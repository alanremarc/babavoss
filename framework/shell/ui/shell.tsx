// The shell page: the shell's view at / drives the tab strip and the launcher; each tab shows its surface's component.
// The strip is the launcher's "+", then the open tabs newest first. A tab the person opens becomes theirs to look at; one
// the agent opens takes its place beside the "+", marked until looked at, and the person stays where they are. A tab that
// is broken or needs someone is marked in the strip and the launcher, from / where the shell gathers who is needed. At the
// strip's right are the notifications: each notice heard while the page is open is a toast that then goes into their
// button, and their panel keeps the notices and all activity (notifications.tsx).
// The URL is the surface path: / the launcher where no tab is, /tabs/N/route a tab, /settings the appearance. When the
// agent points to a place, the page goes there, or offers it while the person is busy (pointing.ts). It loads no stylesheet:
// the root's page does, one, which imports the shell's styles.css, so the shell's styles are compiled once.
import { Activity, Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"
import { CircleAlertIcon, LocateFixedIcon, SettingsIcon, XIcon } from "lucide-react"
import type { Handle, View } from "../../core/index.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../kit/components/alert"
import { Button } from "../../kit/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../kit/components/empty"
import { call, changes, read, type Notice } from "./client.ts"
import { Frame, TabCommands, useFrames } from "./frame.tsx"
import { Launcher, LauncherButton, type TabEntry, type SurfaceEntry } from "./launcher.tsx"
import { Notifications } from "./notifications.tsx"
import { Settings } from "./settings.tsx"
import { ChangesContext, TabProvider } from "./tab.tsx"
import { arrival, placeOf, pointedSince, typingIn, type Pointed } from "./pointing.ts"
import { newestFirst, successor } from "./strip.ts"
import { SurfaceTabs, TabContent, type TabNeed } from "./tabs.tsx"

/** Each surface's page module: its component, the default export, and the icon the strip and the launcher show. */
export type Registry = Record<string, { default: ComponentType; icon?: ReactNode }>
/** A tab as the desktop lists it; `broken` says why its surface fails on what it keeps. */
type Row = { at: string; n: number; surface: string; title?: string; close?: Handle; broken?: string }
/** A tab that is needed, as / gathers it. */
type Need = { at: string; surface: string } & TabNeed
type RootView = { title: string; needs?: Need[]; missing?: string; empty?: string; surfaces: SurfaceEntry[]; tabs: Row[]; pointed?: Pointed }

const parse = () => placeOf(location.pathname)
const urlOf = (key: string, route = "/") => (key === "new" ? "/" : key === "settings" ? "/settings" : key + (route === "/" ? "" : route))

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

export function Shell({ surfaces }: { surfaces: Registry }) {
  const [root, setRoot] = useState<RootView>()
  const [error, setError] = useState("")
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState(false)
  const [at, setAt] = useState(parse)
  const [routes, setRoutes] = useState<Record<string, string>>(() => (at.key.startsWith("/") ? { [at.key]: at.route } : {}))
  const [listeners] = useState(() => new Set<() => void>())
  // Every tab's frame, and the commands of the one looked at, which the palette offers first.
  const frames = useFrames()
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
  const active = at.key === "new" || at.key === "settings" || rows.some((r) => r.at === at.key) ? at.key : "new"
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

  useEffect(() => {
    const load = () => read<RootView>("/").then(setRoot, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    void load()

    return changes(
      () => {
        void load()
        for (const fn of listeners) fn()
      },
      (connected) => {
        if (up.current !== connected) for (const fn of listeners) fn()
        up.current = connected
        setConnected(connected)
      },
      (notice) => {
        for (const fn of hearers) fn(notice)
      }
    )
  }, [listeners, hearers])

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

  // A closed tab in the URL falls back to the launcher.
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

  const choices = {
    surfaces: root?.surfaces ?? [],
    icons,
    tabs: entries,
    active,
    disabled: pending || !root,
    loading: !root,
    launch: (s: SurfaceEntry) => void open(s.open),
    select: (at: string) => go(at),
    settings: () => go("settings"),
    lead: (done: () => void) => <TabCommands frames={frames} at={active} done={done} />,
  }
  const away = (at: string) => go(successor(strip, at) ?? "new")

  return (
    <div className="flex h-dvh min-h-64 flex-col overflow-hidden text-xs">
      {!connected && (
        <p className="px-4 py-2 text-muted-foreground" role="status">
          {root ? "Reconnecting…" : "Connecting…"}
        </p>
      )}
      {error && (
        <Alert variant="destructive" className="mx-3 mb-2 w-auto">
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
        <Alert className="mx-3 mb-2 w-auto">
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
      <ChangesContext.Provider value={stream}>
        <main className="relative flex min-h-0 flex-1 flex-col">
          <TabContent address="settings" hidden={active !== "settings"}>
            <Settings title={root?.title ?? "babavoss"} />
          </TabContent>
          {active === "new" && (
            <TabContent address="new" hidden={false}>
              <Launcher title={root?.title} notice={root?.missing ?? root?.empty} {...choices} />
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
                      >
                        <Frame frames={frames} title={row.title} name={row.surface}>
                          <Page />
                        </Frame>
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
      </ChangesContext.Provider>
      <SurfaceTabs
        active={active}
        onSelect={(key) => go(key)}
        home={<LauncherButton {...choices} />}
        end={<Notifications changes={stream} notices={notices} title={root?.title ?? "baba"} go={(at) => go(placeOf(at).key, placeOf(at).route)} />}
        items={[
          ...(active === "settings" ? [{ id: "settings", label: "Settings", icon: <SettingsIcon aria-hidden />, onClose: () => go(strip[0]?.at ?? "new") }] : []),
          ...strip.map((row, i) => ({
            id: row.at,
            label: entries[i]!.label,
            icon: entries[i]!.icon,
            unseen: !!seen && !seen.has(row.at) && row.at !== active,
            needs: entries[i]!.needs,
            broken: entries[i]!.broken,
            ...(row.close && { onClose: () => void act("/", row.close!).then(() => active === row.at && away(row.at)) }),
          })),
        ]}
      />
    </div>
  )
}

export type { View }
