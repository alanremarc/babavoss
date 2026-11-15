// The strip, the page's header: home, the babavoss mark, then the open tabs as pills that scroll when they overflow, and
// at its right what the shell puts there; and a tab's panel. A tab is the home of one instance of a surface, with its own
// state. A pill is its icon and its title; over it, or focused, the icon gives way to dots that open the tab's menu, as a
// right click or the context-menu key does. A pill is marked by what stands in its tab: broken, plainly; something that
// waits on the person, by one dot: needing them, an ask, a notice they have not seen, or a tab the agent opened that they
// have not looked at; needing the agent, quietly; and why, as its tooltip. At its right stands what is the session's.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { MenuDropdown } from "../../kit/layouts/menu.tsx"
import { tabScrollOffset } from "./tab-scroll"

const contentId = (key: string) => `content-${key.replaceAll("/", "-")}`
const tabId = (key: string) => `tab-${key.replaceAll("/", "-")}`
const fadeEnd = "mask-r-from-[calc(100%-32px)]"

/** Who a tab needs, and why. */
export type TabNeed = { who: "person" | "agent"; why: string }
/**
 * A pill: `waits` where an ask or a notice in it waits on the person; `menu` the tab's menu, made as it opens and given
 * the way to close it; `onClose` closes the tab, as a middle click does.
 */
type TabItem = {
  id: string
  label: string
  icon: ReactNode
  unseen?: boolean
  waits?: boolean
  needs?: TabNeed[]
  broken?: string
  menu?: (close: () => void) => ReactNode
  onClose?: () => void
}

/** What the pill says beyond its label, one line each: why it is broken, who it needs and why. */
export const standing = ({ needs = [], broken }: Pick<TabItem, "needs" | "broken">): string[] => [
  ...(broken !== undefined ? [`Broken: ${broken}`] : []),
  ...needs.map((n) => `${n.who === "person" ? "Needs you" : "Needs the agent"}: ${n.why}`),
]
/** The mark in the pill's corner, the strongest first: broken; the one dot of what waits on the person; needing the agent. */
const MARK = {
  broken: "size-2 bg-destructive",
  person: "size-1.5 bg-primary",
  agent: "size-1.5 bg-muted-foreground/70",
}
export const markOf = ({ needs = [], broken, unseen, waits }: Pick<TabItem, "needs" | "broken" | "unseen" | "waits">): keyof typeof MARK | undefined =>
  broken !== undefined ? "broken" : waits || unseen || needs.some((n) => n.who === "person") ? "person" : needs.length ? "agent" : undefined

const pillMotion = "transition-[scale,opacity] duration-[200ms,100ms] ease-[cubic-bezier(.3,1.6,.4,1),ease] motion-reduce:transition-none"

/** What opens a tab's menu from the keyboard, on the tab: the context-menu key, or Shift+F10. */
export const opensMenu = (e: { key: string; shiftKey: boolean }) => e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)

