// The shell through the runtime's door, as the agent's text: what changes in a tab is said once in an answer, and what
// the person did there is still told at / on the agent's next request; who a tab needs is said first, and its notices once,
// to the agent as lines and to the page as events; what was heard and not yet told is told once, though the runtime
// started again in between.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, setSystemTime } from "bun:test"
import { action, defineRoot, detail, surface, view, type Update } from "../../framework/core/index.ts"
import { startRuntime } from "../../framework/core/runtime/runtime.ts"
import { ACTOR_HEADER, CALL_HEADER, CALL_ID_HEADER, endpointFile, SERVICE_HEADER, type Endpoint } from "../../framework/core/runtime/service.ts"
import { HARNESS_HEADER, HUSH_MS, NO_HOOKS_LINE, QUIET_LINE, type Unheard } from "../../framework/core/runtime/turn.ts"
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
/** A board of items: one finished is detail, as its tokens are; marking one is the page's own; one waiting for review needs the agent. */
type Board = { items: { n: number; title: string; done: boolean; reviewed: boolean }[]; tokens: number; marked: number[] }

const add = action({
  name: "add",
  description: "add an item",
  subject: {},
  inputs: { title: "string" },
  update: (m: Board, { title }): Update<Board, never> => ({ model: { ...m, items: [...m.items, { n: m.items.length + 1, title, done: false, reviewed: false }] } }),
})
const finish = action({
  name: "finish",
  description: "finish an item",
  subject: { n: "number" },
  inputs: {},
  update: (m: Board, { n }): Update<Board, never> => ({
    model: { ...m, tokens: m.tokens + 10, items: m.items.map((i) => (i.n === n ? { ...i, done: true } : i)) },
    notices: [{ text: `item ${n} is finished`, at: `/items/${n}` }],
  }),
})
const review = action({
  name: "review",
  description: "review a finished item",
  subject: { n: "number" },
  inputs: {},
  update: (m: Board, { n }): Update<Board, never> => ({ model: { ...m, items: m.items.map((i) => (i.n === n ? { ...i, reviewed: true } : i)) } }),
})
const reset = action({ name: "reset", description: "reset the tokens", subject: {}, inputs: {}, update: (m: Board): Update<Board, never> => ({ model: { ...m, tokens: 0 } }) })
const mark = action({
  name: "mark",
  description: "the person marks an item on the page",
  subject: {},
  inputs: { n: "number" },
  quiet: true,
  update: (m: Board, { n }): Update<Board, never> => ({ model: { ...m, marked: [...m.marked, n] } }),
})
const boardPages = view([add, finish, review, reset, mark], {
  "/": (m) => {
    const waiting = m.items.filter((i) => i.done && !i.reviewed)

    return {
      title: "Board",
      items: m.items.map((i) => {
        const row = { at: `/items/${i.n}`, n: i.n, title: i.title, done: i.done }

        return i.done && i.reviewed ? detail(row) : row
      }),
      tokens: detail(m.tokens),
      marked: m.marked,
      ...(waiting.length && { attention: { who: "agent", why: `to review ${waiting.map((i) => i.n).join(", ")}` } }),
      add: add.bind({}),
      reset: reset.bind({}),
      mark: mark.bind({}),
    }
  },
  "/items/:n": (m, { n }) => {
    const i = m.items.find((i) => i.n === Number(n))

    return i && { ...i, ...(!i.done && { finish: finish.bind({ n: i.n }) }), ...(i.done && !i.reviewed && { review: review.bind({ n: i.n }) }) }
  },
})
const board = surface<Board, { kind: "none" }, never>({
  description: "a board",
  init: () => ({ items: [], tokens: 0, marked: [] }),
  update: (m, msg) => (msg.kind === "call" ? boardPages.update(m, msg) : { model: m }),
  view: boardPages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
const dirs: string[] = []
const closes: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of closes.splice(0)) await close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The shell's runtime for session S, in a new directory or, to start again where one ran, in `dir`. */
const started = async (dir = mkdtempSync(join(tmpdir(), "shell-door-"))) => {
  if (!dirs.includes(dir)) dirs.push(dir)
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1" }))

  const root = defineRoot({ name: "tabs", ui: dir, surface: shell({ counter, board }, dir) })
  const runtime = await startRuntime(root, ["--session", "S"], {
    entry: join(dir, "scripts/open.ts"),
    env: { BABAVOSS_HOME: dir },
    strengths: { weak: 60_000 },
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

  /** A hook's word on the turn: a message of the person's starts one. */
  const turn = async (event: string) =>
    void (await fetch(`http://127.0.0.1:${runtime.port}/_/turn`, { method: "POST", headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token }, body: event }))

  return { runtime, endpoint, request, dir, turn }
}

it("says a tab's change once in the answer to a call there, and still tells at / what the person did in the tab", async () => {
  const { request } = await started()

  expect(await request("/?open")).toContain("actions: bv tabs / ACTION name=value…\n  open surface=NAME   in a new tab, unless its surface keeps one")
  // A tab opened is one line: its heading, its actions by name, and where to read the rest.
  expect(await request("/", { handle: "open", args: { surface: "counter" } })).toBe('+ /counter "Counter" (tab 1), actions: bump, note, grow; read /counter')
  // The agent's own call: its change is in the answer once, not again under the tab's heading.
  expect(await request("/tabs/1", { handle: "bump", args: { by: "2" } })).toBe("n: 0 → 2")
  // The person acts in the tab; the agent's next call there says its own change and what was heard; what the person
  // changed at / is told at the next boundary, and the agent's own changes are not, though they were made after.
  // What a call with a notice changed, the notice stands for: it is not told again at /.
  await request("/tabs/1", { handle: "note", args: { text: "mine" } }, true)
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toBe("n: 2 → 3\nnotices:\n/counter: noted mine (by the person)")
  expect(await request("/_/wait?seconds=0")).toBe("nothing changed")
  await request("/tabs/1", { handle: "note", args: { text: "" } }, true)
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toBe("n: 3 → 4\nnotices:\nthe person acted on /counter")
  expect(await request("/_/wait?seconds=0")).toBe('changed by the person:\n/counter "Counter" (tab 1)\nnote: "mine" → ""')
  // A read of the tab shows it whole, so nothing of it is repeated from /.
  await request("/tabs/1", { handle: "bump", args: { by: 1 } }, true)
  expect(await request("/tabs/1")).not.toContain("changed:")
  expect(await request("/")).not.toContain("changed:")
})

it("reaches a tab by its surface's name, and answers a path into a tab the person closed with where its surface is now", async () => {
  const { request } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "counter" } })
  expect(await request("/counter", { handle: "bump", args: { by: "2" } })).toBe("n: 0 → 2")
  await request("/", { handle: "close", args: { n: 1 } }, true)
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toStartWith(
    "refused: /tabs/1, the counter tab 1, was closed by the person: open one with open surface=counter at /, and it is at /counter\n"
  )
  expect(await request("/counter")).toBe("/counter, the counter tab 1, was closed by the person: open one with open surface=counter at /, and it is at /counter")
  await request("/", { handle: "open", args: { surface: "counter" } }, true)
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toStartWith(
    "refused: /tabs/1, the counter tab 1, was closed by the person; counter is now at /counter (tab 2)"
  )
  expect(await request("/counter", { handle: "bump", args: { by: "1" } })).toBe("n: 0 → 1")
  // With the person's message: the tab closed, and the one opened at the name, each by its number.
  expect((await request("/_/wait?seconds=0")).split("\n").slice(0, 3)).toEqual(["changed by the person:", '- /counter "Counter" (tab 1) closed', '+ /counter "Counter" (tab 2), actions: bump, note, grow; read /counter'])
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
      "/counter: noted theirs (by the person)",
      "changed by the person:",
      "+ need: the person, at /counter, to say whether so many is right",
      '/counter "Counter" (tab 1)',
      // The notice stands for what its own call changed: the note is not told again.
      "n: 0 → 6",
    ].join("\n")
  )
  expect((await request("/")).split("\n").slice(0, 3)).toEqual(['title: "baba"', "needs: at\tsurface\twho\twhy", '"/counter"\t"counter"\t"person"\t"to say whether so many is right"'])
  await read("noted theirs")
  expect(events).toContain('event: notice\ndata: {"text":"noted mine","at":"/counter","from":"counter","by":"the agent"}')
  expect(events).toContain('event: notice\ndata: {"text":"noted theirs","at":"/counter","from":"counter"}')
  await reader.cancel()
})

