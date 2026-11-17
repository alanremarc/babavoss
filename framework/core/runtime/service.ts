// The resident process's identity and discovery. The lock says who owns the state directory; the endpoint file is
// discovery, never a lock. A client finds a live service or wakes one, and treats a lost response as an uncertain outcome.
// A service whose process lives on with nothing listening at its port, longer than one takes to close, is deaf: its
// client ends that process, once and only where it is this session's runtime, and wakes a fresh one, which takes the state.
import { appendFileSync, closeSync, existsSync, fstatSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { ownState, sessionCwd } from "../state/state.ts"

// The token is one instance's secret: the command and the hooks send it as a header, read from the endpoint file, and it
// changes as the runtime starts again. It is kept in the state directory, its owner's alone, and never given to a client
// that did not send it.
/** `instance` names this runtime's process to the agent, as the token, a secret, cannot: a restart is followed by it. */
export type Identity = { dir: string; token: string; pid: number; instance: string }
/** `closing`: since when the service has been closing its door, as it does before it lets go of the session. */
export type Endpoint = Identity & { port: number; closing?: number }
/** The response header every answer of a service carries: its token. */
export const SERVICE_HEADER = "babavoss-service"
/** The request header naming the actor; the person when absent. */
export const ACTOR_HEADER = "babavoss-actor"
/** The request header of a client's probe for whether the service is up: answered at once, as the code stands. */
export const PROBE_HEADER = "babavoss-probe"
/** The response header of a service that restarts for changed code without doing what it was asked: ask again, of the one in its place. */
export const STALE_HEADER = "babavoss-stale"
/** The request header naming one run of the word, one tool call of the agent's: what tells calls apart for the hooks' silence. */
export const CALL_HEADER = "babavoss-call"
/** The request header a client names a call it makes by, which the call carries: a program acting as the person finds its own by it. */
export const CALL_ID_HEADER = "babavoss-call-id"
export const STARTUP_MS = 10_000
export const REQUEST_MS = 30_000
/**
 * How long a live service may refuse connections before its client takes it for deaf: longer than a runtime takes to close
 * its door and let go of the session, CLOSE_MS, counted from when it said it was closing, or else from the first refusal seen.
 */
export const DEAF_MS = 10_000

export const endpointFile = (dir: string) => join(dir, "service.json")
export const logFile = (dir: string) => join(dir, "service.log")
/** Where the session's runtime last listened: kept when it ends, so the next instance asks for the same address. */
export const portFile = (dir: string) => join(dir, "port")
export const lastPort = (dir: string): number | undefined => {
  try {
    const port = Number(readFileSync(portFile(dir), "utf8"))

    return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * The environment refuses what a runtime requires: a resident process, a file lock, loopback. Not a fault to retry: the
 * root does not run here, and the message says why, for an agent to read.
 */
export class Denied extends Error {}
/** How a runtime the environment refuses ends, so the process that woke it can say why. */
export const DENIED_EXIT = 78

const LOOPBACK_REFUSED = "the sandbox refuses loopback connections, and the root is reached through its runtime over loopback"

/** A file system error that says not allowed rather than broken, as a sandbox around the state directory says it; else the error. */
export const deniedState = (error: unknown, dir: string): unknown =>
  ["EPERM", "EACCES", "EROFS"].includes((error as { code?: string } | undefined)?.code ?? "")
    ? new Denied(`the sandbox refuses writing its state in ${dir}`)
    : error

const failedWith = (error: unknown, code: string) =>
  error instanceof TypeError && [error, error.cause].some((e) => (e as { code?: string } | undefined)?.code === code)

/** BSD flock locks follow the open descriptor across the short-lived locking utility and release on process death. */
export function ownService(dir: string) {
  ownState(dir, true)

  const file = join(dir, "service.lock")
  const fd = openSync(file, "a+", 0o600)
  const actual = fstatSync(fd)
  const expected = statSync(file)

  if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw new Error("The service lock changed under us")

  const bsd = ["darwin", "freebsd", "openbsd"].includes(process.platform)
  const result = spawnSync(bsd ? "/usr/bin/lockf" : "flock", bsd ? ["-s", "-t", "0", "3"] : ["-n", "3"], {
    stdio: ["ignore", "pipe", "pipe", fd],
    encoding: "utf8",
    timeout: 1000,
  })

  if (result.error || result.status !== 0) {
    closeSync(fd)
    if (!result.error && result.status === (bsd ? 75 : 1)) return undefined
    throw new Denied(
      `its runtime needs a file lock and ${bsd ? "/usr/bin/lockf" : "flock"} cannot take one: ${(result.error?.message ?? result.stderr).trim()}`
    )
  }

  const identity: Identity = { dir, token: randomUUID(), pid: process.pid, instance: randomUUID().slice(0, 8) }
  let released = false

  return {
    identity,
    publish(port: number, closing?: number) {
      const temporary = `${endpointFile(dir)}.${identity.token}.tmp`

      try {
        writeFileSync(temporary, JSON.stringify({ ...identity, port, ...(closing && { closing }) }), { mode: 0o600 })
        renameSync(temporary, endpointFile(dir))
        writeFileSync(portFile(dir), String(port), { mode: 0o600 })
      } finally {
        rmSync(temporary, { force: true })
      }
    },
    /** Its door is closing from now: said in the endpoint file it published, if it is still this one's. */
    closing() {
      try {
        const endpoint = JSON.parse(readFileSync(endpointFile(dir), "utf8")) as Endpoint

        if (endpoint.token === identity.token && !released) this.publish(endpoint.port, Date.now())
      } catch {}
    },
    release() {
      if (released) return
      released = true
      try {
        const endpoint = JSON.parse(readFileSync(endpointFile(dir), "utf8")) as Endpoint

        if (endpoint.token === identity.token) rmSync(endpointFile(dir), { force: true })
      } catch {
        // A failed start may never have published an endpoint.
      } finally {
        closeSync(fd)
      }
    },
  }
}

/** The live service of this directory, or undefined. A health check is a GET that answers with the endpoint's token. */
export async function findService(dir: string, signal?: AbortSignal): Promise<Endpoint | undefined> {
  const found = await probeService(dir, signal)

  return found?.up ? found.endpoint : undefined
}

/**
 * The service the endpoint file names, and whether it is up; `refused` where its process is alive and nothing listens at
 * its port, as when it closes, or when its door is gone. A probe is answered at once, even while requests are held.
 */
async function probeService(dir: string, signal?: AbortSignal): Promise<{ endpoint: Endpoint; up?: true; refused?: true } | undefined> {
  let endpoint: Endpoint

  try {
    endpoint = JSON.parse(readFileSync(endpointFile(dir), "utf8")) as Endpoint
  } catch {
    return
  }
  if (endpoint.dir !== dir || typeof endpoint.token !== "string" || !Number.isInteger(endpoint.port) || endpoint.port < 1) return
  try {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
      headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token, [PROBE_HEADER]: "1" },
      signal: AbortSignal.any([AbortSignal.timeout(300), ...(signal ? [signal] : [])]),
    })

    await response.body?.cancel()
    if (response.headers.get(SERVICE_HEADER) === endpoint.token && !response.headers.has(STALE_HEADER)) return { endpoint, up: true }
  } catch (error) {
    if (failedWith(error, "EPERM")) throw new Denied(LOOPBACK_REFUSED)
    if (failedWith(error, "ECONNREFUSED") && alive(endpoint.pid)) return { endpoint, refused: true }
  }

  return { endpoint }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}
