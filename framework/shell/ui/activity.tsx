// The activity drawer's parts (notifications.tsx holds them together): a channel as the list shows it, two lines beside
// its surface's icon; what the agent sees next, one item that opens in place into the person's waiting calls; a line of a
// channel's history; and the keys that move through them. Hierarchy is type and colour alone, as everywhere in the drawer.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { cn } from "../../kit/cn.ts"
import { AppWindowIcon, BotIcon, ChevronRightIcon, CircleDotIcon, HouseIcon, UserRoundIcon } from "lucide-react"
import { agoOf, needLine, previewOf, SHELL, type Channel, type Row, type TabInfo, type Who } from "./channels.ts"

/** Who did it, in words, for a tooltip and a reader. */
export const BY: Record<Who, string> = { person: "by you", agent: "by the agent", surface: "by the surface" }
export const MARK: Record<Who, ReactNode> = { person: <UserRoundIcon />, agent: <BotIcon />, surface: <AppWindowIcon /> }
/** How long a line or a channel heard while the drawer is open stays lit. */
const LIT_MS = 1600
const ROW = "outline-none hover:bg-foreground/4 focus-visible:bg-foreground/6"

/** The small sign of who did it, or of what waits, before a line. */
export const Mark = ({ children, className, label }: { children: ReactNode; className?: string; label: string }) => (
  <span title={label} className={cn("flex size-3 shrink-0 items-center justify-center text-muted-foreground/70 [&_svg]:size-3", className)}>
    {children}
    <span className="sr-only">{label}</span>
  </span>
)

/** A channel's sign: its surface's icon on a quiet tile, the shell's house for its own, a neutral dot where a surface has none. */
export const ChannelIcon = ({ channel, icon, small = false }: { channel: Channel; icon: ReactNode; small?: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "grid shrink-0 place-items-center rounded-md bg-foreground/6 text-muted-foreground",
      small ? "size-5 [&_svg]:size-3" : "size-7 [&_svg]:size-3.5",
      channel.closed && "opacity-50"
    )}
  >
    {channel.key === SHELL ? <HouseIcon /> : (icon ?? <span className="size-1.5 rounded-full bg-foreground/30" />)}
  </span>
)

/** Lights `self` a moment each time `key` changes to something lit, unless motion is reduced. */
function useLit(self: RefObject<HTMLElement | null>, lit: boolean, key: unknown) {
  useLayoutEffect(() => {
    if (!lit || !self.current || typeof self.current.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    self.current.animate([{ backgroundColor: "color-mix(in oklab, var(--primary) 10%, transparent)" }, { backgroundColor: "transparent" }], {
      duration: LIT_MS,
      easing: "ease-out",
    })
  }, [lit, key])
}

const Ago = ({ when, className }: { when: string; className?: string }) => (
  <time dateTime={when} title={new Date(when).toLocaleString()} className={cn("shrink-0 text-meta text-muted-foreground/60 tabular-nums", className)}>
    {agoOf(new Date(when), new Date())}
  </time>
)

/**
 * A channel in the list: its icon; its name, medium where it holds something unseen, and when its last message was; then
 * what its tab needs of the person, or a preview of its latest message, and the unseen count with its dot.
 */
export function ChannelItem({ channel, icon, lit, enter }: { channel: Channel; icon: ReactNode; lit: boolean; enter: () => void }) {
  const self = useRef<HTMLDivElement>(null)
  const latest = channel.rows[0]
  const preview = latest && previewOf(latest)
  const said = [
    channel.name,
    channel.closed && "closed",
    channel.need && `needs you: ${needLine(channel.need.why)}`,
    channel.unseen > 0 && `${channel.unseen} new`,
    preview && `${preview.by ? `${preview.by}: ` : ""}${preview.text}`,
  ]
    .filter(Boolean)
    .join(", ")

  useLit(self, lit, latest?.n)

  return (
    <div
      ref={self}
      data-line
      data-channel={channel.key}
      role="button"
      tabIndex={-1}
      aria-label={said}
      className={cn("flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2", ROW)}
      onClick={enter}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowRight") {
          e.preventDefault()
          enter()
        }
      }}
    >
      <ChannelIcon channel={channel} icon={icon} />
      <span aria-hidden className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 truncate", channel.closed ? "text-muted-foreground" : "text-foreground", channel.unseen > 0 && "font-medium")}>{channel.name}</span>
          {channel.closed && <span className="shrink-0 text-meta text-muted-foreground/60">closed</span>}
          {latest && <Ago when={latest.when} className="ml-auto" />}
        </span>
        <span className="flex items-center gap-2">
          {channel.need ? (
            <span className="flex min-w-0 items-center gap-1 text-foreground/85">
              <CircleDotIcon className="size-3 shrink-0 text-primary" />
              <span className="truncate">{needLine(channel.need.why)}</span>
            </span>
          ) : preview ? (
            <span className="min-w-0 truncate text-muted-foreground">
              {preview.by && <span className="text-muted-foreground/70">{preview.by}: </span>}
              <span className={cn(latest!.kind === "call" && "font-mono text-muted-foreground/70")}>{preview.text}</span>
            </span>
          ) : null}
          {channel.unseen > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-muted-foreground tabular-nums">
              {channel.unseen > 1 && channel.unseen}
              <span className="size-1.5 rounded-full bg-primary" />
            </span>
          )}
        </span>
      </span>
    </div>
  )
}