it("ends a wait on who is needed changing, though the surface changed it by itself and said nothing", async () => {
  const { request } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "counter" } })

  const from = Date.now()

  await request("/tabs/1", { handle: "grow", args: {} })
  expect(await request("/_/wait?seconds=5")).toBe(
    ["changed by the surface:", "+ need: the person, at /counter, to say whether so many is right", '/counter "Counter" (tab 1)', "n: 0 → 6"].join("\n")
  )
  expect(Date.now() - from).toBeLessThan(4000)
})

it("tells a notice heard before the runtime started again in the agent's next answer after, once", async () => {
  const first = await started()

  await first.request("/?open")
  await first.request("/", { handle: "open", args: { surface: "counter" } })
  await first.request("/tabs/1", { handle: "note", args: { text: "before" } }, true)
  // The runtime sleeps, or gives way to changed code, before the agent is told.
  await first.runtime.close()

  const { request } = await started(first.dir)

  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toBe("n: 0 → 1\nnotices:\n/counter: noted before (by the person)")
  expect(await request("/tabs/1", { handle: "bump", args: { by: "1" } })).toBe("n: 1 → 2")
  // The agent's own notice is not told back to it, before a restart or after.
  await request("/tabs/1", { handle: "note", args: { text: "mine" } })
  expect(await request("/_/wait?seconds=0&tell=notices")).toBe("nothing changed")
})

