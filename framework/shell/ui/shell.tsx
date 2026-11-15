// The shell page: the shell's view at / drives the tab strip and home; each tab, the home of one instance of a surface
// with its own state, shows its surface's component. The strip is the page's header: home, the babavoss mark, which is
// also whose move it is (turn.ts); then the open tabs newest first, each with its menu (actions.tsx); and at its right the
// notifications. Below it a tab's content fills the rest, or home, the shell's own page (home.tsx). A tab the person opens becomes
// theirs to look at; one the agent opens takes its place beside home, marked until looked at, and the person stays where
// they are. A tab that is broken, needs someone, offers an ask or holds a notice not yet seen is marked in the strip and
// on home, from / where the shell gathers who is needed. Each notice heard while the page is open is a toast that then
// goes into the notifications' button, and their drawer keeps the notices and all activity (notifications.tsx).
// The URL is the surface path: / home, also where no tab is, /tabs/N/route a tab. When the agent points to a place, the
// page goes there, or offers it while the person is busy (pointing.ts). The person's settings, their own surface's that
// comes with the shell, are applied here: the appearance, the shortcuts (shortcuts.ts) and the mark's animation
// (appearance.ts). It loads no stylesheet: the root's page does, one, which imports the shell's styles.css, so the
// shell's styles are compiled once.
import { Activity, Component, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentType, type ReactNode } from "react"
import { CircleAlertIcon, LocateFixedIcon, XIcon } from "lucide-react"
import type { Handle, View } from "../../core/index.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../kit/components/alert"
import { Button } from "../../kit/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../kit/components/empty"
import { DropdownKit, MenuItems, type MenuItem } from "../../kit/layouts/menu.tsx"
import { call, changes, read, type Notice, type Turn } from "./client.ts"
import { Actions, TabMenu, useTabAsks } from "./actions.tsx"
import { noticesIn, type Offered } from "./commands.ts"
import { Home, HomeTab, SEARCH, type TabEntry } from "./home.tsx"
import { backTo, shortcut, type SurfaceEntry } from "./home.ts"
import type { Drawers } from "./inputs.tsx"
import { NOTICES, Notifications, unseenRows, useFeed } from "./notifications.tsx"
import * as settingsPage from "../settings/ui/index.tsx"
import { bindings, shown as keysShown } from "../settings/src/keys.ts"
import { useSettings } from "./appearance.ts"
import { mac, useShortcuts } from "./shortcuts.ts"
import { ChangesContext, TabProvider } from "./tab.tsx"
import { arrival, HOME, placeOf, pointedSince, typingIn, type Pointed } from "./pointing.ts"
import { cycled, newestFirst, successor } from "./strip.ts"
import { SurfaceTabs, TabContent, type TabNeed } from "./tabs.tsx"
import { endable, endMove, standingOf } from "./turn.ts"

/**
 * Each surface's page module: its component, the default export; the icon the strip and home show; and the
 * drawers its frame opens for the inputs of the actions they are named for.
 */
export type Registry = Record<string, { default: ComponentType; icon?: ReactNode; drawers?: Drawers }>
/** A tab as the desktop lists it; `broken` says why its surface fails on what it keeps. */
type Row = { at: string; n: number; surface: string; title?: string; close?: Handle; broken?: string }
/** A tab that is needed, as / gathers it. */
type Need = { at: string; surface: string } & TabNeed
type RootView = { title: string; needs?: Need[]; missing?: string; empty?: string; surfaces: SurfaceEntry[]; tabs: Row[]; pointed?: Pointed }

const parse = () => placeOf(location.pathname)
const urlOf = (key: string, route = "/") => (key === HOME ? "/" : key + (route === "/" ? "" : route))
/** The pages of the surfaces that come with the shell, beside the project's. */
const OWN: Registry = { settings: settingsPage }

class TabError extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  render() {
    if (this.state.error === undefined) return this.props.children

