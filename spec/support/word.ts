// What the specs of the standalone client and the root's door share: a root set up with a machine, bin and state of its
// own, the client's path, an answer's printed command, and the cleanup after each test.
import { notesRoot } from "../support/notes.ts"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export const client = resolve("framework/core/bv/bv.ts")

/** A handle's command as an answer prints it: its block's head, with its name for ACTION and its line's arguments for the rest. */
export function printed(answer: string, name: string): string {
  const lines = answer.split("\n")
  const at = lines.findIndex((line) => line === `  ${name}` || line.startsWith(`  ${name} `))
  const head = lines.slice(0, at).findLast((line) => line.startsWith("actions: "))!
  const own = lines[at]!.trim().split("   ")[0]!.split(" ")

  return head.slice("actions: ".length).replace(" name=value…", "").replace("ACTION", own.join(" "))
}
export const roots: string[] = []

export function setup(dev = false) {
  const root = mkdtempSync(join(tmpdir(), "bv-spec-"))

  roots.push(root)

  const entry = join(notesRoot(join(root, "root")), "scripts/open.ts")
  const bin = join(root, "bin")

  mkdirSync(bin)

  const env = {
    ...process.env,
    PATH: process.env.PATH,
    HOME: root,
    CLAUDE_CODE_SESSION_ID: "S",
    CODEX_THREAD_ID: "",
    ANTIGRAVITY_CONVERSATION_ID: "",
    BABAVOSS_HOME: root,
    BABAVOSS_BIN: bin,
    BABAVOSS_DEV: dev ? "1" : "0",
    BABAVOSS_HUSH_MS: "",
  }
  const run = (args: string[] = [], file = client, input = "") => {
    const result = spawnSync(process.execPath, [file, ...args], { env, input, encoding: "utf8", timeout: 15000 })

    return { status: result.status, out: result.stdout, err: result.stderr }
  }
  const open = () => run([], entry)
  const endpoint = () =>
    JSON.parse(readFileSync(join(env.BABAVOSS_HOME, "sessions/S/demo/service.json"), "utf8")) as { pid: number; port: number; token: string; instance: string }

  return { entry, root, bin, env, run, open, endpoint }
}
/** Ends each root a spec started and removes what it wrote; a spec file runs it after each test. */
export async function cleanup() {
  for (const root of roots.splice(0)) {
    try {
      const endpoint = JSON.parse(readFileSync(join(root, "sessions/S/demo/service.json"), "utf8")) as { pid: number }

      process.kill(endpoint.pid, "SIGTERM")
    } catch {}
    // Let the resident process drain before removing its state.
    await Bun.sleep(100)
    rmSync(root, { recursive: true, force: true })
  }
}
