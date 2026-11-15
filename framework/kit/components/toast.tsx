// Toasts: a small stack of passing lines, newest nearest the edge they come from, each gone after a while unless hovered. A toast with an
// action is a button that does it and goes; any toast can be dismissed. Given `into`, the place where passed toasts are
// kept, one that times out or is dismissed shrinks into it, so the eye learns where they went; with reduced motion it
// only fades. What a toast says is the caller's.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"

export type ToastItem = { id: number; title: ReactNode; text: ReactNode; meta?: ReactNode; onSelect?: () => void }

/** How long a toast stays when nobody holds it. */
export const TOAST_MS = 6000
/** How long a toast takes to go into its place, or to fade where motion is reduced. */
const INTO_MS = 340
const FADE_MS = 150

/** A toast's way out: shrunk and moved to the middle of `to`, fading as it goes; or only faded. */
function leave(el: HTMLElement, to: Element | null | undefined): Promise<unknown> {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const target = !reduced && to?.getBoundingClientRect()

  el.style.pointerEvents = "none"
  if (typeof el.animate !== "function") return Promise.resolve()
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

function Toast({ item, dismiss, into, from }: { item: ToastItem; dismiss: () => void; into?: RefObject<Element | null>; from: "top" | "bottom" }) {
  const [held, setHeld] = useState(false)
  const self = useRef<HTMLLIElement>(null)
  const going = useRef(false)
  const gone = useRef(dismiss)
  // Timed out or dismissed: into its place where there is one, and then gone.
  const away = () => {
    if (going.current) return
    going.current = true
    if (!self.current || !into) return gone.current()
    void leave(self.current, into.current).then(
      () => gone.current(),
      () => gone.current()
    )
  }
  const later = useRef(away)

  gone.current = dismiss
  later.current = away
  useEffect(() => {
    if (held) return

    const timer = setTimeout(() => later.current(), TOAST_MS)

    return () => clearTimeout(timer)
  }, [held])

  const body = (
    <>
      <span className="truncate font-medium text-foreground">{item.title}</span>
      <span className="line-clamp-2 text-muted-foreground">{item.text}</span>
      {item.meta && <span className="truncate text-meta text-muted-foreground">{item.meta}</span>}
    </>
  )

  return (
    <li
      ref={self}
      role="status"
      className={cn("pointer-events-auto relative w-full rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-200 animate-in fade-in-0 motion-reduce:animate-none", from === "top" ? "slide-in-from-top-2" : "slide-in-from-bottom-2")}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {item.onSelect ? (
        <button
          type="button"
          className="flex w-full cursor-pointer flex-col gap-0.5 rounded-lg py-2 pr-8 pl-3 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            item.onSelect!()
            dismiss()
          }}
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-col gap-0.5 py-2 pr-8 pl-3">{body}</div>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute top-1.5 right-1.5 grid size-5 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3"
        onClick={away}
      >
        <XIcon aria-hidden />
      </button>
    </li>
  )
}

/**
 * The stack, placed by `className`; `dismiss` takes a toast away by its id, once it is gone. `into` is where a passed toast
 * goes, such as the button that keeps them; a toast acted on goes at once, since it was seen. `from` is the edge the
 * stack stands at, where a new toast comes in: the bottom, or the top, newest first.
 */
export function Toasts({
  toasts,
  dismiss,
  className,
  into,
  from = "bottom",
}: {
  toasts: ToastItem[]
  dismiss: (id: number) => void
  className?: string
  into?: RefObject<Element | null>
  from?: "top" | "bottom"
}) {
  if (!toasts.length) return null

  return (
    <ol aria-label="Notices" className={cn("pointer-events-none fixed z-50 flex w-[min(22rem,calc(100vw-16px))] gap-1.5 text-xs", from === "top" ? "flex-col-reverse" : "flex-col", className)}>
      {toasts.map((item) => (
        <Toast key={item.id} item={item} from={from} dismiss={() => dismiss(item.id)} {...(into && { into })} />
      ))}
    </ol>
  )
}
