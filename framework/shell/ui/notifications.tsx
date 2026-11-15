// The notifications: one button at the strip's right and the activity it pulls in from the right edge, under the strip and
// over the content, the same for every surface; Escape, the button or a press outside it closes it. Each notice heard while
// the activity is closed is a toast, once, one line: who did it, what happened, and its surface; clicking it opens the
// activity on its channel. A toast that passes goes into the button, which carries one dot while the person has not seen
// something, and the count of their calls that wait for the agent. What they have seen is the shell's, at
// /activity/notices, so a refresh or a page opened later counts from the log, and no old toast is shown again; the shell
// reads the notices once, for the tabs they dot too. While the activity is open no toast is shown: a toast on screen
// leaves into it, and a notice heard comes in on its channel, lit a moment.
//
// The activity has two levels. The first is what the agent sees next, one item that opens in place, and the channels, as a
// messaging app lists its conversations (channels.ts): one a tab, two lines beside its surface's icon, its name and when it
// last said something, then a preview of that or what the tab needs of the person; newest first, a tab that needs them
// pinned above. It lists the notices, what the surfaces chose to say; All adds every call. Choosing a channel goes to the
// second: its history, newest first, grouped by when, one line an entry that opens to its whole. Opening a channel sees
// its notices, and they stay dotted until it is left; Mark all seen sees them all. Escape, Backspace or the left arrow go
// back; Escape on the first level closes.
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { cn } from "../../kit/cn.ts"
import { ArrowUpRightIcon, ChevronLeftIcon, CircleDotIcon, LogsIcon } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "../../kit/components/sheet"
import { Toasts, type ToastItem } from "../../kit/components/toast"
import { BY, ChannelIcon, ChannelItem, Heading, HistoryLine, keepFocus, MARK, Mark, moveIn, NextTurn } from "./activity.tsx"
import { arrived, channelOf, channelsOf, groupsOf, levelKey, needLine, placeIn, SHELL, tabIn, type Channel, type Need, type Row, type TabInfo, type Who } from "./channels.ts"
import { call, read, type Notice } from "./client.ts"

/** What the activity lists: the notices, or all activity. */
export type Shown = "notices" | "all"
/** A page of /activity: its entries, the page before, and for the person how many and which notices they have not seen. */
export type Page = { entries: Row[] | string; earlier?: { at: string }; unseen?: number; fresh?: number[] }
type Stream<T = void> = { subscribe: (fn: (value: T) => void) => () => void }
/** The channel the second level shows: its key, the notices unseen as it was entered, and the newest entry then. */
export type Entered = { key: string; stay: ReadonlySet<number>; since: number }

export const NOTICES = "/activity/notices"
const ALL = "/activity"
const SHOWN: { value: Shown; label: string }[] = [
  { value: "notices", label: "Notices" },
  { value: "all", label: "All" },
]
const THROTTLE_MS = 400
/** The most toasts shown at once; an older one goes first. */
const TOASTS = 4

/** The rows the activity lists: the notices, or all activity. */
export const inView = (rows: Row[], shown: Shown): Row[] => (shown === "notices" ? rows.filter((r) => r.kind !== "call") : rows)

/** What waits on the person: the tabs that need them, not the agent. */
export const needsOf = (needs: Need[]): Need[] => needs.filter((n) => n.who === "person")

/** The count the button shows: what the shell counts unseen, less the toasts still showing, which count once they go into it. */
export const badgeOf = (unseen: number, showing: number, open: boolean): number => (open ? 0 : Math.max(0, unseen - showing))

/** The notices the person has not seen, of the rows kept: those the shell names, by number. */
export const unseenRows = (rows: Row[], fresh: readonly number[]): Row[] => rows.filter((r) => fresh.includes(r.n))

/**
 * The person's latest calls, as many as the agent has not been told of: what it is told with their next message, newest
 * first; a call that gave a notice is that notice. Read from all activity, where every row has its kind.
 */
export const waitingRows = (rows: Row[], waiting: number): Row[] => rows.filter((r) => r.who === "person" && r.kind !== undefined).slice(0, Math.max(0, waiting))

/** The toasts after a notice is heard: none added while the activity is open, which shows it on its channel; else the newest few. */
export const toastsAfter = <T,>(toasts: T[], toast: T, open: boolean): T[] => (open ? toasts : [...toasts, toast].slice(-TOASTS))

/** Who caused a notice heard, from its `by`: absent where the person did, "the surface" where it did it by itself. */
export const whoBy = (by: string | undefined): Who => (by === undefined ? "person" : by === "the surface" ? "surface" : "agent")

