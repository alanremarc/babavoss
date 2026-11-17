// The eval's fixture: a copy of the queue's shape, issues in the backlog, in a lane, done or drafts, each on a narrative with
// the issues it came out of and a note, kept in its tab and seeded the same at every run's start (seed.ts). The eval copies
// this folder from its own checkout into each run's project as its surface `queue`, so every variant runs the same queue;
// its words, the description, `how` and the actions' descriptions, are in words.ts, which a variant may replace
// (../../../words/). No store, no outline, no iterations: what the tasks need.
import { action, detail, surface, view, type Update } from "babavoss/core/index.ts"
import { seed } from "./seed.ts"
import { LANES, words } from "./words.ts"

export { LANES }

export type Status = "draft" | "backlog" | "lane" | "done"
export type Narrative = { id: string; title: string; about: string }
/** `order`: when it last moved, so each section keeps the order things arrived in it. */
export type Issue = { n: number; title: string; about: string; status: Status; lane?: number; note?: string; order: number; narrative: string; from: number[] }
export type Work = { issues: Issue[]; narratives: Narrative[]; next: number; clock: number }
type Result = Update<Work, never>

const find = (w: Work, n: number) => w.issues.find((issue) => issue.n === n)
const changed = (w: Work, n: number, change: (issue: Issue) => Issue): Work => ({ ...w, issues: w.issues.map((issue) => (issue.n === n ? change(issue) : issue)) })
const moved = (w: Work, n: number, change: (issue: Issue) => Issue): Work => ({
  ...changed(w, n, (issue) => ({ ...change(issue), order: w.clock })),
  clock: w.clock + 1,
})
const said = (w: Work, n: number, what: string) => {
  const issue = find(w, n)!

  return { text: `${issue.status === "draft" ? "Draft" : "Issue"} ${n}, ${issue.title}, ${what}`, at: `/issues/${n}` }
}

/** Whether `to` is reachable from `n` along "came out of" edges read forwards: linking `n` from `to` would then close a cycle. */
function reaches(w: Work, n: number, to: number): boolean {
  const seen = new Set<number>()
  const walk = (at: number): boolean => {
    if (at === to) return true
    if (seen.has(at)) return false
    seen.add(at)

    return w.issues.filter((issue) => issue.from.includes(at)).some((issue) => walk(issue.n))
  }

  return walk(n)
}

/** The issues a comma list names, or why it cannot be read: "9, 26" → [9, 26]; empty is none. */
function parents(w: Work, list: string): number[] | string {
  const ns = list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  const missing = ns.find((n) => !Number.isInteger(n) || !find(w, n))

  return missing === undefined ? [...new Set(ns)] : `There is no issue ${missing}`
}

/** A new issue: on the narrative named, else its first parent's, else the first narrative. */
function made(w: Work, args: { title: string; about: string; from?: string; narrative?: string }, status: Status): Result {
  const title = args.title.trim()
  const about = args.about.trim()

  if (!title || !about) return { refused: "An issue needs a title and a line about it" }

  const from = parents(w, args.from ?? "")

  if (typeof from === "string") return { refused: from }

  const named = args.narrative?.trim()

  if (named && !w.narratives.some((x) => x.id === named)) return { refused: `There is no narrative ${named}` }

  const narrative = named || (from.length ? find(w, from[0]!)!.narrative : w.narratives[0]!.id)
  const issue: Issue = { n: w.next, title, about, status, order: w.clock, narrative, from }

  const model = { ...w, issues: [...w.issues, issue], next: w.next + 1, clock: w.clock + 1 }

  // A draft is the person's to look at: a highlight, which marks the tab on their page until they look.
  return { model, ...(status === "draft" && { notices: [{ ...said(model, issue.n, "is a draft for you to look at"), highlight: true as const }] }) }
}

