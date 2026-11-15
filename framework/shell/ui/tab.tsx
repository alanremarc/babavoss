// A surface's component runs inside a tab, the home of one instance of the surface with its own state: it knows its
// address, its route within, and reads, calls and watches below its address. What it reads live comes from its tab's
// cache (live.ts): a page is shown once its first reads are known, and keeps what it shows while a new path is read.
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import type { Args, View } from "../../core/index.ts"
import type { Theme } from "../../kit/theme.ts"
import { call as callDoor, read as readDoor, type Answer } from "./client.ts"
import { cachesBy, liveCache, shownOf, type Entry, type LiveCache } from "./live.ts"

export type TabContext = {
  /** /tabs/N */
  address: string
  surface: string
  route: string
  active: boolean
  navigate: (route: string) => void
  read: <V = View>(path?: string) => Promise<V>
  call: <V = View>(path: string, handle: string, args: Args) => Promise<Answer<V>>
  /** The view at `path` now and after every change; `onError` when there is none; `onConnected` as the page's stream goes up or down. Returns stop. */
  live: <V = View>(path: string, onView: (view: V) => void, onError?: (error: string) => void, onConnected?: (up: boolean) => void) => () => void
}

/**
 * What a page may ask of the shell beyond its tab, used by convention and never needed: `open` shows a tab of a surface,
 * the one open or else a new one; `go` goes to a place by its whole path, as `/queue/issues/3`; `toast` raises a toast from
 * the tab, which clicking returns to, kept nowhere and not told to the agent, since what happened to both sides is a notice
 * of the surface's `update`; `appearance` is the person's mode and theme, for a library that must be told them: `theme`
 * the preset's id or dynamic, `numbers` the three it is derived from, which change as a dynamic theme is changed.
 */
export type ShellServices = {
  open: (surface: string) => Promise<void>
  go: (at: string) => void
  toast: (address: string, text: string, at?: string) => void
  appearance: { mode: "light" | "dark"; theme: string; numbers: Theme }
}

/** The shell's services as the shell gives them; a page drawn without the shell has them do nothing. */
export const ServicesContext = createContext<ShellServices>({ open: async () => {}, go: () => {}, toast: () => {}, appearance: { mode: "light", theme: "neutral", numbers: { hue: 0, tint: 0, vivid: 0 } } })

/** The tab's context as the shell holds it: with its cache, which useLive reads. */
const Context = createContext<(TabContext & { cache: LiveCache }) | null>(null)

/** The shell gives the paths a view names under `at` whole; a surface's component works with its own, below its tab. */
export function own<V>(value: V, address: string): V {
  if (Array.isArray(value)) return value.map((v) => own(v, address)) as V
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      k === "at" && typeof v === "string" && (v === address || v.startsWith(`${address}/`)) ? v.slice(address.length) || "/" : own(v, address),
    ])
  ) as V
}

/** A path of the tab as the door knows it: below its address. */
const fullPath = (address: string, path: string) => {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) throw new Error("Tab paths start with / and carry no query or fragment")

  return address + (path === "/" ? "" : path)
}

/** A tab's cache of its views, read below its address, seeded with what the page was served at its paths, whole. */
export function tabCache(address: string, served: Record<string, unknown> = {}): LiveCache {
  const cache = liveCache(async (path) => own(await readDoor(fullPath(address, path)), address))

  for (const [at, view] of Object.entries(served))
    if (at === address || at.startsWith(`${address}/`)) cache.seed(at.slice(address.length) || "/", own(view, address))

  return cache
}

/** The page's one subscription to the surface's changes and its connection, and each tab's cache of views, by its address. */
export type Changes = { subscribe: (fn: () => void) => () => void; connected: () => boolean; cacheOf: (address: string) => LiveCache }

const unshelled = cachesBy((address) => tabCache(address))

export const ChangesContext = createContext<Changes>({
  subscribe: () => () => {},
  connected: () => false,
  cacheOf: unshelled.of,
})

/** A tab's way to its views and actions, below its address: what its context gives, and what its menu in the strip reads by. */
export type Door = Pick<TabContext, "read" | "call" | "live"> & { cache: LiveCache }

