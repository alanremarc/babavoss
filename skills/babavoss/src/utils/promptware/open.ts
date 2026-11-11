// Compute an app's open answer in scratch state, then stop its runtime and remove the state.
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { endpointFile, logFile, readJsonFile, type Endpoint } from "#babavoss/core/index.ts"

const WAKE_MS = 10_000
const END_MS = 5_000

export type OpenResult = { status: "ready" | "failed"; text: string; output: string; command: string; tookMs: number; error?: string }

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

/** Stop every runtime woken under the scratch state: wait for one still waking to publish its endpoint, SIGTERM, then SIGKILL. */
export async function stopRuntimes(state: string, waking: boolean): Promise<void> {
  const sessions = join(state, "sessions")
  const dirs = existsSync(sessions)
    ? readdirSync(sessions).flatMap((name) =>
        readdirSync(join(sessions, name), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(sessions, name, entry.name))
      )
    : []

  await Promise.all(
    dirs.map(async (dir) => {
      // A command killed mid-wake may leave a runtime starting: the log is opened before it is spawned, the endpoint once it listens.
      for (const until = Date.now() + WAKE_MS; waking && existsSync(logFile(dir)) && !existsSync(endpointFile(dir)) && Date.now() < until;) await sleep(100)

      let endpoint: Endpoint | undefined

      try {
        endpoint = readJsonFile<Endpoint>(endpointFile(dir))
      } catch {
        return
      }
      if (!endpoint || !alive(endpoint.pid)) return
      try {
        process.kill(endpoint.pid, "SIGTERM")
      } catch {
        return
      }
      for (const until = Date.now() + END_MS; alive(endpoint.pid) && Date.now() < until;) await sleep(50)
      if (alive(endpoint.pid)) process.kill(endpoint.pid, "SIGKILL")
    })
  )
}

export async function runOpen(dir: string, signal: AbortSignal): Promise<OpenResult> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "promptware-")))
  const state = join(root, "state")
  const bin = join(root, "bin")

  mkdirSync(bin)

  const args = [join(dir, "scripts/open.ts"), "--session", randomUUID()]
  const command = ["bun", ...args].map((v) => JSON.stringify(v)).join(" ")
  const started = performance.now()
  let killed = false

  try {
    return await new Promise<OpenResult>((resolve) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLAUDE|CODEX|BABAVOSS)_/.test(key)))
      const child = spawn(process.execPath, args, {
        cwd: dir,
        env: { ...env, BABAVOSS_HOME: state, BABAVOSS_BIN: bin },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
      let stdout = "",
        stderr = "",
        error: string | undefined
      const stop = () => {
        killed = true
        error = signal.aborted ? "stopped" : "open exceeded 60 seconds"
        try {
          process.kill(-child.pid!, "SIGKILL")
        } catch {
          /* already gone */
        }
      }
      const timer = setTimeout(stop, 60_000)

      signal.addEventListener("abort", stop, { once: true })
      if (signal.aborted) stop()
      child.stdout.on("data", (data) => {
        stdout += data
      })
      child.stderr.on("data", (data) => {
        stderr += data
      })
      child.on("error", (e) => {
        error = e.message
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", stop)
        if (code !== 0) error ??= `exited ${code}`
        resolve({
          status: error ? "failed" : "ready",
          text: error ? "" : stdout,
          output: stdout + stderr,
          command,
          tookMs: Math.round(performance.now() - started),
          ...(error && { error }),
        })
      })
    })
  } finally {
    try {
      await stopRuntimes(state, killed)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}
