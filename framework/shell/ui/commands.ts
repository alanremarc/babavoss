// What a tab offers the person, worked out without a page, from its surface's views alone: the actions a view offers,
// ordered by the view's `menu` fact; the places a view names under `at` and what each is called; the tree
// below a tab as its menu's search reads it; the tab's menu, and the dots on the way to what waits on the person; what an
// input form's fields make of the inputs.
import type { MenuItem } from "../../kit/layouts/menu.tsx"
import { handles, type Args, type Handle, type Json, type Schema, type View } from "../../core/surface/view.ts"

/** An action offered at a path: the handle. */
export type Offered = { path: string; handle: Handle }
/** A place a view names: its path within the tab, and what it is called, by its row's `title` or `name`, else its path's last part. */
export type Place = { at: string; label: string }

const key = (h: Handle) => `${h.name} ${JSON.stringify(h.args)}`

/** The actions offered at `path` in its view, once each, in the view's order. */
export function offered(path: string, view: View | undefined): Offered[] {
  const seen = new Set<string>()

  return handles(view).flatMap((handle) => {
    if (seen.has(key(handle))) return []
    seen.add(key(handle))

    return [{ path, handle }]
  })
}

/** An action's name as a person reads it: `end_move` is "End move". */
export const named = (name: string): string => {
  const words = name.replace(/[_-]+/g, " ").trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A description as an entry's label reads it: as written, its first letter a capital. */
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Offered actions as entries of a menu: each by its name, or by its description where several share
 * one, the same handle bound to different subjects; with "…" where it asks for input first.
 */
export function actionItems(actions: Offered[], run: (action: Offered) => void): { id: string; name: string; label: string; hint: string; run: () => void }[] {
  const count = new Map<string, number>()

  for (const a of actions) count.set(a.handle.name, (count.get(a.handle.name) ?? 0) + 1)

  return actions.map((a) => ({
    id: `${a.path} ${key(a.handle)}`,
    name: a.handle.name,
    label: ((count.get(a.handle.name) ?? 0) > 1 ? capital(a.handle.description) : named(a.handle.name)) + (Object.keys(a.handle.open).length ? "…" : ""),
    hint: a.handle.description,
    run: () => run(a),
  }))
}

/** A view's `menu` fact, how its actions are grouped and ordered: groups, each a label and the names of its actions. */
export type MenuFact = { label: string; actions: string[] }[]

const menuFact = (value: Json | undefined): MenuFact =>
  Array.isArray(value)
    ? value.flatMap((g) =>
        g && typeof g === "object" && !Array.isArray(g) && typeof g.label === "string" && Array.isArray(g.actions)
          ? [{ label: g.label, actions: g.actions.filter((a): a is string => typeof a === "string") }]
          : []
      )
    : []

/**
 * The actions offered at a place as a menu's entries: the groups the view's `menu` fact names, each under its label in its
 * order; then the rest, in the view's order. A line between each.
 */
export function grouped(actions: Offered[], menu: Json | undefined, run: (action: Offered) => void): MenuItem[] {
  const items = actionItems(actions, run)
  const groups = menuFact(menu)
  const grouped = new Set(groups.flatMap((g) => g.actions))
  const entry = (i: (typeof items)[number]): MenuItem => ({ kind: "action", id: i.id, label: i.label, hint: i.hint, run: i.run })
  const sections: { label?: string; list: typeof items }[] = [
    ...groups.map((g) => ({ label: g.label, list: g.actions.flatMap((name) => items.filter((i) => i.name === name)) })),
    { list: items.filter((i) => !grouped.has(i.name)) },
  ].filter((s) => s.list.length)

  return sections.flatMap((s, n): MenuItem[] => [
    ...(n ? [{ kind: "separator" as const, id: `edge-${n}` }] : []),
    ...(s.label ? [{ kind: "label" as const, id: `group-${n}`, label: s.label }] : []),
    ...s.list.map(entry),
  ])
}

const last = (path: string) => decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "/")
const called = (row: { [key: string]: Json | undefined }): string | undefined =>
  typeof row.title === "string" && row.title ? row.title : typeof row.name === "string" && row.name ? row.name : undefined

/** Every place a view names under `at`, once each and in order, but the view's own: a path with more behind it. */
export function placesOf(view: Json | undefined, self?: string): Place[] {
  const out = new Map<string, Place>()
  const walk = (value: Json | undefined) => {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) return value.forEach(walk)
    if (value.kind === "handle") return
    if (typeof value.at === "string" && value.at.startsWith("/") && value.at !== self && !out.has(value.at)) {
      out.set(value.at, { at: value.at, label: called(value) ?? last(value.at) })
    }
    for (const v of Object.values(value)) walk(v)
  }

  walk(view)

  return [...out.values()]
}

/** What a place is called: its view's `title` or `name`, else its row's in a view that lists it, else its path's last part. */
export function labelOf(path: string, view: View | undefined, listed: Place[] = []): string {
  return (view && called(view)) ?? listed.find((p) => p.at === path)?.label ?? last(path)
}

