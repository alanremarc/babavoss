// The rail: the tabs at the side of the page the person chose, the mark first, home's tab, then the open tabs newest first
// (rail.ts orders them). At the left or right it is a column of round icons, a tab's title and why it is marked shown
// beside it on hover; along the top or bottom a row of pills, an icon and a title that slides on hover where it is cut.
// Either scrolls where there are more tabs than fit. A click shows a tab; a click on the tab shown, a right click, the
// context-menu key or Shift+F10 opens its drawer, and the same again closes it; a middle click closes the tab. While its
// drawer is open a tab's icon is three dots, swapped with a spring; on a row, hovering the icon swaps it too, and a click
// on it opens the drawer at once. The arrows move along the rail in its direction. A tab's mark is on its icon.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { EllipsisIcon } from "lucide-react"
import { cn } from "../../kit/cn.ts"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../kit/components/tooltip"
import type { Rail as Placed } from "../settings/src/settings.ts"
import { doesOf, MARK, onScreen, opensDrawer, stepOf, upright, type Gesture, type Mark } from "./rail.ts"
import { tabScrollOffset } from "./tab-scroll.ts"

/** A tab's button, by its address: what a drawer gives focus back to, and what a bubble stands beside. */
export const tabId = (key: string) => `tab-${key.replaceAll("/", "-")}`
/** The panel a tab's button shows. */
export const contentId = (key: string) => `content-${key.replaceAll("/", "-")}`

/**
 * An entry of the rail, the mark's or a tab's: `why` the lines under its title that say why it is marked; `fresh` where
 * the agent opened it and the person has not looked yet, which it arrives with; `close` where it can be closed.
 */
export type RailItem = { id: string; label: string; icon: ReactNode; mark?: Mark; why?: string[]; fresh?: boolean; close?: () => void }

const swap = "transition-[scale,opacity] duration-[200ms,100ms] ease-[cubic-bezier(.3,1.6,.4,1),ease] motion-reduce:transition-none"
const fadeEnd = (column: boolean) => (column ? "mask-b-from-[calc(100%-24px)]" : "mask-r-from-[calc(100%-32px)]")

/**
 * The rail. `mark` is home's tab, its icon the babavoss mark; `tabs` the open tabs, newest first; `drawer` the entry whose
 * drawer is open; `select` shows one, `toggle` opens or closes its drawer.
 */
