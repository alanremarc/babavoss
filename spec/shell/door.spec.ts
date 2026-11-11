// The shell through the runtime's door, as the agent's text: what changes in a tab is said once in an answer, and what
// the person did there is still told at / on the agent's next request.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { action, defineApp, surface, view, type Update } from "../../packages/babavoss/core/index.ts"
import { startRuntime } from "../../packages/babavoss/core/runtime/runtime.ts"
import { ACTOR_HEADER, endpointFile, SERVICE_HEADER, type Endpoint } from "../../packages/babavoss/core/runtime/service.ts"
import { readJsonFile } from "../../packages/babavoss/core/state/json-file.ts"
import { shell, util } from "../../packages/babavoss/shell/shell.ts"

type Model = { n: number; note: string }

const bump = action({
  name: "bump",
  description: "add",
  subject: {},
  inputs: { by: "number" },
  update: (m: Model, { by }): Update<Model, never> => ({ model: { ...m, n: m.n + by } }),
})
const note = action({
  name: "note",
  description: "note",
  subject: {},
  inputs: { text: "string" },
  update: (m: Model, { text }): Update<Model, never> => ({ model: { ...m, note: text } }),
})
const pages = view([bump, note], { "/": (m) => ({ title: "Counter", n: m.n, note: m.note, bump: bump.bind({}), note_: note.bind({}) }) })
const counter = util(
  "counter",
  "counts",
  surface<Model, { kind: "none" }, never>({
    description: "counts",
    init: () => ({ n: 0, note: "" }),
    update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : { model: m }),
    view: pages.view,
    run: async () => {},
    failed: () => ({ kind: "none" }),
  }),
  { open: "always" }
)
const dirs: string[] = []
const closes: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of closes.splice(0)) await close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it("says a tab's change once in the answer to a call there, and still tells at / what the person did in the tab", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shell-door-"))

  dirs.push(dir)
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1" }))

  const app = defineApp({ name: "tabs", ui: dir, surface: shell({ title: "Tabs", utils: [counter] }) })
  const runtime = await startRuntime(app, ["--session", "S"], {
    entry: join(dir, "scripts/open.ts"),
    env: { BABAVOSS_HOME: dir },
    idleMs: 60_000,
    watch: [],
    log: () => {},
    exit: () => {},
  })

  if (!runtime) throw new Error("not started")
  closes.push(() => runtime.close())

  const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "tabs")))!
  const request = async (path: string, call?: unknown, person = false) =>
    (
      await fetch(`http://127.0.0.1:${runtime.port}${path}`, {
        method: call ? "POST" : "GET",
        headers: { accept: person ? "application/json" : "text/plain", [SERVICE_HEADER]: endpoint.token, ...(person && { [ACTOR_HEADER]: "person" }) },
        ...(call ? { body: JSON.stringify(call) } : {}),
      })
    ).text()

  expect(await request("/?open")).toContain("tabs.0.facts.n: 0")
  // The agent's own call: its change is in the answer once, not again under tabs.0.facts.
  expect(await request("/tabs/1", { handle: "bump", args: { by: "2" } })).toBe("n: 0 → 2")
  // The person acts in the tab; the agent's next call there says its own change, and at / what the person did.
  await request("/tabs/1", { handle: "note", args: { text: "mine" } }, true)
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toBe('n: 2 → 3\nchanged:\ntabs.0.facts.note: "" → "mine"')
  // A read of the tab shows it whole, so nothing of it is repeated from /.
  await request("/tabs/1", { handle: "bump", args: { by: 1 } }, true)
  expect(await request("/tabs/1")).not.toContain("changed:")
  expect(await request("/")).not.toContain("changed:")
})
