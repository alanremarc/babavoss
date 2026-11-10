// The resident process of one session: owns the session's state directory, runs the surface with its start commands, serves the
// door, publishes the endpoint, exits when idle. It is woken in the directory the session runs in, which is its cwd.
// The app's runtime entry hands startRuntime its arguments and nothing else.
// It also exits when its own code changes, once nothing is running, so the next call wakes the new code: an app loaded in
// place is edited while its runtimes are up. Where the environment refuses it a lock or loopback, it logs why as its last
// line and ends with DENIED_EXIT, for the waker to say the app does not run here.
import { existsSync, readFileSync, realpathSync, watch, type FSWatcher } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { modelPorts, stateDir } from "../state/state.ts"
import { run } from "../surface/run.ts"
import type { AppDefinition } from "../app.ts"
import { door } from "./door.ts"
import { DENIED_EXIT, Denied, ownService } from "./service.ts"

export type RuntimeOptions = {
  command?: string
  entry?: string
  port?: number
  idleMs?: number
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
  /** Directories whose change ends the runtime once idle; default: the app's src and the framework it holds. */
  watch?: string[]
  /** How the process ends, with its exit code; for specs. */
  exit?: (code?: number) => void
}
export const IDLE_MS = 30 * 60_000
export const CLOSE_MS = 8000
/** How long after the last change the runtime waits before ending, so a save of several files counts once. */
export const RELOAD_MS = 500

/** The app's own source and the framework it holds, under the app root, above its scripts/open.ts entry. */
export const sourceDirs = (entry = process.argv[1]!): string[] => {
  const root = dirname(dirname(resolve(entry)))

  return [join(root, "src"), join(root, "framework")].filter((dir) => existsSync(dir)).map((dir) => realpathSync(dir))
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

  const log = options.log ?? ((line: string) => console.error(line))
  const exit = options.exit ?? ((code?: number) => process.exit(code ?? 0))
  const refused = (error: Denied) => {
    log(error.message)
    exit(DENIED_EXIT)

    return undefined
  }
  const dir = stateDir(app, { id: session }, options.env)
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

  const running = run(app.surface, { ...modelPorts(dir), log })
  let idle: ReturnType<typeof setTimeout> | undefined
  let closing: Promise<void> | undefined
  const watchers: FSWatcher[] = []
  // Whatever refuses to close, the process ends within CLOSE_MS of the decision: the lock must not outlive the service.
  const close = () =>
    (closing ??= (async () => {
      clearTimeout(idle)
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
  // A change in the code: end as soon as nothing runs, and the next call wakes the new code.
  let reload: ReturnType<typeof setTimeout> | undefined
  const changed = (file: string) => {
    clearTimeout(reload)
    reload = setTimeout(() => {
      log(`${file} changed: ending when idle, the next call wakes the new code`)

      const when = () => (running.active() === 0 ? end() : void setTimeout(when, RELOAD_MS).unref())

      when()
    }, RELOAD_MS)
    reload.unref()
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

  // Each instance has a new page address.
  const preferred = options.port ?? 0
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

  return { port, close }
}
