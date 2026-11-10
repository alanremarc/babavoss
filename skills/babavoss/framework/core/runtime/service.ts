// The resident process's identity and discovery. The lock says who owns the state directory; the endpoint file is
// discovery, never a lock. A client finds a live service or wakes one, and treats a lost response as an uncertain outcome.
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { sessionCwd } from "../state/state.ts"

export type Identity = { dir: string; token: string; pid: number }
export type Endpoint = Identity & { port: number }
/** The response header every answer of a service carries: its token. */
export const SERVICE_HEADER = "babavoss-service"
/** The request header naming the actor; the person when absent. */
export const ACTOR_HEADER = "babavoss-actor"
export const STARTUP_MS = 10_000
export const REQUEST_MS = 30_000

export const endpointFile = (dir: string) => join(dir, "service.json")
export const logFile = (dir: string) => join(dir, "service.log")

/**
 * The environment refuses what a runtime requires: a resident process, a file lock, loopback. Not a fault to retry: the
 * app does not run here, and the message says why, for an agent to read.
 */
export class Denied extends Error {}
/** How a runtime the environment refuses ends, so the process that woke it can say why. */
export const DENIED_EXIT = 78

const LOOPBACK_REFUSED = "the sandbox refuses loopback connections, and the app is reached through its runtime over loopback"

/** A file system error that says not allowed rather than broken, as a sandbox around the state directory says it; else the error. */
export const deniedState = (error: unknown, dir: string): unknown =>
  ["EPERM", "EACCES", "EROFS"].includes((error as { code?: string } | undefined)?.code ?? "")
    ? new Denied(`the sandbox refuses writing its state in ${dir}`)
    : error

const failedWith = (error: unknown, code: string) => error instanceof TypeError && (error.cause as { code?: string } | undefined)?.code === code

/** BSD flock locks follow the open descriptor across the short-lived locking utility and release on process death. */
export function ownService(dir: string) {
  mkdirSync(dir, { recursive: true })

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

  const identity: Identity = { dir, token: randomUUID(), pid: process.pid }
  let released = false

  return {
    identity,
    publish(port: number) {
      const temporary = `${endpointFile(dir)}.${identity.token}.tmp`

      try {
        writeFileSync(temporary, JSON.stringify({ ...identity, port }), { mode: 0o600 })
        renameSync(temporary, endpointFile(dir))
      } finally {
        rmSync(temporary, { force: true })
      }
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
  try {
    const endpoint = JSON.parse(readFileSync(endpointFile(dir), "utf8")) as Endpoint

    if (endpoint.dir !== dir || typeof endpoint.token !== "string" || !Number.isInteger(endpoint.port) || endpoint.port < 1) return

    const response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
      headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token },
      signal: AbortSignal.any([AbortSignal.timeout(300), ...(signal ? [signal] : [])]),
    })

    await response.body?.cancel()
    if (response.headers.get(SERVICE_HEADER) === endpoint.token) return endpoint
  } catch (error) {
    if (failedWith(error, "EPERM")) throw new Denied(LOOPBACK_REFUSED)
  }
}

/**
 * Starts the app's runtime entry for a session, detached, logging to the session's state directory; it owns that directory
 * from then on. It runs in the directory the session runs in, as recorded, whoever wakes it and from wherever; before any
 * record, or when the recorded one is gone, in the waker's.
 */
export function wakeService(dir: string, entry: string | URL, session: string, env: NodeJS.ProcessEnv = process.env): ChildProcess {
  mkdirSync(dir, { recursive: true })

  const log = openSync(logFile(dir), "a", 0o600)
  const recorded = sessionCwd(dir)

  try {
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

export type Request = { method?: string; actor?: string; body?: string; accept?: string; signal?: AbortSignal }

/** Why a runtime the environment refused gave up: the last line it logged. */
const deniedReason = (dir: string): string => {
  try {
    return readFileSync(logFile(dir), "utf8").trim().split("\n").at(-1) ?? ""
  } catch {
    return ""
  }
}

/** A client of a session's service: finds it or wakes it with `entry`, then requests. */
export function serviceClient(dir: string, session: string, entry: string | URL, env?: NodeJS.ProcessEnv) {
  const ready = async (signal?: AbortSignal): Promise<Endpoint> => {
    const bounded = AbortSignal.any([AbortSignal.timeout(STARTUP_MS), ...(signal ? [signal] : [])])
    let child: ChildProcess | undefined
    let nextLaunch = 0

    try {
      while (!bounded.aborted) {
        const endpoint = await findService(dir, bounded)

        if (endpoint) return endpoint
        if (child?.exitCode === DENIED_EXIT) throw new Denied(deniedReason(dir) || "the environment refuses what its runtime requires")
        if (child && !child.pid) throw new Denied("the environment refuses starting its runtime as a process of its own")
        if (child && (child.signalCode !== null || (child.exitCode !== null && child.exitCode !== 0))) throw new Error("the runtime failed to start")
        if ((!child || child.exitCode !== null) && Date.now() >= nextLaunch) {
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

        try {
          return await fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
            method: init.method ?? "GET",
            body: init.body,
            signal,
            headers: {
              accept: init.accept ?? "application/json",
              "content-type": "application/json",
              [SERVICE_HEADER]: endpoint.token,
              ...(init.actor && { [ACTOR_HEADER]: init.actor }),
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
      }
      throw signal.reason
    },
  }
}
export type ServiceClient = ReturnType<typeof serviceClient>
