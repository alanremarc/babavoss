// Where the map draws each issue: narratives leave a central origin each in its own direction, issues step outward by their
// depth in the narrative on a grid, the deepest child goes on straight and the others stack beside it, an issue that came out
// of two narratives is drawn between them, and a few passes push overlapping cards apart. Each narrative's direction is
// searched among a few, for the most compact map with the fewest crossings. The same data always gives the same map.

export type Placed = { n: number; narrative: string; from: number[] }
export type Point = { x: number; y: number }
export type Layout = { at: Map<number, Point>; angle: Map<string, number>; direction: (n: number) => Point }

export const CARD = { w: 184, h: 76 }
/** The origin's own box, kept clear of cards. */
const ORIGIN = { w: 150, h: 34 }
const GAP = { along: 48, side: 14 }
const PASSES = 120
/** How many directions a narrative may take, and the frame's shape they are judged against, width over height. */
const DIRECTIONS = 12
const FINALISTS = 40
const ASPECT = 1.35

/** Every ordering of `xs` that keeps the first in place, in a fixed order. */
function orders<T>(xs: T[]): T[][] {
  if (xs.length <= 2) return [xs]

  const [first, ...rest] = xs
  const perms = (ys: T[]): T[][] => (ys.length <= 1 ? [ys] : ys.flatMap((y, i) => perms([...ys.slice(0, i), ...ys.slice(i + 1)]).map((p) => [y, ...p])))

  return perms(rest).map((p) => [first!, ...p])
}

/** The narratives round the origin, those that share edges next to each other: the ordering with the shortest cross edges. */
function arrange(ids: string[], nodes: Placed[]): string[] {
  if (ids.length > 7) return ids

  const of = new Map(nodes.map((node) => [node.n, node.narrative]))
  const pairs = nodes.flatMap((node) => node.from.flatMap((p) => (of.has(p) && of.get(p) !== node.narrative ? [[of.get(p)!, node.narrative] as const] : [])))
  const cost = (order: string[]) =>
    pairs.reduce((sum, [a, b]) => {
      const d = Math.abs(order.indexOf(a) - order.indexOf(b))

      return sum + Math.min(d, order.length - d) ** 2
    }, 0)

  return orders(ids).reduce((best, order) => (cost(order) < cost(best) ? order : best))
}

type Tree = { n: number; depth: number; children: Tree[]; left: number; right: number; v: number }

/** One narrative as a tree on its own: depth along its direction and a lateral slot, the deepest line kept straight. */
function narrative(nodes: Placed[]): Map<number, { depth: number; v: number }> {
  const inside = new Map(nodes.map((node) => [node.n, node]))
  const local = (node: Placed) => node.from.filter((p) => inside.has(p))
  const depths = new Map<number, number>()
  /** The longest line of issues in this narrative that leads to `n`; a cycle, which the surface refuses, would end the walk. */
  const depth = (n: number, walking = new Set<number>()): number => {
    if (depths.has(n)) return depths.get(n)!
    if (walking.has(n)) return 1
    walking.add(n)

    const d = 1 + Math.max(0, ...local(inside.get(n)!).map((p) => depth(p, walking)))

    walking.delete(n)
    depths.set(n, d)

    return d
  }

  for (const node of nodes) depth(node.n)

  const trees = new Map(nodes.map((node) => [node.n, { n: node.n, depth: depths.get(node.n)!, children: [], left: 0, right: 0, v: 0 } as Tree]))
  const top: Tree = { n: -1, depth: 0, children: [], left: 0, right: 0, v: 0 }

  for (const node of nodes) {
    const ps = local(node)
    const primary = ps.reduce<number | undefined>((best, p) => (best === undefined || depths.get(p)! > depths.get(best)! ? p : best), undefined)

    ;(primary === undefined ? top : trees.get(primary)!).children.push(trees.get(node.n)!)
  }

  const height = (t: Tree): number => 1 + Math.max(0, ...t.children.map(height))
  /** The lateral extent of a subtree around its own line, the deepest child on that line and the rest alternating beside it. */
  const measure = (t: Tree): void => {
    t.children.forEach(measure)
    if (!t.children.length) return

    const spine = t.children.reduce((best, c) => (height(c) > height(best) ? c : best))
    let left = Math.min(0, spine.left)
    let right = Math.max(0, spine.right)

    spine.v = 0
    t.children
      .filter((c) => c !== spine)
      .forEach((c, i) => {
        if (i % 2 === 0) {
          c.v = right - c.left + 1
          right = c.v + c.right
        } else {
          c.v = left - c.right - 1
          left = c.v + c.left
        }
      })
    t.left = left
    t.right = right
  }

  measure(top)

  const out = new Map<number, { depth: number; v: number }>()
  const place = (t: Tree, v: number) => {
    if (t.n >= 0) out.set(t.n, { depth: t.depth, v })
    for (const c of t.children) place(c, v + c.v)
  }

  // Centre the narrative's fan on its direction.
  place(top, -(top.left + top.right) / 2)

  return out
}

