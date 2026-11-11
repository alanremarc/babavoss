// The resident process of one session: owns the session's state directory, runs the surface with its start commands, serves the
// door, publishes the endpoint, exits when idle. It is woken in the directory the session runs in, which is its cwd.
// The app's runtime entry hands startRuntime its arguments and nothing else.
// An app loaded in place is edited while its runtimes are up. The runtime is woken under bun's hot reload, which runs the
// entry again in the same process when its code changes: startRuntime then finds the runtime already here and puts the new
// surface in its place, from the state the old one saved, once nothing is running or after SWAP_WAIT_MS, which cuts what still
// runs. A wait, a cut and code that does not start are logged and said first in the agent's next answer. The process, its
// address, its token and its open pages stay. Code that does not load leaves the old surface running. A change in the page's
// own code is told to the open pages, which load again. The runtime's own code, the framework's core, is not swapped: when
// that changed, the runtime here closes and starts again in the same process, at the same address. Each line it logs begins
// with its time. Where the environment refuses it a lock or loopback, it logs why as its last line and ends with DENIED_EXIT,
// for the waker to say the app does not run here.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, watch, type FSWatcher } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { modelPorts, stateDir } from "../state/state.ts"
import { run, type Running } from "../surface/run.ts"
import type { AppDefinition } from "../app.ts"
import { door } from "./door.ts"
import { DENIED_EXIT, Denied, lastPort, ownService } from "./service.ts"

export type RuntimeOptions = {
  command?: string
  entry?: string
  port?: number
  idleMs?: number
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
  /** Directories whose change may change the page; default: the app's src and its ui. */
  watch?: string[]
  /** What the framework's own code is, as a number that differs when it changed; for specs. */
  stamp?: number
  /** How long changed code waits for running work before cutting it; for specs. */
  swapWaitMs?: number
  /** How the process ends, with its exit code; for specs. */
  exit?: (code?: number) => void
}
export const IDLE_MS = 30 * 60_000
export const CLOSE_MS = 8000
/** How long after the last change the runtime waits before acting on it, so a save of several files counts once. */
export const RELOAD_MS = 500
/** How long changed code waits for what runs to end before it cuts it and is loaded. */
export const SWAP_WAIT_MS = 30_000

/** The app's own source and its page, under the app root, above its scripts/open.ts entry. */
export const sourceDirs = (entry = process.argv[1]!): string[] => {
  const root = dirname(dirname(resolve(entry)))

  return [join(root, "src"), join(root, "ui")].filter((dir) => existsSync(dir)).map((dir) => realpathSync(dir))
}

/** A runtime of this process: what a reload of the code finds here, and hands its new app to. `stamp` is the framework code it runs. */
type Live = { port: number; stamp?: number; close(): Promise<void>; swap(app: AppDefinition): Promise<void> }

/** When the framework's core, the code a runtime is made of, last changed: the latest of its files' times. */
const coreStamp = (dir = dirname(import.meta.dir)): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const path = join(dir, entry.name)

    return Math.max(latest, entry.isDirectory() ? coreStamp(path) : statSync(path).mtimeMs)
  }, 0)

const LIVE = Symbol.for("babavoss.runtimes")
/** The runtimes of this process by state directory. Kept on globalThis, which a hot reload leaves as it is. */
const lives = (): Map<string, Live> => {
  const held = globalThis as { [LIVE]?: Map<string, Live> }

  return (held[LIVE] ??= new Map())
}

/** One surface standing for whichever runs now: its subscribers and its count of commits go on through a swap. */
function standing<M>(first: Running<M>) {
  let current = first
  let base = 0
  const subscribers = new Set<() => void>()
  const tell = () => {
    for (const fn of subscribers) fn()
  }
  let off = current.subscribe(tell)
  const own: Partial<Running<M>> = {
    version: () => base + current.version(),
    subscribe: (fn) => {
      subscribers.add(fn)

      return () => void subscribers.delete(fn)
    },
  }

  return {
    running: new Proxy({} as Running<M>, { get: (_target, key) => Reflect.get(own, key) ?? Reflect.get(current, key) }),
    current: () => current,
    replace(next: Running<M>) {
      off()
      base += current.version() + 1
      current = next
      off = next.subscribe(tell)
      tell()
    },
  }
}