it("carries the name a call's caller gave it, in the header, into the activity, so a program acting as the person finds its own call", async () => {
  const { request, runtime, endpoint } = await started()
  const named = (path: string, call: unknown, id: string) =>
    fetch(`http://127.0.0.1:${runtime.port}${path}`, {
      method: "POST",
      headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token, [CALL_ID_HEADER]: id },
      body: JSON.stringify(call),
    })

  await request("/", { handle: "open", args: { surface: "counter" } })
  expect((await named("/tabs/1", { handle: "note", args: { text: "mine" } }, "lab:act-2")).status).toBe(200)
  await request("/tabs/1", { handle: "note", args: { text: "theirs" } }, true)

  const rows = JSON.parse(await request("/activity", undefined, true)) as { entries: { did: string; said?: string[]; who: string; id?: string }[] }

  expect(rows.entries.slice(0, 2).map(({ did, said, who, id }) => ({ did, said, who, id }))).toEqual([
    { did: "note text=theirs", said: ["noted theirs"], who: "person", id: undefined },
    { did: "note text=mine", said: ["noted mine"], who: "person", id: "lab:act-2" },
  ])
})

it("tells more than twenty notices waiting as the newest twenty, after one line that counts the older and says where to read them", async () => {
  const { request } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "counter" } })
  for (let i = 1; i <= 25; i++) await request("/tabs/1", { handle: "note", args: { text: `n${i}` } }, true)

  const told = (await request("/_/wait?seconds=0&tell=notices")).split("\n")

  expect(told.slice(0, 3)).toEqual(["notices:", "5 earlier notices; read /activity/notices", "/counter: noted n6 (by the person)"])
  expect(told).toHaveLength(22)
  expect(told.at(-1)).toBe("/counter: noted n25 (by the person)")
  expect(await request("/_/wait?seconds=0&tell=notices")).toBe("nothing changed")
})