    return (
      <Alert variant="destructive" className="m-3 w-auto">
        <AlertTitle>The surface's page failed</AlertTitle>
        <AlertDescription>{this.state.error}</AlertDescription>
        <Button variant="outline" onClick={() => this.setState({ error: undefined })}>
          Try again
        </Button>
      </Alert>
    )
  }
}

export function Shell({ surfaces: project }: { surfaces: Registry }) {
  const surfaces = useMemo(() => ({ ...project, ...OWN }), [project])
  const { settings, again: settingsAgain } = useSettings()
  const [root, setRoot] = useState<RootView>()
  const [error, setError] = useState("")
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState(false)
  const [at, setAt] = useState(parse)
  const [routes, setRoutes] = useState<Record<string, string>>(() => (at.key.startsWith("/") ? { [at.key]: at.route } : {}))
  const [listeners] = useState(() => new Set<() => void>())
  // Each tab's asks, which dot it.
  const asks = useTabAsks()
  const [, asksMoved] = useReducer((n: number) => n + 1, 0)
  // The action of a tab asking its inputs in a modal, and the last refusal of one, by its tab.
  const [asking, setAsking] = useState<{ at: string; action: Offered }>()
  const [refused, setRefused] = useState<{ at: string; reason: string }>()
  // Each tab's reloads: raising one reads its views again.
  const [reloads, setReloads] = useState<Record<string, number>>({})
  const up = useRef(false)
  const stream = useMemo(
    () => ({
      subscribe: (fn: () => void) => {
        listeners.add(fn)

        return () => void listeners.delete(fn)
      },
      connected: () => up.current,
    }),
    [listeners]
  )
  const rows = root?.tabs ?? []
  const settingsOpen = useRef(false)

  settingsOpen.current = rows.some((r) => r.surface === "settings")
  const active = at.key === HOME || rows.some((r) => r.at === at.key) ? at.key : HOME
  // The tab shown before home, which home returns to.
  const [shown, setShown] = useState<string>()
  const back = backTo(shown, rows.map((r) => r.at))
  const icons = useMemo(() => Object.fromEntries(Object.entries(surfaces).map(([name, s]) => [name, s.icon])), [surfaces])
  const strip = useMemo(() => newestFirst(rows), [rows])
  const entries: TabEntry[] = strip.map((row) => ({
    at: row.at,
    n: row.n,
    surface: row.surface,
    label: row.title ?? `${row.surface} ${row.n}`,
    icon: icons[row.surface] ?? <span className="size-3.5 rounded-full bg-foreground/30" aria-hidden />,
    needs: (root?.needs ?? []).filter((need) => need.at === row.at).map(({ who, why }) => ({ who, why })),
    ...(row.broken !== undefined && { broken: row.broken }),
  }))
  const waits = (at: string) => asks.count(at) > 0 || noticesIn(at, unseen).length > 0
  // Who hears each notice as it comes: the notifications.
  const [hearers] = useState(() => new Set<(notice: Notice) => void>())
  const notices = useMemo(
    () => ({
      subscribe: (fn: (notice: Notice) => void) => {
        hearers.add(fn)

        return () => void hearers.delete(fn)
      },
    }),
    [hearers]
  )
  // The tabs the person has looked at, or that were open when the page loaded: any other was opened by the agent since.
  const [seen, setSeen] = useState<ReadonlySet<string>>()
  // Whose move it is, as the runtime hears it from the harness's hooks.
  const [turn, setTurn] = useState<Turn>()
  // The notices, read once: the drawer's, and what dots the tabs until seen.
  const told = useFeed(NOTICES, stream, true)
  const unseen = useMemo(() => unseenRows(told.rows, told.unseen), [told.rows, told.unseen])

  useEffect(() => asks.subscribe(asksMoved), [asks])

  useEffect(() => {
    const load = () => read<RootView>("/").then(setRoot, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    void load()

    return changes(
      () => {
        void load()
        // A settings tab of this session may have changed them, also while it is not shown: they are read again.
        if (settingsOpen.current) settingsAgain()
        for (const fn of listeners) fn()
      },
      (connected) => {
        if (up.current !== connected) for (const fn of listeners) fn()
        up.current = connected
        setConnected(connected)
      },
      (notice) => {
        for (const fn of hearers) fn(notice)
      },
      setTurn
    )
  }, [listeners, hearers, settingsAgain])

  useEffect(() => {
    document.title = root?.title ?? "babavoss"
  }, [root?.title])

  useLayoutEffect(() => {
    const navigate = () => {
      const next = parse()

      if (next.key.startsWith("/")) setRoutes((previous) => ({ ...previous, [next.key]: next.route }))
      setAt(next)
    }

    window.addEventListener("popstate", navigate)

    return () => window.removeEventListener("popstate", navigate)
  }, [])

  useEffect(() => {
    if (root) setSeen((s) => (!s ? new Set([...root.tabs.map((r) => r.at), active]) : s.has(active) ? s : new Set([...s, active])))
  }, [root, active])

  useEffect(() => {
    if (active !== HOME) setShown(active)
  }, [active])

  // A closed tab in the URL falls back to home.
  useEffect(() => {
    if (root && at.key !== active) history.replaceState(null, "", urlOf(active, routes[active]))
  }, [root, at.key, active, routes])

  const go = (key: string, route?: string) => {
    const url = urlOf(key, route ?? routes[key])

    if (location.pathname !== url) history.pushState(null, "", url)
    if (route) setRoutes((previous) => ({ ...previous, [key]: route }))
    setAt({ key, route: route ?? routes[key] ?? "/" })
  }
  const act = async (path: string, handle: Handle) => {
    setError("")
    setPending(true)
    try {
      const result = await call<RootView>(path, handle.name, handle.args)

      if (result.outcome === "refused") setError(result.reason)
      else {
        setRoot(result.view)

        return result.view
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  const open = async (handle: Handle) => {
    const view = await act("/", handle)
    const opened = newestFirst(view?.tabs.filter((r) => r.surface === handle.args.surface) ?? [])[0]

    if (opened) go(opened.at, "/")
  }

  // Pointing: the agent's show moves `pointed` at /; the page goes there, or offers it while the person is busy.
  const [offer, setOffer] = useState<Pointed>()
  const pointedSeen = useRef<number>(undefined)
  const acted = useRef(0)
  const offered = offer && placeOf(offer.at)

  useEffect(() => {
    const mark = () => void (acted.current = Date.now())
    const kinds = ["pointerdown", "keydown", "wheel"] as const

    for (const kind of kinds) window.addEventListener(kind, mark, { capture: true, passive: true })

    return () => {
      for (const kind of kinds) window.removeEventListener(kind, mark, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!root) return

    const { seen, fresh } = pointedSince(pointedSeen.current, root.pointed)

    pointedSeen.current = seen
    if (!fresh) return

    const place = placeOf(fresh.at)

    if (!root.tabs.some((r) => r.at === place.key) || (place.key === at.key && place.route === at.route)) return setOffer(undefined)
    if (arrival({ typing: typingIn(document.activeElement), acted: acted.current }, Date.now()) === "go") {
      setOffer(undefined)
      go(place.key, place.route)
    } else setOffer(fresh)
  }, [root])

  // An offer the person took up by going there themselves is done.
  useEffect(() => {
    if (offered && offered.key === at.key && offered.route === at.route) setOffer(undefined)
  }, [offered?.key, offered?.route, at.key, at.route])

  const away = (at: string) => go(successor(strip, at) ?? HOME)
  const close = async (row: Row) => {
    if (!row.close) return
    await act("/", row.close)
    if (active === row.at) away(row.at)
  }
  const closeOthers = async (row: Row) => {
    for (const other of strip) if (other.at !== row.at && other.close) await act("/", other.close)
    if (active !== row.at && active !== HOME) go(row.at)
  }
  // An action of a tab, wherever it was chosen: one that asks for inputs opens its modal in the tab, shown first; another
  // is called at once, and a refusal shows the tab with why.
  const start = (row: Row, action: Offered) => {
    if (Object.keys(action.handle.open).length || surfaces[row.surface]?.drawers?.[action.handle.name]) {
      setAsking({ at: row.at, action })
      if (active !== row.at) go(row.at)

      return
    }
    void call(row.at + (action.path === "/" ? "" : action.path), action.handle.name, action.handle.args).then(
      (answer) => {
        if (answer.outcome !== "refused") return setRefused((r) => (r?.at === row.at ? undefined : r))
        setRefused({ at: row.at, reason: answer.reason })
        if (active !== row.at) go(row.at)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e))
    )
  }
  // The shell's own controls, the same in every tab's menu.
  const controls = (row: Row): MenuItem[] => [
    {
      kind: "action",
      id: "close",
      label: "Close tab",
      note: "its state is dropped",
      hint: row.close?.description,
      disabled: !row.close,
      run: () => void close(row),
    },
    {
      kind: "action",
      id: "close-others",
      label: "Close other tabs",
      disabled: !strip.some((other) => other.at !== row.at && other.close),
      run: () => void closeOthers(row),
    },
    {
      kind: "action",
      id: "copy",
      label: "Copy link",
      hint: location.origin + urlOf(row.at, routes[row.at]),
      run: () => void navigator.clipboard?.writeText(location.origin + urlOf(row.at, routes[row.at])),
    },
    { kind: "action", id: "reload", label: "Reload", hint: "Read the tab's views again", run: () => setReloads((r) => ({ ...r, [row.at]: (r[row.at] ?? 0) + 1 })) },
  ]

  // Going where an unseen notice is about sees it.
  useEffect(() => {
    if (!active.startsWith("/")) return

    const here = active + ((routes[active] ?? "/") === "/" ? "" : routes[active])
    const there = unseen.filter((n) => n.at === here && here !== active)

    if (!there.length) return
    void Promise.all(there.map((n) => call(NOTICES, "looked", { n: n.n }))).then(() => told.load(), () => undefined)
  }, [active, routes, unseen])

  // The tab whose menu the shortcut opens: the one focused in the strip, else the one shown.
  const openMenu = () => {
    const focused = document.activeElement?.closest('[data-slot="pill"]')
    const pill = focused ?? document.getElementById(`tab-${active.replaceAll("/", "-")}`)?.closest('[data-slot="pill"]')

    pill?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  }
  const order = [HOME, ...strip.map((r) => r.at)]

  useShortcuts(settings.keys, {
    home: () => {
      go(shortcut(active, back))
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(SEARCH)?.focus())
    },
    next: () => go(cycled(order, active, 1) ?? HOME),
    previous: () => go(cycled(order, active, -1) ?? HOME),
    menu: openMenu,
  })

  const homeKeys = keysShown(bindings(settings.keys).home, mac)

  return (
    <ChangesContext.Provider value={stream}>
    <div className="flex h-dvh min-h-64 flex-col overflow-hidden text-xs">
      <SurfaceTabs
        active={active}
        onSelect={(key) => go(key)}
        home={<HomeTab active={active === HOME} standing={standingOf(turn)} animate={settings.logo.animate} keys={homeKeys} onSelect={() => go(HOME)} />}
        end={<Notifications changes={stream} notices={notices} told={told} title={root?.title ?? "baba"} go={(at) => go(placeOf(at).key, placeOf(at).route)} />}
        items={[
          ...strip.map((row, i) => ({
            id: row.at,
            label: entries[i]!.label,
            icon: entries[i]!.icon,
            unseen: !!seen && !seen.has(row.at) && row.at !== active,
            waits: waits(row.at),
            needs: entries[i]!.needs,
            broken: entries[i]!.broken,
            ...(row.close && { onClose: () => void close(row) }),
            menu: (shut: () => void) =>
              row.broken !== undefined || !surfaces[row.surface]?.default ? (
                <MenuItems kit={DropdownKit} items={controls(row)} />
              ) : (
                <TabMenu
                  address={row.at}
                  route={routes[row.at] ?? "/"}
                  title={row.title}
                  name={row.surface}
                  start={(action) => start(row, action)}
                  navigate={(route) => go(row.at, route)}
                  notices={noticesIn(row.at, unseen)}
                  controls={controls(row)}
                  close={shut}
                />
              ),
          })),
        ]}
      />
      {!connected && (
        <p className="border-b px-4 py-1 text-muted-foreground" role="status">
          {root ? "Reconnecting…" : "Connecting…"}
        </p>
      )}
      {error && (
        <Alert variant="destructive" className="mx-3 my-2 w-auto">
          <CircleAlertIcon />
          <AlertTitle>Refused</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setError("")}>
              <XIcon />
            </Button>
          </AlertAction>
        </Alert>
      )}
      {offer && offered && (
        <Alert className="mx-3 my-2 w-auto">
          <LocateFixedIcon />
          <AlertTitle>
            The agent points to {entries.find((e) => e.at === offered.key)?.label ?? offered.key}
            {offered.route !== "/" && <span className="font-mono text-muted-foreground"> {offered.route}</span>}
          </AlertTitle>
          <AlertAction className="flex gap-1">
            <Button size="sm" onClick={() => go(offered.key, offered.route)}>
              Go there
            </Button>
            <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setOffer(undefined)}>
              <XIcon />
            </Button>
          </AlertAction>
        </Alert>
      )}
        <main className="relative flex min-h-0 flex-1 flex-col">
          {active === HOME && (
            <TabContent address={HOME} hidden={false}>
              <Home
                title={root?.title}
                notice={root?.missing ?? root?.empty}
                surfaces={root?.surfaces ?? []}
                icons={icons}
                tabs={entries}
                back={entries.find((e) => e.at === back)}
                keys={homeKeys}
                {...(turn && endable(turn) && { end: { drivable: turn.drivable, run: () => endMove(turn.drivable) } })}
                disabled={pending || !root}
                loading={!root}
                launch={(handle) => void open(handle)}
                select={(at) => go(at)}
                {...(back && { leave: () => go(back) })}
              />
            </TabContent>
          )}
          {rows.map((row) => {
            const Page = surfaces[row.surface]?.default

            return (
              <TabContent key={row.at} address={row.at} hidden={active !== row.at}>
                <Activity mode={active === row.at ? "visible" : "hidden"}>
                  {row.broken !== undefined ? (
                    <Alert variant="destructive" className="m-3 w-auto">
                      <AlertTitle>This tab is broken</AlertTitle>
                      <AlertDescription>{row.broken}</AlertDescription>
                    </Alert>
                  ) : Page ? (
                    <TabError>
                      <TabProvider
                        address={row.at}
                        surface={row.surface}
                        route={routes[row.at] ?? "/"}
                        active={active === row.at}
                        navigate={(route) => go(row.at, route)}
                        reload={reloads[row.at] ?? 0}
                      >
                        <Actions
                          asks={asks}
                          title={row.title}
                          name={row.surface}
                          drawers={surfaces[row.surface]?.drawers}
                          start={(action) => start(row, action)}
                          {...(asking?.at === row.at && { asking: asking.action })}
                          answered={() => setAsking(undefined)}
                          {...(refused?.at === row.at && { refused: refused.reason })}
                          dismiss={() => setRefused(undefined)}
                        >
                          <Page />
                        </Actions>
                      </TabProvider>
                    </TabError>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CircleAlertIcon />
                        </EmptyMedia>
                        <EmptyTitle>{row.surface} has no page</EmptyTitle>
                        <EmptyDescription>Give it one: the default export of its ui/index.tsx.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </Activity>
              </TabContent>
            )
          })}
        </main>
    </div>
    </ChangesContext.Provider>
  )
}

export type { View }
