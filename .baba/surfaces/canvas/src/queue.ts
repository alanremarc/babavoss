// Import the former session queues into a worktree's first Canvas record. The source records stay in place.
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readJsonFile } from "babavoss/core/index.ts"
import { empty, type Canvas, type Post, type Ticket } from "./canvas.ts"

type QueueIssue = {
  n: number
  title: string
  about: string
  status: "draft" | "backlog" | "lane" | "done"
  order: number
  lane?: number
  note?: string
  updates?: { t?: number; text: string }[]
  narrative?: string
  from?: number[]
  iterations?: { title: string; why: string; decided: string; outcome: string }[]
}
type Queue = { issues: QueueIssue[]; narratives: { id: string; title: string }[]; next?: number }
const status: Record<QueueIssue["status"], Ticket["status"]> = { draft: "waiting", backlog: "open", lane: "working", done: "done" }

function readQueue(file: string): Queue {
  const work = readJsonFile<Partial<Queue>>(file)

  if (!work || !Array.isArray(work.issues) || !Array.isArray(work.narratives) ||
    !work.issues.every((issue) => issue && Number.isSafeInteger(issue.n) && issue.n > 0 && typeof issue.title === "string" &&
      typeof issue.about === "string" && Object.hasOwn(status, issue.status) && Number.isFinite(issue.order)) ||
    new Set(work.issues.map(({ n }) => n)).size !== work.issues.length) throw new Error(`${file} does not hold a queue`)

  return { issues: work.issues, narratives: work.narratives, ...(Number.isSafeInteger(work.next) && { next: work.next }) }
}

export function fromQueues(state: string, current?: string): Canvas | undefined {
  const sessions = join(state, "sessions")

  if (!existsSync(sessions)) return undefined

  const canvas = empty()
  const dirs = readdirSync(sessions, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  const ordered = current && dirs.includes(current) ? [current, ...dirs.filter((name) => name !== current)] : dirs
  const used = new Set<number>()

  for (const session of ordered) {
    const file = join(sessions, session, "work.json")

    if (!existsSync(file)) continue

    const work = readQueue(file)
    const time = statSync(file).mtime.toISOString()
    const ids = new Map<number, number>()

    canvas.next = Math.max(canvas.next, work.next ?? 1)
    // Keep IDs where they fit, then give colliding issues a new ID before mapping their references.
    for (const { n } of work.issues) {
      if (used.has(n)) continue
      used.add(n)
      ids.set(n, n)
      canvas.next = Math.max(canvas.next, n + 1)
    }
    for (const { n } of work.issues) if (!ids.has(n)) ids.set(n, canvas.next++)
    for (const id of ids.values()) used.add(id)

    for (const issue of [...work.issues].sort((a, b) => a.order - b.order)) {
      const phase = work.narratives.find(({ id }) => id === issue.narrative)?.title
      const from = issue.from?.map((n) => ids.has(n) ? `#${ids.get(n)}` : `Queue #${n}`).join(", ")
      const about = [issue.about, `Imported from Queue issue #${issue.n} in session ${session}.`]
      const posts: Post[] = []

      if (from) about.push(`Came from ${from}.`)
      if (issue.lane !== undefined) about.push(`Queue lane ${issue.lane}.`)
      if (issue.status === "draft") about.push("This draft was waiting for approval.")
      for (const round of issue.iterations ?? []) about.push(`## ${round.title}`, ...[round.why, round.decided, round.outcome].filter(Boolean))
      for (const update of issue.updates ?? []) {
        const at = new Date(update.t ?? Number.NaN)

        posts.push({ at: Number.isFinite(at.getTime()) ? at.toISOString() : time, by: "worker", text: update.text })
      }
      if (issue.note) posts.push({ at: time, by: "main", text: issue.note })
      canvas.tickets.push({
        n: ids.get(issue.n)!, title: issue.title, about: about.join("\n\n"), status: status[issue.status],
        worker: issue.status === "lane" ? "subagent" : "main", ...(phase && { phase }), posts,
        createdAt: time, updatedAt: time, order: canvas.clock++,
      })
    }
  }

  return canvas.tickets.length ? canvas : undefined
}
