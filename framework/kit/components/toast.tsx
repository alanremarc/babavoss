// Toasts: a small stack of passing lines, newest nearest the edge they come from, each gone after a while unless hovered. A
// toast is one line: a small mark, the text, and where it is from, quieter; one with an action is a button that does it
// and goes; any toast can be dismissed. Given `into`, the place where passed toasts are kept, one that times out or is
// dismissed shrinks into it, so the eye learns where they went; with reduced motion it only fades. Given `away`, every toast
// leaves at once, a short slide toward the edge, as when what keeps them opens. What a toast says is the caller's.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"

/** A toast: `text` its line, `title` where it is from, `meta` more of that, `mark` the small sign before it. */
export type ToastItem = { id: number; text: ReactNode; title?: ReactNode; meta?: ReactNode; mark?: ReactNode; onSelect?: () => void }

/** How long a toast stays when nobody holds it. */
export const TOAST_MS = 6000
/** How long a toast takes to go into its place, to leave at once, or to fade where motion is reduced. */
const INTO_MS = 340
const AWAY_MS = 160
const FADE_MS = 150

/** A toast's way out: shrunk and moved to the middle of `to`; slid toward the edge where it goes `away`; or only faded. */
function leave(el: HTMLElement, to: Element | null | undefined, away: boolean): Promise<unknown> {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const target = !reduced && !away && to?.getBoundingClientRect()

  el.style.pointerEvents = "none"
  if (typeof el.animate !== "function") return Promise.resolve()
  if (away && !reduced) {
    const keyframes = [{ transform: "none", opacity: 1 }, { transform: "translateX(24px)", opacity: 0 }]

    return el.animate(keyframes, { duration: AWAY_MS, easing: "ease-in", fill: "forwards" }).finished
  }
  if (!target) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: "forwards" }).finished

  const from = el.getBoundingClientRect()
  const dx = target.left + target.width / 2 - (from.left + from.width / 2)
  const dy = target.top + target.height / 2 - (from.top + from.height / 2)

  return el.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0 },
    ],
    { duration: INTO_MS, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" }
  ).finished
}

type ToastProps = { item: ToastItem; dismiss: () => void; into?: RefObject<Element | null>; from: "top" | "bottom"; away: boolean }

function Toast({ item, dismiss, into, from, away }: ToastProps) {
  const [held, setHeld] = useState(false)
  const self = useRef<HTMLLIElement>(null)
  const going = useRef(false)
  const gone = useRef(dismiss)
  // Timed out, dismissed or sent away: into its place where there is one, and then gone.
  const leaving = (now = false) => {
    if (going.current) return
    going.current = true
    if (!self.current || (!into && !now)) return gone.current()
    void leave(self.current, into?.current, now).then(
      () => gone.current(),
      () => gone.current()
    )
  }
  const later = useRef(leaving)

  gone.current = dismiss
  later.current = leaving
  useEffect(() => {
    if (held || away) return

    const timer = setTimeout(() => later.current(), TOAST_MS)

    return () => clearTimeout(timer)
  }, [held, away])
  useEffect(() => {
    if (away) later.current(true)
  }, [away])

  const body = (
    <>
      {item.mark && <span className="flex size-3 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3">{item.mark}</span>}
      <span className="min-w-0 flex-1 truncate text-foreground">{item.text}</span>
      {item.title && <span className="max-w-[40%] shrink-0 truncate text-meta text-muted-foreground">{item.title}</span>}
      {item.meta && <span className="shrink-0 truncate text-meta text-muted-foreground/70">{item.meta}</span>}
    </>
  )

  return (
    <li
      ref={self}
      role="status"
      className={cn(
        "group/toast pointer-events-auto relative w-full rounded-md bg-popover text-popover-foreground shadow-sm ring-1 ring-foreground/8 duration-200 animate-in fade-in-0 motion-reduce:animate-none",
        from === "top" ? "slide-in-from-top-1" : "slide-in-from-bottom-1"
      )}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {item.onSelect ? (
        <button
          type="button"
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md pr-7 pl-2.5 text-left outline-none hover:bg-foreground/4 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            item.onSelect!()
            dismiss()
          }}
        >
          {body}
        </button>
      ) : (
        <div className="flex h-8 items-center gap-2 pr-7 pl-2.5">{body}</div>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute top-1.5 right-1.5 grid size-5 cursor-pointer place-items-center rounded-full text-muted-foreground opacity-0 outline-none group-hover/toast:opacity-100 hover:bg-foreground/6 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-100 [&_svg]:size-3"
        onClick={() => leaving()}
      >
        <XIcon aria-hidden />
      </button>
    </li>
  )
}

/**
 * The stack, placed by `className`; `dismiss` takes a toast away by its id, once it is gone. `into` is where a passed toast
 * goes, such as the button that keeps them; a toast acted on goes at once, since it was seen. `away` sends every toast
 * away at once. `from` is the edge the stack stands at, where a new toast comes in: the bottom, or the top, newest first.
 */
export function Toasts({
  toasts,
  dismiss,
  className,
  into,
  away = false,
  from = "bottom",
}: {
  toasts: ToastItem[]
  dismiss: (id: number) => void
  className?: string
  into?: RefObject<Element | null>
  away?: boolean
  from?: "top" | "bottom"
}) {
  if (!toasts.length) return null

  return (
    <ol aria-label="Notices" className={cn("pointer-events-none fixed z-50 flex w-[min(22rem,calc(100vw-16px))] gap-1 text-body", from === "top" ? "flex-col-reverse" : "flex-col", className)}>
      {toasts.map((item) => (
        <Toast key={item.id} item={item} from={from} away={away} dismiss={() => dismiss(item.id)} {...(into && { into })} />
      ))}
    </ol>
  )
}