export function doorOf(address: string, { subscribe, connected, cacheOf }: Changes): Door {
  const cache = cacheOf(address)

  return {
    cache,
    read: async (path = "/") => own(await readDoor(fullPath(address, path)), address) as never,
    call: async (path, handle, args) => own(await callDoor(fullPath(address, path), handle, args), address) as never,
    live: (path, onView, onError, onConnected) => {
      let last: Entry | undefined
      const tell = () => {
        const entry = cache.get(path)

        if (!entry || entry === last) return
        last = entry
        if (entry.error !== undefined) onError?.(entry.error)
        else onView(entry.view as never)
      }
      const off = cache.subscribe(path, tell)
      const connection = onConnected && subscribe(() => onConnected(connected()))

      tell()
      onConnected?.(connected())

      return () => {
        off()
        connection?.()
      }
    },
  }
}

/** `reload`: a number the shell raises to have every view of the tab read again, as its menu's Reload does. */
export function TabProvider({
  address,
  surface,
  route,
  active,
  navigate,
  reload = 0,
  children,
}: Omit<TabContext, "read" | "call" | "live"> & { reload?: number; children?: ReactNode }) {
  const changes = useContext(ChangesContext)
  const door = useMemo(() => doorOf(address, changes), [address, changes])
  const value = useMemo<TabContext & { cache: LiveCache }>(() => ({ address, surface, route, active, navigate, ...door }), [address, surface, route, active, navigate, door])
  const reloaded = useRef(reload)

  // A reload reads every view the tab watches again, in place: what it shows stays until the new one lands.
  useEffect(() => {
    if (reloaded.current === reload) return
    reloaded.current = reload
    door.cache.changed()
  }, [door, reload])

  // The tab's own element, named by its surface: a surface's stylesheet is scoped to it, so it styles its tab alone.
  return (
    <Context.Provider value={value}>
      <div data-surface={surface} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </Context.Provider>
  )
}

export function useTab(): TabContext {
  const tab = useContext(Context)

  if (!tab) throw new Error("useTab is for a surface's component inside the shell")

  return tab
}

/** The shell's services, for a page: `toast` here is from this tab, its `at` a path within it. */
export function useShell(): Omit<ShellServices, "toast"> & { toast: (text: string, at?: string) => void } {
  const services = useContext(ServicesContext)
  const address = useContext(Context)?.address ?? ""

  return useMemo(() => ({ ...services, toast: (text: string, at?: string) => services.toast(address, text, at) }), [services, address])
}

/** The tab's cache of its views, which the shell's frame around the page reads too. */
export function useTabCache(): LiveCache {
  const tab = useContext(Context)

  if (!tab) throw new Error("useTabCache is for the shell's frame of a tab")

  return tab.cache
}

/** The view at a path of the tab, kept current, with no first read under way: a hook that reads the cache alone. */
export function useCached<V = View>(cache: LiveCache, path: string | undefined): Entry<V> | undefined {
  const subscribe = useCallback((fn: () => void) => (path === undefined ? () => {} : cache.subscribe(path, fn)), [cache, path])

  const get = () => (path === undefined ? undefined : cache.get(path))

  // The same on a server's render: what the cache holds, as a spec draws a first frame.
  return useSyncExternalStore(subscribe, get, get) as Entry<V> | undefined
}

/**
 * The view at a path under this tab, kept current. A first read waits: the page is not drawn until it is known, so it never
 * shows a state that is not true; its tab shows quiet ground meanwhile (Ready). A new path keeps the view of the old one
 * until its own lands, so a page that moves is never blank; a change replaces the view in place. `error` where the read
 * failed, beside the view it had.
 */
export function useLive<V = View>(path: string): { view?: V; error?: string } {
  const tab = useContext(Context)

  if (!tab) throw new Error("useLive is for a surface's component inside the shell")

  const { cache } = tab

  const entry = useCached<V>(cache, path)
  const before = useRef<Entry<V>>(undefined)
  const shown = shownOf(entry, before.current)

  if (!shown) throw cache.load(path)
  before.current = shown

  return shown
}

/** How long a tab waits on its first reads, quietly, before it says it is reading. */
export const QUIET_MS = 400

function Reading() {
  const [said, setSaid] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSaid(true), QUIET_MS)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
      {said && <span className="animate-in text-meta text-muted-foreground duration-500 fade-in-0">Reading…</span>}
    </div>
  )
}

/** Where a tab's page is drawn: its ground alone until its first reads are known, then the page, once. */
export function Ready({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Reading />}>{children}</Suspense>
}
