// What the present costs an agent, measured: a fixed scenario on a queue of twelve issues, replayed through the formatter,
// and the lines and characters each step injects; and a turn through a real runtime's door, as the hooks and the word
// see it, while the person and a surface's command act beside the agent. Run with `bun spec/support/measure.ts`; add
// `--print` for the texts.
// Index-keyed and flattened, as before identity-keyed rows and a heading per tab, the same scenario took 34 lines and
// 2044 characters whole, 59 lines and 4201 characters over its steps, and 38 lines and 3124 characters told at once.
// The turn, before notices were split from the present: 31 lines and 1057 characters during the work, 18 and 663 in the
// word's answers, 13 and 394 after tool calls, and nothing with the person's next message.
// Before an action was told by its name, a reorder by what moved and a notice let stand for its commit's changes: the
// steps' diffs summed 29 lines and 1011 characters; the turn's call answers 11 and 359, the person's next message 12 and 405.
// After: 29 and 884; 11 and 328; 9 and 324.
// Before highlight took the place of show and attention, the session start's present was 22 lines and 1184 characters,
// and the call answers 11 and 328; after, 22 and 1177, and 11 and 338, a highlight told first and marked so.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { action, defineRoot, surface, view as routes, type Update } from "../../framework/core/index.ts"
import { handle, type Json } from "../../framework/core/surface/view.ts"
import { diff, tell, whole } from "../../framework/core/present/present.ts"
import { startRuntime } from "../../framework/core/runtime/runtime.ts"
import { ACTOR_HEADER, endpointFile, SERVICE_HEADER, type Endpoint } from "../../framework/core/runtime/service.ts"
import { readJsonFile } from "../../framework/core/state/json-file.ts"
import { shell } from "../../framework/shell/src/surface.ts"
import { TELLS } from "../../framework/core/hook.ts"

const COMMAND = ".babavoss/bin/baba"
const HOW =
  "Keep this true as the work moves: add an issue the person asks for, draft one you would suggest and leave it until they approve it on the page, " +
  "start an issue when a subagent takes it in a lane, note where it stands, and mark it done only once it is merged into main. An issue's path has " +
  "what it is about and what can be done with it. One issue per lane, 5 lanes; the backlog's top is next."

type Issue = { n: number; title: string; status: "draft" | "backlog" | "lane" | "done"; lane?: number; note?: string; stamp: number }
type Model = { issues: Issue[]; how: string }

const TITLES = [
  "Keep the root alive through a surface's changes",
  "Shape how the surface appears to the agent",
  "Finish containing a failing tab",
  "Name each tab's actions at /",
  "Measure what a hook injects",
  "Let the page end the person's move",
  "Carry notices from update",
  "Gather attention at the top of /",
  "Bound what one diff injects",
  "Read a tab's long text by its path",
  "Draft: a dark palette for the lab",
  "Draft: a changelog view",
]