/** One feed of rows at `path`, newest first, read again on every change while `live`, and further back on asking; `served` what the page was served there, so it is not read at first. */
export function useFeed(path: string, changes: Stream, live: boolean, served?: Page) {
  const [rows, setRows] = useState<Row[]>(() => (Array.isArray(served?.entries) ? served.entries : []))
  const [earlier, setEarlier] = useState<string | undefined>(served?.earlier?.at)
  const [unseen, setUnseen] = useState(served?.unseen ?? 0)
  const [fresh, setFresh] = useState<number[]>(served?.fresh ?? [])
  const first = useRef(served !== undefined)
  const older = useRef<Row[]>([])
  const load = useCallback(async () => {
    const page = await read<Page>(path).catch(() => undefined)

    if (!page) return

    const latest = Array.isArray(page.entries) ? page.entries : []
    const oldest = latest.at(-1)?.n ?? Infinity
    const kept = older.current.filter((r) => r.n < oldest)

    setRows([...latest, ...kept])
    setUnseen(page.unseen ?? 0)
    setFresh(page.fresh ?? [])
    if (!kept.length) setEarlier(page.earlier?.at)
  }, [path])
  const more = async () => {
    if (!earlier) return

    const page = await read<Page>(earlier).catch(() => undefined)

    if (!page) return
    older.current = [...older.current, ...(Array.isArray(page.entries) ? page.entries : [])]
    setRows((all) => [...all, ...older.current.filter((r) => !all.some((a) => a.n === r.n))])
    setEarlier(page.earlier?.at)
  }

  useEffect(() => {
    if (!live) return

    let timer: ReturnType<typeof setTimeout> | undefined

    if (!first.current) void load()
    first.current = false

    const off = changes.subscribe(() => {
      timer ??= setTimeout(() => {
        timer = undefined
        void load()
      }, THROTTLE_MS)
    })

    return () => {
      off()
      clearTimeout(timer)
    }
  }, [changes, load, live])

  return { rows, earlier, unseen, fresh, more, load }
}

/** The notices as the shell reads them once, for the drawer and for the tabs they dot. */
export type Feed = ReturnType<typeof useFeed>

/** The tabs that need the person, read from / on every change while `live`. */
function useNeeds(changes: Stream, live: boolean): Need[] {
  const [needs, setNeeds] = useState<Need[]>([])

  useEffect(() => {
    if (!live) return

    const load = () => void read<{ needs?: Need[] }>("/").then((root) => setNeeds(needsOf(root.needs ?? [])), () => undefined)

    load()

    return changes.subscribe(load)
  }, [changes, live])

  return needs
}

const QUIET = "cursor-pointer text-meta text-muted-foreground/70 outline-none hover:text-foreground focus-visible:underline focus-visible:underline-offset-4"

/** A notice as the shell hears it: from the stream, or a page's own toast, `kept: false`, which is in no log and returns to its place. */
export type Heard = Notice & { kept?: false }

/**
 * The button, its drawer and the toasts. `changes` tells of every change, `notices` of each notice as it is heard, `told`
 * is the feed of notices; `go` goes to a place, a tab and the route within it; `title` names the shell's own channel and a
 * toast whose notice names no surface; `tabs` are the open tabs and `icons` each surface's icon, the strip's.
 */