/** Whether a process is this session's runtime of this entry, by its command line: it was woken as `ENTRY --serve SESSION`. */
export const isRuntime = (pid: number, entry: string, session: string): boolean => {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false

  const listed = spawnSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 1000 })
  const paths = new Set([entry])

  try {
    paths.add(realpathSync(entry))
  } catch {}

  return listed.status === 0 && [...paths].some((path) => listed.stdout.includes(`${path} --serve ${session}`))
}
/**
 * Ends a deaf runtime: only the process the endpoint names, only where it is this session's runtime of this entry, SIGTERM
 * and then SIGKILL. Answers whether it is gone, so its lock is free for a fresh one.
 */
export async function endDeaf(endpoint: Endpoint, entry: string, session: string): Promise<boolean> {
  const gone = async (ms: number) => {
    for (const until = Date.now() + ms; Date.now() < until; await sleep(50)) if (!alive(endpoint.pid)) return true

    return !alive(endpoint.pid)
  }

  if (!isRuntime(endpoint.pid, entry, session)) return false
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(endpoint.pid, signal)
    } catch {}
    if (await gone(2000)) return true
  }

  return false
}
/** Since when a refusing service has refused: since it said it was closing, or since `seen`, the first refusal its client saw. */
const deafSince = (endpoint: Endpoint, seen: number) => (typeof endpoint.closing === "number" ? Math.min(endpoint.closing, seen) : seen)