/** An issue's inputs: a short imperative title, and brief markdown on what changes and why. */
const ISSUE = { title: { type: "string", kind: "line" }, about: { type: "string", kind: "markdown" } } as const
/** And what it came out of, a comma list of issues, or none; and its narrative, or none for its first parent's. */
const BRANCH = { ...ISSUE, from: { type: "string", kind: "issues" }, narrative: { type: "string", kind: "id" } } as const
const add = action({
  name: "add",
  description: words.actions.add,
  subject: {},
  inputs: ISSUE,
  update: (w: Work, args): Result => made(w, args, "backlog"),
})
const addFrom = action({
  name: "add_from",
  description: words.actions.add_from,
  subject: {},
  inputs: BRANCH,
  update: (w: Work, args): Result => made(w, args, "backlog"),
})
const draft = action({
  name: "draft",
  description: words.actions.draft,
  subject: {},
  inputs: ISSUE,
  update: (w: Work, args): Result => made(w, args, "draft"),
})
const approve = action({
  name: "approve",
  description: words.actions.approve,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, (issue) => ({ ...issue, status: "backlog" })), notices: [said(w, n, "approved: it joins the backlog")] }),
})
const describe = action({
  name: "describe",
  description: words.actions.describe,
  subject: { n: "number" },
  inputs: { about: { type: "string", kind: "markdown" } },
  update: (w: Work, { n, about }): Result => (about.trim() ? { model: changed(w, n, (issue) => ({ ...issue, about: about.trim() })) } : { refused: "Say what it is about" }),
})
const note = action({
  name: "note",
  description: words.actions.note,
  subject: { n: "number" },
  inputs: { text: { type: "string", kind: "line" } },
  update: (w: Work, { n, text }): Result => ({ model: changed(w, n, (issue) => ({ ...issue, note: text.trim() })) }),
})
const start = action({
  name: "start",
  description: words.actions.start,
  subject: { n: "number" },
  inputs: { lane: { type: "number", range: [1, LANES] } },
  update(w: Work, { n, lane }): Result {
    const busy = w.issues.find((issue) => issue.status === "lane" && issue.lane === lane)

    if (busy) return { refused: `Lane ${lane} is delivering issue ${busy.n}` }

    return { model: moved(w, n, (issue) => ({ ...issue, status: "lane", lane })), notices: [said(w, n, `started in lane ${lane}`)] }
  },
})
const done = action({
  name: "done",
  description: words.actions.done,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "done" })), notices: [said(w, n, "is done")] }),
})
const back = action({
  name: "back",
  description: words.actions.back,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "backlog" })) }),
})
const drop = action({
  name: "drop",
  description: words.actions.drop,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({
    model: { ...w, issues: w.issues.filter((issue) => issue.n !== n).map((issue) => ({ ...issue, from: issue.from.filter((p) => p !== n) })) },
    notices: [said(w, n, "dropped").text],
  }),
})
const link = action({
  name: "link",
  description: words.actions.link,
  subject: { n: "number" },
  inputs: { from: { type: "number", kind: "issue" } },
  update(w: Work, { n, from }): Result {
    if (!find(w, from)) return { refused: `There is no issue ${from}` }
    if (from === n) return { refused: "An issue cannot come out of itself" }
    if (find(w, n)!.from.includes(from)) return { refused: `Issue ${n} already came out of ${from}` }
    if (reaches(w, n, from)) return { refused: `Issue ${from} came out of ${n}, so ${n} cannot come out of it` }

    return { model: changed(w, n, (issue) => ({ ...issue, from: [...issue.from, from] })) }
  },
})
const unlink = action({
  name: "unlink",
  description: words.actions.unlink,
  subject: { n: "number" },
  inputs: { from: { type: "number", kind: "issue" } },
  update: (w: Work, { n, from }): Result =>
    find(w, n)!.from.includes(from)
      ? { model: changed(w, n, (issue) => ({ ...issue, from: issue.from.filter((x) => x !== from) })) }
      : { refused: `Issue ${n} did not come out of ${from}` },
})
const move = action({
  name: "move",
  description: words.actions.move,
  subject: { n: "number" },
  inputs: { narrative: { type: "string", kind: "id" } },
  update: (w: Work, { n, narrative }): Result =>
    w.narratives.some((x) => x.id === narrative.trim())
      ? { model: changed(w, n, (issue) => ({ ...issue, narrative: narrative.trim() })) }
      : { refused: `There is no narrative ${narrative.trim()}` },
})

