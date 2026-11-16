// The resident process of one session: owns the session's state directory, runs the surface with its start commands, serves the
// door, publishes the endpoint, exits when idle. It is woken in the directory the session runs in, which is its cwd.
// The root's runtime entry hands startRuntime its arguments and nothing else.
// A root loaded in place is edited while its runtimes are up. The runtime is woken under bun's hot reload, which runs the
// entry again in the same process when its code changes: startRuntime then finds the runtime already here and puts the new
// surface in its place, from the state the old one saved, once nothing is running or after SWAP_WAIT_MS, which cuts what still
// runs. What is asked meanwhile is held, holdMs at most, and answered by the new code; a call the old code took no longer
// as it stopped is given to the new one, since it did nothing. A wait is logged and told to the open pages; a cut and code
// that does not start are told too, and said first in the agent's next answer. The process, its address, its token and its
// open pages stay. A change in the page's own code is told to the open pages, which load again.
// The runtime's own code, the framework's core, is not swapped: when that changed, the runtime here closes and starts again
// in the same process, at the same address.
// A hot reload that fails, on code that does not parse or on a file gone for a moment as a checkout leaves it, leaves bun's
// process no longer woken for its timers, nor for the files it watches: a timer fires only when something else wakes the
// process, a request, and in a quiet one never. Bun says so in the log, a line beginning `error: `. So a runtime under hot
// reload holds what each file of its code was when loaded, and gives way, without answering, once bun said a reload failed
// in its process, when its timers are dead, or when a file changed since and was not loaded within STALE_MS: it closes and
// wakes a new process in its place, at its address, which loads the code as it is or fails saying why, and is told what was
// cut. It looks before each answer, and as changed code is loaded.
// It never stays deaf. What ends it is bounded by the clock, not by a timer alone. After every load in place it asks its own
// door as a client would, and gives way where the door does not answer; closed for the framework's changed code, a runtime
// whose successor in the process throws says why and ends. A client ends a runtime that lives on with nothing at its port.
// Each line it logs begins with its time. Where the environment refuses it a lock or loopback, it logs why as its last
// line and ends with DENIED_EXIT, for the waker to say the root does not run here.
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { modelPorts, stateDir } from "../state/state.ts"
import { run, STOP_MS, type Answer, type Noticed, type Running } from "../surface/run.ts"
import type { RootDefinition } from "../root.ts"
import { later } from "../update.ts"
import { door } from "./door.ts"
import { DENIED_EXIT, Denied, PROBE_HEADER, SERVICE_HEADER, failedSince, lastPort, logFile, logSize, ownService } from "./service.ts"

export type RuntimeOptions = {
  command?: string
  entry?: string
  port?: number
  idleMs?: number
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
  /** Directories whose change may change the page; default: the root's src and its ui. */
  watch?: string[]
  /** What the framework's own code is, as a number that differs when it changed; for specs. */
  stamp?: number
  /** How long changed code waits for running work before cutting it; for specs. */
  swapWaitMs?: number
  /** How the process ends, with its exit code; for specs. */
  exit?: (code?: number) => void
  /**
   * The process runs under bun's hot reload, as its entry woke it: it holds its code as loaded, gives way when that is no
   * longer the code on disk, and wakes its successor by calling this.
   */
  successor?: () => void
  /** The latest release, asked once as the runtime starts: the page says so, quietly, while it is later than the version running. */
  latest?: () => Promise<string | undefined>
}
export const IDLE_MS = 30 * 60_000
export const CLOSE_MS = 8000
/** How long after the last change the runtime waits before acting on it, so a save of several files counts once. */
export const RELOAD_MS = 500
/** How long changed code waits for what runs to end before it cuts it and is loaded. */
export const SWAP_WAIT_MS = 30_000
/** How long an answer waits for hot reload to load a change on disk before the runtime gives way to a new process. */
export const STALE_MS = 1500
/** How long a request is held while changed code is loaded: the swap's wait, what it cuts stopping, and a margin. */
export const holdMs = (swapWaitMs = SWAP_WAIT_MS) => swapWaitMs + STOP_MS + 5000

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
/** The process's code as loaded now: its entry and every module it imported, which hot reload gathers again each time. */
const loadedCode = (entry: string): Code =>
  new Map(
    [resolve(entry), ...Object.keys(require.cache)].filter((file) => file.startsWith("/")).map((file) => [file, { stamp: stampOf(file), hash: hashOf(file) }]),
  )
