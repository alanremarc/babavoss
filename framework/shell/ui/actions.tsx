// What the shell makes of a tab's actions, from its surface's views alone, the same for every surface; the page returns
// its content alone and draws none of it. The tab's menu, which its drawer holds at its head: a search of the actions and
// places of the whole tree below the tab; the surface's actions at /; where the tab is below /, the place's, under its
// name; Go, the places and the way back up; then the shell's own controls. A highlight the person had not opened is dotted
// on every step of the way to it. Around the tab's content: the line that says why an action was refused, and the modal an
// action with inputs opens, the page's drawer for it or a form of its inputs.
import { Suspense, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react"
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
import { ChangesContext, doorOf, useCached, useLive, useTab, type Door } from "./tab.tsx"

/** The view at a path under the tab, kept current, from the tab's cache: none where nothing is there, or with no path. */
function useView(door: Door, path: string | undefined): View | undefined {
  const entry = useCached<View>(door.cache, path)

  return entry?.error === undefined ? entry?.view : undefined
}

/** The tree below the tab as the search reads it: read as the menu opens, again only after something changed. */
function useIndex(read: Door["read"]): Found[] | undefined {
  const { subscribe } = useContext(ChangesContext)
  const [found, setFound] = useState<Found[]>()
  const [stale, setStale] = useState(0)

  useEffect(() => subscribe(() => setStale((n) => n + 1)), [subscribe])
  useEffect(() => {
    let gone = false

    void indexOf((path) => read(path)).then((f) => !gone && setFound(f), () => undefined)

    return () => void (gone = true)
  }, [read, stale])

  return found
}

/** What a tab offers, read from its views: the tab's menu, and what its search finds. */
type Model = { items: MenuItem[]; found?: Found[]; ready: boolean }

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
  /** The places of the highlights the person had not opened in the tab, which dot the way to them, and its controls. */
  menu: { highlights: string[]; controls: MenuItem[] }
}): Model {
  // The surface's root, where the tab is, and the place above it: a route that is no path of the surface offers nothing.
  // The place above is read only where a view known names it, so a parent path with no view is never asked for.
  const up = parentOf(route)
  const root = useView(door, "/")
  const here = useView(door, route === "/" ? undefined : route)
  const above = useView(door, aboveOf(route, [root, here]))
  const found = useIndex(door.read)
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
  const items = tabMenu({
    surface: { label: shown, actions: atRoot, menu: root?.menu },
    ...(route !== "/" && here && { place: { label: placeLabel, actions: atHere, menu: here.menu } }),
    go,
    dots: dotted(menu.highlights, route, go),
    start,
    navigate,
    controls: menu.controls,
  })

  return { items, found, ready: !!root }
}

/** A tab's menu as its drawer holds it: its entries, and what its search finds. */
export type TabMenuModel = { items: MenuItem[]; find: (query: string) => MenuItem[]; ready: boolean }

/** The tab's menu, read from its views through `door` where given, else the tab's at its address, while `on`. */
export function useTabMenu({
  door: given,
  address,
  route,
  title,
  name,
  start,
  navigate,
  highlights,
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
  highlights: string[]
  controls: MenuItem[]
}): TabMenuModel {
  const changes = useContext(ChangesContext)
  const door = useMemo(() => given ?? doorOf(address, changes), [given, address, changes])
  const model = useModel({ door, route, title, name, start, navigate, menu: { highlights, controls } })
  return {
    items: model.ready ? model.items : controls,
    find: (query) => foundItems(search(model.found ?? [], query), navigate, start),
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
 * `asking` for its inputs.
 */
export function Actions({
  drawers = {},
  asking,
  answered,
  refused,
  dismiss,
  children,
}: {
  drawers?: Drawers
  asking?: Offered
  answered: () => void
  refused?: string
  dismiss: () => void
  children: ReactNode
}) {
  const tab = useTab()
  const call = async (action: Offered, inputs: Args = {}) => {
    const answer = await tab.call(action.path, action.handle.name, { ...action.handle.args, ...inputs })

    return answer.outcome === "refused" ? answer.reason : undefined
  }

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