/** The queue's facts at /, as the shell lists them for tab 3: lanes first, then the backlog, the drafts and what is done. */
function view(m: Model): Json {
  const of = (status: Issue["status"]) =>
    m.issues.filter((i) => i.status === status).sort((a, b) => (status === "lane" ? a.lane! - b.lane! : a.stamp - b.stamp))
  const lanes = of("lane")
  const drafts = of("draft")
  const rows = [...lanes, ...of("backlog"), ...drafts, ...of("done")].map((i) => ({
    at: `/tabs/3/issues/${i.n}`,
    n: i.n,
    title: i.title,
    status: i.status,
    ...(i.lane && { lane: i.lane }),
    ...(i.note && { note: i.note }),
  }))

  return {
    title: "baba",
    surfaces: [
      {
        name: "queue",
        description: "Track the work on babavoss as issues. Use when work is asked for, starts, moves or lands.",
        open: handle("open", "open a queue tab", { surface: "queue" }),
      },
      {
        name: "lab",
        description: "See how a surface appears to an agent. Use when a surface's words are tested.",
        open: handle("open", "open a lab tab", { surface: "lab" }),
      },
    ],
    tabs: [
      {
        at: "/tabs/3",
        n: 3,
        surface: "queue",
        close: handle("close", "close tab 3, Queue; its state and log are kept read only in the archive of closed tabs, /activity/closed", { n: 3 }),
        title: "Queue",
        actions: ["add", "draft"],
        facts: {
          how: m.how,
          lanes: 5,
          free: [1, 2, 3, 4, 5].filter((lane) => !lanes.some((i) => i.lane === lane)),
          issues: rows,
          ...(drafts.length && { waiting: `the person, to approve or drop ${drafts.length} draft${drafts.length > 1 ? "s" : ""} on the page` }),
        },
      },
    ],
  }
}
/** An issue at its own path, as the agent's call there sees it before and after. */
function issue(m: Model, n: number): Json {
  const i = m.issues.find((i) => i.n === n)!

  return {
    at: `/tabs/3/issues/${n}`,
    n,
    title: i.title,
    status: i.status,
    ...(i.lane && { lane: i.lane }),
    ...(i.status === "backlog" && { start: handle("start", `Give issue ${n} to a lane, 1 to 5`, { n }, { lane: "number" }) }),
    ...(i.status === "lane" && { done: handle("done", `Mark issue ${n} done`, { n }) }),
    drop: handle("drop", `Remove issue ${n}`, { n }),
  }
}

type Step = { name: string; who: "person" | "surface" | "you" | undefined; change: (m: Model) => Model; issue?: number }

const set = (m: Model, n: number, change: (i: Issue) => Issue, stamp = true): Model => ({
  ...m,
  issues: m.issues.map((i) => (i.n === n ? { ...change(i), ...(stamp && { stamp: Math.max(...m.issues.map((i) => i.stamp)) + 1 }) } : i)),
})
const LONG =
  "Blocked on the notices lane: the hook's PostToolUse would carry only notices once it lands, so this waits. Meanwhile the formatter's " +
  "rules are settled in specs: identity-keyed rows, a heading per tab, standing prose told whole only, long texts cut, and a cap of forty lines."

/** The scenario: the person approves a draft; the agent starts two issues and marks one done; a note is rewritten long; rows reorder. */
export const STEPS: Step[] = [
  { name: "person approves draft 11", who: "person", change: (m) => set(m, 11, (i) => ({ ...i, status: "backlog" })) },
  { name: "agent starts issue 1 in lane 1", who: "you", issue: 1, change: (m) => set(m, 1, (i) => ({ ...i, status: "lane", lane: 1 })) },
  { name: "agent starts issue 2 in lane 2", who: "you", issue: 2, change: (m) => set(m, 2, (i) => ({ ...i, status: "lane", lane: 2 })) },
  { name: "agent marks issue 1 done", who: "you", issue: 1, change: (m) => set(m, 1, ({ lane: _, ...i }) => ({ ...i, status: "done" })) },
  { name: "person rewrites issue 5's note, long", who: "person", change: (m) => set(m, 5, (i) => ({ ...i, note: LONG }), false) },
  {
    name: "person moves issue 9 to the backlog's top",
    who: "person",
    change: (m) => set(m, 9, (i) => ({ ...i, stamp: -1 }), false),
  },
  {
    name: "person adds issues 13 and 14",
    who: "person",
    change: (m) => ({ ...m, issues: [...m.issues, ...[13, 14].map((n) => ({ n, title: `Follow-up ${n}`, status: "backlog" as const, stamp: 100 + n }))] }),
  },
  { name: "the surface's how changes by a word", who: undefined, change: (m) => ({ ...m, how: m.how.replace("5 lanes", "five lanes") }) },
]

export const start = (): Model => ({
  how: HOW,
  issues: TITLES.map((title, i) => ({ n: i + 1, title, status: i >= 10 ? "draft" : "backlog", stamp: i })),
})

/** A formatter: the whole present, and the text an answer carries for a change, with who made it. */
export type Formatter = { whole(view: Json): string; diff(before: Json, now: Json, who: string | undefined, path?: string): string }