/** The path above one within a tab, `/` at the top; none above `/`. */
export const parentOf = (path: string): string | undefined => (path === "/" ? undefined : path.replace(/\/[^/]*$/, "") || "/")

/**
 * The place above `route` the tab's menu reads, for its way back up: only one a view `known` names, so a parent path with
 * no view, which the door answers with not found, is never asked for; none at `/` or just below it.
 */
export function aboveOf(route: string, known: readonly (View | undefined)[]): string | undefined {
  const up = parentOf(route)

  return up !== undefined && up !== "/" && known.some((view) => placesOf(view).some((p) => p.at === up)) ? up : undefined
}

/** What an input form's fields hold, as the action's arguments: each open input of its type, or undefined while one is not. */
export function argsOf(open: Schema, fields: Record<string, string | boolean | undefined>): Args | undefined {
  const args: Args = {}

  for (const [name, type] of Object.entries(open)) {
    const value = fields[name]

    if (type === "boolean") args[name] = value === true
    else if (type === "number") {
      if (typeof value !== "string" || !value.trim() || !Number.isFinite(Number(value))) return undefined
      args[name] = Number(value)
    } else {
      if (typeof value !== "string") return undefined
      args[name] = value
    }
  }

  return args
}

/** What the tab menu's search finds: an action offered at a place, or a place, with what it is called and the place it is in. */
export type Found = { kind: "action"; action: Offered; label: string; where: string } | { kind: "place"; at: string; label: string }

/** How far the search reads below a tab: views read in all, and places deep from `/`. */
export const HELP = { views: 60, depth: 4 }

/**
 * The tree below a tab as its menu's search reads it: breadth-first from `/` along the places each view names, reading at most
 * `caps.views` views and none deeper than `caps.depth`. A place beyond the caps is still found, by its row; its actions are not.
 */
export async function indexOf(read: (path: string) => Promise<View | undefined>, caps = HELP): Promise<Found[]> {
  const found: Found[] = []
  const known = new Map<string, string>([["/", "/"]])
  let level = ["/"]
  let left = caps.views

  for (let depth = 0; level.length && left > 0 && depth <= caps.depth; depth++) {
    const batch = level.slice(0, left)
    const views = await Promise.all(batch.map((path) => read(path).catch(() => undefined)))

    left -= batch.length
    level = []
    batch.forEach((path, i) => {
      const view = views[i]

      if (!view) return

      const where = labelOf(path, view, [...known].map(([at, label]) => ({ at, label })))

      const actions = offered(path, view)
      const labels = new Map(actionItems(actions, () => {}).map((item) => [item.id, item.label]))

      for (const action of actions) found.push({ kind: "action", action, label: labels.get(`${path} ${key(action.handle)}`)!, where })
      for (const place of placesOf(view, path)) {
        if (known.has(place.at)) continue
        known.set(place.at, place.label)
        found.push({ kind: "place", ...place })
        level.push(place.at)
      }
    })
  }

  return found
}

/** The menu a place is found under: Go, where the tab's menu lists the places. */
export const GO = "Go"

/**
 * How well one word of a query is met by a found entry, lower the better, or nothing where it is not: by its label
 * whole, at a word's start or within; then by its way in the menu, Go for a place and where an action is offered; then
 * by what else says it, a place's path or an action's description.
 */
function met(f: Found, word: string): number | undefined {
  const starts = (text: string) => text.split(/[^a-z0-9]+/).some((w) => w.startsWith(word))
  const label = f.label.toLowerCase()
  const way = (f.kind === "place" ? GO : f.where).toLowerCase()
  const rest = (f.kind === "place" ? f.at : f.action.handle.description).toLowerCase()

  if (label === word) return 0
  if (starts(label)) return 1
  if (label.includes(word)) return 2
  if (starts(way)) return 3
  if (way.includes(word)) return 4

  return rest.includes(word) ? 5 : undefined
}

/**
 * What the search finds for a query: the places and actions that meet every word of it, by their label, their way in
 * the menu or what else says them, the best met first; among equals the order they were read in, nearest `/` first. At
 * most `cap`.
 */
export function search(found: Found[], query: string, cap = 30): Found[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  if (!words.length) return []

  return found
    .flatMap((f, order) => {
      const scores = words.map((w) => met(f, w))

      return scores.some((score) => score === undefined) ? [] : [{ f, order, score: scores.reduce<number>((sum, score) => sum + score!, 0) }]
    })
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, cap)
    .map(({ f }) => f)
}

/** Whether `path` is `place` or below it, within one tab. */
export const under = (path: string, place: string): boolean => place === "/" || path === place || path.startsWith(`${place}/`)

/**
 * Where the tab's menu puts a dot on the way to what waits on the person elsewhere in the tab: `targets` are the paths
 * of unseen notices, `route` where the tab is, `go` the entries of Go, the way back up first. A place Go lists
 * is dotted where a target is at it or below; a way back up, where a target is below it and not below the route. What
 * stands at the route or at `/` is where the menu already is, and needs no way; a notice about no place is `/`.
 */