/** The first file whose content is not what was loaded, or undefined. A file only touched is taken as it is. */
const changedFile = (code: Code): string | undefined => {
  for (const [file, loaded] of code) {
    const stamp = stampOf(file)

    if (stamp === loaded.stamp) continue
    if (hashOf(file) !== loaded.hash) return file
    loaded.stamp = stamp
  }
}

/** Waits `ms` by the clock, yielding to the event loop between short sleeps of the thread; never by a timer, which may be dead. */
const pause = (ms: number) =>
  new Promise<void>((done) => {
    const until = Date.now() + ms
    const tick = () => {
      if (Date.now() >= until) return done()
      Bun.sleepSync(Math.min(5, until - Date.now()))
      setImmediate(tick)
    }

    setImmediate(tick)
  })
/** What `work` settles with, or undefined once `ms` passed by the clock; never bounded by a timer, which may be dead. */
const within = <T>(work: Promise<T>, ms: number) =>
  new Promise<T | undefined>((done) => {
    const until = Date.now() + ms
    let settled = false
    const tick = () => {
      if (settled) return
      if (Date.now() >= until) return done(undefined)
      Bun.sleepSync(Math.min(5, until - Date.now()))
      setImmediate(tick)
    }

    work.then(
      (value) => {
        settled = true
        done(value)
      },
      () => {
        settled = true
        done(undefined)
      },
    )
    setImmediate(tick)
  })
/** Whether the process's timers fire: after a failed hot reload, bun's may never fire again. */
const timersFire = async () => {
  let fired = false
  const timer = setTimeout(() => (fired = true), 0)
  const until = Date.now() + 200

  while (!fired && Date.now() < until) await pause(1)
  clearTimeout(timer)

  return fired
}
/** What a runtime that gave way tells the one in its place, said first in the agent's next answer, and where its log stood. */
const gaveWayFile = (dir: string) => join(dir, "gave-way")
type GaveWay = { line: string; cut: boolean; log?: number }
const gaveWay = (dir: string): GaveWay | undefined => {
  let text: string

  try {
    text = readFileSync(gaveWayFile(dir), "utf8")
  } catch {
    return undefined
  }
  try {
    return JSON.parse(text) as GaveWay
  } catch {
    return { line: text, cut: true }
  }
}

const FAILED = Symbol.for("babavoss.failed")
/**
 * Whether a hot reload failed in this process since the session's runtime here began, or since the one it took the place
 * of gave way: bun says so in the log, where the process writes. After one, bun no longer wakes the process for its timers:
 * one fires only when something else wakes it, and in a quiet process never. Nothing that waits on a timer can be trusted
 * here, and a fresh process takes the session. What was read is kept on globalThis, so each look reads only what is new.
 */
const reloadFailed = (dir: string): boolean => {
  const held = globalThis as { [FAILED]?: Map<string, { read: number; failed: boolean }> }
  const looked = (held[FAILED] ??= new Map())
  let at = looked.get(dir)

  if (!at) looked.set(dir, (at = { read: gaveWay(dir)?.log ?? logSize(dir), failed: false }))
  if (at.failed) return true

  const size = logSize(dir)

  if (size > at.read) {
    at.failed = failedSince(dir, at.read)
    at.read = size
  }

  return at.failed
}

/**
 * A runtime of this process: what a reload of the code finds here, and hands its new root to. `stamp` is the framework code
 * it runs; `leave` gives way to a fresh process, absent from a runtime of code from before it.
 */
type Live = { port: number; stamp?: number; close(): Promise<void>; swap(root: RootDefinition, code?: Code): Promise<void>; leave?(why: string): Promise<void> }