export function measure(format: Formatter) {
  let m = start()
  const rows = [{ name: "whole present", text: format.whole(view(m)) }]

  for (const step of STEPS) {
    const next = step.change(m)
    const text =
      step.who === "you"
        ? format.diff(issue(m, step.issue!), issue(next, step.issue!), undefined, `/tabs/3/issues/${step.issue}`)
        : format.diff(view(m), view(next), step.who)

    rows.push({ name: step.name, text })
    m = next
  }
  // As one telling: all of it done between two of the agent's turns, as by the person.
  rows.push({ name: "all of it, told at once", text: format.diff(view(start()), view(m), "person") })

  return rows.map(({ name, text }) => ({ name, lines: text ? text.split("\n").length : 0, chars: text.length, text }))
}

const BY: Record<string, string> = { person: "the person", surface: "the surface" }

/** The formatter: what the agent is told now. */
export const now: Formatter = {
  whole: (v) => whole(v, { command: COMMAND }).join("\n"),
  diff: (before, now, who, path = "/") =>
    tell(diff(before, now, { command: COMMAND, path }), () => (path === "/" ? (who ? `changed by ${BY[who]}:` : "changed:") : undefined)).join("\n"),
}

/** The turn's surfaces: a list of tasks whose `check` a command runs, reporting twice; and notes the person keeps. */
type Task = { n: number; title: string; status: "todo" | "doing" | "done"; checks?: string }
type Tasks = { tasks: Task[]; next: number }
type Checked = { kind: "checked"; n: number; result: "running" | "passed" }

const gates: (() => void)[] = []
const tasked = (m: Tasks, n: number, change: (t: Task) => Task): Tasks => ({ ...m, tasks: m.tasks.map((t) => (t.n === n ? change(t) : t)) })
const add = action({
  name: "add",
  description: "Add a task",
  subject: {},
  inputs: { title: "string" },
  update: (m: Tasks, { title }): Update<Tasks, never> => ({ model: { tasks: [...m.tasks, { n: m.next, title, status: "todo" }], next: m.next + 1 } }),
})
const begin = action({
  name: "begin",
  description: "Begin a task",
  subject: { n: "number" },
  inputs: {},
  update: (m: Tasks, { n }): Update<Tasks, { n: number }> => ({ model: tasked(m, n, (t) => ({ ...t, status: "doing" })), commands: [{ n }] }),
})
const finish = action({
  name: "finish",
  description: "Finish a task",
  subject: { n: "number" },
  inputs: {},
  update: (m: Tasks, { n }): Update<Tasks, never> => ({ model: tasked(m, n, (t) => ({ ...t, status: "done" })), notices: [{ text: `Task ${n} is done`, at: `/tasks/${n}` }] }),
})
const rename = action({
  name: "rename",
  description: "Rename a task",
  subject: { n: "number" },
  inputs: { title: "string" },
  update: (m: Tasks, { n, title }): Update<Tasks, never> => ({ model: tasked(m, n, (t) => ({ ...t, title })) }),
})
const taskViews = routes<Tasks, { n: number }>([add, begin, finish, rename], {
  "/": (m) => ({
    title: "Tasks",
    how: "Add what the person asks for, begin one at a time; checks run by themselves; finish a task only once its checks passed.",
    tasks: m.tasks.map(({ n, title, status, checks }) => ({ at: `/tasks/${n}`, n, title, status, ...(checks && { checks }) })),
    add: add.bind({}),
  }),
  "/tasks/:n": (m, { n }) => {
    const t = m.tasks.find((t) => t.n === Number(n))

    return (
      t && {
        ...t,
        ...(t.status === "todo" && { begin: begin.bind({ n: t.n }) }),
        ...(t.status === "doing" && { finish: finish.bind({ n: t.n }) }),
        rename: rename.bind({ n: t.n }),
      }
    )
  },
})
const tasks = surface<Tasks, Checked | { kind: "none" }, { n: number }>({
  description: "Track tasks. Use when work is asked for.",
  init: () => ({ tasks: [], next: 1 }),
  update: (m, msg) =>
    msg.kind === "call"
      ? taskViews.update(m, msg)
      : msg.kind === "checked"
        ? {
            model: tasked(m, msg.n, (t) => ({ ...t, checks: msg.result })),
            ...(msg.result === "passed" && { notices: [{ text: `Task ${msg.n}'s checks passed`, at: `/tasks/${msg.n}`, highlight: true as const }] }),
          }
        : { model: m },
  view: taskViews.view,
  // Each report waits for the scenario to let it through.
  run: async ({ n }, send) => {
    for (const result of ["running", "passed"] as const) {
      await new Promise<void>((go) => gates.push(go))
      send({ kind: "checked", n, result })
    }
  },
  failed: () => ({ kind: "none" }),
})