/**
 * Starts the root's runtime entry for a session, detached, logging to the session's state directory; it owns that directory
 * from then on. It runs in the directory the session runs in, as recorded, whoever wakes it and from wherever; before any
 * record, or when the recorded one is gone, in the waker's.
 */
export function wakeService(dir: string, entry: string | URL, session: string, env: NodeJS.ProcessEnv = process.env): ChildProcess {
  ownState(dir)

  const log = openSync(logFile(dir), "a", 0o600)
  const recorded = sessionCwd(dir)

  try {
    // Never under bun's hot reload: the runtime takes changed code by starting again, as its mode says (runtime.ts).
    const child = spawn(process.execPath, [typeof entry === "string" ? entry : fileURLToPath(entry), "--serve", session], {
      detached: true,
      stdio: ["ignore", "ignore", log],
      env,
      cwd: recorded && existsSync(recorded) ? recorded : process.cwd(),
    })

    child.on("error", (error) => appendFileSync(logFile(dir), `${error.message}\n`))
    child.unref()

    return child
  } finally {
    closeSync(log)
  }
}

/** A request of the service; `id` names a call, as CALL_ID_HEADER carries it. */
export type Request = { method?: string; actor?: string; id?: string; body?: string; accept?: string; signal?: AbortSignal }

/** Why a runtime the environment refused gave up: the last line it logged, without the time it begins with. */
const deniedReason = (dir: string): string => {
  try {
    return (readFileSync(logFile(dir), "utf8").trim().split("\n").at(-1) ?? "").replace(/^\d{4}-\d\d-\d\dT\S+Z /, "")
  } catch {
    return ""
  }
}

export const logSize = (dir: string) => {
  try {
    return statSync(logFile(dir)).size
  } catch {
    return 0
  }
}
/** What a runtime that did not start logged after `offset`, as bun says why code does not load: the file and the error, its last lines. */
const saidSince = (dir: string, offset: number): string => {
  try {
    return readFileSync(logFile(dir)).subarray(offset).toString("utf8").trim().split("\n").slice(-20).join("\n")
  } catch {
    return ""
  }
}

