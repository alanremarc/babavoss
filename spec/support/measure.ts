// What the present costs an agent, measured: a fixed scenario on a queue of twelve issues, replayed through the formatter,
// and the lines and characters each step injects. Run with `bun spec/support/measure.ts`; add `--print` for the texts.
// Index-keyed and flattened, as before identity-keyed rows and a heading per tab, the same scenario took 34 lines and
// 2044 characters whole, 59 lines and 4201 characters over its steps, and 38 lines and 3124 characters told at once.
import { handle, type Json } from "../../framework/core/surface/view.ts"
import { diff, tell, whole } from "../../framework/core/present/present.ts"

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
        close: handle("close", "close tab 3; its state is dropped", { n: 3 }),
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
}