export function Rail({
  placed,
  mark,
  tabs,
  active,
  drawer,
  select,
  toggle,
}: {
  placed: Placed
  mark: RailItem
  tabs: RailItem[]
  active: string
  drawer?: string
  select: (id: string) => void
  toggle: (id: string) => void
}) {
  const column = upright(placed)
  const list = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const items = onScreen(mark, tabs, placed)

  // Where the tabs overflow, the far end fades; a wheel scrolls a row sideways.
  useLayoutEffect(() => {
    const element = list.current!
    const measure = () =>
      setMore(column ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
    const wheel = (event: WheelEvent) => {
      if (column || event.ctrlKey || event.metaKey || element.scrollWidth <= element.clientWidth) return

      const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(element).lineHeight) || 16 : event.deltaMode === 2 ? element.clientWidth : 1

      element.scrollLeft += (event.deltaX || event.deltaY) * unit
      event.preventDefault()
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    element.addEventListener("scroll", measure, { passive: true })
    element.addEventListener("wheel", wheel, { passive: false })

    return () => {
      observer.disconnect()
      element.removeEventListener("scroll", measure)
      element.removeEventListener("wheel", wheel)
    }
  })

  // The tab shown is kept in view, as is one just opened: the rail scrolls, never what holds it.
  useLayoutEffect(() => {
    const element = list.current
    const shown = element?.querySelector('[aria-selected="true"]')

    if (!element || !shown) return

    const a = shown.getBoundingClientRect()
    const b = element.getBoundingClientRect()

    if (column) element.scrollTop += a.top < b.top ? a.top - b.top : a.bottom > b.bottom ? a.bottom - b.bottom : 0
    else element.scrollLeft += a.left < b.left ? a.left - b.left : a.right > b.right ? a.right - b.right : 0
  }, [active, tabs.length, column])

  const keys = (event: KeyboardEvent) => {
    const buttons = [...list.current!.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = at < 0 ? undefined : stepOf(event.key, placed)

    if (step === undefined) return

    const to = step === "first" ? 0 : step === "last" ? buttons.length - 1 : (at + step + buttons.length) % buttons.length
    const target = items[to]!

    event.preventDefault()
    if (target.id !== active) select(target.id)
    buttons[to]!.focus()
  }

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <nav
        aria-label="Tabs"
        data-rail={placed.side}
        className={cn(
          "relative z-20 flex shrink-0 border-border bg-sidebar",
          column ? "w-11 flex-col" : "h-11 items-center",
          { left: "border-r", right: "border-l", top: "border-b", bottom: "border-t" }[placed.side]
        )}
      >
        <div
          ref={list}
          role="tablist"
          aria-label="Open tabs"
          aria-orientation={column ? "vertical" : "horizontal"}
          onKeyDown={keys}
          className={cn(
            "no-scrollbar flex min-h-0 min-w-0 flex-1 gap-1",
            column ? "flex-col items-center overflow-y-auto overscroll-y-contain py-1.5" : "h-full items-center overflow-x-auto overscroll-x-contain px-2",
            column && placed.from === "bottom" && "justify-end",
            more && fadeEnd(column)
          )}
        >
          {items.map((item) => (
            <Entry
              key={item.id}
              item={item}
              home={item.id === mark.id}
              column={column}
              side={placed.side}
              active={active === item.id}
              open={drawer === item.id}
              select={() => select(item.id)}
              toggle={() => toggle(item.id)}
            />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  )
}

/** One entry of the rail standing alone, as the guide shows the mark's or a tab's in a state. */
export function RailEntry(props: Parameters<typeof Entry>[0]) {
  return (
    <TooltipProvider delayDuration={200}>
      <div role="tablist" className="contents">
        <Entry {...props} />
      </div>
    </TooltipProvider>
  )
}

/** One entry of the rail: the mark's or a tab's button, its icon or the dots, its mark, and on a row its title. */
function Entry({
  item,
  home,
  column,
  side,
  active,
  open,
  select,
  toggle,
}: {
  item: RailItem
  home: boolean
  column: boolean
  side: Placed["side"]
  active: boolean
  open: boolean
  select: () => void
  toggle: () => void
}) {
  const said = item.why ?? []
  const act = (gesture: Gesture) => {
    for (const does of doesOf(gesture, { shown: active, open })) {
      if (does === "show") select()
      else if (does === "end") item.close?.()
      else toggle()
    }
  }
  const [hover, setHover] = useState(false)
  const [tip, setTip] = useState(false)
  const button = (
    <button
      type="button"
      role="tab"
      id={tabId(item.id)}
      data-rail-id={item.id}
      aria-selected={active}
      aria-controls={contentId(item.id)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={[item.fresh ? `${item.label}, new` : item.label, ...said].join(". ")}
      tabIndex={active ? 0 : -1}
      {...(!column && { title: [item.label, ...said].join("\n") })}
      data-active={active || undefined}
      data-open={open || undefined}
      className={cn(
        "group/tab relative flex shrink-0 cursor-pointer items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/6 focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-[active]:bg-foreground/11 data-[active]:text-foreground data-[open]:bg-foreground/11 data-[open]:text-foreground [&_svg:not([class*='size-'])]:size-3.5",
        column ? "size-8 justify-center" : home ? "size-7 justify-center" : "h-7 max-w-48 min-w-0 pr-2.5 pl-[3px]",
        item.fresh && "animate-in duration-300 fade-in-0 zoom-in-90 motion-reduce:animate-none",
        home && !active && !open && "not-hover:has-[[data-turn=working]]:bg-foreground/3"
      )}
      onClick={() => act("click")}
      // A right click shows the tab and opens its drawer, once the click itself is over.
      onContextMenu={(e) => {
        e.preventDefault()
        requestAnimationFrame(() => act("menu"))
      }}
      onKeyDown={(e) => {
        if (!opensDrawer(e)) return
        e.preventDefault()
        act("menu")
      }}
      // A middle click closes a tab; pressing it must not start the browser's scrolling.
      onMouseDown={(e) => item.close && e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => {
        if (!item.close || e.button !== 1) return
        e.preventDefault()
        act("middle")
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon open={open} cell={!column && !home} {...(!column && !home && { press: () => act("icon") })} home={home}>
        {item.icon}
      </Icon>
      {!column && !home && <Title label={item.label} engaged={hover} />}
      {item.mark && (
        <span aria-hidden className={cn("pointer-events-none absolute", column ? "top-[5px] right-[5px]" : "top-[3px] left-[3px] size-[22px]")}>
          <span data-mark={item.mark} className={cn("absolute top-0 right-0 rounded-full ring-2 ring-sidebar", MARK[item.mark])} />
        </span>
      )}
    </button>
  )

  if (!column) return button

  return (
    <Tooltip open={tip && !open} onOpenChange={setTip}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={side === "left" ? "right" : "left"} sideOffset={8} className="flex max-w-72 flex-col gap-0.5 px-2 py-1.5 text-body">
        <span className="text-foreground">{item.label}</span>
        {said.map((line) => (
          <span key={line} className="text-meta text-muted-foreground">
            {line}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * An entry's icon, which gives way to three dots while its drawer is open. `press`, on a row's pill: the icon is a control
 * of its own, hovering it shows the dots and a click on it opens the drawer, whether or not the tab is shown.
 */
function Icon({ open, press, cell, home, children }: { open: boolean; press?: () => void; cell: boolean; home: boolean; children: ReactNode }) {
  return (
    <span
      data-slot="rail-icon"
      className={cn("relative grid shrink-0 place-items-center", cell && "group/icon size-[22px] rounded-full hover:bg-foreground/11", home && "size-full")}
      {...(press && {
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          press()
        },
      })}
    >
      <span className={cn("col-start-1 row-start-1 grid place-items-center", swap, open ? "scale-50 opacity-0" : press && "group-hover/icon:scale-50 group-hover/icon:opacity-0")}>
        {children}
      </span>
      <span
        aria-hidden
        className={cn(
          "col-start-1 row-start-1 grid place-items-center text-foreground [&_svg]:size-3.5",
          swap,
          !open && "scale-50 opacity-0",
          !open && press && "group-hover/icon:scale-100 group-hover/icon:opacity-100"
        )}
      >
        <EllipsisIcon />
      </span>
    </span>
  )
}

/** A pill's title, which slides to show the rest of itself while the pill is hovered, where it is cut; still where motion is reduced. */
function Title({ label, engaged }: { label: string; engaged: boolean }) {
  const viewport = useRef<HTMLSpanElement>(null)
  const moving = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)

  useLayoutEffect(() => {
    const measure = () => setDistance(Math.max(0, content.current!.offsetWidth - viewport.current!.clientWidth))
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(viewport.current!)
    observer.observe(content.current!)

    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const text = moving.current!
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    let frame: number | undefined
    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      text.style.transform = "translateX(0)"
    }
    const sync = () => {
      stop()
      if (!engaged || distance <= 1 || reduced.matches) return

      const began = performance.now()
      const tick = (now: number) => {
        text.style.transform = `translateX(-${tabScrollOffset(now - began - 100, content.current!.offsetWidth)}px)`
        frame = requestAnimationFrame(tick)
      }

      frame = requestAnimationFrame(tick)
    }

    sync()
    reduced.addEventListener("change", sync)

    return () => {
      reduced.removeEventListener("change", sync)
      stop()
    }
  }, [distance, engaged])

  return (
    <span ref={viewport} data-slot="tab-label" className={cn("block min-w-0 overflow-clip pl-[3px] whitespace-nowrap", distance > 1 && "mask-r-from-[calc(100%-24px)]")}>
      <span ref={moving} className="flex w-max">
        {/* The gap before the copy that follows is part of the text while it slides, so it comes round evenly. */}
        <span ref={content} className={cn("block", distance > 1 && "pr-6")}>
          {label}
        </span>
        <span aria-hidden="true" className={cn("pr-6", distance > 1 ? "block" : "hidden")}>
          {label}
        </span>
      </span>
    </span>
  )
}