export function layout(ids: string[], nodes: Placed[]): Layout {
  if (!ids.length) return { at: new Map(), angle: new Map(), direction: () => ({ x: 1, y: 0 }) }

  const order = arrange(ids, nodes)
  const groups = new Map(order.map((id) => [id, nodes.filter((node) => node.narrative === id)]))
  const local = new Map(order.map((id) => [id, narrative(groups.get(id)!)]))
  const by = new Map(nodes.map((node) => [node.n, node]))
  const ns = nodes.map((node) => node.n).sort((a, b) => a - b)
  // Each narrative takes one of a few directions, in their order round the origin, starting from any of them; the most
  // compact map with the fewest overlaps and crossings is kept. All are judged as first placed; the best few are relaxed
  // and judged again.
  const turns = order.map((_, r) => [...order.slice(r), ...order.slice(0, r)])
  const tried = turns.flatMap((turned) => choices(turned.length).map((angles) => place(turned, local, by, ns, angles)))
  const finalists = tried.sort((a, b) => a.score - b.score).slice(0, FINALISTS)

  for (const f of finalists) {
    relax(f.at, ns)
    f.score = judge(f.at, by, ns)
  }

  const best = finalists.reduce((a, b) => (b.score < a.score ? b : a))
  const direction = (n: number) => {
    const theta = best.angle.get(by.get(n)?.narrative ?? "") ?? 0

    return { x: Math.cos(theta), y: Math.sin(theta) }
  }

  return { at: best.at, angle: best.angle, direction }
}

/** Every way to give `count` narratives distinct directions out of the candidates, in order round the origin. */
function choices(count: number): number[][] {
  const steps = Array.from({ length: DIRECTIONS }, (_, i) => -Math.PI + (2 * Math.PI * i) / DIRECTIONS)

  if (count > DIRECTIONS - 2) return [Array.from({ length: count }, (_, i) => -Math.PI + (2 * Math.PI * i) / count)]

  const out: number[][] = []
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === count) return void out.push(chosen)
    for (let i = from; i <= DIRECTIONS - (count - chosen.length); i++) pick(i + 1, [...chosen, steps[i]!])
  }

  pick(0, [])

  return out
}

/** The map with the narratives in these directions: every card's place, and how good it is, lower better. */
function place(order: string[], local: Map<string, Map<number, { depth: number; v: number }>>, by: Map<number, Placed>, ns: number[], angles: number[]) {
  const angle = new Map(order.map((id, i) => [id, angles[i]!]))
  const at = new Map<number, Point>()

  // A narrative mostly sideways grows in columns, one mostly up or down in rows; each step out also drifts along its direction,
  // and siblings stack across the growth, so cards stay on a grid and the narrative still leaves the origin its own way.
  for (const id of order) {
    const theta = angle.get(id)!
    const d = { x: Math.cos(theta), y: Math.sin(theta) }
    const across = Math.abs(d.x) >= 0.6 * Math.abs(d.y)
    const along = across ? (CARD.w + GAP.along) / Math.abs(d.x) : (CARD.h + GAP.along) / Math.abs(d.y)
    const side = across ? { x: 0, y: CARD.h + GAP.side } : { x: CARD.w + GAP.side, y: 0 }
    const first = across ? (ORIGIN.w / 2 + GAP.along + CARD.w / 2) / Math.abs(d.x) : (ORIGIN.h / 2 + GAP.along + CARD.h / 2) / Math.abs(d.y)

    for (const [n, { depth, v }] of local.get(id)!) {
      const r = first + (depth - 1) * along

      at.set(n, { x: d.x * r + side.x * v, y: d.y * r + side.y * v })
    }
  }

  // An issue that came out of more than one narrative is drawn between them, a step out from its parents.
  const done = new Set<number>()
  const settle = (n: number) => {
    if (done.has(n)) return
    done.add(n)

    const ps = by.get(n)!.from.filter((p) => at.has(p))

    ps.forEach(settle)
    if (new Set(ps.map((p) => by.get(p)!.narrative)).size < 2) return

    const c = ps.reduce((sum, p) => ({ x: sum.x + at.get(p)!.x / ps.length, y: sum.y + at.get(p)!.y / ps.length }), { x: 0, y: 0 })
    const r = Math.hypot(c.x, c.y) || 1
    const own = at.get(n)!

    at.set(n, { x: (own.x + c.x + (c.x / r) * 140) / 2, y: (own.y + c.y + (c.y / r) * 100) / 2 })
  }

  for (const n of ns) settle(n)

  return { at, angle, score: judge(at, by, ns) }
}