const by = (a: Issue, b: Issue) => a.order - b.order
const open = (issue: Issue) => issue.status !== "done"
/** An issue as the stack lists it: one line, with the path that has the rest. */
const row = (issue: Issue) => ({
  at: `/issues/${issue.n}`,
  n: issue.n,
  title: issue.title,
  status: issue.status,
  ...(issue.lane && { lane: issue.lane }),
  narrative: issue.narrative,
  ...(issue.from.length && { from: issue.from }),
  ...(issue.note && { note: issue.note }),
})
const ref = (issue: Issue) => ({ at: `/issues/${issue.n}`, n: issue.n, title: issue.title, status: issue.status })
function counted(w: Work, x: Narrative) {
  const mine = w.issues.filter((issue) => issue.narrative === x.id)

  return { at: `/narratives/${x.id}`, id: x.id, title: x.title, about: x.about, issues: mine.length, open: mine.filter(open).length }
}
const menu = [
  { label: "Move", actions: ["start", "done", "back", "move"] },
  { label: "Edit", actions: ["describe", "note", "link", "unlink"] },
]
function whole(w: Work, issue: Issue) {
  const subject = { n: issue.n }
  const x = w.narratives.find((x) => x.id === issue.narrative)

  return {
    ...row(issue),
    about: issue.about,
    narrative: { at: `/narratives/${issue.narrative}`, id: issue.narrative, title: x?.title ?? issue.narrative },
    from: issue.from.flatMap((p) => (find(w, p) ? [ref(find(w, p)!)] : [])),
    to: w.issues.filter((other) => other.from.includes(issue.n)).map(ref),
    menu,
    ...(issue.status === "draft" && { approve: approve.bind(subject) }),
    describe: describe.bind(subject),
    note_: note.bind(subject),
    ...((issue.status === "backlog" || issue.status === "draft") && { start: start.bind(subject) }),
    ...(issue.status !== "done" && { done: done.bind(subject) }),
    ...((issue.status === "lane" || issue.status === "done") && { back: back.bind(subject) }),
    move: move.bind(subject),
    link: link.bind(subject),
    ...(issue.from.length && { unlink: unlink.bind(subject) }),
    drop: drop.bind(subject),
  }
}
const actions = [add, addFrom, draft, approve, describe, note, start, done, back, drop, link, unlink, move]
const pages = view(actions, {
  "/": (w) => {
    const lanes = w.issues.filter((issue) => issue.status === "lane").sort((a, b) => a.lane! - b.lane!)
    const backlog = w.issues.filter((issue) => issue.status === "backlog").sort(by)
    const drafts = w.issues.filter((issue) => issue.status === "draft").sort(by)
    const finished = w.issues.filter((issue) => issue.status === "done").sort((a, b) => b.order - a.order)

    return {
      title: "Queue",
      how: words.how,
      lanes: LANES,
      free: Array.from({ length: LANES }, (_, i) => i + 1).filter((lane) => !lanes.some((issue) => issue.lane === lane)),
      narratives: w.narratives.map((x) => {
        const { about: _about, ...named } = counted(w, x)

        return named
      }),
      issues: [...[...lanes, ...backlog, ...drafts].map(row), ...finished.map((issue) => detail(row(issue)))],
      add: add.bind({}),
      add_from: addFrom.bind({}),
      draft: draft.bind({}),
    }
  },
  "/narratives": (w) => ({ title: "Narratives", narratives: w.narratives.map((x) => counted(w, x)) }),
  "/narratives/:id": (w, { id }) => {
    const x = w.narratives.find((x) => x.id === id)

    return x && { ...counted(w, x), issues: w.issues.filter((issue) => issue.narrative === x.id).sort(by).map(row) }
  },
  "/issues/:n": (w, { n }) => {
    const issue = find(w, Number(n))

    return issue && whole(w, issue)
  },
})

type Event = { kind: "none" }

export default surface<Work, Event, never>({
  description: words.description,
  init: seed,
  update: (w, message) => (message.kind === "call" ? pages.update(w, message) : { model: w }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
