// Toasts: a small stack of passing lines, newest at the bottom, each gone after a while unless hovered. A toast with an
// action is a button that does it and goes; any toast can be dismissed. What a toast says is the caller's.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"

export type ToastItem = { id: number; title: ReactNode; text: ReactNode; meta?: ReactNode; onSelect?: () => void }

/** How long a toast stays when nobody holds it. */
export const TOAST_MS = 6000

function Toast({ item, dismiss }: { item: ToastItem; dismiss: () => void }) {
  const [held, setHeld] = useState(false)
  const gone = useRef(dismiss)

  gone.current = dismiss
  useEffect(() => {
    if (held) return

    const timer = setTimeout(() => gone.current(), TOAST_MS)

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
      role="status"
      className="pointer-events-auto relative w-full rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
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
        onClick={dismiss}
      >
        <XIcon aria-hidden />
      </button>
    </li>
  )
}

/** The stack, placed by `className`; `dismiss` takes a toast away by its id. */
export function Toasts({ toasts, dismiss, className }: { toasts: ToastItem[]; dismiss: (id: number) => void; className?: string }) {
  if (!toasts.length) return null

  return (
    <ol aria-label="Notices" className={cn("pointer-events-none fixed z-50 flex w-[min(22rem,calc(100vw-16px))] flex-col gap-1.5 text-xs", className)}>
      {toasts.map((item) => (
        <Toast key={item.id} item={item} dismiss={() => dismiss(item.id)} />
      ))}
    </ol>
  )
}
