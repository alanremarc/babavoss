// The queue: the work on babavoss as issues, each a draft, in the backlog, in a lane or done. The agent orchestrates up to five
// lanes, each a subagent in its own worktree delivering one issue at a time, and keeps this current as the work moves;
// the person reads it on the page. Nothing here does the work: it says who is delivering what.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export const LANES = 5

export type Issue = { n: number; title: string; about: string; note?: string; status: "draft" | "backlog" | "lane" | "done"; lane?: number; at: number }
export type Model = { issues: Issue[]; next: number; clock: number }
type Event = { kind: "none" }
type Result = Update<Model, never>

/** The model with issue `n` changed and stamped, so each section keeps the order things arrived in it. */
const moved = (m: Model, n: number, change: (issue: Issue) => Issue): Model => ({
  ...m,
  clock: m.clock + 1,
  issues: m.issues.map((issue) => (issue.n === n ? { ...change(issue), at: m.clock } : issue)),
})

/** A notice of what happened to issue `n`, about its path, which a dropped one no longer has: "Issue 3, Title, is done". */
const said = (m: Model, n: number, what: string) => {
  const issue = m.issues.find((i) => i.n === n)!

  return { text: `${issue.status === "draft" ? "Draft" : "Issue"} ${n}, ${issue.title}, ${what}`, at: `/issues/${n}` }
}

const made = (m: Model, title: string, about: string, status: Issue["status"]): Result =>
  title.trim() && about.trim()
    ? { model: { issues: [...m.issues, { n: m.next, title: title.trim(), about: about.trim(), status, at: m.clock }], next: m.next + 1, clock: m.clock + 1 } }
    : { refused: "An issue needs a title and a line about it" }
const add = action({
  name: "add",
  description: "Add an issue the person asked for to the bottom of the backlog: a short imperative title, and about, brief markdown on what changes and why",
  subject: {},
  inputs: { title: "string", about: "string" },
  update: (m: Model, { title, about }): Result => made(m, title, about, "backlog"),
})
const draft = action({
  name: "draft",
  description: "Suggest an issue the person has not asked for, as a draft: title and about as for add; it waits for their approval on the page",
  subject: {},
  inputs: { title: "string", about: "string" },
  update: (m: Model, { title, about }): Result => made(m, title, about, "draft"),
})
const approve = action({
  name: "approve",
  description: ({ n }) => `Approve draft ${n}: it joins the backlog`,
  subject: { n: "number" },
  inputs: {},
  ask: true,
  update: (m: Model, { n }): Result => ({ model: moved(m, n, (issue) => ({ ...issue, status: "backlog" })), notices: [said(m, n, "approved: it joins the backlog")] }),
})
const describe = action({
  name: "describe",
  description: ({ n }) => `Rewrite what issue ${n} is about, as brief markdown`,
  subject: { n: "number" },
  inputs: { about: "string" },
  update: (m: Model, { n, about }): Result =>
    about.trim() ? { model: { ...m, issues: m.issues.map((issue) => (issue.n === n ? { ...issue, about: about.trim() } : issue)) } } : { refused: "Say what it is about" },
})
const note = action({
  name: "note",
  description: ({ n }) => `Say where issue ${n} stands in one line: what is being done, or what it waits for; empty text clears it`,
  subject: { n: "number" },
  inputs: { text: "string" },
  update: (m: Model, { n, text }): Result => ({
    model: { ...m, issues: m.issues.map((issue) => (issue.n === n ? { ...issue, note: text.trim() } : issue)) },
  }),
})
const start = action({
  name: "start",
  description: ({ n }) => `Give issue ${n} to a lane, 1 to ${LANES}, when a subagent begins on it`,
  subject: { n: "number" },
  inputs: { lane: "number" },
  update(m: Model, { n, lane }): Result {
    if (!Number.isInteger(lane) || lane < 1 || lane > LANES) return { refused: `There are lanes 1 to ${LANES}` }

    const busy = m.issues.find((issue) => issue.status === "lane" && issue.lane === lane)

    if (busy) return { refused: `Lane ${lane} is delivering issue ${busy.n}` }

    return { model: moved(m, n, (issue) => ({ ...issue, status: "lane", lane })), notices: [said(m, n, `started in lane ${lane}`)] }
  },
})
const done = action({
  name: "done",
  description: ({ n }) => `Mark issue ${n} done, once it is merged into main and the person can see it`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => ({ model: moved(m, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "done" })), notices: [said(m, n, "is done")] }),
})
const back = action({
  name: "back",
  description: ({ n }) => `Return issue ${n} to the backlog`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => ({ model: moved(m, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "backlog" })) }),
})
const drop = action({
  name: "drop",
  description: ({ n }) => `Remove issue ${n}: it will not be done`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => ({ model: { ...m, issues: m.issues.filter((issue) => issue.n !== n) }, notices: [said(m, n, "dropped").text] }),
})

