// What the shell makes of a tab's actions, from its surface's views alone, the same for every surface; the page returns
// its content alone and draws none of it. The tab's menu, which its drawer holds at its head: a search of the actions and
// places of the whole tree below the tab; the surface's actions at /; where the tab is below /, the place's, under its
// name; Go, the places and the way back up; then the shell's own controls. What waits on the person is dotted, and so is
// every step of the way to it; the first ask is what the drawer's foot points to. Around the tab's content: the line that
// says why an action was refused, and the modal an action with inputs opens, the page's drawer for it or a form of its
// inputs. While the tab is shown, its asks mark it on the rail.
import { Suspense, useContext, useEffect, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import type { MenuItem } from "../../kit/layouts/menu.tsx"
import type { Args, View } from "../../core/surface/view.ts"
import {
  aboveOf,
  dotted,
  foundItems,
  indexOf,
  labelOf,
  named,
  offered,
  parentOf,
  placesOf,
  search,
  tabMenu,
  type Found,
  type Offered,
} from "./commands.ts"
import { Inputs, type Drawers } from "./inputs.tsx"
import { ChangesContext, doorOf, useCached, useLive, useTab, useTabCache, type Door } from "./tab.tsx"

/** How many asks each tab offers where it was last seen, by its address, which mark it on the rail until it closes. */
export type TabAsks = { count: (at: string) => number; set: (at: string, count: number) => void; subscribe: (fn: () => void) => () => void }

export function useTabAsks(): TabAsks {
  const [store] = useState<TabAsks>(() => {
    const asked = new Map<string, number>()
    const listeners = new Set<() => void>()

    return {
      count: (at) => asked.get(at) ?? 0,
      set: (at, count) => {
        if ((asked.get(at) ?? 0) === count) return
        asked.set(at, count)
        for (const fn of listeners) fn()
      },
      subscribe: (fn) => {
        listeners.add(fn)

        return () => void listeners.delete(fn)
      },
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

/** What a tab offers, read from its views: how many asks, and the tab's menu where `menu` is asked for. */
type Model = { asks: number; items: MenuItem[]; found?: Found[]; ready: boolean }

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
  // The place above is read only where a view known names it, so a parent path with no view is never asked for.
  const up = parentOf(route)
  const root = useView(door, "/")
  const here = useView(door, route === "/" ? undefined : route)
  const above = useView(door, aboveOf(route, [root, here]))
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

  return { asks: [...atRoot, ...atHere].filter((a) => a.ask).length, items, found, ready: !!root }
}

/** A tab's menu as its drawer holds it: its entries, what its search finds, and the first ask it offers, by its label and place. */
export type TabMenuModel = { items: MenuItem[]; find: (query: string) => MenuItem[]; ask?: { label: string; at: string }; ready: boolean }

/** The tab's menu, read from its views through `door` where given, else the tab's at its address, while `on`. */
export function useTabMenu({
  door: given,
  address,
  route,
  title,
  name,
  start,
  navigate,
  notices,
  controls,
}: {
  /** Where its views are read from: the tab's, at its address, unless another is given, as a sample's. */
  door?: Door
  address: string
  route: string
  title?: string
  name: string
  start: (action: Offered) => void
  navigate: (route: string) => void
  notices: string[]
  controls: MenuItem[]
}): TabMenuModel {
  const changes = useContext(ChangesContext)
  const door = useMemo(() => given ?? doorOf(address, changes), [given, address, changes])
  const model = useModel({ door, route, title, name, start, navigate, menu: { notices, controls } })
  const ask = (model.found ?? []).find((f) => f.kind === "action" && f.action.ask)

  return {
    items: model.ready ? model.items : controls,
    find: (query) => foundItems(search(model.found ?? [], query), navigate, start),
    ...(ask?.kind === "action" && { ask: { label: ask.label, at: ask.action.path } }),
    ready: model.ready,
  }
}

/** The modal of an action with inputs, in its tab: the view where it is offered read live for the surface's drawer. */
function Asked(props: Omit<ComponentProps<typeof Inputs>, "view">) {
  const { view } = useLive(props.action.path)

  return <Inputs {...props} view={view} />
}

/** The line over a tab's content that says why the action last started from its menu was refused. */
export function RefusedLine({ reason, dismiss }: { reason: string; dismiss: () => void }) {
  return (
    <p role="alert" className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 py-0.5 pr-1 pl-2.5 text-meta text-destructive">
      <span className="min-w-0 flex-1 truncate" title={reason}>
        {reason}
      </span>
      <button type="button" aria-label="Dismiss" className="grid size-icon cursor-pointer place-items-center rounded-sm hover:bg-foreground/8" onClick={dismiss}>
        <XIcon className="size-glyph" aria-hidden />
      </button>
    </p>
  )
}

/**
 * Around a tab's content: the refusal of the last action started from its menu, and the modal of the one
 * `asking` for its inputs. `start` is the shell's, which starts an action of this tab wherever it was chosen.
 */
export function Actions({
  asks,
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
  asks: TabAsks
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

  useLayoutEffect(() => asks.set(tab.address, model.asks), [asks, tab.address, model.asks])

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col text-body">
        {refused && <RefusedLine reason={refused} dismiss={dismiss} />}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {asking && (
        // The modal waits on its view alone: the tab's content stays as it is.
        <Suspense fallback={null}>
          <Asked
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