export function dotted(targets: readonly string[], route: string, go: readonly { at: string; up?: boolean }[]): Set<string> {
  const away = targets.filter((t) => t !== route && t !== "/")

  return new Set(go.filter((g) => away.some((t) => (g.up ? under(t, g.at) && !under(t, route) : under(t, g.at)))).map((g) => g.at))
}

/** The unseen notices a tab is about, as paths within it: its own address, a notice about no place, as `/`. */
export function noticesIn(address: string, notices: readonly { at: string | null }[]): string[] {
  return notices.flatMap((n) => (n.at && (n.at === address || n.at.startsWith(`${address}/`)) ? [n.at.slice(address.length) || "/"] : []))
}

/** A tab's menu as its parts make it: what the shell's own controls for every tab are, after a line. */
export type TabMenuParts = {
  /** The surface's title, and the actions at `/` and its `menu` fact. */
  surface: { label: string; actions: Offered[]; menu?: Json }
  /** Where the tab is below `/`: the place's name, its actions and its `menu` fact. */
  place?: { label: string; actions: Offered[]; menu?: Json }
  /** Go's entries, the way back up first, each dotted where `dots` holds its path. */
  go: { at: string; label: string; up?: boolean }[]
  dots: ReadonlySet<string>
  start: (action: Offered) => void
  navigate: (at: string) => void
  controls: MenuItem[]
}

/** More places than Go shows without a field to filter them. */
export const MANY = 8

/**
 * The tab's menu, top to bottom: the surface's actions at `/`, with no title, the tab having it; where the tab is below `/`, the place's
 * actions under its name; Go, the places and the way back up, a submenu with a field where there are more than MANY;
 * then the shell's own controls. Go and the places in it carry a dot on the way to what waits elsewhere.
 */
export function tabMenu({ surface, place, go, dots, start, navigate, controls }: TabMenuParts): MenuItem[] {
  // The surface's own actions stand without a heading: the tab the menu hangs from names it already.
  const section = (id: string, s: { label: string; actions: Offered[]; menu?: Json }, titled = true): MenuItem[] => {
    const items = grouped(s.actions, s.menu, start)

    if (!items.length || !titled) return items

    return [{ kind: "label", id: `${id}-title`, label: s.label, strong: true }, ...items]
  }
  const ups = go.filter((g) => g.up)
  const places = go.filter((g) => !g.up)
  const entry = (g: TabMenuParts["go"][number]): MenuItem => ({
    kind: "action",
    id: `go ${g.at}`,
    label: g.label,
    hint: g.at,
    run: () => navigate(g.at),
    ...(dots.has(g.at) && { mark: true }),
  })
  const goItems: MenuItem[] = [...ups.map(entry), ...(ups.length && places.length ? [{ kind: "separator" as const, id: "places-edge" }] : []), ...places.map(entry)]
  const parts: MenuItem[][] = [
    section("surface", surface, false),
    place ? section("place", place) : [],
    goItems.length
      ? [{ kind: "submenu" as const, id: "go", label: "Go", items: goItems, ...(places.length > MANY && { search: "Filter places" }), ...(go.some((g) => dots.has(g.at)) && { mark: true }) }]
      : [],
    controls,
  ].filter((p) => p.length)

  return parts.flatMap((p, n): MenuItem[] => [...(n ? [{ kind: "separator" as const, id: `part-${n}` }] : []), ...p])
}

/** What the search finds as entries of the tab's menu: a place goes there, an action starts. */
export function foundItems(found: Found[], navigate: (at: string) => void, start: (action: Offered) => void): MenuItem[] {
  return found.map((f) =>
    f.kind === "place"
      ? { kind: "action", id: `place ${f.at}`, label: f.label, note: GO, hint: f.at, run: () => navigate(f.at) }
      : {
          kind: "action",
          id: `action ${f.action.path} ${key(f.action.handle)}`,
          label: f.label,
          note: f.where,
          hint: f.action.handle.description,
          run: () => start(f.action),
        }
  )
}

/**
 * The shell's own controls, the same in every tab's menu: close the tab, where it can be; close the others, where there
 * are any; copy its link; read its views again.
 */
export function controlsOf({ close, others, link, reload }: { close?: { hint: string; run: () => void }; others?: () => void; link: string; reload: () => void }): MenuItem[] {
  return [
    { kind: "action", id: "close", label: "Close tab", note: "its state is dropped", hint: close?.hint, disabled: !close, run: () => close?.run() },
    { kind: "action", id: "close-others", label: "Close other tabs", disabled: !others, run: () => others?.() },
    { kind: "action", id: "copy", label: "Copy link", hint: link, run: () => void navigator.clipboard?.writeText(link) },
    { kind: "action", id: "reload", label: "Reload", hint: "Read the tab's views again", run: reload },
  ]
}