type Notes = { notes: { n: number; text: string }[] }

const write = action({
  name: "write",
  description: "Write a note",
  subject: {},
  inputs: { text: "string" },
  update: (m: Notes, { text }): Update<Notes, never> => ({ model: { notes: [...m.notes, { n: m.notes.length + 1, text }] } }),
})
const pin = action({
  name: "pin",
  description: "Pin a note for the agent",
  subject: {},
  inputs: { text: "string" },
  update: (m: Notes, { text }): Update<Notes, never> => ({ model: { notes: [...m.notes, { n: m.notes.length + 1, text }] }, notices: [`Pinned: ${text}`] }),
})
const noteViews = routes<Notes, never>([write, pin], { "/": (m) => ({ title: "Notes", notes: m.notes, write: write.bind({}), pin: pin.bind({}) }) })
const notes = surface<Notes, { kind: "none" }, never>({
  description: "Keep notes. Use when something is to be remembered.",
  init: () => ({ notes: [] }),
  update: (m, msg) => (msg.kind === "call" ? noteViews.update(m, msg) : { model: m }),
  view: noteViews.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})

/** What each hook asks the runtime for. */
export type Hooks = { PostToolUse: string; UserPromptSubmit: string }

/**
 * A turn: the root opened at the session's start with both tabs and two tasks, and the person's message; then the agent's
 * eight tool calls, four of them the word's and four of other tools, each followed by its hook, while the person acts five
 * times on the two tabs and a task's checks report twice; then the person's next message. Every text the agent is given,
 * by the word or a hook.
 */
