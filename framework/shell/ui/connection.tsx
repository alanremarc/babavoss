// What the page says when it lost the runtime, said under the mark; and what stands over a tab's content without moving
// it, the shell's alerts. The page is served whole, so a normal load says nothing of connecting; only a stream that was up and is lost
// for more than a moment says so, or one that never came up after a while.
import { useEffect, useState, type ReactNode } from "react"
import { CircleAlertIcon, LocateFixedIcon, XIcon } from "lucide-react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../kit/components/alert"
import { Button } from "../../kit/components/button"

/** The page's stream: not yet up since the page loaded, up, or lost after it was. */
export type Connected = "connecting" | "up" | "lost"

/** How long a lost stream goes unsaid, as a runtime that starts again comes back within it. */
export const LOST_MS = 700
/** How long a page waits for its first stream before it says it is connecting. */
export const CONNECTING_MS = 4000

/** What the page says of its stream after `ms` in a state: nothing while it is up, or too soon to tell. */
export function said(state: Connected, ms: number): string | undefined {
  if (state === "lost" && ms >= LOST_MS) return "Reconnecting"
  if (state === "connecting" && ms >= CONNECTING_MS) return "Connecting"

  return undefined
}

/** What the page says of its stream now, once it has been in a state long enough to say it; nothing otherwise. */
export function useSaid(state: Connected): string | undefined {
  const [shown, setShown] = useState<string>()

  useEffect(() => {
    setShown(undefined)
    if (state === "up") return

    const timer = setTimeout(() => setShown(said(state, Infinity)), state === "lost" ? LOST_MS : CONNECTING_MS)

    return () => clearTimeout(timer)
  }, [state])

  return shown
}

/** Over the top of the content, centred: what comes and goes here never shifts what is under it. */
export function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-2 *:pointer-events-auto *:max-w-xl">{children}</div>
  )
}

/** An action the shell called that was refused, with why, until it is dismissed. */
export function RefusedAlert({ reason, dismiss }: { reason: string; dismiss: () => void }) {
  return (
    <Alert variant="destructive" className="w-auto shadow-md">
      <CircleAlertIcon />
      <AlertTitle>Refused</AlertTitle>
      <AlertDescription>{reason}</AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={dismiss}>
          <XIcon />
        </Button>
      </AlertAction>
    </Alert>
  )
}

/** A place the agent points to while the person is busy: the tab by its label, the route within it, and the way there. */
export function PointedAlert({ label, route, go, dismiss }: { label: string; route: string; go: () => void; dismiss: () => void }) {
  return (
    <Alert className="w-auto shadow-md">
      <LocateFixedIcon />
      <AlertTitle>
        The agent points to {label}
        {route !== "/" && <span className="font-mono text-muted-foreground"> {route}</span>}
      </AlertTitle>
      <AlertAction className="flex gap-1">
        <Button size="sm" onClick={go}>
          Go there
        </Button>
        <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={dismiss}>
          <XIcon />
        </Button>
      </AlertAction>
    </Alert>
  )
}