/** A client of a session's service: finds it or wakes it with `entry`, then requests. */
export function serviceClient(dir: string, session: string, entry: string | URL, env?: NodeJS.ProcessEnv) {
  const path = typeof entry === "string" ? entry : fileURLToPath(entry)
  // A deaf runtime is ended once by this client; a second one that is deaf too is not for it to fix.
  let replaced = false
  const ready = async (signal?: AbortSignal): Promise<Endpoint> => {
    let bounded = AbortSignal.any([AbortSignal.timeout(STARTUP_MS), ...(signal ? [signal] : [])])
    let child: ChildProcess | undefined
    let nextLaunch = 0
    let logged = 0
    let refusing: { token: string; seen: number } | undefined

    try {
      while (!bounded.aborted) {
        const found = await probeService(dir, bounded)

        if (found?.up) return found.endpoint
        // Alive with nothing at its port: it closes, which ends within CLOSE_MS, or its door is gone, which never ends.
        if (found?.refused) {
          const { endpoint } = found

          if (refusing?.token !== endpoint.token) {
            refusing = { token: endpoint.token, seen: Date.now() }
            bounded = AbortSignal.any([AbortSignal.timeout(DEAF_MS + STARTUP_MS), ...(signal ? [signal] : [])])
          }
          if (Date.now() - deafSince(endpoint, refusing.seen) < DEAF_MS) {
            await sleep(50, undefined, { signal: bounded })
            continue
          }
          if (replaced || !(await endDeaf(endpoint, path, session))) throw new Error(`its runtime, process ${endpoint.pid}, does not answer at 127.0.0.1:${endpoint.port}`)
          replaced = true
          refusing = undefined
          bounded = AbortSignal.any([AbortSignal.timeout(STARTUP_MS), ...(signal ? [signal] : [])])
          appendFileSync(logFile(dir), `${new Date().toISOString()} its runtime, process ${endpoint.pid}, had stopped answering and was ended; a fresh one takes the state\n`)
          continue
        }
        refusing = undefined
        if (child?.exitCode === DENIED_EXIT) throw new Denied(deniedReason(dir) || "the environment refuses what its runtime requires")
        if (child && !child.pid) throw new Denied("the environment refuses starting its runtime as a process of its own")
        if (child && (child.signalCode !== null || (child.exitCode !== null && child.exitCode !== 0)))
          throw new Error(`the runtime failed to start${saidSince(dir, logged).replace(/^(?=.)/, ": ")}`)
        if ((!child || child.exitCode !== null) && Date.now() >= nextLaunch) {
          logged = logSize(dir)
          child = wakeService(dir, entry, session, env)
          nextLaunch = Date.now() + 250
        }
        await sleep(50, undefined, { signal: bounded })
      }
      throw bounded.reason
    } catch (error) {
      const refused = deniedState(error, dir)

      if (refused instanceof Denied) throw refused
      throw new Error(`The runtime did not become ready: ${error instanceof Error ? error.message : String(error)}. See ${logFile(dir)}`)
    }
  }

  return {
    ready,
    async request(path: string, init: Request = {}): Promise<Response> {
      const signal = AbortSignal.any([AbortSignal.timeout(REQUEST_MS), ...(init.signal ? [init.signal] : [])])

      while (!signal.aborted) {
        const endpoint = await ready(signal)
        let response: Response

        try {
          response = await fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
            method: init.method ?? "GET",
            body: init.body,
            signal,
            headers: {
              accept: init.accept ?? "application/json",
              "content-type": "application/json",
              [SERVICE_HEADER]: endpoint.token,
              ...(init.actor && { [ACTOR_HEADER]: init.actor }),
              ...(init.id && { [CALL_ID_HEADER]: init.id }),
            },
          })
        } catch (error) {
          // A refused connection carried nothing: the service is between an old port closing and a new one listening.
          if (failedWith(error, "EPERM")) throw new Denied(LOOPBACK_REFUSED)
          if (failedWith(error, "ECONNREFUSED")) {
            await sleep(50, undefined, { signal })
            continue
          }
          throw new Error(`Request outcome is uncertain; read state before retrying. ${error instanceof Error ? error.message : String(error)}`)
        }
        if (!response.headers.has(STALE_HEADER)) return response
        // It gave way to a new one, having done nothing: asked again, of that one.
        await response.body?.cancel()
        await sleep(50, undefined, { signal })
      }
      throw signal.reason
    },
  }
}
export type ServiceClient = ReturnType<typeof serviceClient>
