// What the shell makes of a tab's actions, from its surface's views alone, the same for every surface; the page returns
// its content alone and draws none of it. The tab's menu, behind the dots that stand in its icon's place in the strip:
// a search of the actions and places of the whole tree below the tab; the surface's actions at /, under its title; where
// the tab is below /, the place's, under its name; Go, the places and the way back up; then the shell's own controls.
// What waits on the person is dotted, and so is every step of the way to it. Around the tab's content: the line that says
// why an action was refused, and the modal an action with inputs opens, the page's drawer for it or a form of its inputs.
// While the tab is shown, its entries are commands of the palette, and its asks dot it in the strip.
import { Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import { DropdownKit, SearchMenu, type Menu, type MenuItem } from "../../kit/layouts/menu.tsx"
import type { Args, View } from "../../core/surface/view.ts"
import {
  commandsOf,
  dotted,
  foundItems,
  grouped,
  indexOf,
  labelOf,
  named,
  offered,
  parentOf,
  placesOf,
  search,
  tabMenu,
  type Command,
  type Found,
  type Offered,
} from "./commands.ts"
import { Inputs, type Drawers } from "./inputs.tsx"
import { ChangesContext, doorOf, useCached, useTab, useTabCache, type Door } from "./tab.tsx"

/**
 * Each tab's commands, by its address, for the palette, while the tab is shown; and how many asks it offers where it was
 * last seen, which dot it in the strip until it closes.
 */
export type TabCommands = {
  get: (at: string) => Command[] | undefined
  set: (at: string, commands: Command[] | undefined) => void
  asks: (at: string) => number
  ask: (at: string, count: number) => void
  subscribe: (fn: () => void) => () => void
  /** Told as a tab's count of asks changes, alone: the strip follows it. */
  subscribeAsks: (fn: () => void) => () => void
}

export function useTabCommands(): TabCommands {
  const [store] = useState<TabCommands>(() => {
    const all = new Map<string, Command[]>()
    const asked = new Map<string, number>()
    const listeners = new Set<() => void>()
    const askers = new Set<() => void>()
    const tell = (to: Set<() => void>) => {
      for (const fn of to) fn()
    }
    const on = (to: Set<() => void>) => (fn: () => void) => {
      to.add(fn)

      return () => void to.delete(fn)
    }

    return {
      get: (at) => all.get(at),
      set: (at, commands) => {
        if (commands) all.set(at, commands)
        else all.delete(at)
        tell(listeners)
      },
      asks: (at) => asked.get(at) ?? 0,
      ask: (at, count) => {
        if ((asked.get(at) ?? 0) === count) return
        asked.set(at, count)
        tell(askers)
      },
      subscribe: on(listeners),
      subscribeAsks: on(askers),
    }
  })

  return store
}

/** The view at a path under the tab, kept current, from the tab's cache: none where nothing is there, or with no path. */
function useView(door: Door, path: string | undefined): View | undefined {
  const entry = useCached<View>(door.cache, path)

  return entry?.error === undefined ? entry?.view : undefined
}

/** The tree below the tab as the search reads it: read as the menu opens, again only after something changed. */
function useIndex(read: Door["read"], on: boolean): Found[] | undefined {
  const { subscribe } = useContext(ChangesContext)
  const [found, setFound] = useState<Found[]>()
  const [stale, setStale] = useState(0)

  useEffect(() => (on ? subscribe(() => setStale((n) => n + 1)) : undefined), [subscribe, on])
  useEffect(() => {
    if (!on) return

    let gone = false

    void indexOf((path) => read(path)).then((f) => !gone && setFound(f), () => undefined)

    return () => void (gone = true)
  }, [read, on, stale])

  return found
}

/** What a tab offers, read from its views: the menus its commands are made of, and the tab's menu where `menu` is asked for. */
type Model = { commands: Command[]; asks: number; items: MenuItem[]; found?: Found[]; ready: boolean }

function useModel({
  door,
  route,
  title,
  name,
  start,
  navigate,
  menu,
}: {
  door: Door
  route: string
  title?: string
  name: string
  start: (action: Offered) => void
  navigate: (route: string) => void
  /** Where the tab's menu is made: the unseen notices it is about, its controls; and the tree is read for its dots and search. */
  menu?: { notices: string[]; controls: MenuItem[] }
}): Model {
  // The surface's root, where the tab is, and the place above it: a route that is no path of the surface offers nothing.
  const up = parentOf(route)
  const root = useView(door, "/")
  const here = useView(door, route === "/" ? undefined : route)
  const above = useView(door, up === undefined || up === "/" ? undefined : up)
  const found = useIndex(door.read, !!menu)
  const shown = title ?? named(name)
  const atRoot = offered("/", root)
  const atHere = route === "/" ? [] : offered(route, here)
  const listed = [...placesOf(root), ...placesOf(above)]
  const placeLabel = labelOf(route, here, listed)
  const places = placesOf(route === "/" ? root : (here ?? root), route)
  const ups = [
    ...(up !== undefined && up !== "/" && above ? [{ at: up, label: labelOf(up, above, placesOf(root)), up: true }] : []),
    ...(route !== "/" ? [{ at: "/", label: shown, up: true }] : []),
  ]
  const go: { at: string; label: string; up?: boolean }[] = [...ups, ...places]
  // The palette's menus, as the tab's commands: the surface's, the place's, and Go.
  const go_: MenuItem[] = go.map((g) => ({ kind: "action", id: `${g.up ? "up" : "go"} ${g.at}`, label: g.label, hint: g.at, run: () => navigate(g.at) }))
  const menus: Menu[] = [
    { id: "surface", label: shown, items: grouped(atRoot, root?.menu, start) },
    ...(route !== "/" && here ? [{ id: "place", label: placeLabel, items: grouped(atHere, here.menu, start) }] : []),
    { id: "go", label: "Go", items: go_ },
  ]
  const targets = menu ? [...(found ?? []).flatMap((f) => (f.kind === "action" && f.action.ask ? [f.action.path] : [])), ...menu.notices] : []
  const items = menu
    ? tabMenu({
        surface: { label: shown, actions: atRoot, menu: root?.menu },
        ...(route !== "/" && here && { place: { label: placeLabel, actions: atHere, menu: here.menu } }),
        go,
        dots: dotted(targets, route, go),
        start,
        navigate,
        controls: menu.controls,
      })
    : []

  return { commands: commandsOf(menus.filter((m) => m.items.length)), asks: [...atRoot, ...atHere].filter((a) => a.ask).length, items, found, ready: !!root }
}

/** The tab's menu, as the dropdown in the strip shows it while it is open: its views are read as it opens. */
export function TabMenu({
  address,
  route,
  title,
  name,
  start,
  navigate,
  notices,
  controls,
  close,
}: {
  address: string
  route: string
  title?: string
  name: string
  start: (action: Offered) => void
  navigate: (route: string) => void
  notices: string[]
  controls: MenuItem[]
  close: () => void
}) {
  const changes = useContext(ChangesContext)
  const door = useMemo(() => doorOf(address, changes), [address, changes])
  const model = useModel({ door, route, title, name, start, navigate, menu: { notices, controls } })
  const find = (query: string) => foundItems(search(model.found ?? [], query), navigate, start)

  return (
    <SearchMenu
      placeholder="Search actions and places"
      items={model.ready ? model.items : controls}
      find={find}
      kit={DropdownKit}
      close={close}
      {...(!model.ready && { empty: "Reading…" })}
    />
  )
}

/**
 * Around a tab's content: the refusal of the last action started from its menu or the palette, and the modal of the one
 * `asking` for its inputs. `start` is the shell's, which starts an action of this tab wherever it was chosen.
 */
export function Actions({
  commands,
  title,
  name,
  drawers = {},
  start,
  asking,
  answered,
  refused,
  dismiss,
  children,
}: {
  commands: TabCommands
  title?: string
  name: string
  drawers?: Drawers
  start: (action: Offered) => void
  asking?: Offered
  answered: () => void
  refused?: string
  dismiss: () => void
  children: ReactNode
}) {
  const tab = useTab()
  const cache = useTabCache()
  const model = useModel({ door: { ...tab, cache }, route: tab.route, title, name, start, navigate: tab.navigate })
  const call = async (action: Offered, inputs: Args = {}) => {
    const answer = await tab.call(action.path, action.handle.name, { ...action.handle.args, ...inputs })

    return answer.outcome === "refused" ? answer.reason : undefined
  }
  const latest = useRef(model)

  latest.current = model
  // The palette's commands are this tab's while it is shown; a hidden tab's effects are gone, and so are its commands.
  useLayoutEffect(() => commands.set(tab.address, latest.current.commands))
  useLayoutEffect(() => () => commands.set(tab.address, undefined), [commands, tab.address])
  useLayoutEffect(() => commands.ask(tab.address, model.asks), [commands, tab.address, model.asks])

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col text-body">
        {refused && (
          <p role="alert" className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 py-0.5 pr-1 pl-2.5 text-meta text-destructive">
            <span className="min-w-0 flex-1 truncate" title={refused}>
              {refused}
            </span>
            <button type="button" aria-label="Dismiss" className="grid size-icon cursor-pointer place-items-center rounded-sm hover:bg-foreground/8" onClick={dismiss}>
              <XIcon className="size-glyph" aria-hidden />
            </button>
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {asking && (
        // The modal waits on its view alone: the tab's content stays as it is.
        <Suspense fallback={null}>
          <Inputs
          key={`${asking.path} ${asking.handle.name} ${JSON.stringify(asking.handle.args)}`}
          action={asking}
          drawer={drawers[asking.handle.name]}
          call={call}
          close={answered}
          />
        </Suspense>
      )}
    </>
  )
}
