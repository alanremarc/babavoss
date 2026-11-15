// The demo project's build, for the design document's scenarios: a surface that changes by itself. Its one command watches
// build.txt in the project, which the scenario writes, a status a line: `running`, `passed`, or `failed: why`. A run
// started is a fact alone; a failure is a notice too, and the agent's attention until a run passes.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { surface, view, type Update } from "babavoss/core/index.ts"

/** `read`: how many lines of the file the model has taken, so a restarted watch goes on from there. */
export type Model = { status: "idle" | "running" | "passed" | "failed"; why?: string; runs: number; read: number }
type Event = { kind: "status"; line: string; i: number } | { kind: "none" }
type Command = { kind: "watch"; from: number }

/** Where the scenario writes the build's status, in the directory the session runs in. */
export const BUILD_FILE = "build.txt"

const pages = view<Model, Command>([], {
  "/": (m) => ({
    title: "Build",
    status: m.status,
    ...(m.why && { why: m.why }),
    runs: m.runs,
    ...(m.status === "failed" && { attention: { who: "agent", why: "to fix the failing build" } }),
  }),
})

function update(m: Model, event: Event): Update<Model, Command> {
  if (event.kind !== "status" || event.i < m.read) return { model: m }

  const [status, ...rest] = event.line.split(":")
  const why = rest.join(":").trim()
  const read = event.i + 1

  if (status === "running") return { model: { status: "running", runs: m.runs + 1, read } }
  if (status === "passed") return { model: { status: "passed", runs: m.runs, read } }
  if (status === "failed") return { model: { status: "failed", why, runs: m.runs, read }, notices: [`The build failed: ${why}`] }

  return { model: { ...m, read } }
}

export default surface<Model, Event, Command>({
  description: "Watch the project's build. Use when a change is to be checked.",
  init: () => ({ status: "idle", runs: 0, read: 0 }),
  start: (m) => [{ kind: "watch", from: m.read }],
  session: () => true,
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : update(m, message)),
  view: pages.view,
  // Each new line of the file is one status, read in order.
  async run({ from }, send, signal) {
    let seen = from

    while (!signal.aborted) {
      let lines: string[] = []

      try {
        lines = readFileSync(join(process.cwd(), BUILD_FILE), "utf8").split("\n").filter(Boolean)
      } catch {}
      for (const [i, line] of lines.entries()) if (i >= seen) send({ kind: "status", line, i })
      seen = Math.max(seen, lines.length)
      await sleep(25)
    }
  },
  failed: () => ({ kind: "none" }),
})