it("tells nothing of the page's own bookkeeping: the notices the person saw, a quiet action, a setting of the page", async () => {
  const { request, runtime, endpoint } = await started()
  const waiting = async () => {
    const ctrl = new AbortController()
    const stream = await fetch(`http://127.0.0.1:${runtime.port}/`, { headers: { accept: "text/event-stream", [SERVICE_HEADER]: endpoint.token }, signal: ctrl.signal })
    const reader = stream.body!.getReader()
    let text = ""

    while (!/event: turn\ndata: .*\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
    ctrl.abort()

    return (JSON.parse(/event: turn\ndata: (.*)\n/.exec(text)![1]!) as { waiting: number }).waiting
  }

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "board" } })
  await request("/tabs/1", { handle: "add", args: { title: "one" } }, true)
  await request("/_/wait?seconds=0")
  await request("/activity/notices", { handle: "seen", args: { n: 2 } }, true)
  await request("/activity/notices", { handle: "looked", args: { n: 3 } }, true)
  await request("/tabs/1", { handle: "mark", args: { n: 1 } }, true)
  expect(await request("/_/wait?seconds=0&tell=notices")).toBe("nothing changed")
  expect(await request("/_/wait?seconds=0")).toBe("nothing changed")
  expect(await waiting()).toBe(0)
  // The page still reads what its own action did.
  expect(JSON.parse(await request("/tabs/1", undefined, true))).toMatchObject({ marked: [1] })
})

it("knows the session's harness from the hook that tells it of the turn, keeps it where a later hook does not say, and takes no name that is not one", async () => {
  const { runtime, endpoint, dir } = await started()
  const tell = (harness?: string) =>
    fetch(`http://127.0.0.1:${runtime.port}/_/turn`, {
      method: "POST",
      headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token, ...(harness !== undefined && { [HARNESS_HEADER]: harness }) },
      body: "working",
    })
  const harness = async () => {
    const ctrl = new AbortController()
    const stream = await fetch(`http://127.0.0.1:${runtime.port}/`, { headers: { accept: "text/event-stream", [SERVICE_HEADER]: endpoint.token }, signal: ctrl.signal })
    const reader = stream.body!.getReader()
    let text = ""

    while (!/event: turn\ndata: .*\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
    ctrl.abort()

    return (JSON.parse(/event: turn\ndata: (.*)\n/.exec(text)![1]!) as { harness?: string }).harness
  }

  expect(await harness()).toBeUndefined()
  await tell("codex")
  expect(await harness()).toBe("codex")
  await tell()
  await tell("Not A Name!")
  expect(await harness()).toBe("codex")
  expect(JSON.parse(readFileSync(join(dir, "sessions", "S", "tabs", "hooks.json"), "utf8"))).toMatchObject({ ever: true, harness: "codex" })
})

it("tells one event in one line: a notice stands for what its call changed, unless a later call with none changed it too; what waits on the agent always", async () => {
  const { request } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "board" } })
  await request("/tabs/1", { handle: "add", args: { title: "one" } })
  await request("/tabs/1/items/1", { handle: "finish", args: { n: 1 } }, true)
  expect(await request("/_/wait?seconds=0")).toBe(
    ["notices:", "/board/items/1: item 1 is finished (by the person)", "changed by the person:", "+ need: you, at /board, to review 1"].join("\n")
  )
  // A notice, then a call with none that changed the same fact: the fact is told, as the later call's; the rest, not.
  await request("/tabs/1", { handle: "add", args: { title: "two" } })
  await request("/tabs/1/items/2", { handle: "finish", args: { n: 2 } }, true)
  await request("/tabs/1", { handle: "reset", args: {} }, true)
  expect(await request("/_/wait?seconds=0")).toBe(
    [
      "notices:",
      "/board/items/2: item 2 is finished (by the person)",
      "changed by the person:",
      "need: you, at /board, now to review 1, 2",
      '/board "Board" (tab 1)',
      "detail changed: tokens in detail; read /board",
    ].join("\n")
  )
})

