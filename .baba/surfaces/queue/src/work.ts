// The session's work, one record that the list and the narratives are views of: issues, each on a narrative, an effort going
// its own way, with the issues it came out of, the reasoning of each of its iterations, and where it stands in the queue.
// The issues form a graph without cycles. Pure: no store, no clock.

export type Status = "draft" | "backlog" | "lane" | "done"
/** A line a lane's worker posted about where its issue stands, with when the call was admitted. */
export type Posted = { t?: number; text: string }
/** One pass at an issue: why it was needed, what was decided, what came of it. */
export type Iteration = { title: string; why: string; decided: string; outcome: string }
export type Narrative = { id: string; title: string; about: string }
/** `order`: when it last moved, so each section keeps the order things arrived in it. */
export type Issue = {
  n: number
  title: string
  about: string
  status: Status
  lane?: number
  note?: string
  updates?: Posted[]
  order: number
  narrative: string
  from: number[]
  iterations: Iteration[]
}
/** `seeded`: the map's history was merged in, once. */
export type Work = { issues: Issue[]; narratives: Narrative[]; next: number; clock: number; seeded?: true }

/** Where an issue goes that names no narrative and came out of none. */
export const DEFAULT: Narrative = { id: "work", title: "The work", about: "Issues on no narrative of their own." }

export const empty = (): Work => ({ issues: [], narratives: [], next: 1, clock: 0 })
export const find = (w: Work, n: number) => w.issues.find((issue) => issue.n === n)

/** The work with the default narrative, where it is not there yet. */
export const withDefault = (w: Work): Work => (w.narratives.some((x) => x.id === DEFAULT.id) ? w : { ...w, narratives: [...w.narratives, DEFAULT] })

/** Whether `to` is reachable from `n` along "came out of" edges read forwards: linking `n` from `to` would then close a cycle. */
export function reaches(w: Work, n: number, to: number): boolean {
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
export function parents(w: Work, list: string): number[] | string {
  const ns = list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  const missing = ns.find((n) => !Number.isInteger(n) || !find(w, n))

  return missing === undefined ? [...new Set(ns)] : `There is no issue ${missing}`
}

/**
 * The work as the store has it with what a tab brought from before merged in, losing nothing: the store's own issues and
 * narratives stand, the tab's that the store does not have join them.
 */
export function union(kept: Work, brought: Work): Work {
  const issues = [...kept.issues, ...brought.issues.filter((issue) => !find(kept, issue.n))]
  const narratives = [...kept.narratives, ...brought.narratives.filter((x) => !kept.narratives.some((y) => y.id === x.id))]
  const top = Math.max(0, ...issues.map((issue) => issue.n))

  return {
    issues,
    narratives,
    next: Math.max(kept.next, brought.next, top + 1),
    clock: Math.max(kept.clock, brought.clock),
    ...((kept.seeded || brought.seeded) && { seeded: true as const }),
  }
}

/** Whether a value read from where the work is kept is work. */
export const isWork = (value: unknown): value is Work => {
  const w = value as Partial<Work> | undefined

  return !!w && Array.isArray(w.issues) && Array.isArray(w.narratives) && typeof w.next === "number" && typeof w.clock === "number"
}