/** How good a map is, lower better: the area it covers against a landscape frame, each pair of cards that overlap, each edge
 * through a card, each two edges that cross. */
function judge(at: Map<number, Point>, by: Map<number, Placed>, ns: number[]): number {
  const xs = [0, ...[...at.values()].map((p) => p.x)]
  const ys = [0, ...[...at.values()].map((p) => p.y)]
  const w = Math.max(...xs) - Math.min(...xs) + CARD.w
  const h = Math.max(...ys) - Math.min(...ys) + CARD.h
  const fit = Math.min(ASPECT / w, 1 / h)
  let overlaps = 0

  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const p = at.get(ns[i]!)!
      const q = at.get(ns[j]!)!

      if (Math.abs(p.x - q.x) < CARD.w + GAP.side && Math.abs(p.y - q.y) < CARD.h + GAP.side) overlaps++
    }
  }

  const edges = ns.flatMap((n) => by.get(n)!.from.filter((p) => at.has(p)).map((p) => [at.get(p)!, at.get(n)!, p, n] as const))
  const through = edges.reduce((sum, [a, b, p, n]) => sum + ns.filter((m) => m !== p && m !== n && crosses(a, b, at.get(m)!)).length, 0)
  let crossings = 0

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b, p, n] = edges[i]!
      const [c, d, q, m] = edges[j]!

      if (p !== q && n !== m && p !== m && n !== q && cut(a, b, c, d)) crossings++
    }
  }

  return (1 / fit) ** 2 * (1 + 0.3 * overlaps) * (1 + 0.1 * through) * (1 + 0.12 * crossings)
}

/** Whether the segments ab and cd cross. */
function cut(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))

  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

/** Whether the segment from a to b passes through the card centred at c. */
function crosses(a: Point, b: Point, c: Point): boolean {
  const steps = 16

  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps
    const y = a.y + ((b.y - a.y) * i) / steps

    if (Math.abs(x - c.x) < CARD.w / 2 && Math.abs(y - c.y) < CARD.h / 2) return true
  }

  return false
}

/** Push overlapping cards apart, the origin fixed, in a fixed order, along the axis that overlaps least. */
function relax(at: Map<number, Point>, ns: number[]) {
  const mx = CARD.w + GAP.side
  const my = CARD.h + GAP.side

  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false

    for (const n of ns) {
      const a = at.get(n)!
      const ox = (CARD.w + ORIGIN.w) / 2 + GAP.side - Math.abs(a.x)
      const oy = (CARD.h + ORIGIN.h) / 2 + GAP.side - Math.abs(a.y)

      if (ox > 0 && oy > 0) {
        moved = true
        at.set(n, ox < oy ? { x: a.x + Math.sign(a.x || 1) * ox, y: a.y } : { x: a.x, y: a.y + Math.sign(a.y || 1) * oy })
      }
    }
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = at.get(ns[i]!)!
        const b = at.get(ns[j]!)!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const ox = mx - Math.abs(dx)
        const oy = my - Math.abs(dy)

        if (ox <= 0 || oy <= 0) continue
        moved = true
        if (ox / mx < oy / my) {
          const s = (Math.sign(dx || ns[j]! - ns[i]!) * ox) / 2

          at.set(ns[i]!, { x: a.x - s, y: a.y })
          at.set(ns[j]!, { x: b.x + s, y: b.y })
        } else {
          const s = (Math.sign(dy || ns[j]! - ns[i]!) * oy) / 2

          at.set(ns[i]!, { x: a.x, y: a.y - s })
          at.set(ns[j]!, { x: b.x, y: b.y + s })
        }
      }
    }
    if (!moved) break
  }
}