export async function midTurn(hooks: Hooks) {
  const dir = mkdtempSync(join(tmpdir(), "measure-"))

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1" }))

  const root = defineRoot({ name: "baba", ui: dir, surface: shell({ tasks, notes }, dir) })
  const runtime = await startRuntime(root, ["--session", "S"], {
    entry: join(dir, "scripts/open.ts"),
    env: { BABAVOSS_HOME: dir },
    strengths: { weak: 60_000 },
    watch: [],
    log: () => {},
    exit: () => {},
  })

  if (!runtime) throw new Error("not started")

  const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "baba")))!
  const send = async (path: string, call?: unknown, person = false, program = false) =>
    (
      await fetch(`http://127.0.0.1:${runtime.port}${path}`, {
        method: call ? "POST" : "GET",
        headers: {
          accept: person || program ? "application/json" : "text/plain",
          [SERVICE_HEADER]: endpoint.token,
          [ACTOR_HEADER]: person ? "person" : "agent:S",
        },
        ...(call ? { body: JSON.stringify(call) } : {}),
      })
    ).text()
  const rows: { name: string; text: string }[] = []
  const agent = async (name: string, path: string, handle: string, args: Record<string, string> = {}) => {
    rows.push({ name: `call: ${name}`, text: await send(path, { handle, args }) })
    rows.push({ name: "  PostToolUse", text: hookText(await send(hooks.PostToolUse)) })
  }
  // A tool call of another kind, an edit or a test run: the root speaks only through its hook.
  const other = async (name: string) => rows.push({ name: `tool: ${name}`, text: "" }, { name: "  PostToolUse", text: hookText(await send(hooks.PostToolUse)) })
  const person = async (path: string, handle: string, args: Json = {}) => void (await send(path, { handle, args }, true))
  const report = async () => {
    gates.shift()!()
    await Bun.sleep(30)
  }

  // As a session resumed: the tabs were opened and the tasks added before, as by a program, which is told nothing.
  await send("/", { handle: "open", args: { surface: "tasks" } }, false, true)
  await send("/", { handle: "open", args: { surface: "notes" } }, false, true)
  await send("/tabs/1", { handle: "add", args: { title: "Write the parser" } }, false, true)
  await send("/tabs/1", { handle: "add", args: { title: "Wire the parser in" } }, false, true)
  rows.push({ name: "session start", text: await send("/?open") })
  rows.push({ name: "UserPromptSubmit", text: hookText(await send(hooks.UserPromptSubmit)) })

  await agent("begin task 1", "/tabs/1/tasks/1", "begin")
  await person("/tabs/1/tasks/2", "rename", { n: 2, title: "Wire the parser into the reader" })
  await other("edit parser.ts")
  await report()
  await agent("add task 3", "/tabs/1", "add", { title: "Document the grammar" })
  await person("/tabs/2", "write", { text: "the grammar is in docs/grammar.md" })
  await person("/tabs/2", "write", { text: "keep it LL(1)" })
  await other("edit parser.ts")
  await report()
  await agent("finish task 1", "/tabs/1/tasks/1", "finish")
  await person("/tabs/2", "pin", { text: "stop after the parser" })
  await other("run the tests")
  await person("/tabs/1/tasks/3", "rename", { n: 3, title: "Document the grammar, briefly" })
  await agent("add task 4", "/tabs/1", "add", { title: "Benchmark the parser" })
  await other("edit reader.ts")
  rows.push({ name: "UserPromptSubmit", text: hookText(await send(hooks.UserPromptSubmit)) })

  for (const go of gates.splice(0)) go()
  await runtime.close()
  rmSync(dir, { recursive: true, force: true })

  return rows.map(({ name, text }) => ({ name, lines: text ? text.split("\n").length : 0, chars: text.length, text }))
}

/** What a hook injects of a wait's answer: nothing where nothing changed. */
const hookText = (answer: string) => (answer.trim() === "nothing changed" ? "" : answer.trim())

if (import.meta.main) {
  const print = process.argv.includes("--print")
  const report = (label: string, format: Formatter) => {
    const rows = measure(format)

    console.log(`\n${label}`)
    for (const row of rows) {
      console.log(`${String(row.lines).padStart(5)} lines ${String(row.chars).padStart(6)} chars  ${row.name}`)
      if (print && row.text) console.log(row.text.replace(/^/gm, "      | "))
    }

    const diffs = rows.slice(1, -1)

    const sum = (of: "lines" | "chars") => diffs.reduce((s, r) => s + r[of], 0)

    console.log(`${String(sum("lines")).padStart(5)} lines ${String(sum("chars")).padStart(6)} chars  each step's diff, summed`)
  }

  report("the present", now)

  const turn = await midTurn({ PostToolUse: TELLS.PostToolUse!.ask, UserPromptSubmit: TELLS.UserPromptSubmit!.ask })

  console.log("\na turn, as injected")
  for (const row of turn) {
    console.log(`${String(row.lines).padStart(5)} lines ${String(row.chars).padStart(6)} chars  ${row.name}`)
    if (print && row.text) console.log(row.text.replace(/^/gm, "      | "))
  }
  for (const kind of ["call:", "  PostToolUse", "UserPromptSubmit"]) {
    const of = turn.slice(2).filter((r) => r.name.startsWith(kind))

    console.log(`${String(of.reduce((s, r) => s + r.lines, 0)).padStart(5)} lines ${String(of.reduce((s, r) => s + r.chars, 0)).padStart(6)} chars  ${kind.trim()}, summed over the turn`)
  }
}