export function Notifications({
  changes,
  notices,
  told,
  go,
  title,
  tabs,
  icons,
  waiting = 0,
}: {
  changes: Stream
  notices: Stream<Heard>
  told: Feed
  go: (at: string) => void
  title: string
  tabs: TabInfo[]
  icons: Record<string, ReactNode | undefined>
  /** How many of the person's own calls the agent has not been told of yet: it is, with their next message. */
  waiting?: number
}) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<Shown>("notices")
  const [entered, setEntered] = useState<Entered>()
  const [nextOpen, setNextOpen] = useState(false)
  // Whether the list was come back to from a channel, which it slides in from the left for.
  const [backed, setBacked] = useState(false)
  const [expanded, setExpanded] = useState<number>()
  // The newest entry as the drawer opened: what arrives after it lights its channel.
  const [since, setSince] = useState(Infinity)
  const [toasts, setToasts] = useState<(ToastItem & { counts: boolean })[]>([])
  const button = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const lines = useRef<HTMLDivElement>(null)
  // Whether the drawer closes back to the button: by Escape, not by a press elsewhere or by going to a place.
  const back = useRef(false)
  // Where focus goes once a level is drawn: a channel's item on coming back, the history on going in.
  const focus = useRef<string>(undefined)
  const all = useFeed(ALL, changes, open && (shown === "all" || waiting > 0))
  const needs = useNeeds(changes, open)
  const isOpen = useRef(open)
  const looking = useRef(new Set<number>())
  const feed = shown === "all" ? all : told
  const rows = inView(feed.rows, shown)
  const fresh = new Set(told.fresh)
  // The title each tab had while the page saw it open, which names its channel once it is closed.
  const titles = useRef<Record<string, string>>({})

  for (const t of tabs) titles.current[t.at] = t.label

  const channels = channelsOf(rows, tabs, needs, fresh, title, titles.current)
  const channel = entered && (channels.find((c) => c.key === entered.key) ?? emptyChannel(entered.key, tabs, told.rows, title, titles.current))
  const next = waitingRows(all.rows, waiting)
  const newest = Math.max(told.rows[0]?.n ?? 0, all.rows[0]?.n ?? 0)

  isOpen.current = open

  // The channel shown is seen, its notices looked at one by one, and so is each that arrives while it is shown.
  useEffect(() => {
    if (!open || !entered) return

    const mine = told.rows.filter((r) => channelOf(r) === entered.key && told.fresh.includes(r.n) && !looking.current.has(r.n))

    if (!mine.length) return
    for (const r of mine) looking.current.add(r.n)
    void Promise.all(mine.map((r) => call(NOTICES, "looked", { n: r.n })))
      .then(() => told.load(), () => undefined)
      .finally(() => mine.forEach((r) => looking.current.delete(r.n)))
  }, [open, entered, told.rows, told.fresh])

  // Focus lands where the level just drawn asks.
  useEffect(() => {
    const to = focus.current

    if (to === undefined || !open) return
    focus.current = undefined
    requestAnimationFrame(() => {
      const item = to === "" ? null : lines.current?.querySelector<HTMLElement>(`[data-channel="${CSS.escape(to)}"]`)
      const target = item ?? lines.current

      target?.focus()
    })
  })

  const enter = (key: string) => {
    const stay = new Set(told.rows.filter((r) => channelOf(r) === key && told.fresh.includes(r.n)).map((r) => r.n))

    setEntered({ key, stay, since: newest })
    setExpanded(undefined)
    focus.current = ""
  }
  const leave = () => {
    if (!entered) return
    focus.current = entered.key
    setBacked(true)
    setEntered(undefined)
    setExpanded(undefined)
  }
  const toggle = (to: boolean, on?: string) => {
    if (to) {
      setSince(newest)
      setBacked(false)
      setExpanded(undefined)
      if (on !== undefined) enter(on)
    } else {
      setEntered(undefined)
      setNextOpen(false)
    }
    setOpen(to)
  }
  const heard = useRef<(notice: Heard) => void>(() => {})

  // A notice opens the activity on its channel, by its tab; while the drawer is open it comes in there, not as a toast.
  heard.current = (notice) => {
    const who = whoBy(notice.by)
    const toast = {
      id: Date.now() + Math.random(),
      text: notice.text,
      title: notice.from ?? title,
      mark: <Mark label={BY[who]}>{MARK[who]}</Mark>,
      counts: notice.by !== undefined && notice.kept !== false,
      onSelect: () => (notice.kept === false && notice.at ? go(notice.at) : toggle(true, tabIn(notice.at))),
    }

    setToasts((all) => toastsAfter(all, toast, isOpen.current))
  }
  useEffect(() => notices.subscribe((notice) => heard.current(notice)), [notices])

  const goTo = (at: string) => {
    back.current = false
    toggle(false)
    go(at)
  }
  const badge = badgeOf(told.unseen, toasts.filter((t) => t.counts).length, open)
  const elsewhere = !!entered && channels.some((c) => c.key !== entered.key && c.rows.some((r) => arrived(r, entered.since)))
  const seeAll = () => {
    const last = told.rows[0]?.n

    if (last) void call(NOTICES, "seen", { n: last }).then(() => told.load(), () => undefined)
  }

  return (
    <>
      <Toasts
        toasts={toasts}
        into={button}
        away={open}
        dismiss={(id) => setToasts((all) => all.filter((t) => t.id !== id))}
        className="top-13 right-2"
        from="top"
      />
      <ActivityButton ref={button} badge={badge} waiting={waiting} open={open} onClick={() => toggle(!open)} />
      <Sheet open={open} onOpenChange={(to) => toggle(to)}>
        <SheetContent
          ref={content}
          top="top-11"
          aria-label="Activity"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            if (focus.current === undefined) content.current?.focus()
          }}
          onEscapeKeyDown={(e) => {
            if (entered) {
              e.preventDefault()
              leave()
            } else back.current = true
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            if (back.current) button.current?.focus()
            back.current = false
          }}
          // The button toggles the drawer itself; a press on it is no press outside.
          onInteractOutside={(e) => {
            if (button.current?.contains(e.target as Node)) e.preventDefault()
          }}
          onKeyDown={(e) => {
            keepFocus(e)
            if (e.key !== "Escape" && levelKey(e.key, entered ? "channel" : "list") === "back") {
              e.preventDefault()
              leave()

              return
            }
            // From the drawer itself, as it opens focused, the arrows go into the lines.
            if (e.target === content.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault()
              lines.current?.querySelector<HTMLElement>("[data-line]")?.focus()
            }
          }}
        >
          <ActivityLevels
            lines={lines}
            {...(channel && { channel, entered: entered! })}
            icons={icons}
            elsewhere={elsewhere}
            leave={leave}
            goTo={goTo}
            expanded={expanded}
            expand={setExpanded}
            shown={shown}
            show={setShown}
            unseen={told.unseen}
            seeAll={seeAll}
            next={next}
            tabs={tabs}
            nextOpen={nextOpen}
            toggleNext={() => setNextOpen((o) => !o)}
            channels={channels}
            since={since}
            enter={enter}
            backed={backed}
            {...(feed.earlier && { more: () => void feed.more() })}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

