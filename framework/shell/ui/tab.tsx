// A surface's component runs inside a tab, the home of one instance of the surface with its own state: it knows its
// address, its route within, and reads, calls and watches below its address.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { Args, View } from "../../core/index.ts"
import { call as callDoor, read as readDoor, type Answer } from "./client.ts"

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

const Context = createContext<TabContext | null>(null)

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

/** The page's one subscription to the surface's changes and its connection; a tab's live reads hang off it. */
export const ChangesContext = createContext<{ subscribe: (fn: () => void) => () => void; connected: () => boolean }>({
  subscribe: () => () => {},
  connected: () => false,
})

/** A tab's way to its views and actions, below its address: what its context gives, and what its menu in the strip reads by. */
export type Door = Pick<TabContext, "read" | "call" | "live">

export function doorOf(address: string, { subscribe, connected }: { subscribe: (fn: () => void) => () => void; connected: () => boolean }): Door {
  const full = (path: string) => {
    if (!path.startsWith("/") || path.includes("?") || path.includes("#")) throw new Error("Tab paths start with / and carry no query or fragment")

    return address + (path === "/" ? "" : path)
  }

  return {
    read: async (path = "/") => own(await readDoor(full(path)), address) as never,
    call: async (path, handle, args) => own(await callDoor(full(path), handle, args), address) as never,
    live: (path, onView, onError, onConnected) => {
      let stopped = false
      const load = () =>
        readDoor(full(path)).then(
          (view) => {
            if (!stopped) onView(own(view, address) as never)
          },
          (error: unknown) => {
            if (!stopped) onError?.(error instanceof Error ? error.message : String(error))
          }
        )

      void load()
      onConnected?.(connected())

      const off = subscribe(() => {
        onConnected?.(connected())
        void load()
      })

      return () => {
        stopped = true
        off()
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
  // A new door on every reload, so every live read of the tab starts again.
  const door = useMemo(() => doorOf(address, changes), [address, changes, reload])
  const value = useMemo<TabContext>(() => ({ address, surface, route, active, navigate, ...door }), [address, surface, route, active, navigate, door])

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

/** The view at a path under this tab, kept current. */
export function useLive<V = View>(path: string): { view?: V; error?: string } {
  const { live } = useTab()
  const [current, setCurrent] = useState<{ view?: V; error?: string }>({})

  // A new path shows the old view until the first read lands; a component that must not, keys itself by the path.
  useEffect(() => {
    return live<V>(
      path,
      (view) => setCurrent({ view }),
      (error) => setCurrent((c) => ({ ...c, error }))
    )
  }, [live, path])

  return current
}