it("weighs by attention: a tab the agent did not read or call in this turn or the last is one line, who changed it; its notices are still told", async () => {
  const { request, turn } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "counter" } })
  await request("/", { handle: "open", args: { surface: "board" } })
  await turn("started")
  await request("/tabs/2")
  await turn("started")
  await request("/tabs/1", { handle: "note", args: { text: "aside" } }, true)
  await request("/tabs/1", { handle: "bump", args: { by: 2 } }, true)
  await request("/tabs/2", { handle: "add", args: { title: "one" } }, true)
  // Read in the last turn, the board is told in full; the counter, opened two turns ago, in one line, its notice still told.
  expect(await request("/_/wait?seconds=0")).toBe(
    [
      "notices:",
      "/counter: noted aside (by the person)",
      "the person acted on /board",
      "changed by the person:",
      '/board "Board" (tab 2)',
      '+ /board/items/1: n 1, title "one", done false',
      '/counter "Counter" (tab 1): changed by the person; read it',
    ].join("\n")
  )
  // Two turns on, a tab that needs the agent is one it works in.
  await turn("started")
  await turn("started")
  await request("/tabs/2/items/1", { handle: "finish", args: { n: 1 } }, true)
  await request("/tabs/2", { handle: "add", args: { title: "two" } }, true)
  await request("/tabs/1", { handle: "bump", args: { by: 1 } }, true)
  expect(await request("/_/wait?seconds=0")).toBe(
    [
      "notices:",
      "/board/items/1: item 1 is finished (by the person)",
      "the person acted on /counter",
      "changed by the person:",
      "+ need: you, at /board, to review 1",
      '/board "Board" (tab 2)',
      '+ /board/items/2: n 2, title "two", done false',
      '/counter "Counter" (tab 1): changed by the person; read it',
    ].join("\n")
  )
})

it("keeps detail out of the present at /, counted in one line with where to read it, and tells it whole at the tab's own path and to the page", async () => {
  const { request } = await started()

  await request("/?open")
  await request("/", { handle: "open", args: { surface: "board" } })
  await request("/tabs/1", { handle: "add", args: { title: "one" } })
  await request("/tabs/1", { handle: "add", args: { title: "two" } })
  await request("/tabs/1/items/1", { handle: "finish", args: {} })
  await request("/tabs/1/items/1", { handle: "review", args: {} })

  const present = await request("/")

  expect(present).toContain('items: at\tn\ttitle\tdone\n"/board/items/2"\t2\t"two"\tfalse\n')
  expect(present).toContain("+1 more in items, tokens in detail; read /board")
  expect(present).not.toContain('"one"')
  // The tab's own path reads it whole, and the page reads ordinary values everywhere.
  expect(await request("/tabs/1")).toContain('"/board/items/1"\t1\t"one"\ttrue')
  expect(await request("/tabs/1")).toContain("tokens: 10")
  expect(JSON.parse(await request("/tabs/1", undefined, true))).toMatchObject({ tokens: 10, items: [{ n: 1, title: "one" }, { n: 2 }] })
  expect(JSON.parse(await request("/", undefined, true)).tabs[0].facts).toMatchObject({ tokens: 10, items: [{ n: 1, title: "one" }, { n: 2 }] })
  // What changes in detail that stays detail is counted in one line.
  await request("/tabs/1", { handle: "reset", args: {} }, true)
  await request("/tabs/1", { handle: "add", args: { title: "three" } }, true)
  expect(await request("/_/wait?seconds=0")).toBe(
    [
      "notices:",
      "the person acted on /board",
      "changed by the person:",
      '/board "Board" (tab 1)',
      '+ /board/items/3: n 3, title "three", done false',
      "detail changed: tokens in detail; read /board",
    ].join("\n")
  )
})

it("answers a call by its outcome alone: a tab opened in one line, an action by its name; and reads one fact of a view by its path", async () => {
  const { request } = await started()

  await request("/?open")
  expect(await request("/", { handle: "open", args: { surface: "board" } })).toBe('+ /board "Board" (tab 1), actions: add, reset, mark; read /board')
  await request("/tabs/1", { handle: "add", args: { title: "one" } })
  expect(await request("/board/items/1", { handle: "finish", args: {} })).toBe("done: false → true\n+ action review\n- action finish")
  expect(await request("/tabs/1/marked")).toBe("marked: []")
  expect(await request("/board/items/1/title")).toBe('title: "one"')
  expect(await request("/tabs/1/nothing")).toBe("nothing at /tabs/1/nothing")
})

it("tells nothing of what no one did: where it pointed, cleared as the root starts again, is no change", async () => {
  const first = await started()

  await first.request("/?open")
  await first.request("/", { handle: "open", args: { surface: "counter" } })
  expect(await first.request("/", { handle: "show", args: { at: "/tabs/1" } })).toBe('+ pointed: "/counter"')
  await first.request("/_/wait?seconds=0")
  await first.runtime.close()

  const { request } = await started(first.dir)

  expect(await request("/_/wait?seconds=0")).toBe("nothing changed")
  expect(await request("/")).not.toContain("pointed")
})

