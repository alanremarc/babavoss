// The demo project's tasks, for the design document's scenarios: rows by identity, the same actions for both sides, a
// decision that is the person's, raised by the agent in the conversation and taken by either side, attention while their
// word is waited for, a notice when a task moves, and a path per task. A task in review carries its approve and reopen in
// the list too, so it is decided from the list. The list is ordered by what is to be done: in review first, then to do,
// then done, so an approval moves a row.
import { action, detail, surface, view, type Update } from "babavoss/core/index.ts"

export type Task = { n: number; title: string; status: "todo" | "review" | "done"; note?: string }
export type Model = { tasks: Task[]; next: number }
type Result = Update<Model, never>

const moved = (m: Model, n: number, status: Task["status"], what: string): Result => {
  const task = m.tasks.find((t) => t.n === n)!

  return { model: { ...m, tasks: m.tasks.map((t) => (t.n === n ? { ...t, status } : t)) }, notices: [{ text: `Task ${n}, ${task.title}, ${what}`, at: `/tasks/${n}` }] }
}

const ORDER: Record<Task["status"], number> = { review: 0, todo: 1, done: 2 }
/** A task as / lists it; a done one is detail there, counted at / and read whole at the tab's path. */
const row = (t: Task) => ({
  at: `/tasks/${t.n}`,
  n: t.n,
  title: t.title,
  status: t.status,
  ...(t.note && { note: t.note }),
  ...(t.status === "review" && { approve: approve.bind({ n: t.n }), reopen: reopen.bind({ n: t.n }) }),
})

const add = action({
  name: "add",
  description: "Add a task: a short title",
  subject: {},
  inputs: { title: "string" },
  update: (m: Model, { title }): Result =>
    title.trim() ? { model: { tasks: [...m.tasks, { n: m.next, title: title.trim(), status: "todo" }], next: m.next + 1 } } : { refused: "A task needs a title" },
})
const done = action({
  name: "done",
  description: ({ n }) => `Mark task ${n} done; the person reviews it`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => moved(m, n, "review", "waits for review"),
})
const approve = action({
  name: "approve",
  description: ({ n }) => `Approve task ${n}`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => moved(m, n, "done", "is approved"),
})
const reopen = action({
  name: "reopen",
  description: ({ n }) => `Reopen task ${n}: it is not done`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Result => moved(m, n, "todo", "is reopened"),
})
const annotate = action({
  name: "annotate",
  description: ({ n }) => `Note on task ${n} what was done or found: a line`,
  subject: { n: "number" },
  inputs: { text: "string" },
  update: (m: Model, { n, text }): Result => ({ model: { ...m, tasks: m.tasks.map((t) => (t.n === n ? { ...t, note: text.trim() } : t)) } }),
})
const pages = view([add, done, approve, reopen, annotate], {
  "/": (m) => {
    const review = m.tasks.filter((t) => t.status === "review")

    return {
      title: "Tasks",
      how: "Add what the person asks for and mark a task done when it is. Approving it is the person's decision: ask them in the conversation, and approve or reopen it as they say; they may do it on the page instead.",
      tasks: m.tasks.toSorted((a, b) => ORDER[a.status] - ORDER[b.status]).map((t) => (t.status === "done" ? detail(row(t)) : row(t))),
      ...(review.length && { attention: { who: "person", why: `to review ${review.length === 1 ? `task ${review[0]!.n}` : `${review.length} tasks`}` } }),
      add: add.bind({}),
    }
  },
  "/tasks/:n": (m, { n }) => {
    const t = m.tasks.find((t) => t.n === Number(n))

    return (
      t && {
        ...t,
        annotate: annotate.bind({ n: t.n }),
        ...(t.status === "todo" && { done: done.bind({ n: t.n }) }),
        ...(t.status === "review" && { approve: approve.bind({ n: t.n }), reopen: reopen.bind({ n: t.n }) }),
      }
    )
  },
})

export default surface<Model, { kind: "none" }, never>({
  description: "Track the project's tasks. Use when work is asked for.",
  init: () => ({ tasks: [], next: 1 }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
