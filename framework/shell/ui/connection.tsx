// What stands over a tab's content without moving it: the line that says the page lost the runtime, and the shell's
// alerts. The page is served whole, so a normal load says nothing of connecting; only a stream that was up and is lost
// for more than a moment says so, or one that never came up after a while.
import { useEffect, useState, type ReactNode } from "react"

/** The page's stream: not yet up since the page loaded, up, or lost after it was. */
export type Connected = "connecting" | "up" | "lost"

/** How long a lost stream goes unsaid, as a runtime that starts again comes back within it. */
export const LOST_MS = 1500
/** How long a page waits for its first stream before it says it is connecting. */
export const CONNECTING_MS = 4000

/** What the page says of its stream after `ms` in a state: nothing while it is up, or too soon to tell. */
export function said(state: Connected, ms: number): string | undefined {
  if (state === "lost" && ms >= LOST_MS) return "Reconnecting…"
  if (state === "connecting" && ms >= CONNECTING_MS) return "Connecting…"

  return undefined
}

export function Connection({ state }: { state: Connected }) {
  const [shown, setShown] = useState<string>()

  useEffect(() => {
    setShown(undefined)
    if (state === "up") return

    const timer = setTimeout(() => setShown(said(state, Infinity)), state === "lost" ? LOST_MS : CONNECTING_MS)

    return () => clearTimeout(timer)
  }, [state])

  if (!shown) return null

  return (
    <p role="status" className="rounded-full border bg-popover px-3 py-1 text-meta text-muted-foreground shadow-sm animate-in fade-in-0">
      {shown}
    </p>
  )
}

/** Over the top of the content, centred: what comes and goes here never shifts what is under it. */
export function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-2 *:pointer-events-auto *:max-w-xl">{children}</div>
  )
}