const by = (a: Issue, b: Issue) => a.at - b.at
/** An issue as the stack lists it: one line, with the path that has the rest. */
const row = (issue: Issue) => ({
  at: `/issues/${issue.n}`,
  n: issue.n,
  title: issue.title,
  status: issue.status,
  ...(issue.lane && { lane: issue.lane }),
  ...(issue.note && { note: issue.note }),
})
/** An issue whole, at its own path: what it is about, and what can be done with it now. */
const whole = (issue: Issue) => ({
  ...row(issue),
  about: issue.about,
  ...(issue.status === "draft" && { attention: { who: "person", why: "to approve or drop this draft" }, approve: approve.bind({ n: issue.n }) }),
  describe: describe.bind({ n: issue.n }),
  note_: note.bind({ n: issue.n }),
  ...(issue.status === "backlog" && { start: start.bind({ n: issue.n }) }),
  ...(issue.status === "lane" && { done: done.bind({ n: issue.n }) }),
  ...((issue.status === "lane" || issue.status === "done") && { back: back.bind({ n: issue.n }) }),
  drop: drop.bind({ n: issue.n }),
})
const pages = view([add, draft, approve, describe, note, start, done, back, drop], {
  "/": (m) => {
    const lanes = m.issues.filter((issue) => issue.status === "lane").sort((a, b) => a.lane! - b.lane!)
    const backlog = m.issues.filter((issue) => issue.status === "backlog").sort(by)
    const drafts = m.issues.filter((issue) => issue.status === "draft").sort(by)
    const finished = m.issues.filter((issue) => issue.status === "done").sort((a, b) => b.at - a.at)

    return {
      title: "Queue",
      how: `Keep this true as the work moves: add an issue the person asks for, draft one you would suggest and leave it until they approve it on the page, start an issue when a subagent takes it in a lane, note where it stands, and mark it done only once it is merged into main. An issue's path has what it is about and what can be done with it. One issue per lane, ${LANES} lanes; the backlog's top is next.`,
      lanes: LANES,
      free: Array.from({ length: LANES }, (_, i) => i + 1).filter((lane) => !lanes.some((issue) => issue.lane === lane)),
      issues: [...lanes, ...backlog, ...drafts, ...finished].map(row),
      ...(drafts.length && { attention: { who: "person", why: `to approve or drop ${drafts.length} draft${drafts.length > 1 ? "s" : ""}` } }),
      add: add.bind({}),
      draft: draft.bind({}),
    }
  },
  "/issues/:n": (m, { n }) => {
    const issue = m.issues.find((issue) => issue.n === Number(n))

    return issue && whole(issue)
  },
})

export default surface<Model, Event, never>({
  description: "Track the work on babavoss as issues: the backlog, the lanes delivering, and what is done. Use when work is asked for, starts, moves or lands.",
  init: () => ({ issues: [], next: 1, clock: 0 }),
  // State kept from a tab that is not a queue's, as when the surface was still the template it began as, starts empty.
  restore: (saved) => (Array.isArray((saved as Partial<Model> | undefined)?.issues) && (saved as Model).issues.every((issue) => typeof issue.about === "string") ? (saved as Model) : { issues: [], next: 1, clock: 0 }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
