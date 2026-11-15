// The queue: the work on babavoss as issues, each in the backlog, in a lane or done. The agent orchestrates up to five
// lanes, each a subagent in its own worktree delivering one issue at a time, and keeps this current as the work moves;
// the person reads it on the page. Nothing here does the work: it says who is delivering what.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export const LANES = 5

export type Issue = { n: number; title: string; note?: string; status: "backlog" | "lane" | "done"; lane?: number; at: number }
export type Model = { issues: Issue[]; next: number; clock: number }
type Event = { kind: "none" }
type Result = Update<Model, never>

/** The model with issue `n` changed and stamped, so each section keeps the order things arrived in it. */
const moved = (m: Model, n: number, change: (issue: Issue) => Issue): Model => ({
  ...m,
  clock: m.clock + 1,
  issues: m.issues.map((issue) => (issue.n === n ? { ...change(issue), at: m.clock } : issue)),
})

const add = action({
  name: "add",
  description: "Add an issue to the bottom of the backlog: one deliverable change, titled in the imperative",
  subject: {},
  inputs: { title: "string" },
  update: (m: Model, { title }): Result =>
    title.trim()
      ? { model: { issues: [...m.issues, { n: m.next, title: title.trim(), status: "backlog", at: m.clock }], next: m.next + 1, clock: m.clock + 1 } }
      : { refused: "An issue needs a title" },
})
const note = action({
  name: "note",
  description: ({ n }) => `Say where issue ${n} stands in one line: what is being done, or what it waits for; empty text clears it`,
  subject: { n: "number" },
  inputs: { text: "string" },
  update: (m: Model, { n, text }): Result => ({
    model: { ...m, issues: m.issues.map(({ note: _note, ...issue }) => (issue.n === n ? { ...issue, ...(text.trim() && { note: text.trim() }) } : { ...issue, ...(_note && { note: _note }) })) },
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

    return { model: moved(m, n, (issue) => ({ ...issue, status: "lane", lane })) }
  },
})
const done = action({
  name: "done",
  description: ({ n }) => `Mark issue ${n} done, once it is merged into main and the person can see it`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => ({ model: moved(m, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "done" })) }),
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
  update: (m: Model, { n }): Result => ({ model: { ...m, issues: m.issues.filter((issue) => issue.n !== n) } }),
})

const by = (a: Issue, b: Issue) => a.at - b.at
const row = (issue: Issue) => ({
  n: issue.n,
  title: issue.title,
  status: issue.status,
  ...(issue.lane && { lane: issue.lane }),
  ...(issue.note && { note: issue.note }),
  note_: note.bind({ n: issue.n }),
  ...(issue.status === "backlog" && { start: start.bind({ n: issue.n }) }),
  ...(issue.status === "lane" && { done: done.bind({ n: issue.n }) }),
  ...(issue.status !== "backlog" && { back: back.bind({ n: issue.n }) }),
  drop: drop.bind({ n: issue.n }),
})
const pages = view([add, note, start, done, back, drop], {
  "/": (m) => {
    const lanes = m.issues.filter((issue) => issue.status === "lane").sort((a, b) => a.lane! - b.lane!)
    const backlog = m.issues.filter((issue) => issue.status === "backlog").sort(by)
    const finished = m.issues.filter((issue) => issue.status === "done").sort((a, b) => b.at - a.at)

    return {
      title: "Queue",
      how: `Keep this true as the work moves: add an issue when work is asked for or found, start it when a subagent takes it in a lane, note where it stands, and mark it done only once it is merged into main. One issue per lane, ${LANES} lanes; the backlog's top is next.`,
      lanes: LANES,
      free: Array.from({ length: LANES }, (_, i) => i + 1).filter((lane) => !lanes.some((issue) => issue.lane === lane)),
      issues: [...lanes, ...backlog, ...finished].map(row),
      add: add.bind({}),
    }
  },
})

export default surface<Model, Event, never>({
  description: "Track the work on babavoss as issues: the backlog, the lanes delivering, and what is done. Use when work is asked for, starts, moves or lands.",
  init: () => ({ issues: [], next: 1, clock: 0 }),
  // State kept from a tab that is not a queue's, as when the surface was still the template it began as, starts empty.
  restore: (saved) => (Array.isArray((saved as Partial<Model> | undefined)?.issues) ? (saved as Model) : { issues: [], next: 1, clock: 0 }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
