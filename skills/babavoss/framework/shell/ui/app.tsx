// The shell page: the surface's root view drives the tab strip and the launcher; each tab shows its util's component.
// The URL is the surface path: / the launcher, /tabs/N/route a tab, /settings the appearance.
import { Activity, Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"
import { CircleAlertIcon, SettingsIcon, XIcon } from "lucide-react"
import type { Handle, View } from "../../core/index.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/alert"
import { Button } from "./components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./components/empty"
import { call, changes, read } from "./client.ts"
import { Launcher, type UtilEntry } from "./launcher.tsx"
import { Settings } from "./settings.tsx"
import { ChangesContext, TabProvider } from "./tab.tsx"
import { SurfaceTabs, TabContent } from "./tabs.tsx"
import "./styles.css"

/** A util's presentation: its component, and the icon the strip and the launcher show. */
export type Registry = Record<string, { component: ComponentType; icon?: ReactNode }>
type Row = { at: string; n: number; util: string; title?: string; close: Handle }
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

export function App({ utils }: { utils: Registry }) {
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
    const opened = view?.tabs.filter((r) => r.util === handle.args.util).at(-1)

    if (opened) go(opened.at, "/")
  }

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
              <Launcher
                title={root?.title}
                utils={root?.utils ?? []}
                icons={icons}
                tabs={rows}
                disabled={pending || !root}
                loading={!root}
                launch={(handle) => void open(handle)}
                settings={() => go("settings")}
              />
            </TabContent>
          )}
          {rows.map((row) => {
            const Util = utils[row.util]?.component

            return (
              <TabContent key={row.at} address={row.at} hidden={active !== row.at}>
                <Activity mode={active === row.at ? "visible" : "hidden"}>
                  {Util ? (
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
        home={
          <Button
            variant="ghost"
            size="icon"
            role="tab"
            id="tab-new"
            aria-label="Launcher"
            title="Launcher"
            aria-selected={active === "new"}
            aria-controls="content-new"
            tabIndex={active === "new" ? 0 : -1}
            className="rounded-full text-muted-foreground hover:bg-foreground/6 aria-selected:bg-foreground/11"
            onClick={() => go("new")}
          >
            <svg viewBox="16 24 80 52" fill="currentColor" aria-hidden>
              <circle cx="39.772" cy="50" r="18" />
              <circle cx="77.5" cy="50" r="12.728" />
            </svg>
          </Button>
        }
        items={[
          ...rows.map((row) => ({
            id: row.at,
            label: row.title ?? `${row.util} ${row.n}`,
            icon: icons[row.util] ?? <span className="size-3.5 rounded-full bg-foreground/30" aria-hidden />,
            onClose: () => void act("/", row.close).then(() => active === row.at && go("new")),
          })),
          ...(active === "settings" ? [{ id: "settings", label: "Settings", icon: <SettingsIcon aria-hidden />, onClose: () => go("new") }] : []),
        ]}
      />
    </div>
  )
}

export type { View }