/** When the framework's core, the code a runtime is made of, last changed: the latest of its files' times; a file gone, as a checkout leaves it, counts none. */
const coreStamp = (dir = dirname(import.meta.dir)): number => {
  try {
    return readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
      const path = join(dir, entry.name)

      return Math.max(latest, entry.isDirectory() ? coreStamp(path) : stampTime(path))
    }, 0)
  } catch {
    return 0
  }
}
const stampTime = (file: string) => {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

const LIVE = Symbol.for("babavoss.runtimes")
/** The runtimes of this process by state directory. Kept on globalThis, which a hot reload leaves as it is. */
const lives = (): Map<string, Live> => {
  const held = globalThis as { [LIVE]?: Map<string, Live> }

  return (held[LIVE] ??= new Map())
}

/**
 * One surface standing for whichever runs now: its subscribers, those who hear its notices and its count of commits go on
 * through a swap. A call the surface being swapped out refuses because it stopped did nothing: it is made of the next one.
 */
function standing<M>(first: Running<M>) {
  let current = first
  let base = 0
  const retired = new WeakSet<Running<M>>()
  let next: { promise: Promise<void>; done: () => void } | undefined
  const subscribers = new Set<() => void>()
  const hearers = new Set<(notice: Noticed) => void>()
  const tell = () => {
    for (const fn of subscribers) fn()
  }
  const hear = (notice: Noticed) => {
    for (const fn of hearers) fn(notice)
  }
  let off = current.subscribe(tell)
  let deaf = current.notices(hear)
  const own: Partial<Running<M>> = {
    version: () => base + current.version(),
    call: async (path, name, args, actor, id): Promise<Answer> => {
      const at = current
      const answer = await at.call(path, name, args, actor, id)

      if (answer.outcome === "written" || !retired.has(at) || at.failure() !== undefined) return answer
      // Bounded, for a runtime that closes before the next one is in place.
      if (current === at && next) await Promise.race([next.promise, sleep(2 * STOP_MS)])

      return current === at ? answer : current.call(path, name, args, actor, id)
    },
    subscribe: (fn) => {
      subscribers.add(fn)

      return () => void subscribers.delete(fn)
    },
    notices: (fn) => {
      hearers.add(fn)

      return () => void hearers.delete(fn)
    },
  }

  return {
    running: new Proxy({} as Running<M>, { get: (_target, key) => Reflect.get(own, key) ?? Reflect.get(current, key) }),
    current: () => current,
    /** The running surface is being stopped to be replaced: what it refuses as stopped waits for the one in its place. */
    retire() {
      let done = () => {}
      const promise = new Promise<void>((resolve) => (done = resolve))

      retired.add(current)
      next = { promise, done }
    },
    replace(fresh: Running<M>) {
      off()
      deaf()
      base += current.version() + 1
      current = fresh
      off = fresh.subscribe(tell)
      deaf = fresh.notices(hear)
      next?.done()
      next = undefined
      tell()
    },
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

/** How long the runtime gives its own door to answer a probe after code was loaded in place. */
export const SERVES_MS = 2000

/**
 * Starts the runtime for the session in `argv`, or returns undefined when another process owns that session already, or when
 * the environment refuses it what it requires, in which case it ends with DENIED_EXIT. Where the runtime before it in this
 * process closed for it and it does not start, nothing serves the session here: it says why and ends, and the next command
 * starts a fresh process.
 */
export async function startRuntime(
  root: RootDefinition,
  argv: string[],
  options: RuntimeOptions = {}
): Promise<{ port: number; close(): Promise<void> } | undefined> {
  const write = options.log ?? ((line: string) => console.error(line))
  const log = (line: string) => write(`${new Date().toISOString()} ${line}`)
  const exit = options.exit ?? ((code?: number) => process.exit(code ?? 0))
  const replacing = { closed: false }

  try {
    return await begin(root, argv, options, log, exit, replacing)
  } catch (error) {
    if (!replacing.closed) throw error
    log(`${root.name}: its runtime closed for its framework's changed code and did not start again: ${error instanceof Error ? error.message : String(error)}; it ends`)
    exit(1)

    return undefined
  }
}

async function begin(
  root: RootDefinition,
  argv: string[],
  options: RuntimeOptions,
  log: (line: string) => void,
  exit: (code?: number) => void,
  replacing: { closed: boolean }
): Promise<{ port: number; close(): Promise<void> } | undefined> {
  const session = sessionArg(argv)

  if (!session) throw new Error("a runtime serves one session: --session ID")

  const refused = (error: Denied) => {
    log(error.message)
    exit(DENIED_EXIT)

    return undefined
  }
  const dir = stateDir(root, { id: session }, options.env)
  // The code was loaded again in this process: the runtime is here already, and takes the new root. Where the framework's
  // own code changed, the runtime here is that code no longer: it closes, and this one starts in its place.
  const stamp = options.stamp ?? coreStamp()
  const here = lives().get(dir)
  const loaded = options.successor && loadedCode(options.entry ?? process.argv[1]!)

  // After a failed hot reload bun's timers may never fire again, and whatever waits on one here would wait for ever, the
  // runtime closing for this code among them: a fresh process takes the session instead.
  if (here?.leave && options.successor && (reloadFailed(dir) || !(await timersFire()))) {
    await here.leave("a hot reload of its code failed")

    return undefined
  }
  // Woken in the place of one that gave way, with code that did not load until now: this process is no better, and hands on.
  if (!here && options.successor && reloadFailed(dir)) {
    const handed = gaveWay(dir)

    log(`${root.name}: a hot reload of its code failed in this process before its runtime started; a fresh process takes the session`)
    try {
      writeFileSync(gaveWayFile(dir), JSON.stringify({ ...(handed ?? { line: "", cut: false }), log: logSize(dir) }))
    } catch {}
    options.successor()
    exit()

    return undefined
  }
  if (here && here.stamp === stamp) {
    await here.swap(root, loaded)

    return here
  }
  if (here) {
    await here.close()
    replacing.closed = true
  }

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

  const started = (of: RootDefinition) => run(of.surface, { ...modelPorts(dir), log })
  const stand = standing(started(root))
  const running = stand.running
  let idle: ReturnType<typeof setTimeout> | undefined
  let closing: Promise<void> | undefined
  const watchers: FSWatcher[] = []
  // Whatever refuses to close, the lock is let go within CLOSE_MS of the decision, by the clock: it must not outlive the
  // service, and after a failed hot reload no timer may fire again. The service file says from when its door is closed, so
  // a client tells a runtime closing from one whose door is gone.
  const close = () =>
    (closing ??= (async () => {
      clearTimeout(idle)
      lives().delete(dir)
      for (const w of watchers) w.close()
      owner.closing()
      await within(
        (async () => {
          await entrance.close()
          await running.stop()
        })(),
        CLOSE_MS
      )
      owner.release()
    })())
  // A runtime that gave way lets go of the session and wakes its successor, so the open pages find one at their address.
  let leaving: string | undefined
  let ending: Promise<void> | undefined
  const end = () =>
    void (ending ??= (async () => {
      await close()
      if (leaving) options.successor?.()
      exit()
    })())
  // A change in a file the page may be made of: the door builds the page again and tells the open ones if it differs.
  let reload: ReturnType<typeof setTimeout> | undefined
  const changed = (file: string) => {
    clearTimeout(reload)
    reload = setTimeout(() => void entrance.refresh(file), RELOAD_MS)
    reload.unref()
  }
  // The code loaded again: the newest root takes the place of the running one once that has nothing under way, or once it has
  // waited SWAP_WAIT_MS, counted from the first change waiting, and cut what still runs. A wait is logged and told once.
  let latest = root
  let code = loaded
  let waiting: RootDefinition | undefined
  let swapping: Promise<void> | undefined
  const bound = options.swapWaitMs ?? SWAP_WAIT_MS
  /** What keeps the code from loading: the running commands by name, and the rest of the work under way as a count. */
  const underWay = () => {
    const named = running.commands()
    const rest = running.active() - named.length

    return [...named, ...(rest > 0 ? [`${rest} more under way`] : [])].join(", ")
  }
  const swap = (to: RootDefinition, next?: Code) => {
    waiting = to
    code = next ?? code

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
              // The agent's requests are held meanwhile and answered by the new code, so this is the page's alone.
              entrance.note(`${taking.name}: its changed code is not loaded yet; it waits at most ${bound / 1000}s for ${what}`, false)
            }
            await sleep(RELOAD_MS)
            continue
          }
          if (busy !== 0) cut = underWay()
          waiting = undefined
          stand.retire()
          await stand.current().stop()

          const fresh = started(taking)
          const failure = fresh.failure()

          if (failure === undefined) {
            stand.replace(fresh)
            latest = taking
            await entrance.replace(taking.ui)
            log(`${taking.name}: its code changed and was loaded in place${cut && `, after ${bound / 1000}s, cutting ${cut}`}`)
            if (cut) entrance.note(`${taking.name}: its changed code was loaded after ${bound / 1000}s, cutting what still ran: ${cut}`)
            else if (waited) entrance.note(`${taking.name}: its changed code was loaded`, false)
          } else {
            // What was saved does not start under the new code: the code before it goes on.
            log(`${taking.name}: its changed code did not start, the code before it goes on: ${failure}`)
            entrance.note(`${taking.name}: its changed code did not start, the code before it goes on: ${failure}`)
            await fresh.stop()
            stand.replace(started(latest))
          }
          since = Date.now()
          waited = false
          if (!(await answers("its changed code was loaded"))) return
        }
      } catch (error) {
        // A swap that throws leaves the surface stopped, or half replaced: a fresh process loads the code as it is.
        giveWay(`loading its changed code failed: ${error instanceof Error ? error.message : String(error)}`)
        end()
      } finally {
        swapping = undefined
      }
    })())
  }
  /**
   * Whether the door still answers a probe on its port, as a client finds it, after code was loaded in place. Where it does
   * not, nothing reaches this runtime any more: it gives way to a fresh process, rather than stay deaf.
   */
  const answers = async (after: string): Promise<boolean> => {
    if (leaving || closing) return false

    const probe = fetch(`http://127.0.0.1:${port}/`, {
      headers: { accept: "application/json", [SERVICE_HEADER]: owner.identity.token, [PROBE_HEADER]: "1" },
    }).then(async (response) => {
      await response.body?.cancel()

      return response.headers.get(SERVICE_HEADER) === owner.identity.token
    })

    if ((await within(probe, SERVES_MS)) === true || leaving || closing) return true
    giveWay(`its door no longer answered on 127.0.0.1:${port} after ${after}`)
    end()

    return false
  }
  const touch = () => {
    clearTimeout(idle)
    idle = setTimeout(() => {
      if (running.active() === 0) end()
      else touch()
    }, options.idleMs ?? IDLE_MS)
    idle.unref()
  }
  /** Gives way to a new process: logged, and told to the one in its place with what it cut. */
  const giveWay = (why: string) => {
    const cut = underWay()

    leaving = `${root.name}: ${why}; its runtime started again with the code as it is${cut && `, cutting what still ran: ${cut}`}`
    log(leaving)
    try {
      writeFileSync(gaveWayFile(dir), JSON.stringify({ line: leaving, cut: !!cut, log: logSize(dir) }))
    } catch {}

    return leaving
  }
  /**
   * Whether what answers is the code on disk: undefined when it is, or once hot reload loads it, or once the changed code
   * loading is loaded, holdMs at most; else why this runtime gives way.
   */
  const current = async (): Promise<string | undefined> => {
    const until = Date.now() + STALE_MS
    let file: string | undefined

    if (leaving) return leaving
    if (options.successor) {
      if (reloadFailed(dir) || !(await timersFire())) return giveWay("a hot reload of its code failed")
      while (code && (file = changedFile(code)) !== undefined) {
        if (Date.now() >= until || !(await timersFire())) return giveWay(`${file} changed and hot reload did not load it`)
        await pause(50)
      }
    }

    const held = Date.now() + holdMs(bound)

    while (swapping && !leaving && Date.now() < held) await Promise.race([swapping.catch(() => {}), sleep(held - Date.now())])
    if (swapping && !leaving) entrance.note(`${root.name}: its changed code is still not loaded after ${holdMs(bound) / 1000}s; this answer is from the code before it`)

    return leaving
  }
  // The version is read each time it is told: a package taken while the runtime runs is the version it runs from then on,
  // and the latest release is told as an update only while it is later than that.
  let released: string | undefined
  const about: Record<string, string | undefined> = {
    root: root.name,
    get version() {
      return rootVersion(options.entry)
    },
    session,
    get update() {
      return released && later(released, rootVersion(options.entry)) ? released : undefined
    },
  }

  void options
    .latest?.()
    .then((version) => {
      released = version
    })
    .catch(() => {})
  const entrance = door(running, {
    identity: owner.identity,
    ui: root.ui,
    ...(root.boot && { boot: root.boot }),
    touched: touch,
    end,
    about,
    command: options.command ?? `bv ${root.name}`,
    current,
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
  // Started again in place, the door must answer as the one before it did.
  if (here && !(await answers("its framework's changed code started it again"))) {
    await ending

    return undefined
  }
  touch()
  log(`${root.name} runtime for session ${session} on 127.0.0.1:${port}, in ${process.cwd()}, state in ${dir}`)
  for (const where of options.watch ?? sourceDirs(options.entry)) {
    try {
      const w = watch(where, { recursive: true }, (_event, file) => changed(join(where, String(file ?? ""))))

      w.unref()
      watchers.push(w)
    } catch (error) {
      log(`not watching ${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (options.successor) {
    let looking = false

    // Bun says where the runtime logs that a reload failed: a look then, with no request to wait for, where bun still wakes it.
    try {
      const w = watch(logFile(dir), async () => {
        if (looking || leaving || closing) return
        looking = true
        if (await current()) end()
        looking = false
      })

      w.unref()
      watchers.push(w)
    } catch {}
    const told = gaveWay(dir)

    rmSync(gaveWayFile(dir), { force: true })
    // The agent is told only of what was cut, which it may have to do again; the rest it never sees.
    if (told?.line) entrance.note(told.line, told.cut)
  }
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, end)

  const leave = (why: string) => {
    if (!leaving) giveWay(why)
    end()

    return ending!
  }
  const live: Live = { port, stamp, close, swap, leave }

  lives().set(dir, live)

  return live
}
