// What a tab offers the person, worked out without a page, from its surface's views alone: the actions a view offers and
// which are asks, ordered by the view's `menu` fact; the places a view names under `at` and what each is called; the tree
// below a tab as its menu's search reads it; the tab's menu, and the dots on the way to what waits on the person; what an
// input form's fields make of the inputs; and every menu entry as one command of the palette.
import type { Menu, MenuItem } from "../../kit/layouts/menu.tsx"
import { handles, type Args, type Handle, type Json, type Schema, type View } from "../../core/surface/view.ts"

/** An action offered at a path: the handle, and whether it is an ask, the person's alone. */
export type Offered = { path: string; handle: Handle; ask: boolean }
/** One command of the palette: from a menu, or an action the view offers. */
export type Command = { id: string; group: string; label: string; hint?: string; keys?: string; ask?: boolean; disabled?: boolean; run: () => void }
/** A place a view names: its path within the tab, and what it is called, by its row's `title` or `name`, else its path's last part. */
export type Place = { at: string; label: string }

const key = (h: Handle) => `${h.name} ${JSON.stringify(h.args)}`

/** The actions offered at `path` in the view the person reads, once each, in the view's order; an ask is the handle marked one. */
export function offered(path: string, view: View | undefined): Offered[] {
  const seen = new Set<string>()

  return handles(view).flatMap((handle) => {
    if (seen.has(key(handle))) return []
    seen.add(key(handle))

    return [{ path, handle, ask: handle.ask === true }]
  })
}

/** An action's name as a person reads it: `end_move` is "End move". */
export const named = (name: string): string => {
  const words = name.replace(/[_-]+/g, " ").trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Offered actions as entries of a menu or the palette: each by its name, or by its description where several share
 * one, the same handle bound to different subjects; with "…" where it asks for input first. Asks first.
 */
export function actionItems(actions: Offered[], run: (action: Offered) => void): { id: string; name: string; label: string; hint: string; ask: boolean; run: () => void }[] {
  const count = new Map<string, number>()

  for (const a of actions) count.set(a.handle.name, (count.get(a.handle.name) ?? 0) + 1)

  return [...actions.filter((a) => a.ask), ...actions.filter((a) => !a.ask)].map((a) => ({
    id: `${a.path} ${key(a.handle)}`,
    name: a.handle.name,
    label: ((count.get(a.handle.name) ?? 0) > 1 ? a.handle.description : named(a.handle.name)) + (Object.keys(a.handle.open).length ? "…" : ""),
    hint: a.handle.description,
    ask: a.ask,
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
 * The actions offered at a place as a menu's entries: the asks first, marked as the person's; then the groups the view's
 * `menu` fact names, each under its label in its order; then the rest, in the view's order. A line between each.
 */
export function grouped(actions: Offered[], menu: Json | undefined, run: (action: Offered) => void): MenuItem[] {
  const items = actionItems(actions, run)
  const groups = menuFact(menu)
  const grouped = new Set(groups.flatMap((g) => g.actions))
  const entry = (i: (typeof items)[number]): MenuItem => ({ kind: "action", id: i.id, label: i.label, hint: i.hint, run: i.run, ...(i.ask && { mark: true }) })
  const sections: { label?: string; list: typeof items }[] = [
    { list: items.filter((i) => i.ask) },
    ...groups.map((g) => ({ label: g.label, list: g.actions.flatMap((name) => items.filter((i) => !i.ask && i.name === name)) })),
    { list: items.filter((i) => !i.ask && !grouped.has(i.name)) },
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

/** Every entry of the menus as a command, grouped by its menu and named by the path to it: a check toggles, a choice's option sets it. */
export function commandsOf(menus: Menu[]): Command[] {
  const walk = (group: string, trail: string[], items: MenuItem[], off: boolean): Command[] =>
    items.flatMap((item): Command[] => {
      const label = (text: string) => [...trail, text].join(" › ")
      const disabled = off || ("disabled" in item && item.disabled === true)

      switch (item.kind) {
        case "action":
          return [{ id: `${group}/${item.id}`, group, label: label(item.label), hint: item.hint, keys: item.keys, disabled, run: item.run, ...(item.mark && { ask: true }) }]
        case "check": {
          const verb = item.checked ? "Uncheck" : "Check"

          return [{ id: `${group}/${item.id}`, group, label: label(`${verb} ${item.label}`), keys: item.keys, disabled, run: () => item.set(!item.checked) }]
        }
        case "choice":
          return item.options
            .filter((o) => o.id !== item.value)
            .map((o) => ({ id: `${group}/${item.id}/${o.id}`, group, label: label(`${item.label}: ${o.label}`), disabled, run: () => item.set(o.id) }))
        case "submenu":
          return walk(group, [...trail, item.label], item.items, disabled)
        case "separator":
        case "label":
          return []
      }
    })

  return menus.flatMap((menu) => walk(menu.label, [], menu.items, menu.disabled === true))
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

/** What the search finds for a query: places and actions whose words hold every word of it, the places first, at most `cap`. */
export function search(found: Found[], query: string, cap = 30): Found[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  if (!words.length) return []

  const hit = (f: Found) => {
    const text = (f.kind === "place" ? `${f.label} ${f.at}` : `${f.label} ${f.action.handle.description} ${f.where}`).toLowerCase()

    return words.every((w) => text.includes(w))
  }

  return [...found.filter((f) => f.kind === "place" && hit(f)), ...found.filter((f) => f.kind === "action" && hit(f))].slice(0, cap)
}

/** Whether `path` is `place` or below it, within one tab. */
export const under = (path: string, place: string): boolean => place === "/" || path === place || path.startsWith(`${place}/`)

/**
 * Where the tab's menu puts a dot on the way to what waits on the person elsewhere in the tab: `targets` are the paths
 * of asks and of unseen notices, `route` where the tab is, `go` the entries of Go, the way back up first. A place Go lists
 * is dotted where a target is at it or below; a way back up, where a target is below it and not below the route. What
 * stands at the route or at `/` is in the menu's sections, dotted there, and needs no way; a notice about no place is `/`.
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
 * then the shell's own controls. Asks stand first in their group, marked, and so does the label over them; Go and the
 * places in it carry a dot on the way to what waits elsewhere.
 */
export function tabMenu({ surface, place, go, dots, start, navigate, controls }: TabMenuParts): MenuItem[] {
  // The surface's own actions stand without a heading: the tab the menu hangs from names it already.
  const section = (id: string, s: { label: string; actions: Offered[]; menu?: Json }, titled = true): MenuItem[] => {
    const items = grouped(s.actions, s.menu, start)

    if (!items.length || !titled) return items

    return [{ kind: "label", id: `${id}-title`, label: s.label, strong: true, ...(s.actions.some((a) => a.ask) && { mark: true }) }, ...items]
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

/** What the search finds as entries of the tab's menu: a place goes there, an action starts, an ask marked. */
export function foundItems(found: Found[], navigate: (at: string) => void, start: (action: Offered) => void): MenuItem[] {
  return found.map((f) =>
    f.kind === "place"
      ? { kind: "action", id: `place ${f.at}`, label: f.label, hint: f.at, run: () => navigate(f.at) }
      : {
          kind: "action",
          id: `action ${f.action.path} ${key(f.action.handle)}`,
          label: f.label,
          note: f.where,
          hint: f.action.handle.description,
          run: () => start(f.action),
          ...(f.action.ask && { mark: true }),
        }
  )
}