/** The button at the strip's right: the count of the person's calls that wait for the agent, and one dot while `badge` counts something unseen. */
export function ActivityButton({
  ref,
  badge,
  waiting,
  open,
  onClick,
}: {
  ref?: RefObject<HTMLButtonElement | null>
  badge: number
  waiting: number
  open: boolean
  onClick: () => void
}) {
  const said = ["Activity", badge ? `${badge} new` : "", waiting ? `${waiting} of your changes wait for the agent's next turn` : ""].filter(Boolean).join(", ")

  return (
    <button
      ref={ref}
      type="button"
      aria-label={said}
      aria-expanded={open}
      title={said}
      data-state={open ? "open" : "closed"}
      data-notifications
      className="relative flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full px-1.5 text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/11 data-[state=open]:text-foreground"
      onClick={onClick}
    >
      <LogsIcon className="size-4" aria-hidden />
      {waiting > 0 && <span className="text-meta tabular-nums">{waiting > 9 ? "9+" : waiting}</span>}
      {badge > 0 && <span aria-hidden data-unseen={badge} className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-sidebar" />}
    </button>
  )
}

/**
 * What the drawer holds, at either level: the list, its header with Notices and All and Mark all seen, what the agent sees
 * next and the channels; or a `channel`, its header and its history. The drawer keeps where it stands; this draws it.
 */
export function ActivityLevels({
  lines,
  channel,
  entered,
  icons,
  elsewhere,
  leave,
  goTo,
  expanded,
  expand,
  shown,
  show,
  unseen,
  seeAll,
  next,
  tabs,
  nextOpen,
  toggleNext,
  channels,
  since,
  enter,
  backed,
  more,
}: {
  lines?: RefObject<HTMLDivElement | null>
  channel?: Channel
  entered?: Entered
  icons: Record<string, ReactNode | undefined>
  elsewhere: boolean
  leave: () => void
  goTo: (at: string) => void
  expanded: number | undefined
  expand: (n: number | undefined) => void
  shown: Shown
  show: (shown: Shown) => void
  unseen: number
  seeAll: () => void
  next: Row[]
  tabs: TabInfo[]
  nextOpen: boolean
  toggleNext: () => void
  channels: Channel[]
  since: number
  enter: (key: string) => void
  backed: boolean
  /** Reads further back, where there is more. */
  more?: () => void
}) {
  return (
    <>
      {channel ? (
        <ChannelHeader channel={channel} icon={channel.surface && icons[channel.surface]} elsewhere={elsewhere} back={leave} go={() => goTo(channel.key)} />
      ) : (
        <div className="flex h-9 shrink-0 items-center gap-3 px-3">
          <SheetTitle className="text-body font-medium">Activity</SheetTitle>
          <div role="tablist" aria-label="Show" className="flex items-center gap-2.5">
            {SHOWN.map((s) => (
              <button key={s.value} type="button" role="tab" aria-selected={shown === s.value} className={cn(QUIET, shown === s.value && "text-foreground")} onClick={() => show(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
          {unseen > 0 && (
            <button type="button" className={cn(QUIET, "ml-auto")} onClick={seeAll}>
              Mark all seen
            </button>
          )}
        </div>
      )}
      <div
        ref={lines}
        key={channel ? `in-${channel.key}` : "list"}
        data-lines
        role="list"
        aria-label={channel ? `${channel.name}, newest first` : "Channels"}
        tabIndex={0}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2 outline-none duration-150 animate-in fade-in-0 motion-reduce:animate-none",
          channel ? "slide-in-from-right-2" : backed && "slide-in-from-left-2"
        )}
        onKeyDown={moveIn}
      >
        {channel ? (
          <History channel={channel} entered={entered!} expanded={expanded} expand={expand} goTo={goTo} />
        ) : (
          <>
            {next.length > 0 && <NextTurn rows={next} tabs={tabs} open={nextOpen} toggle={toggleNext} />}
            {channels.map((c) => (
              <div role="listitem" key={c.key}>
                <ChannelItem channel={c} icon={c.surface && icons[c.surface]} lit={!!c.rows[0] && arrived(c.rows[0], since)} enter={() => enter(c.key)} />
              </div>
            ))}
            {!channels.length && <p className="px-3 py-6 text-center text-muted-foreground/70">{shown === "all" ? "Nothing has happened yet" : "Nothing new to say yet"}</p>}
          </>
        )}
        {more && (
          <button type="button" className={cn(QUIET, "mx-2 mt-2")} onClick={more}>
            Show earlier
          </button>
        )}
      </div>
    </>
  )
}

/** A channel the list no longer has, as when the lens leaves it empty: its name from its tab or its notices, with no rows. */
function emptyChannel(key: string, tabs: TabInfo[], rows: Row[], shell: string, titles: Record<string, string>): Channel {
  const tab = tabs.find((t) => t.at === key)
  const surface = key === SHELL ? undefined : (tab?.surface ?? rows.find((r) => channelOf(r) === key)?.surface)

  return { key, name: key === SHELL ? shell : (tab?.label ?? titles[key] ?? surface ?? key), ...(surface && { surface }), closed: key !== SHELL && !tab, rows: [], unseen: 0 }
}

/** The second level's header: back, with a dot where another channel heard something meanwhile; the channel; and the way to its tab. */
function ChannelHeader({ channel, icon, elsewhere, back, go }: { channel: Channel; icon: ReactNode; elsewhere: boolean; back: () => void; go: () => void }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 pr-3 pl-1.5">
      <button
        type="button"
        aria-label={elsewhere ? "Back to the channels, something new there" : "Back to the channels"}
        title="Back"
        className="relative grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={back}
      >
        <ChevronLeftIcon className="size-3.5" aria-hidden />
        {elsewhere && <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-popover" />}
      </button>
      <ChannelIcon channel={channel} icon={icon} small />
      <SheetTitle className="min-w-0 truncate text-body font-medium">{channel.name}</SheetTitle>
      {channel.closed && <span className="shrink-0 text-meta text-muted-foreground/60">closed</span>}
      {!channel.closed && channel.key !== SHELL && (
        <button type="button" className={cn(QUIET, "ml-auto flex shrink-0 items-center gap-0.5")} onClick={go}>
          Go to tab
          <ArrowUpRightIcon className="size-3" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** A channel's history: newest first, grouped by when; what was unseen as it was entered, and what arrives, dotted until it is left. */
function History({
  channel,
  entered,
  expanded,
  expand,
  goTo,
}: {
  channel: Channel
  entered: Entered
  expanded: number | undefined
  expand: (n: number | undefined) => void
  goTo: (at: string) => void
}) {
  const groups = groupsOf(channel.rows, new Date())
  const need = channel.need && (
    <div className="mx-1 mt-1 flex h-7 items-center gap-1.5 rounded-md bg-primary/6 px-2 text-foreground">
      <CircleDotIcon className="size-3 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 truncate">
        <span className="sr-only">Needs you: </span>
        {needLine(channel.need.why)}
      </span>
    </div>
  )

  if (!channel.rows.length)
    return (
      <>
        {need}
        <p className="px-3 py-6 text-center text-muted-foreground/70">Nothing said here yet</p>
      </>
    )

  return (
    <>
      {need}
      {groups.map((group) => (
    <section key={`${group.label}-${group.rows[0]!.n}`} aria-label={group.label}>
      <Heading>{group.label}</Heading>
      {group.rows.map((row) => {
        const place = placeIn(row, channel.key)
        const at = row.at

        return (
          <div role="listitem" key={row.n}>
            <HistoryLine
              row={row}
              {...(place && { place })}
              {...(place && at !== null && at !== SHELL && { go: () => goTo(at) })}
              fresh={entered.stay.has(row.n) || arrived(row, entered.since)}
              lit={arrived(row, entered.since)}
              open={expanded === row.n}
              toggle={() => expand(expanded === row.n ? undefined : row.n)}
            />
          </div>
        )
      })}
    </section>
      ))}
    </>
  )
}
