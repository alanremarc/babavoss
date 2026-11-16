// A narrative as an outline of what came out of what: its roots, the issues on it with no parent on it, in the order they
// were added, and under each issue the issues on it that came out of it, in the same order. An issue with several parents
// on the narrative stands once, under the first, and names the others; links to other narratives are said on the issue
// they touch. Pure: the work in, the outline out, for the view to say; and how the page folds the outline it reads.
import type { Issue, Work } from "./work.ts"

/** Issues on other narratives that an issue came out of or led to, by narrative: { leftovers: [50, 51] }. */
export type Elsewhere = Record<string, number[]>
/**
 * An issue in its place: `depth` 0 for a root; `also`, the other issues on the narrative it came out of besides the one
 * it stands under; `from` and `to`, what it came out of and led to on other narratives.
 */
export type Place = { issue: Issue; depth: number; also: number[]; from: Elsewhere; to: Elsewhere }

const open = (issue: Issue) => issue.status !== "done"

/** The issues on narrative `id` in outline order, each in its place. */
export function outline(w: Work, id: string): Place[] {
  const mine = w.issues.filter((issue) => issue.narrative === id).sort((a, b) => a.n - b.n)
  const here = new Set(mine.map((issue) => issue.n))
  const under = (issue: Issue) => issue.from.find((p) => here.has(p))
  const elsewhere = (ns: number[]) => {
    const by: Elsewhere = {}

    for (const n of ns) {
      const there = w.issues.find((issue) => issue.n === n)

      if (there && there.narrative !== id) (by[there.narrative] ??= []).push(n)
    }

    return by
  }
  const places: Place[] = []
  const walk = (issue: Issue, depth: number) => {
    const first = under(issue)

    places.push({
      issue,
      depth,
      also: issue.from.filter((p) => here.has(p) && p !== first),
      from: elsewhere(issue.from),
      to: elsewhere(w.issues.filter((other) => other.from.includes(issue.n)).map((other) => other.n)),
    })
    mine.filter((child) => under(child) === issue.n).forEach((child) => walk(child, depth + 1))
  }

  mine.filter((issue) => under(issue) === undefined).forEach((issue) => walk(issue, 0))

  return places
}

/** The places whose issue is open, with every issue they stand under, so each open one keeps its path. */
export function openOnly(places: Place[]): Place[] {
  const kept = new Set<number>()

  places.forEach((place, i) => {
    if (!open(place.issue)) return
    // Its path: the nearest place before it at each shallower depth.
    let depth = place.depth

    kept.add(i)
    for (let j = i - 1; j >= 0 && depth > 0; j--)
      if (places[j]!.depth < depth) {
        depth = places[j]!.depth
        kept.add(j)
      }
  })

  return places.filter((_, i) => kept.has(i))
}

/** An issue's place as an outline lists it: its number and how deep it stands. */
type Placed = { n: number; depth: number }

/** The places shown once the branches under the issues in `folded` are closed: those issues stay, what stands under them goes. */
export function fold<P extends Placed>(places: P[], folded: ReadonlySet<number>): P[] {
  const shown: P[] = []
  let below: number | undefined

  for (const place of places) {
    if (below !== undefined && place.depth > below) continue
    below = folded.has(place.n) ? place.depth : undefined
    shown.push(place)
  }

  return shown
}

/** Whether a place has issues standing under it: the next place is deeper. */
export const branches = (places: Placed[], i: number) => (places[i + 1]?.depth ?? -1) > places[i]!.depth