/** What a line is, cut to one until it is opened: `cut` tells whether opening it would show more. */
function useCut() {
  const text = useRef<HTMLSpanElement>(null)

  return { text, cut: () => !!text.current && text.current.scrollWidth > text.current.clientWidth }
}

/**
 * What the agent sees next: one item, collapsed, its count and when; opened, the person's calls that wait for the agent's
 * next turn, newest first, each one line, what, where and how long ago, that opens to its whole.
 */
export function NextTurn({ rows, tabs, open, toggle }: { rows: Row[]; tabs: TabInfo[]; open: boolean; toggle: () => void }) {
  const [whole, setWhole] = useState<number>()

  return (
    <section aria-label="The agent sees next" className="border-b border-border/60 pb-1">
      <div
        data-line
        role="button"
        tabIndex={-1}
        aria-expanded={open}
        className={cn("flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2", ROW)}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || (e.key === "ArrowRight" && !open) || (e.key === "ArrowLeft" && open)) {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <span aria-hidden className="grid size-7 shrink-0 place-items-center text-muted-foreground">
          <ChevronRightIcon className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-foreground">
            The agent sees next <span className="text-muted-foreground tabular-nums">· {rows.length}</span>
          </span>
          <span className="truncate text-muted-foreground/70">with your next message</span>
        </span>
      </div>
      {open && (
        <div role="list" aria-label="Waiting for the agent" className="pb-1 pl-9">
          {rows.map((row) => {
            const place = row.tab ? (tabs.find((t) => t.at === row.tab)?.label ?? row.surface) : row.surface

            return (
              <div role="listitem" key={row.n}>
                <HistoryLine row={row} place={place} fresh={false} lit={false} open={whole === row.n} toggle={() => setWhole((n) => (n === row.n ? undefined : row.n))} />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Where a line is within its tab, a quiet token that goes there; plain where it cannot be gone to. */
function Place({ name, go }: { name: string; go?: () => void }) {
  if (!go) return <span className="max-w-28 shrink-0 truncate text-meta text-muted-foreground/50">{name}</span>

  return (
    <button
      type="button"
      tabIndex={-1}
      title={`Go to ${name}`}
      className="max-w-28 shrink-0 cursor-pointer truncate text-meta text-muted-foreground/70 outline-none hover:text-foreground hover:underline hover:underline-offset-2"
      onClick={(e) => {
        e.stopPropagation()
        go()
      }}
    >
      {name}
    </button>
  )
}

/**
 * One line of a history: who, what, where where it is more specific than the channel, and when, on one line until it is
 * opened whole by Enter, Space or a click; `fresh` dots it, `lit` lights it as it arrives.
 */
export function HistoryLine({
  row,
  place,
  go,
  fresh,
  lit,
  open,
  toggle,
}: {
  row: Row
  place?: string
  go?: () => void
  fresh: boolean
  lit: boolean
  open: boolean
  toggle: () => void
}) {
  const self = useRef<HTMLDivElement>(null)
  const { text, cut } = useCut()

  useLit(self, lit, row.n)

  return (
    <div
      ref={self}
      data-line
      tabIndex={-1}
      aria-expanded={open}
      className={cn("relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-sm px-2", ROW, open ? "py-1.5" : "h-7")}
      onClick={() => (open || cut() ? toggle() : go?.())}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          toggle()
        }
      }}
    >
      <span aria-hidden className={cn("absolute left-0.5 size-1 rounded-full", fresh ? "bg-primary" : "bg-transparent", open ? "top-3" : "top-1/2 -translate-y-1/2")} />
      <Mark label={BY[row.who]} className={open ? "mt-0.5 self-start" : undefined}>
        {MARK[row.who]}
      </Mark>
      <span
        ref={text}
        className={cn(
          "min-w-0 flex-1",
          open ? "break-words whitespace-normal" : "truncate",
          row.kind === "call" ? "font-mono text-muted-foreground/60" : fresh ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {fresh && <span className="sr-only">New: </span>}
        {row.what}
      </span>
      <span className={cn("flex shrink-0 items-center gap-2", open && "self-start")}>
        {place && <Place name={place} {...(go && { go })} />}
        <Ago when={row.when} className="w-10 text-right" />
      </span>
    </div>
  )
}

export const Heading = ({ children }: { children: ReactNode }) => <div className="px-2 pt-3 pb-1 text-meta font-medium text-muted-foreground/70">{children}</div>

/** The arrow keys move through the lines, Home and End to either end. */
export function moveIn(e: KeyboardEvent<HTMLElement>) {
  const lines = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-line]")]
  const at = lines.indexOf(document.activeElement as HTMLElement)
  const to = { ArrowDown: at + 1, ArrowUp: at < 0 ? lines.length - 1 : at - 1, Home: 0, End: lines.length - 1 }[e.key]

  if (to === undefined || !lines.length) return
  e.preventDefault()
  lines[Math.max(0, Math.min(lines.length - 1, to))]!.focus()
}

/** Tab stays within the drawer while it is open, round from its last stop to its first. */
export function keepFocus(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return

  const stops = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([tabindex='-1']), [data-lines]")]
  const first = stops[0]
  const last = stops.at(-1)

  if (!first || !last) return
  if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