it("finds the hooks quiet by the runs that carry a call, the agent's own, and never by a request that carries none, as a run in its name from elsewhere", async () => {
  const { runtime, endpoint, turn } = await started()
  const run = async (call?: string) =>
    (
      await fetch(`http://127.0.0.1:${runtime.port}/`, {
        headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: "agent:S", ...(call && { [CALL_HEADER]: call }) },
      })
    ).text()
  const later = (ms: number) => setSystemTime(new Date(Date.now() + ms))

  try {
    await run("a")
    await turn("working")
    // Others run in the session's name: as they carried a call, the agent's next run after a pause found the hooks quiet.
    await run("x")
    later(HUSH_MS + 1)
    expect(await run("b")).toStartWith(QUIET_LINE)
    await turn("working")
    // Without one they count for nothing: the agent's next run follows its own hook.
    await run()
    later(HUSH_MS + 1)
    expect(await run()).not.toContain(QUIET_LINE)
    expect(await run("c")).not.toContain(QUIET_LINE)
    // And its own silence still counts: its run long after its last, with no hook between.
    later(HUSH_MS + 1)
    expect(await run("d")).toStartWith(QUIET_LINE)
  } finally {
    setSystemTime()
  }
})

it("shows the page the hooks' silence the agent was told of, never heard or gone quiet, until a hook is heard, and the same after a restart", async () => {
  const first = await started()
  const runOf = (at: Awaited<ReturnType<typeof started>>) => async (call: string) =>
    (
      await fetch(`http://127.0.0.1:${at.runtime.port}/`, {
        headers: { accept: "text/plain", [SERVICE_HEADER]: at.endpoint.token, [ACTOR_HEADER]: "agent:S", [CALL_HEADER]: call },
      })
    ).text()
  /** The turn as the page reads it on connecting, or as it next changes. */
  const unheardIn = async (at: Awaited<ReturnType<typeof started>>) => {
    const ctrl = new AbortController()
    const stream = await fetch(`http://127.0.0.1:${at.runtime.port}/`, { headers: { accept: "text/event-stream", [SERVICE_HEADER]: at.endpoint.token }, signal: ctrl.signal })
    const reader = stream.body!.getReader()
    let text = ""

    while (!/event: turn\ndata: .*\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
    ctrl.abort()

    return (JSON.parse(/event: turn\ndata: (.*)\n/.exec(text)![1]!) as { unheard?: Unheard }).unheard
  }
  const run = runOf(first)
  const later = (ms: number) => setSystemTime(new Date(Date.now() + ms))

  try {
    // A fresh session, before any hook: its agent's first run finds nothing, nor does a run soon after.
    await run("a")
    expect(await unheardIn(first)).toBeUndefined()
    await run("b")
    expect(await unheardIn(first)).toBeUndefined()
    // Never heard: the agent is told once, as before, and the page from then on.
    later(HUSH_MS + 1)
    expect(await run("c")).toStartWith(NO_HOOKS_LINE)

    const never = await unheardIn(first)

    expect(never).toMatchObject({ ever: false })
    // It lasts while the agent runs on, never told it again.
    later(HUSH_MS + 1)
    expect(await run("d")).not.toContain(NO_HOOKS_LINE)
    expect(await unheardIn(first)).toEqual(never!)
    // A hook heard clears it.
    await first.turn("working")
    expect(await unheardIn(first)).toBeUndefined()
    // Heard, then gone quiet: a run, and the next long after it with no hook between.
    await run("e")
    later(HUSH_MS + 1)
    expect(await run("f")).toStartWith(QUIET_LINE)
    expect(await unheardIn(first)).toMatchObject({ ever: true })
  } finally {
    setSystemTime()
  }

  // A runtime that starts again, as for a page opened long after, shows it the same, and its first hook clears it.
  const kept = await unheardIn(first)

  await first.runtime.close()

  const again = await started(first.dir)

  expect(await unheardIn(again)).toEqual(kept!)
  await again.turn("started")
  expect(await unheardIn(again)).toBeUndefined()
})