function Tab({
  label,
  icon,
  unseen,
  waits,
  needs,
  broken,
  menu,
  active,
  focusable,
  id,
  onSelect,
  onClose,
}: { active: boolean; focusable: boolean; onSelect: () => void } & TabItem) {
  const mark = markOf({ needs, broken, unseen, waits })
  const [open, setOpen] = useState(false)
  const tab = useRef<HTMLButtonElement>(null)
  const said = standing({ needs, broken })
  const labelRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)
  const [engaged, setEngaged] = useState(false)

  useLayoutEffect(() => {
    const viewport = labelRef.current!
    const text = contentRef.current!
    const measure = () => setDistance(Math.max(0, text.offsetWidth - viewport.clientWidth))
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(viewport)
    observer.observe(text)

    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const text = textRef.current!
    const preference = matchMedia("(prefers-reduced-motion: reduce)")
    let frame: number | undefined
    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      text.style.transform = "translateX(0)"
    }
    const sync = () => {
      stop()
      if (!engaged || distance <= 1 || preference.matches) return

      const began = performance.now()
      const tick = (now: number) => {
        text.style.transform = `translateX(-${tabScrollOffset(now - began - 100, contentRef.current!.offsetWidth)}px)`
        frame = requestAnimationFrame(tick)
      }

      frame = requestAnimationFrame(tick)
    }

    sync()
    preference.addEventListener("change", sync)

    return () => {
      preference.removeEventListener("change", sync)
      stop()
    }
  }, [distance, engaged])

  return (
    <div
      data-slot="pill"
      className={cn(
        "group/pill relative flex h-7 min-w-0 shrink-0 items-center rounded-full text-muted-foreground hover:bg-foreground/6 hover:text-foreground has-focus-visible:not-data-[active]:bg-foreground/6 has-focus-visible:text-foreground data-[active]:bg-foreground/11 data-[active]:text-foreground [&_svg:not([class*='size-'])]:size-3.5",
        unseen && "animate-in duration-300 fade-in-0 zoom-in-90 motion-reduce:animate-none",
        open && "bg-foreground/6 text-foreground"
      )}
      data-active={active || undefined}
      data-menu={open || undefined}
      // A right click anywhere on the tab opens its menu, once the click itself is over, so nothing of it closes the menu again.
      onContextMenu={(e) => {
        if (!menu) return
        e.preventDefault()
        e.stopPropagation()
        requestAnimationFrame(() => setOpen(true))
      }}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={(event) => {
        setEngaged(!!event.currentTarget.querySelector(":focus-visible"))
      }}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setEngaged(true)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setEngaged(event.currentTarget.matches(":hover"))
      }}
      onMouseDown={(e) => {
        if (onClose && e.button === 1) e.preventDefault()
      }}
      onAuxClick={(e) => {
        if (onClose && e.button === 1) {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <button
        type="button"
        role="tab"
        id={tabId(id)}
        aria-selected={active}
        aria-controls={contentId(id)}
        ref={tab}
        tabIndex={focusable ? 0 : -1}
        onKeyDown={(e) => {
          if (!menu || !opensMenu(e)) return
          e.preventDefault()
          setOpen(true)
        }}
        className="relative flex h-full max-w-48 min-w-0 cursor-pointer items-center rounded-full pr-2.5 pl-[3px] outline-none"
        onClick={onSelect}
        title={[label, ...said].join("\n")}
        aria-label={[unseen ? `${label}, new` : label, ...said].join(". ")}
      >
        <span
          ref={labelRef}
          data-slot="tab-label"
          className={cn("block min-w-0 overflow-clip mask-l-from-[calc(100%-25px)] mask-l-to-[calc(100%-22px)] whitespace-nowrap", distance > 1 && fadeEnd)}
        >
          <span ref={textRef} data-slot="tab-text" className="flex w-max">
            <span ref={contentRef} className="block pl-[25px]">
              {label}
            </span>
            <span aria-hidden="true" className={cn("pl-[25px]", distance > 1 ? "block" : "hidden")}>
              {label}
            </span>
          </span>
        </span>
        <span
          data-slot="pill-icon"
          className={cn(
            "pointer-events-none absolute left-[3px] grid size-[22px] place-items-center",
            pillMotion,
            menu &&
              "group-hover/pill:scale-50 group-hover/pill:opacity-0 group-has-[:focus-visible]/pill:scale-50 group-has-[:focus-visible]/pill:opacity-0 group-data-[menu]/pill:scale-50 group-data-[menu]/pill:opacity-0 [@media(hover:none)]:opacity-0"
          )}
        >
          {icon}
        </span>
        {/* The mark stands still over whichever is shown, the icon or the caret. */}
        {mark && (
          <span aria-hidden className="pointer-events-none absolute top-[3px] left-[3px] size-[22px]">
            <span data-mark={mark} className={cn("absolute top-0 right-0 rounded-full ring-2 ring-sidebar", MARK[mark])} />
          </span>
        )}
      </button>
      {menu && (
        <MenuDropdown
          open={open}
          setOpen={setOpen}
          label={`Menu for ${label}`}
          // The menu hangs from the strip: its top square and with no line of its own, starting on the pixel under the
          // strip's lower border, which is its top edge; its left on the tab's. The caret's foot is 11.5px above that.
          sideOffset={11.5}
          alignOffset={-3}
          className="rounded-t-none border border-t-0 border-foreground/10 ring-0"
          // Focus goes back to the tab, unless what was chosen opened a modal, which keeps it.
          closed={() => {
            if (!document.querySelector('[role="dialog"]:not([data-slot="sheet-content"])')) tab.current?.focus()
          }}
          trigger={
            <button
              type="button"
              className={cn(
                "pointer-events-none absolute top-[3px] left-[3px] grid size-[22px] scale-50 cursor-pointer place-items-center rounded-full text-foreground opacity-0 outline-none group-hover/pill:pointer-events-auto group-hover/pill:scale-100 group-hover/pill:opacity-100 group-has-[:focus-visible]/pill:pointer-events-auto group-has-[:focus-visible]/pill:scale-100 group-has-[:focus-visible]/pill:opacity-100 group-data-[menu]/pill:pointer-events-auto group-data-[menu]/pill:scale-100 group-data-[menu]/pill:opacity-100 hover:bg-foreground/11 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/11 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100",
                pillMotion
              )}
              tabIndex={-1}
              aria-label={`Menu for ${label}`}
            >
              <ChevronDownIcon aria-hidden className={cn("transition-[rotate] duration-200 ease-[cubic-bezier(.3,1.6,.4,1)] motion-reduce:transition-none", open && "rotate-180")} />
            </button>
          }
        >
          {open && menu(() => setOpen(false))}
        </MenuDropdown>
      )}
    </div>
  )
}

export function TabContent({ address, hidden, children }: { address: string; hidden: boolean; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col" hidden={hidden} role="tabpanel" id={contentId(address)} aria-labelledby={tabId(address)}>
      {children}
    </section>
  )
}

/** `end`: what stands at the strip's right, after the tabs, of the session rather than a tab: whose move it is, and the notifications. */
export function SurfaceTabs({ items, active, onSelect, home, end }: { items: TabItem[]; active: string; onSelect: (id: string) => void; home: ReactNode; end?: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useLayoutEffect(() => {
    const element = strip.current!

    const measure = () => setMore(element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || element.scrollWidth <= element.clientWidth) return

      const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(element).lineHeight) || 16 : event.deltaMode === 2 ? element.clientWidth : 1

      element.scrollLeft += (event.deltaX || event.deltaY) * unit
      event.preventDefault()
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(element.parentElement!)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    element.addEventListener("scroll", measure, { passive: true })
    element.parentElement!.addEventListener("wheel", wheel, { passive: false })

    return () => {
      observer.disconnect()
      element.removeEventListener("scroll", measure)
      element.parentElement!.removeEventListener("wheel", wheel)
    }
  })

  useLayoutEffect(() => {
    strip.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active, items.length])

  const moveTab = (event: KeyboardEvent) => {
    const buttons = [...strip.current!.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)

    if (current < 0) return

    const step = ({ Home: 0, End: -1, ArrowLeft: current - 1, ArrowRight: current + 1 } as Record<string, number | undefined>)[event.key]

    if (step === undefined) return

    const tab = buttons.at(step % buttons.length)!

    event.preventDefault()
    tab.click()
    tab.focus()
  }

  return (
    <nav aria-label="Tabs" className="flex h-11 shrink-0 items-center gap-1 border-b bg-sidebar px-2" onKeyDown={moveTab}>
      <div className="shrink-0">{home}</div>
      <div
        ref={strip}
        role="tablist"
        aria-label="Open tabs"
        className={cn("no-scrollbar flex h-full min-w-0 shrink items-center gap-1 overflow-x-auto overscroll-x-contain", more && fadeEnd)}
      >
        {items.map((item) => (
          <Tab key={item.id} {...item} active={active === item.id} focusable={active === item.id} onSelect={() => onSelect(item.id)} />
        ))}
      </div>
      {end && <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">{end}</div>}
    </nav>
  )
}