/** An app's version belongs to the package above its scripts directory. */
export const appVersion = (entry = process.argv[1]!) =>
  (JSON.parse(readFileSync(join(dirname(dirname(resolve(entry))), "package.json"), "utf8")) as { version?: string }).version ?? ""

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
  app: AppDefinition,
  argv: string[],
  options: RuntimeOptions = {}
): Promise<{ port: number; close(): Promise<void> } | undefined> {
  const session = sessionArg(argv)

  if (!session) throw new Error("a runtime serves one session: --session ID")

  const write = options.log ?? ((line: string) => console.error(line))
  const log = (line: string) => write(`${new Date().toISOString()} ${line}`)
  const exit = options.exit ?? ((code?: number) => process.exit(code ?? 0))
  const refused = (error: Denied) => {
    log(error.message)
    exit(DENIED_EXIT)

    return undefined
  }
  const dir = stateDir(app, { id: session }, options.env)
  // The code was loaded again in this process: the runtime is here already, and takes the new app. Where the framework's
  // own code changed, the runtime here is that code no longer: it closes, and this one starts in its place.
  const stamp = options.stamp ?? coreStamp()
  const here = lives().get(dir)

  if (here && here.stamp === stamp) {
    await here.swap(app)

    return here
  }
  if (here) await here.close()

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

  const started = (of: AppDefinition) => run(of.surface, { ...modelPorts(dir), log })
  const stand = standing(started(app))
  const running = stand.running
  let idle: ReturnType<typeof setTimeout> | undefined
  let closing: Promise<void> | undefined
  const watchers: FSWatcher[] = []
  // Whatever refuses to close, the process ends within CLOSE_MS of the decision: the lock must not outlive the service.
  const close = () =>
    (closing ??= (async () => {
      clearTimeout(idle)
      lives().delete(dir)
      for (const w of watchers) w.close()

      const forced = setTimeout(() => {
        owner.release()
        exit()
      }, CLOSE_MS)

      forced.unref()
      await entrance.close()
      await running.stop()
      owner.release()
      // Closed in time: whoever asked decides what comes next, not this timer.
      clearTimeout(forced)
    })())
  const end = () => void close().then(() => exit())
  // A change in a file the page may be made of: the door builds the page again and tells the open ones if it differs.
  let reload: ReturnType<typeof setTimeout> | undefined
  const changed = (file: string) => {
    clearTimeout(reload)
    reload = setTimeout(() => void entrance.refresh(file), RELOAD_MS)
    reload.unref()
  }
  // The code loaded again: the newest app takes the place of the running one once that has nothing under way, or once it has
  // waited SWAP_WAIT_MS, counted from the first change waiting, and cut what still runs. A wait is logged and told once.
  let latest = app
  let waiting: AppDefinition | undefined
  let swapping: Promise<void> | undefined
  const bound = options.swapWaitMs ?? SWAP_WAIT_MS
  /** What keeps the code from loading: the running commands by name, and the rest of the work under way as a count. */
  const underWay = () => {
    const named = running.commands()
    const rest = running.active() - named.length

    return [...named, ...(rest > 0 ? [`${rest} more under way`] : [])].join(", ")
  }
  const swap = (to: AppDefinition) => {
    waiting = to

    return (swapping ??= (async () => {
      let since = Date.now()
      let waited = false

      try {
        while (waiting && !closing) {
          const taking = waiting
          const busy = running.active()
          let cut = ""

          if (busy !== 0 && Date.now() - since < bound) {
            if (!waited) {
              const what = underWay()
              const jobs = `${busy} job${busy === 1 ? "" : "s"}`

              waited = true
              log(`${taking.name}: its code changed; waiting for ${jobs} to finish before loading it, at most ${bound / 1000}s: ${what}`)
              entrance.note(`${taking.name}: its changed code is not loaded yet; it waits at most ${bound / 1000}s for ${what}`)
            }
            await sleep(RELOAD_MS)
            continue
          }
          if (busy !== 0) cut = underWay()
          waiting = undefined
          await stand.current().stop()

          const fresh = started(taking)
          const failure = fresh.failure()

          if (failure === undefined) {
            stand.replace(fresh)
            latest = taking
            about.version = appVersion(options.entry)
            await entrance.replace(taking.ui)
            log(`${taking.name}: its code changed and was loaded in place${cut && `, after ${bound / 1000}s, cutting ${cut}`}`)
            if (cut) entrance.note(`${taking.name}: its changed code was loaded after ${bound / 1000}s, cutting what still ran: ${cut}`)
            else if (waited) entrance.note(`${taking.name}: its changed code was loaded`)
          } else {
            // What was saved does not start under the new code: the code before it goes on.
            log(`${taking.name}: its changed code did not start, the code before it goes on: ${failure}`)
            entrance.note(`${taking.name}: its changed code did not start, the code before it goes on: ${failure}`)
            await fresh.stop()
            stand.replace(started(latest))
          }
          since = Date.now()
          waited = false
        }
      } finally {
        swapping = undefined
      }
    })())
  }
  const touch = () => {
    clearTimeout(idle)
    idle = setTimeout(() => {
      if (running.active() === 0) end()
      else touch()
    }, options.idleMs ?? IDLE_MS)
    idle.unref()
  }
  const about = { app: app.name, version: appVersion(options.entry), session }
  const entrance = door(running, { identity: owner.identity, ui: app.ui, touched: touch, end, about, command: options.command ?? `bv ${app.name}` })

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
  touch()
  log(`${app.name} runtime for session ${session} on 127.0.0.1:${port}, in ${process.cwd()}, state in ${dir}`)
  for (const where of options.watch ?? sourceDirs(options.entry)) {
    try {
      const w = watch(where, { recursive: true }, (_event, file) => changed(join(where, String(file ?? ""))))

      w.unref()
      watchers.push(w)
    } catch (error) {
      log(`not watching ${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, end)

  const live: Live = { port, stamp, close, swap }

  lives().set(dir, live)

  return live
}
