// The frame: the menu bar the shell draws at the top of every surface's tab, under the page's strip, always and the same for
// every surface, made from the surface's views alone; a surface cannot hide or replace it. A
// menu named after the surface, its actions at /; where the tab is below /, a menu for that place, its actions, the asks
// first and marked; Go, the places the view names and the way back up; Help, a search of the actions and places of the
// whole tree below the tab. What waits on the person stands at the right too. An action that needs input opens a modal,
// the page's drawer for it or a form of its inputs. The page returns its content alone and puts nothing here. Every menu
// entry is a command of the palette too, while the tab is the one looked at.
import { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import { CommandGroup, CommandItem, CommandShortcut } from "../../kit/components/command"
import { MenuTriggers, type Menu, type MenuItem } from "../../kit/layouts/menu.tsx"
import type { Args, View } from "../../core/surface/view.ts"
import { commandsOf, grouped, indexOf, labelOf, named, offered, parentOf, placesOf, search, type Command, type Found, type Offered } from "./commands.ts"
import { Inputs, type Drawers } from "./inputs.tsx"
import { ChangesContext, useTab } from "./tab.tsx"

/** Each frame's commands, by its tab's address, for the palette: a frame gives them while its tab is shown. */
export type Frames = {
  get: (at: string) => Command[] | undefined
  set: (at: string, commands: Command[] | undefined) => void
  subscribe: (fn: () => void) => () => void
}

export function useFrames(): Frames {
  const [frames] = useState<Frames>(() => {
    const all = new Map<string, Command[]>()
    const listeners = new Set<() => void>()

    return {
      get: (at) => all.get(at),
      set: (at, commands) => {
        if (commands) all.set(at, commands)
        else all.delete(at)
        for (const fn of listeners) fn()
      },
      subscribe: (fn) => {
        listeners.add(fn)

        return () => void listeners.delete(fn)
      },
    }
  })

  return frames
}

/** The view at a path under the tab, kept current; none where nothing is there, or with no path. */
function useView(path: string | undefined): View | undefined {
  const { live } = useTab()
  const [shown, setShown] = useState<{ path: string; view?: View }>()

  useEffect(() => {
    if (path === undefined) return setShown(undefined)

    return live(path, (view) => setShown({ path, view }), () => setShown({ path }))
  }, [live, path])

  return shown && shown.path === path ? shown.view : undefined
}

/** Help's index of the tree below the tab: read when Help opens, again only after something changed. */
function useIndex(): { found: Found[]; refresh: () => void } {
  const { read } = useTab()
  const { subscribe } = useContext(ChangesContext)
  const [found, setFound] = useState<Found[]>([])
  const stale = useRef(true)

  useEffect(() => subscribe(() => void (stale.current = true)), [subscribe])

  const refresh = () => {
    if (!stale.current) return
    stale.current = false
    void indexOf((path) => read(path)).then(setFound, () => void (stale.current = true))
  }

  return { found, refresh }
}

/** More places than a menu shows without a field to filter them. */
const MANY = 8

export function Frame({
  frames,
  title,
  name,
  drawers = {},
  aside,
  children,
}: {
  frames: Frames
  title?: string
  name: string
  drawers?: Drawers
  aside?: ReactNode
  children: ReactNode
}) {
  const tab = useTab()
  const { route, navigate } = tab
  const [asking, setAsking] = useState<Offered>()
  const [refused, setRefused] = useState("")
  const help = useIndex()
  // The surface's root, where the tab is, and the place above it: a route that is no path of the surface offers nothing.
  const up = parentOf(route)
  const root = useView("/")
  const here = useView(route === "/" ? undefined : route)
  const above = useView(up === undefined || up === "/" ? undefined : up)
  const shown = title ?? named(name)
  const call = async (action: Offered, inputs: Args = {}) => {
    const answer = await tab.call(action.path, action.handle.name, { ...action.handle.args, ...inputs })

    return answer.outcome === "refused" ? answer.reason : undefined
  }
  const start = (action: Offered) =>
    Object.keys(action.handle.open).length || drawers[action.handle.name] ? setAsking(action) : void call(action).then((reason) => setRefused(reason ?? ""))
  const atRoot = offered("/", root)
  const atHere = route === "/" ? [] : offered(route, here)
  const listed = [...placesOf(root), ...placesOf(above)]
  const go = (at: string) => () => navigate(at)
  // Go: the way back up, then every place the view where the tab is names, by its row's name.
  const places = placesOf(route === "/" ? root : (here ?? root), route)
  const back: MenuItem[] = [
    ...(up !== undefined && up !== "/" && above ? [{ kind: "action" as const, id: `up ${up}`, label: labelOf(up, above, placesOf(root)), hint: up, run: go(up) }] : []),
    ...(route !== "/" ? [{ kind: "action" as const, id: "up /", label: shown, hint: "/", run: go("/") }] : []),
  ]
  const goItems: MenuItem[] = [
    ...back,
    ...(back.length && places.length ? [{ kind: "separator" as const, id: "places-edge" }] : []),
    ...places.map((p): MenuItem => ({ kind: "action", id: `go ${p.at}`, label: p.label, hint: p.at, run: go(p.at) })),
  ]
  const menus: Menu[] = [
    { id: "surface", label: shown, strong: true, items: grouped(atRoot, root?.menu, start) },
    ...(route !== "/" && here ? [{ id: "place", label: labelOf(route, here, listed), items: grouped(atHere, here.menu, start) }] : []),
    ...(goItems.length ? [{ id: "go", label: "Go", items: goItems, ...(places.length > MANY && { search: { placeholder: "Filter places" } }) }] : []),
  ]
  const find = (query: string): MenuItem[] =>
    search(help.found, query).map((f) =>
      f.kind === "place"
        ? { kind: "action", id: `place ${f.at}`, label: f.label, hint: f.at, run: go(f.at) }
        : {
            kind: "action",
            id: `action ${f.action.path} ${f.action.handle.name} ${JSON.stringify(f.action.handle.args)}`,
            label: `${f.label} · ${f.where}`,
            hint: f.action.handle.description,
            run: () => start(f.action),
            ...(f.action.ask && { mark: true }),
          }
    )
  const bar: Menu[] = [...menus, { id: "help", label: "Help", items: [], search: { placeholder: "Search actions and places", find }, opened: help.refresh }]
  const asks = [...atHere, ...atRoot].filter((a) => a.ask)
  const commands: Command[] = commandsOf(menus.filter((m) => m.items.length))

  // The palette's commands are this tab's while it is shown; a hidden tab's effects are gone, and so are its commands.
  useLayoutEffect(() => frames.set(tab.address, commands))
  useLayoutEffect(() => () => frames.set(tab.address, undefined), [frames, tab.address])

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col text-body">
        <header aria-label={shown} data-frame className="flex h-menubar shrink-0 items-center gap-1 border-b bg-background pr-1 pl-1">
          <MenuTriggers menus={bar} />
          <span className="min-w-2 flex-1" />
          {asks.slice(0, 3).map((a) => (
            <button
              key={`${a.path} ${a.handle.name} ${JSON.stringify(a.handle.args)}`}
              type="button"
              title={a.handle.description}
              className="flex h-row shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-primary/10 px-2 text-meta font-medium text-primary outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => start(a)}
            >
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              {named(a.handle.name)}
            </button>
          ))}
          {/* The shell's own marks for this tab go here. */}
          <div data-frame-aside className="flex shrink-0 items-center gap-1 empty:hidden">
            {aside}
          </div>
        </header>
        {refused && (
          <p role="alert" className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 py-0.5 pr-1 pl-2.5 text-meta text-destructive">
            <span className="min-w-0 flex-1 truncate" title={refused}>
              {refused}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              className="grid size-icon cursor-pointer place-items-center rounded-sm hover:bg-foreground/8"
              onClick={() => setRefused("")}
            >
              <XIcon className="size-glyph" aria-hidden />
            </button>
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {asking && (
        <Inputs
          key={`${asking.path} ${asking.handle.name} ${JSON.stringify(asking.handle.args)}`}
          action={asking}
          drawer={drawers[asking.handle.name]}
          call={call}
          close={() => setAsking(undefined)}
        />
      )}
    </>
  )
}

/** The palette's first groups, the commands of the tab looked at: what waits on the person, then its actions and menus. */
export function TabCommands({ frames, at, done }: { frames: Frames; at: string; done: () => void }) {
  const commands = useSyncExternalStore(frames.subscribe, () => frames.get(at)) ?? []
  const rest = commands.filter((c) => !c.ask)
  const groups = [
    { heading: "For you to decide", list: commands.filter((c) => c.ask) },
    ...[...new Set(rest.map((c) => c.group))].map((heading) => ({ heading, list: rest.filter((c) => c.group === heading) })),
  ].filter((g) => g.list.length)
  // The palette closes first, so what a command opens, such as its prompt, is not taken down with it.
  const choose = (command: Command) => {
    done()
    requestAnimationFrame(command.run)
  }

  return groups.map((g) => (
    <CommandGroup key={g.heading} heading={g.heading}>
      {g.list.map((c) => (
        <CommandItem key={c.id} value={`command ${c.id}`} keywords={[c.label, c.hint ?? "", c.group]} disabled={c.disabled} onSelect={() => choose(c)}>
          <span className="grid size-[22px] shrink-0 place-items-center" aria-hidden>
            {c.ask && <span className="size-1.5 rounded-full bg-primary" />}
          </span>
          <span className="max-w-[45%] shrink-0 truncate text-foreground">{c.label}</span>
          {c.hint && c.hint !== c.label && (
            <span className="min-w-0 flex-1 truncate pl-1.5" title={c.hint}>
              {c.hint}
            </span>
          )}
          {c.keys && <CommandShortcut>{c.keys}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  ))
}
