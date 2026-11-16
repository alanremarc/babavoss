// Notices as they arrive: each a bubble beside the tab it is in, beside the mark where it is in none, pointing away from
// the rail, gone after a few seconds, at most a few per tab; hovering one keeps it, and a click opens its tab's drawer,
// where its thread keeps it. A page's own passing word (useShell().toast), kept nowhere, is a bubble too, and its click
// goes where it is about. The tab's mark and its thread are what remain. They stand over the page, so a rail that scrolls
// does not cut them, placed by where the tab's button is.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { cn } from "../../kit/cn.ts"
import { tabId } from "./rail.tsx"

/** How long a bubble stays when nobody holds it, in ms. */
export const BUBBLE_MS = 3000
/** The most bubbles beside one tab; an older one goes first. */
export const BUBBLES = 3

/** A bubble: its words, and what a click on it does: open its tab's drawer, or go to a place. */
export type Bubble = { id: number; text: string; from?: string; at?: string; kept: boolean }

/** The bubbles after one more beside `key`: the newest few of each tab's. */
export function added(all: Readonly<Record<string, Bubble[]>>, key: string, bubble: Bubble): Record<string, Bubble[]> {
  return { ...all, [key]: [...(all[key] ?? []), bubble].slice(-BUBBLES) }
}

/** The bubbles after one goes. */
export function gone(all: Readonly<Record<string, Bubble[]>>, key: string, id: number): Record<string, Bubble[]> {
  const left = (all[key] ?? []).filter((b) => b.id !== id)
  const { [key]: _, ...rest } = all

  return left.length ? { ...rest, [key]: left } : rest
}

/** The way a bubble stands from its tab: the side of the tab away from the rail. */
type Away = "right" | "left" | "down" | "up"

/** Where the bubbles beside a tab stand on the page, from its button's box: off its side away from the rail, kept on screen. */
function placed(box: DOMRect, away: Away): { style: CSSProperties; upward: boolean } {
  const gap = 8
  const width = innerWidth
  const height = innerHeight
  const lower = box.top + box.height / 2 > height / 2

  if (away === "right" || away === "left") {
    const x = away === "right" ? { left: box.right + gap } : { right: width - box.left + gap }

    return { style: { ...x, ...(lower ? { bottom: Math.max(gap, height - box.bottom) } : { top: Math.max(gap, box.top) }) }, upward: lower }
  }

  const left = Math.max(gap, Math.min(box.left, width - 288))

  return away === "down" ? { style: { left, top: box.bottom + gap }, upward: false } : { style: { left, bottom: height - box.top + gap }, upward: true }
}

/**
 * The bubbles over the page: each tab's beside its button, by `key`, the tab's address or home's. `open` opens a tab's
 * drawer, `go` goes to a place; `dismiss` takes one away once it has gone.
 */
export function Bubbles({
  bubbles,
  away,
  open,
  go,
  dismiss,
}: {
  bubbles: Readonly<Record<string, Bubble[]>>
  away: Away
  open: (key: string) => void
  go: (at: string) => void
  dismiss: (key: string, id: number) => void
}) {
  const [, moved] = useState(0)

  // A bubble follows its tab as the page is resized or the rail scrolls.
  useEffect(() => {
    const move = () => moved((n) => n + 1)

    addEventListener("resize", move)
    addEventListener("scroll", move, true)

    return () => {
      removeEventListener("resize", move)
      removeEventListener("scroll", move, true)
    }
  }, [])

  // None is drawn on the server, nor portalled where there is none to stand.
  if (typeof document === "undefined" || !Object.keys(bubbles).length) return null

  return createPortal(
    Object.entries(bubbles).map(([key, list]) => {
      const box = document.getElementById(tabId(key))?.getBoundingClientRect()

      if (!box || !list.length) return null

      const { style, upward } = placed(box, away)

      return (
        <div key={key} style={style} className={cn("pointer-events-none fixed z-50 flex w-max max-w-[280px] gap-1", upward ? "flex-col-reverse" : "flex-col", away === "left" ? "items-end" : "items-start")}>
          {[...list].reverse().map((b) => (
            <Said key={b.id} bubble={b} away={away} act={() => (b.kept ? open(key) : b.at ? go(b.at) : open(key))} dismiss={() => dismiss(key, b.id)} />
          ))}
        </div>
      )
    }),
    document.body
  )
}

/** One bubble: its words, and where it is from where that is not its tab; held while hovered, gone after BUBBLE_MS otherwise. */
export function Said({ bubble, away, act, dismiss }: { bubble: Bubble; away: Away; act: () => void; dismiss: () => void }) {
  const [held, setHeld] = useState(false)
  const latest = useRef(dismiss)

  latest.current = dismiss
  useLayoutEffect(() => {
    if (held) return

    const timer = setTimeout(() => latest.current(), BUBBLE_MS)

    return () => clearTimeout(timer)
  }, [held])

  return (
    <button
      type="button"
      data-bubble
      className={cn(
        "pointer-events-auto max-w-full cursor-pointer rounded-2xl bg-popover px-3 py-2 text-left text-body leading-snug wrap-anywhere text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-200 animate-in fade-in-0 hover:brightness-95 motion-reduce:animate-none dark:hover:brightness-125",
        { right: "rounded-tl-md slide-in-from-left-1", left: "rounded-tr-md slide-in-from-right-1", down: "rounded-tl-md slide-in-from-top-1", up: "rounded-bl-md slide-in-from-bottom-1" }[away]
      )}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onClick={() => {
        dismiss()
        act()
      }}
    >
      {bubble.from && <span className="block text-meta text-muted-foreground">{bubble.from}</span>}
      {bubble.text}
    </button>
  )
}
