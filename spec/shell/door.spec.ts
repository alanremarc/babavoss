// The shell through the runtime's door, as the agent's text: what changes in a tab is said once in an answer, and what
// the person did there is still told at / on the agent's next request; who a tab needs is said first, and its notices once,
// to the agent as lines and to the page as events.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { action, defineRoot, surface, view, type Update } from "../../framework/core/index.ts"
import { startRuntime } from "../../framework/core/runtime/runtime.ts"
import { ACTOR_HEADER, endpointFile, SERVICE_HEADER, type Endpoint } from "../../framework/core/runtime/service.ts"
import { readJsonFile } from "../../framework/core/state/json-file.ts"
import { shell } from "../../framework/shell/src/surface.ts"

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
  update: (m: Model, { text }): Update<Model, never> => ({ model: { ...m, note: text }, ...(text && { notices: [`noted ${text}`] }) }),
})
const grow = action({
  name: "grow",
  description: "add six, by a command",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, { kind: "grow" }> => ({ model: m, commands: [{ kind: "grow" }] }),
})
const pages = view([bump, note, grow], {
  "/": (m) => ({
    title: "Counter",
    n: m.n,
    note: m.note,
    ...(m.n > 5 && { attention: { who: "person", why: "to say whether so many is right" } }),
    bump: bump.bind({}),
    note_: note.bind({}),
    grow: grow.bind({}),
  }),
})
const counter = surface<Model, { kind: "grown" | "none" }, { kind: "grow" }>({
  description: "counts",
  init: () => ({ n: 0, note: "" }),
  update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : msg.kind === "grown" ? { model: { ...m, n: m.n + 6 } } : { model: m }),
  view: pages.view,
  run: async (_c, send) => {
    await new Promise((done) => setTimeout(done, 100))
    send({ kind: "grown" })
  },
  failed: () => ({ kind: "none" }),
})
const dirs: string[] = []
const closes: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of closes.splice(0)) await close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const started = async () => {
  const dir = mkdtempSync(join(tmpdir(), "shell-door-"))

  dirs.push(dir)
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1" }))

  const root = defineRoot({ name: "tabs", ui: dir, surface: shell({ counter }, dir) })
  const runtime = await startRuntime(root, ["--session", "S"], {
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

  return { runtime, endpoint, request }
}

it("says a tab's change once in the answer to a call there, and still tells at / what the person did in the tab", async () => {
  const { request } = await started()

  expect(await request("/?open")).toContain('/ open surface="counter"   open a counter tab')
  expect(await request("/", { handle: "open", args: { surface: "counter" } })).toContain('\n+ /tabs/1 counter "Counter"\nactions: bump, note')
  // The agent's own call: its change is in the answer once, not again under the tab's heading.
  expect(await request("/tabs/1", { handle: "bump", args: { by: "2" } })).toBe("n: 0 → 2")
  // The person acts in the tab; the agent's next call there says its own change and what was heard; what the person
  // changed at / is told at the next boundary, and the agent's own changes are not, though they were made after.
  await request("/tabs/1", { handle: "note", args: { text: "mine" } }, true)
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toBe("n: 2 → 3\nnotices:\ncounter /tabs/1: noted mine (by the person)")
  expect(await request("/_/wait?seconds=0")).toBe('changed by the person:\n/tabs/1 counter "Counter"\nnote: "" → "mine"')
  // A read of the tab shows it whole, so nothing of it is repeated from /.
  await request("/tabs/1", { handle: "bump", args: { by: 1 } }, true)
  expect(await request("/tabs/1")).not.toContain("changed:")
  expect(await request("/")).not.toContain("changed:")
})

it("says first at / who a tab needs, tells its notices once as lines by who caused them, and gives the page each as an event", async () => {
  const { runtime, endpoint, request } = await started()
  const stream = await fetch(`http://127.0.0.1:${runtime.port}/`, { headers: { accept: "text/event-stream", [SERVICE_HEADER]: endpoint.token } })
  const reader = stream.body!.getReader()
  let events = ""
  const read = async (until: string) => {
    while (!events.includes(until)) events += new TextDecoder().decode((await reader.read()).value)
  }

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "counter" } })
  expect(await request("/tabs/1", { handle: "note", args: { text: "mine" } })).toBe('note: "" → "mine"')
  await request("/tabs/1", { handle: "note", args: { text: "theirs" } }, true)
  await request("/tabs/1", { handle: "bump", args: { by: 6 } }, true)
  expect(await request("/_/wait?seconds=0")).toBe(
    [
      "notices:",
      "counter /tabs/1: noted theirs (by the person)",
      "changed by the person:",
      "+ need: the person, at /tabs/1 counter, to say whether so many is right",
      '/tabs/1 counter "Counter"',
      "n: 0 → 6",
      'note: "mine" → "theirs"',
    ].join("\n")
  )
  expect((await request("/")).split("\n").slice(0, 3)).toEqual(['title: "baba"', "needs: at\tsurface\twho\twhy", '"/tabs/1"\t"counter"\t"person"\t"to say whether so many is right"'])
  await read("noted theirs")
  expect(events).toContain('event: notice\ndata: {"text":"noted mine","at":"/tabs/1","from":"counter","by":"the agent"}')
  expect(events).toContain('event: notice\ndata: {"text":"noted theirs","at":"/tabs/1","from":"counter"}')
  await reader.cancel()
})

it("ends a wait on who is needed changing, though the surface changed it by itself and said nothing", async () => {
  const { request } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "counter" } })

  const from = Date.now()

  await request("/tabs/1", { handle: "grow", args: {} })
  expect(await request("/_/wait?seconds=5")).toBe(
    ["changed by the surface:", "+ need: the person, at /tabs/1 counter, to say whether so many is right", '/tabs/1 counter "Counter"', "n: 0 → 6"].join("\n")
  )
  expect(Date.now() - from).toBeLessThan(4000)
})
