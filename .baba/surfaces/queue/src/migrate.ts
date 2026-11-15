// What a queue tab kept before the work was the session's own, made into work once: its issues as they were, each placed on
// a narrative with what it came out of and its reasoning, from the map of the work's history (seed.ts). Nothing kept is lost:
// an issue keeps its title, about, status, note and updates; the map adds what the queue did not have.
import { later, narratives, nodes } from "./seed.ts"
import { DEFAULT, find, withDefault, type Issue, type Work } from "./work.ts"

/** A queue tab's model before: issues ordered by `at`, with no narrative, edges or iterations. */
export type Legacy = { issues: (Omit<Issue, "order" | "narrative" | "from" | "iterations"> & { at: number })[]; next: number; clock: number }

/** What an issue the map knew and the queue did not is about, since the map kept no words on it. */
export const FROM_MAP = "Kept from the map of the work, which had it before the queue did."

export const isLegacy = (saved: unknown): saved is Legacy => {
  const kept = saved as Partial<Legacy> & { narratives?: unknown }

  return !!kept && Array.isArray(kept.issues) && !Array.isArray(kept.narratives) && kept.issues.every((issue) => typeof issue.about === "string")
}

/** A queue kept from before, as work, with the map's history merged in. */
export function adopt(legacy: Legacy): Work {
  const issues = legacy.issues.map(({ at, ...issue }): Issue => ({ ...issue, order: at, narrative: "", from: [], iterations: [] }))
  const top = Math.max(0, ...issues.map((issue) => issue.n))

  return seed({ issues, narratives: [], next: Math.max(legacy.next, top + 1), clock: legacy.clock })
}

/**
 * The map's history merged into the work, once, by issue number: an issue on no narrative yet takes the map's narrative,
 * edges and iterations, or for one taken after the map, its narrative and edges, else the default narrative; an issue the
 * map had and the work does not joins it as done, before the rest. Edges to an issue the work does not have are left out.
 */
export function seed(w: Work): Work {
  if (w.seeded) return w

  const oldest = Math.min(0, ...w.issues.map((issue) => issue.order))
  const missing = nodes.filter((node) => !find(w, node.n))
  const joined: Issue[] = missing.map((node, i) => ({
    n: node.n,
    title: node.title,
    about: FROM_MAP,
    status: "done",
    order: oldest - missing.length + i,
    narrative: node.narrative,
    from: node.from,
    iterations: node.iterations,
  }))
  const placed = w.issues.map((issue): Issue => {
    if (issue.narrative) return issue

    const node = nodes.find((x) => x.n === issue.n)
    const next = later.find((x) => x.n === issue.n)
    const iterations = issue.iterations.length ? issue.iterations : (node?.iterations ?? [])

    return { ...issue, narrative: node?.narrative ?? next?.narrative ?? DEFAULT.id, from: node?.from ?? next?.from ?? issue.from, iterations }
  })
  const all = [...joined, ...placed]
  const ns = new Set(all.map((issue) => issue.n))
  const issues = all.map((issue) => ({ ...issue, from: issue.from.filter((p) => ns.has(p) && p !== issue.n) }))
  const mine = narratives.filter((x) => !w.narratives.some((y) => y.id === x.id))
  const merged: Work = {
    ...w,
    issues,
    narratives: [...mine, ...w.narratives],
    next: Math.max(w.next, ...[...ns].map((n) => n + 1)),
    seeded: true,
  }

  return issues.some((issue) => issue.narrative === DEFAULT.id) ? withDefault(merged) : merged
}
