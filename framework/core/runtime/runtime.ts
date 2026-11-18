// The resident process of one session: owns the session's state directory, runs the surface with its start commands, serves the
// door, publishes the endpoint, sleeps when what woke it is spent or when its state directory is gone. It is woken in the directory the session
// runs in, which is its cwd. The root's runtime entry hands startRuntime its arguments and nothing else.
// A runtime runs the code it started with, and takes changed code only by starting again: a fresh process in its place, at its
// address, with the state as saved. When is the mode's:
//   dev     a change to the code it loaded restarts it at once, cutting whatever runs; the open pages are told to load again
//           when the page's own files change. What was cut is said in the agent's next answer, and to the pages.
//   normal  the default: changed code is said, once to the agent and as a fact of / for as long as it lasts, and runs once the
//           agent restarts the runtime. A restart with nothing under way is at once; with work under way the runtime drains:
//           it refuses new calls, says so naming its instance, and starts again once the work ended.
// Each runtime has an instance, a short id in its endpoint, by which a restart is followed: the client waits until another
// instance answers. Each line it logs begins with its time. Where the environment refuses it a lock or loopback, it logs why
// as its last line and ends with DENIED_EXIT, for the waker to say the root does not run here.
// It stays up for what woke it (wake.ts): each request gives a deadline by its strength, and it sleeps, ends with its state
// kept, once the furthest has passed and nothing runs; asked to, at once. A restart carries the deadline to the one in its
// place: a restart is no use of its own, and the explicit one is the agent's command, which renewed it already.
import { existsSync, readFileSync, realpathSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { modelPorts, stateDir } from "../state/state.ts"
import { run } from "../surface/run.ts"
import type { RootDefinition } from "../root.ts"
import { later } from "../update.ts"
import { door } from "./door.ts"
import { DENIED_EXIT, Denied, lastPort, ownService } from "./service.ts"
import { strengthsOf, wakeful, type Strength } from "./wake.ts"

export type RuntimeOptions = {
  command?: string
  entry?: string
  port?: number
  /** How long each strength keeps it up, where not as STRENGTHS or BABAVOSS_WAKE_MS says; for specs. */
  strengths?: Partial<Record<Exclude<Strength, "none">, number>>
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
  /** Directories whose change may change the page; default: the root's src and its ui. */
  watch?: string[]
  /** Directories of code the runtime runs although it did not load it, as a surface whose code did not load: a change there is changed code. */
  code?: string[]
  /** Dev mode: changed code restarts the runtime at once, cutting what runs. Default: normal mode, unless BABAVOSS_DEV says. */
  dev?: boolean
  /** The time, where not the machine's; for specs, which move it on in place of waiting. */
  now?: () => number
  /** How often it looks at its deadline and its code, where not every LOOK_MS; for specs. */
  lookMs?: number
  /** How long changed code stands before a dev runtime restarts, or a page loads again, where not RELOAD_MS; for specs. */
  reloadMs?: number
  /** How the process ends, with its exit code; for specs. */
  exit?: (code?: number) => void
  /** Wakes a fresh process in this one's place, as it was woken; called once this one let go of the session, as it restarts. */
  successor?: () => void
  /** The latest release, asked once as the runtime starts: the page says so, quietly, while it is later than the version running. */
  latest?: () => Promise<string | undefined>
}
export const CLOSE_MS = 8000
/** How often the runtime looks whether its code changed on disk, and, while it drains, whether its work ended. */
export const LOOK_MS = 250
/** How long changed code must stand before dev mode restarts for it, so a save of several files counts once. */
export const RELOAD_MS = 500

/**
 * The mode a runtime runs in: dev where BABAVOSS_DEV is 1, normal where it is 0, else as configured, .baba/baba.config.ts's
 * `dev`; normal by default.
 */
export const devMode = (configured?: boolean, env: NodeJS.ProcessEnv = process.env): boolean =>
  env.BABAVOSS_DEV === "1" || (env.BABAVOSS_DEV !== "0" && configured === true)

/** The root's own source and its page, under the root root, above its scripts/open.ts entry. */
export const sourceDirs = (entry = process.argv[1]!): string[] => {
  const root = dirname(dirname(resolve(entry)))

  return [join(root, "src"), join(root, "ui")].filter((dir) => existsSync(dir)).map((dir) => realpathSync(dir))
}

/** What each file of the process's code was when it was loaded: its time and size, and a hash of its content; a gone file is empty. */
type Code = Map<string, { stamp: string; hash: string }>

const stampOf = (file: string) => {
  try {
    const stat = statSync(file)

    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return ""
  }
}
const hashOf = (file: string) => {
  try {
    return String(Bun.hash(readFileSync(file)))
  } catch {
    return ""
  }
}
/** Adds to `code` what the process loaded since: its entry and every module it imported, as they are now. */
const loaded = (entry: string, code: Code = new Map()): Code => {
  for (const file of [resolve(entry), ...Object.keys(require.cache)])
    if (file.startsWith("/") && !code.has(file)) code.set(file, { stamp: stampOf(file), hash: hashOf(file) })

  return code
}
/** The first file whose content is not what was loaded, or undefined. A file only touched is taken as it is. */
const changedFile = (code: Code): string | undefined => {
  for (const [file, was] of code) {
    const stamp = stampOf(file)

    if (stamp === was.stamp) continue
    if (hashOf(file) !== was.hash) return file
    was.stamp = stamp
  }
}
/** A file of a spec, which is no code the runtime or its page runs. */
const isSpec = (file: string) => file.split(sep).includes("spec") || /\.spec\.tsx?$/.test(file)

/** What a runtime that restarted tells the one in its place: a line for the pages, and for the agent too where it cut work. */
const handoffFile = (dir: string) => join(dir, "restarted")
type Handoff = { line: string; cut: boolean; until?: number }
const handoff = (dir: string): Handoff | undefined => {
  try {
    return JSON.parse(readFileSync(handoffFile(dir), "utf8")) as Handoff
  } catch {
    return undefined
  }
}

/** A root's version is its package's: the nearest package.json at or above its root, the directory its scripts/ is in. */
export const rootVersion = (entry = process.argv[1]!) => {
  for (let dir = dirname(dirname(resolve(entry))); ; dir = dirname(dir)) {
    const file = join(dir, "package.json")

    if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version ?? ""
    if (dir === dirname(dir)) return ""
  }
}

/** The session named by `--session ID` in an argument list. */
export const sessionArg = (argv: string[]): string | undefined => {
  const at = argv.indexOf("--session")

  return at === -1 ? undefined : argv[at + 1]
}

/**
 * Starts the runtime for the session in `argv`, or returns undefined when another process owns that session already, or when
 * the environment refuses it what it requires, in which case it ends with DENIED_EXIT.
 */
export async function startRuntime(
  root: RootDefinition,
  argv: string[],
  options: RuntimeOptions = {}
): Promise<{ port: number; instance: string; close(): Promise<void> } | undefined> {
  const write = options.log ?? ((line: string) => console.error(line))
  const log = (line: string) => write(`${new Date().toISOString()} ${line}`)
  const exit = options.exit ?? ((code?: number) => process.exit(code ?? 0))
  const session = sessionArg(argv)

  if (!session) throw new Error("a runtime serves one session: --session ID")

  const refused = (error: Denied) => {
    log(error.message)
    exit(DENIED_EXIT)

    return undefined
  }
  const dir = stateDir(root, { id: session }, options.env)
  const owned = () => {
    try {
      return ownService(dir)
    } catch (error) {
      if (error instanceof Denied) return error
      throw error
    }
  }
  const owner = owned()

  if (owner instanceof Denied) return refused(owner)
  if (!owner) return undefined

  const dev = options.dev ?? devMode()
  const entry = options.entry ?? process.argv[1]!
  const { instance } = owner.identity
  const command = options.command ?? `bv ${root.name}`
  const running = run(root.surface, { ...(root.keep ?? modelPorts)(dir), log })
  const code = loaded(entry)
  const watchers: FSWatcher[] = []
  const now = options.now ?? Date.now
  const lookMs = options.lookMs ?? LOOK_MS
  const reloadMs = options.reloadMs ?? RELOAD_MS
  const wake = wakeful({ ...strengthsOf(options.env), ...options.strengths }, now())
  let looking: ReturnType<typeof setInterval> | undefined
  let closing: Promise<void> | undefined
  // The lock is let go within CLOSE_MS of the decision, whatever refuses to close: it must not outlive the service. The
  // service file says from when its door is closing, so a client tells a runtime closing from one whose door is gone.
  const close = () =>
    (closing ??= (async () => {
      clearInterval(looking)
      for (const w of watchers) w.close()
      owner.closing()

      let bound: ReturnType<typeof setTimeout> | undefined

      await Promise.race([
        (async () => {
          await entrance.close()
          await running.stop()
        })().catch(() => {}),
        new Promise<void>((done) => (bound = setTimeout(done, CLOSE_MS))),
      ])
      clearTimeout(bound)
      owner.release()
    })())
  // A runtime that restarts lets go of the session and wakes its successor, so the open pages find one at their address.
  let leaving: string | undefined
  let ending: Promise<void> | undefined
  const end = () =>
    void (ending ??= (async () => {
      if (!leaving && !closing) {
        log(`${root.name}: instance ${instance} sleeps, its state kept; any call wakes it`)
        entrance.asleep()
      }
      await close()
      if (leaving) options.successor?.()
      exit()
    })())
  /** What a restart now would cut: the running commands by name, and the rest of the work under way as a count. */
  const underWay = () => {
    const named = running.commands()
    const rest = running.active() - named.length

    return [...named, ...(rest > 0 ? [`${rest} more under way`] : [])].join(", ")
  }
  /** Decides to restart, cutting what runs: logged, and told to the one in its place, which says it. */
  const leave = (why: string) => {
    if (leaving) return leaving

    const cut = underWay()

    leaving = `${root.name}: ${why}${cut && `; the restart cut ${cut}`}`
    log(leaving)
    try {
      writeFileSync(handoffFile(dir), JSON.stringify({ line: leaving, cut: !!cut, until: wake.until } satisfies Handoff), { mode: 0o600 })
    } catch {}

    return leaving
  }
  const restart = (why: string) => {
    leave(why)
    end()
  }
  // Normal mode: changed code is said once, and stands as a fact of / until the runtime restarts.
  let stale: string | undefined
  const staleLine = () => `code: changed on disk since instance ${instance} started; it runs once restarted: ${command} restart`
  const changed = (file: string) => {
    if (stale || leaving) return
    stale = file
    log(`${root.name}: ${file} changed since instance ${instance} started; it runs once restarted`)
    entrance.note(`${root.name}: its code changed on disk; it runs once restarted: ${command} restart`)
  }
  // Dev mode: changed code restarts it once it stood RELOAD_MS, and only while its entry is there to start again, as a
  // checkout that removes it for a moment leaves it. A change in code it did not load is heard by a watch, and waits here.
  let due: number | undefined
  let heard: string | undefined
  const look = () => {
    if (closing) return
    if (!existsSync(dir)) {
      log(`${root.name}: its state directory ${dir} is gone; it ends`)

      return end()
    }
    if (now() >= wake.until && running.active() === 0) return end()
    if (stale) return
    loaded(entry, code)

    const file = changedFile(code) ?? heard

    if (!file) return void (due = undefined)
    if (!dev) return changed(file)
    if (!existsSync(entry)) return
    due ??= Date.now() + reloadMs
    if (Date.now() >= due) restart(`its code changed (${file}) and it restarted`)
  }
  // While it drains, it refuses new calls, and starts again once nothing is under way.
  let draining: string | undefined
  const drain = () => {
    if (running.active() === 0) restart("it restarted once its work ended")
  }
  const restartAsked = (): { status: number; text: string; after?: () => void } => {
    if (leaving) return { status: 200, text: `${root.name}: instance ${instance} is restarting` }
    if (draining) return { status: 202, text: draining }

    const cut = dev ? underWay() : ""

    if (dev || running.active() === 0)
      return { status: 200, text: `${root.name}: instance ${instance} restarts${cut && `, cutting ${cut}`}`, after: () => restart("it restarted, as asked") }
    draining = `${root.name}: instance ${instance} is draining to restart: it takes no new calls and restarts once ${underWay()} ended. Wait for it: ${command} follow ${instance}`
    log(draining)
    entrance.note(draining, false)
    clearInterval(looking)
    looking = setInterval(drain, lookMs)
    looking.unref()

    return { status: 202, text: draining }
  }
  /** Dev mode, before an answer: whether what answers is the code on disk; where it is not, why it restarts instead. */
  const current = async (): Promise<string | undefined> => {
    if (leaving) return leaving
    if (!dev) return undefined
    loaded(entry, code)

    const file = changedFile(code) ?? heard

    // The door answers that it is asked again, and then ends this runtime.
    if (file && existsSync(entry)) return leave(`its code changed (${file}) and it restarted`)
  }
  // The version is the one it started with, the code it runs; the latest release is told as an update while it is later.
  const version = rootVersion(options.entry)
  let released: string | undefined
  const about: Record<string, string | undefined> = {
    root: root.name,
    version,
    session,
    get update() {
      return released && later(released, version) ? released : undefined
    },
  }

  void options
    .latest?.()
    .then((latest) => {
      released = latest
    })
    .catch(() => {})
  const entrance = door(running, {
    identity: owner.identity,
    ui: root.ui,
    ...(root.boot && { boot: root.boot }),
    woken: (signal) => wake.signal(signal, now()),
    end,
    about,
    command,
    current,
    opened: () => [`${root.name} ${version}${dev ? ", in dev mode: changed code restarts it at once" : ""}`, ...(stale ? [staleLine()] : [])],
    restart: restartAsked,
    refusing: () => draining,
  })

  // The address the session last had, so the person's open page finds this instance; any free one where that is taken.
  const preferred = options.port ?? lastPort(dir) ?? 0
  const listen = (on: number) =>
    new Promise<NodeJS.ErrnoException | undefined>((done) => {
      entrance.server.once("error", done)
      entrance.server.listen(on, "127.0.0.1", () => {
        entrance.server.removeAllListeners("error")
        done(undefined)
      })
    })
  const failed = (await listen(preferred)) && (await listen(0))

  if (failed) {
    await running.stop()
    owner.release()
    if (failed.code === "EPERM" || failed.code === "EACCES")
      return refused(new Denied("the sandbox refuses listening on loopback, where its runtime is reached"))
    throw new Error(`no port to listen on: ${failed.message}`)
  }

  const port = (entrance.server.address() as { port: number }).port

  owner.publish(port)
  if (root.started) {
    const started = root.started

    setTimeout(() => {
      try {
        started(dir)
      } catch (error) {
        log(`${root.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }, 0).unref()
  }
  log(`${root.name} runtime for session ${session}, instance ${instance}, ${dev ? "dev" : "normal"} mode, on 127.0.0.1:${port}, in ${process.cwd()}, state in ${dir}`)
  // A change in a file the page may be made of: in dev mode the door builds the page again and tells the open ones if it
  // differs; in normal mode it is changed code, said.
  let reload: ReturnType<typeof setTimeout> | undefined
  const pageChanged = (file: string) => {
    if (isSpec(file)) return
    if (!dev) return changed(file)
    clearTimeout(reload)
    reload = setTimeout(() => void entrance.refresh(file), reloadMs)
    reload.unref()
  }

  for (const where of options.watch ?? sourceDirs(options.entry)) {
    try {
      const w = watch(where, { recursive: true }, (_event, file) => pageChanged(join(where, String(file ?? ""))))

      w.unref()
      watchers.push(w)
    } catch (error) {
      log(`not watching ${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const where of options.code ?? []) {
    try {
      const w = watch(where, { recursive: true }, (_event, file) => {
        const path = join(where, String(file ?? ""))

        if (!isSpec(path)) heard ??= path
      })

      w.unref()
      watchers.push(w)
    } catch (error) {
      log(`not watching ${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  looking = setInterval(look, lookMs)
  looking.unref()

  // What the runtime before it said as it restarted: the agent is told only of what was cut, which it may have to do again.
  const told = handoff(dir)

  rmSync(handoffFile(dir), { force: true })
  if (typeof told?.until === "number") wake.carry(told.until)
  if (told?.line) entrance.note(told.line, told.cut)
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, end)

  return { port, instance, close }
}
