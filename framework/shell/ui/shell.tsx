// The shell page: the surface's root view drives the tab strip and the launcher; each tab shows its util's component.
// The strip is the launcher's "+", then the open tabs newest first. A tab the person opens becomes theirs to look at; one
// the agent opens takes its place beside the "+", marked until looked at, and the person stays where they are.
// The URL is the surface path: / the launcher where no tab is, /tabs/N/route a tab, /settings the appearance. It loads no stylesheet:
// the root's page does, one, which imports the shell's styles.css, so the shell's styles are compiled once.
import { Activity, Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"
import { CircleAlertIcon, SettingsIcon, XIcon } from "lucide-react"
import type { Handle, View } from "../../core/index.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../kit/components/alert"
import { Button } from "../../kit/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../kit/components/empty"
import { call, changes, read } from "./client.ts"
import { Launcher, LauncherButton, type TabEntry, type UtilEntry } from "./launcher.tsx"
import { Settings } from "./settings.tsx"
import { ChangesContext, TabProvider } from "./tab.tsx"
import { newestFirst, successor } from "./strip.ts"
import { SurfaceTabs, TabContent } from "./tabs.tsx"

/** A util's presentation: its component, and the icon the strip and the launcher show. */
export type Registry = Record<string, { component: ComponentType; icon?: ReactNode }>
/** A tab as home lists it; one whose util is always open offers no `close`; `broken` says why its util fails on what it keeps. */
type Row = { at: string; n: number; util: string; title?: string; close?: Handle; broken?: string }
type RootView = { title: string; utils: UtilEntry[]; tabs: Row[] }
type At = { key: string; route: string }

const parse = (): At => {
  const path = location.pathname.replace(/\/$/, "") || "/"
  const tab = /^(\/tabs\/\d+)(\/.*)?$/.exec(path)

  if (tab) return { key: tab[1]!, route: tab[2] || "/" }
  if (path === "/settings") return { key: "settings", route: "/" }

  return { key: "new", route: "/" }
}
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
        <AlertTitle>The util's page failed</AlertTitle>
        <AlertDescription>{this.state.error}</AlertDescription>
        <Button variant="outline" onClick={() => this.setState({ error: undefined })}>
          Try again
        </Button>
      </Alert>
    )
  }
}

export function Shell({ utils }: { utils: Registry }) {
  const [root, setRoot] = useState<RootView>()
  const [error, setError] = useState("")
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState(false)
  const [at, setAt] = useState(parse)
  const [routes, setRoutes] = useState<Record<string, string>>(() => (at.key.startsWith("/") ? { [at.key]: at.route } : {}))
  const [listeners] = useState(() => new Set<() => void>())
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
  const icons = useMemo(() => Object.fromEntries(Object.entries(utils).map(([name, u]) => [name, u.icon])), [utils])
  const strip = useMemo(() => newestFirst(rows), [rows])
  const entries: TabEntry[] = strip.map((row) => ({
    at: row.at,
    n: row.n,
    util: row.util,
    label: row.title ?? `${row.util} ${row.n}`,
    icon: icons[row.util] ?? <span className="size-3.5 rounded-full bg-foreground/30" aria-hidden />,
  }))
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
      }
    )
  }, [listeners])

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

  // A page opened at / lands in the first tab that is always open, where there is one: a root of one util is that util.
  const landed = useRef(false)

  useEffect(() => {
    if (!root || landed.current) return
    landed.current = true

    const first = root.tabs.find((r) => !r.close)

    if (first && at.key === "new") {
      history.replaceState(null, "", urlOf(first.at))
      setAt({ key: first.at, route: "/" })
    }
  }, [root, at.key])

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
    const opened = newestFirst(view?.tabs.filter((r) => r.util === handle.args.util) ?? [])[0]

    if (opened) go(opened.at, "/")
  }

  const choices = {
    utils: root?.utils ?? [],
    icons,
    tabs: entries,
    active,
    disabled: pending || !root,
    loading: !root,
    launch: (u: UtilEntry) => (u.open ? void open(u.open) : go(rows.find((r) => r.util === u.name)?.at ?? "new")),
    select: (at: string) => go(at),
    settings: () => go("settings"),
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
      <ChangesContext.Provider value={stream}>
        <main className="relative flex min-h-0 flex-1 flex-col">
          <TabContent address="settings" hidden={active !== "settings"}>
            <Settings title={root?.title ?? "babavoss"} />
          </TabContent>
          {active === "new" && (
            <TabContent address="new" hidden={false}>
              <Launcher title={root?.title} {...choices} />
            </TabContent>
          )}
          {rows.map((row) => {
            const Util = utils[row.util]?.component

            return (
              <TabContent key={row.at} address={row.at} hidden={active !== row.at}>
                <Activity mode={active === row.at ? "visible" : "hidden"}>
                  {row.broken !== undefined ? (
                    <Alert variant="destructive" className="m-3 w-auto">
                      <AlertTitle>This tab is broken</AlertTitle>
                      <AlertDescription>{row.broken}</AlertDescription>
                    </Alert>
                  ) : Util ? (
                    <TabError>
                      <TabProvider
                        address={row.at}
                        util={row.util}
                        route={routes[row.at] ?? "/"}
                        active={active === row.at}
                        navigate={(route) => go(row.at, route)}
                      >
                        <Util />
                      </TabProvider>
                    </TabError>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CircleAlertIcon />
                        </EmptyMedia>
                        <EmptyTitle>{row.util} has no page</EmptyTitle>
                        <EmptyDescription>Register a component for it in the page's utils.</EmptyDescription>
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
        items={[
          ...(active === "settings" ? [{ id: "settings", label: "Settings", icon: <SettingsIcon aria-hidden />, onClose: () => go(strip[0]?.at ?? "new") }] : []),
          ...strip.map((row, i) => ({
            id: row.at,
            label: entries[i]!.label,
            icon: entries[i]!.icon,
            unseen: !!seen && !seen.has(row.at) && row.at !== active,
            ...(row.close && { onClose: () => void act("/", row.close!).then(() => active === row.at && away(row.at)) }),
          })),
        ]}
      />
    </div>
  )
}

export type { View }
