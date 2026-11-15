// How toolbars are arranged, as pure changes: tools stacked in toolbars, each pinned to an edge or floating, moved by a
// drag or a menu. Every tool is in exactly one toolbar; a toolbar left with none is gone.

/** An edge of the content a toolbar pins to; each holds at most one. */
export type Edge = "left" | "right" | "top" | "bottom"
/** A floating toolbar's box, within the content. */
export type Float = { x: number; y: number; width: number; height: number }
/** A toolbar: one stack of tools, in order, pinned to an edge or floating, collapsed to icons or expanded. */
export type Bar = { id: string; tools: string[]; edge?: Edge; float?: Float; expanded: boolean; folded?: string[] }
/** Where a drag would land: an edge, a place among a toolbar's tools, a toolbar to merge into, or free over the content. */
export type Drop = { edge: Edge } | { bar: string; index: number } | { float: { x: number; y: number } }

/** A collapsed toolbar: a strip as wide as one icon button and its margin. */
export const STRIP = 36
/** A pinned toolbar expanded, at first: wide on a side, tall on the top or bottom. */
export const EXPANDED = { side: 280, edge: 220 }
/** A floating toolbar's size, at first. */
export const FLOATING = { width: 280, height: 360 }
/** A floating toolbar sized narrower than this collapses to its strip; wider, it expands. */
export const UNFOLD = 160
/** How near an edge of the content a drop pins to it. */
export const BAND = 28
export const edges: { id: Edge; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
]

const fresh = () => `bar-${Math.random().toString(36).slice(2, 8)}`
const filled = (bars: Bar[]) => bars.filter((b) => b.tools.length > 0)

/** The tools in their order: job tools first, meta tools at the end. */
export const ordered = <T extends { id: string; meta?: boolean }>(tools: T[]): T[] => [...tools.filter((t) => !t.meta), ...tools.filter((t) => t.meta)]

/**
 * The kept toolbars, made whole against the util's tools: unknown tools dropped, missing ones added to the first, one
 * toolbar per edge. With none kept, one toolbar pinned right holds every tool.
 */
export function settle(kept: Bar[] | undefined, tools: { id: string; meta?: boolean }[]): Bar[] {
  const ids = ordered(tools).map((t) => t.id)
  const seen = new Set<string>()
  const bars: Bar[] = []

  for (const b of kept ?? []) {
    const own = b.tools.filter((t) => ids.includes(t) && !seen.has(t))
    const there = b.edge && bars.find((x) => x.edge === b.edge)

    own.forEach((t) => seen.add(t))
    if (!own.length) continue
    if (there) there.tools.push(...own)
    else
      bars.push({
        id: b.id,
        tools: own,
        expanded: b.expanded !== false,
        folded: (b.folded ?? []).filter((t) => own.includes(t)),
        ...(b.edge ? { edge: b.edge } : { float: { x: 12, y: 12, ...FLOATING, ...b.float } }),
      })
  }

  const missing = ids.filter((t) => !seen.has(t))

  if (!missing.length) return bars
  if (!bars.length) return [{ id: "main", tools: missing, edge: "right", expanded: true }]

  return bars.map((b, i) => (i === 0 ? { ...b, tools: [...b.tools, ...missing] } : b))
}

/** One tool moved: among a toolbar's tools, to an edge (joining the toolbar there), or floating as a toolbar of its own. */
export function moveTool(bars: Bar[], tool: string, drop: Drop): Bar[] {
  const from = bars.find((b) => b.tools.includes(tool))

  if (!from) return bars

  const at = from.tools.indexOf(tool)
  const without = bars.map((b) => (b === from ? { ...b, tools: b.tools.filter((t) => t !== tool), folded: b.folded?.filter((t) => t !== tool) } : b))

  if ("bar" in drop)
    return filled(
      without.map((b) => {
        if (b.id !== drop.bar) return b

        const i = Math.min(b.id === from.id && drop.index > at ? drop.index - 1 : drop.index, b.tools.length)

        return { ...b, tools: [...b.tools.slice(0, i), tool, ...b.tools.slice(i)] }
      })
    )
  if ("edge" in drop) {
    const there = without.find((b) => b.edge === drop.edge)

    return filled(
      there
        ? without.map((b) => (b === there ? { ...b, tools: [...b.tools, tool] } : b))
        : [...without, { id: fresh(), tools: [tool], edge: drop.edge, expanded: true }]
    )
  }

  return filled([...without, { id: fresh(), tools: [tool], float: { ...drop.float, ...FLOATING }, expanded: true }])
}

/** A whole toolbar moved: pinned to an edge (joining the toolbar there), merged into another, or floating. */
export function moveBar(bars: Bar[], id: string, drop: Drop): Bar[] {
  const self = bars.find((b) => b.id === id)

  if (!self) return bars
  if ("bar" in drop) {
    if (drop.bar === id) return bars

    return bars.filter((b) => b.id !== id).map((b) => (b.id === drop.bar ? { ...b, tools: [...b.tools, ...self.tools] } : b))
  }
  if ("edge" in drop) {
    const there = bars.find((b) => b.edge === drop.edge && b.id !== id)

    if (there) return moveBar(bars, id, { bar: there.id, index: there.tools.length })

    return bars.map((b) => (b.id === id ? { id: b.id, tools: b.tools, expanded: b.expanded, folded: b.folded, edge: drop.edge } : b))
  }

  return bars.map((b) =>
    b.id === id ? { id: b.id, tools: b.tools, expanded: b.expanded, folded: b.folded, float: { ...FLOATING, ...b.float, ...drop.float } } : b
  )
}

/** How a toolbar is named: by its edge, or as one of the floating ones. */
export function names(bars: Bar[]) {
  const floating = bars.filter((b) => !b.edge)

  return (bar: Bar) =>
    bar.edge ? `${edges.find((e) => e.id === bar.edge)!.label} toolbar` : `Floating toolbar${floating.length > 1 ? ` ${floating.indexOf(bar) + 1}` : ""}`
}
