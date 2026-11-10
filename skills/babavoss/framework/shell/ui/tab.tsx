// A util's component runs inside a tab: it knows its address, its route within, and reads, calls and watches below its address.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { Args, View } from "../../core/index.ts"
import { call as callDoor, read as readDoor, type Answer } from "./client.ts"

export type TabContext = {
  /** /tabs/N */
  address: string
  util: string
  route: string
  active: boolean
  navigate: (route: string) => void
  read: <V = View>(path?: string) => Promise<V>
  call: <V = View>(path: string, handle: string, args: Args) => Promise<Answer<V>>
  /** The view at `path` now and after every change; `onError` when there is none; `onConnected` as the page's stream goes up or down. Returns stop. */
  live: <V = View>(path: string, onView: (view: V) => void, onError?: (error: string) => void, onConnected?: (up: boolean) => void) => () => void
}

const Context = createContext<TabContext | null>(null)

/** The page's one subscription to the surface's changes and its connection; a tab's live reads hang off it. */
export const ChangesContext = createContext<{ subscribe: (fn: () => void) => () => void; connected: () => boolean }>({
  subscribe: () => () => {},
  connected: () => false,
})

export function TabProvider({ address, util, route, active, navigate, children }: Omit<TabContext, "read" | "call" | "live"> & { children?: ReactNode }) {
  const { subscribe, connected } = useContext(ChangesContext)
  const value = useMemo<TabContext>(() => {
    const full = (path: string) => {
      if (!path.startsWith("/") || path.includes("?") || path.includes("#")) throw new Error("Tab paths start with / and carry no query or fragment")

      return address + (path === "/" ? "" : path)
    }

    return {
      address,
      util,
      route,
      active,
      navigate,
      read: (path = "/") => readDoor(full(path)),
      call: (path, handle, args) => callDoor(full(path), handle, args),
      live: (path, onView, onError, onConnected) => {
        let stopped = false
        const load = () =>
          readDoor(full(path)).then(
            (view) => {
              if (!stopped) onView(view as never)
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
  }, [address, util, route, active, navigate, subscribe, connected])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTab(): TabContext {
  const tab = useContext(Context)

  if (!tab) throw new Error("useTab is for a util's component inside the shell")

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
