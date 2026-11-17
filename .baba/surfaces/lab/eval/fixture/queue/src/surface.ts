// The eval's fixture: a copy of the queue's shape, issues in the backlog, in a lane, done or drafts, each on a narrative with
// the issues it came out of and a note, kept in its tab and seeded the same at every run's start (seed.ts). The eval copies
// this folder into each run's project as its surface `queue`, so a variant that changes how a surface is told to the agent,
// in the framework or in these descriptions, brings its own copy. No store, no outline, no iterations: what the tasks need.
import { action, detail, surface, view, type Update } from "babavoss/core/index.ts"
import { seed } from "./seed.ts"

export const LANES = 5

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

  return { model: { ...w, issues: [...w.issues, issue], next: w.next + 1, clock: w.clock + 1 } }
}

const ABOUT = "a short imperative title, and about, brief markdown on what changes and why"
const BRANCH = "; from, the issues it came out of as a comma list, or empty; narrative, its id, or empty for its first parent's"
const add = action({
  name: "add",
  description: `Add an issue the person asked for to the bottom of the backlog: ${ABOUT}`,
  subject: {},
  inputs: { title: "string", about: "string" },
  update: (w: Work, args): Result => made(w, args, "backlog"),
})
const addFrom = action({
  name: "add_from",
  description: `Add an issue the person asked for, as add does, with what it came out of: ${ABOUT}${BRANCH}`,
  subject: {},
  inputs: { title: "string", about: "string", from: "string", narrative: "string" },
  update: (w: Work, args): Result => made(w, args, "backlog"),
})
const draft = action({
  name: "draft",
  description: "Suggest an issue the person has not asked for, as a draft: title and about as for add; it is theirs to look at, on the page or with you",
  subject: {},
  inputs: { title: "string", about: "string" },
  update: (w: Work, args): Result => made(w, args, "draft"),
})
const approve = action({
  name: "approve",
  description: ({ n }) => `Approve draft ${n} into the backlog: the person does on the page, and you do once they tell you to go ahead with it`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, (issue) => ({ ...issue, status: "backlog" })), notices: [said(w, n, "approved: it joins the backlog")] }),
})
const describe = action({
  name: "describe",
  description: ({ n }) => `Rewrite what issue ${n} is about, as brief markdown`,
  subject: { n: "number" },
  inputs: { about: "string" },
  update: (w: Work, { n, about }): Result => (about.trim() ? { model: changed(w, n, (issue) => ({ ...issue, about: about.trim() })) } : { refused: "Say what it is about" }),
})
const note = action({
  name: "note",
  description: ({ n }) => `Say where issue ${n} stands in one line: what is being done, or what it waits for; empty text clears it`,
  subject: { n: "number" },
  inputs: { text: "string" },
  update: (w: Work, { n, text }): Result => ({ model: changed(w, n, (issue) => ({ ...issue, note: text.trim() })) }),
})
const start = action({
  name: "start",
  description: ({ n }) => `Give issue ${n} to a lane, 1 to ${LANES}, when a subagent begins on it; a draft the person said to build starts the same way`,
  subject: { n: "number" },
  inputs: { lane: "number" },
  update(w: Work, { n, lane }): Result {
    if (!Number.isInteger(lane) || lane < 1 || lane > LANES) return { refused: `There are lanes 1 to ${LANES}` }

    const busy = w.issues.find((issue) => issue.status === "lane" && issue.lane === lane)

    if (busy) return { refused: `Lane ${lane} is delivering issue ${busy.n}` }

    return { model: moved(w, n, (issue) => ({ ...issue, status: "lane", lane })), notices: [said(w, n, `started in lane ${lane}`)] }
  },
})
const done = action({
  name: "done",
  description: ({ n }) => `Mark issue ${n} done: its work is merged into main, where the person can see it`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "done" })), notices: [said(w, n, "is done")] }),
})
const back = action({
  name: "back",
  description: ({ n }) => `Return issue ${n} to the backlog`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "backlog" })) }),
})
const drop = action({
  name: "drop",
  description: ({ n }) => `Remove issue ${n}: it will not be done`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({
    model: { ...w, issues: w.issues.filter((issue) => issue.n !== n).map((issue) => ({ ...issue, from: issue.from.filter((p) => p !== n) })) },
    notices: [said(w, n, "dropped").text],
  }),
})
const link = action({
  name: "link",
  description: ({ n }) => `Say issue ${n} came out of another issue as well`,
  subject: { n: "number" },
  inputs: { from: "number" },
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
  description: ({ n }) => `Say issue ${n} did not come out of one of the issues it names`,
  subject: { n: "number" },
  inputs: { from: "number" },
  update: (w: Work, { n, from }): Result =>
    find(w, n)!.from.includes(from)
      ? { model: changed(w, n, (issue) => ({ ...issue, from: issue.from.filter((x) => x !== from) })) }
      : { refused: `Issue ${n} did not come out of ${from}` },
})
const move = action({
  name: "move",
  description: ({ n }) => `Move issue ${n} to another narrative, by its id`,
  subject: { n: "number" },
  inputs: { narrative: "string" },
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
    ...(issue.status === "draft" && { attention: { who: "person", why: "to look at this draft" }, approve: approve.bind(subject) }),
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
      how:
        "The session's work as the person follows it, so it is worth keeping true as the work moves. What the person asks for is added " +
        "as an issue; what you would suggest is a draft, theirs to look at. Once they say to go ahead with a draft, on the page or in " +
        "the conversation, it is as good as approved: start it like any issue. A lane is a subagent delivering one issue; a note says " +
        "where an issue stands. Done means merged into main. add_from also names what an issue came out of and its narrative, an effort " +
        `going its own way. An issue's path has the rest. There are ${LANES} lanes; the backlog's top is next.`,
      lanes: LANES,
      free: Array.from({ length: LANES }, (_, i) => i + 1).filter((lane) => !lanes.some((issue) => issue.lane === lane)),
      narratives: w.narratives.map((x) => {
        const { about: _about, ...named } = counted(w, x)

        return named
      }),
      issues: [...[...lanes, ...backlog, ...drafts].map(row), ...finished.map((issue) => detail(row(issue)))],
      ...(drafts.length && { attention: { who: "person", why: `to look at ${drafts.length} draft${drafts.length > 1 ? "s" : ""}` } }),
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
  description:
    "Track the session's work as issues, each in the backlog, in a lane or done, on a narrative with what it came out of. " +
    "Use when work is asked for, starts, moves, branches or lands.",
  init: seed,
  update: (w, message) => (message.kind === "call" ? pages.update(w, message) : { model: w }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
