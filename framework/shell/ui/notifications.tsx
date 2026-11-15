// The notifications: one button at the strip's right and the activity log it pulls in from the right edge, under the strip
// and over the content, the same for every surface; Escape, the button or a press outside it closes it. Each notice heard
// while the log is closed is a toast, once, one line: who did it, what happened, and its surface; clicking it goes where it
// happened and counts it seen. A toast that passes goes into the button, which carries one dot while the person has not
// seen something: the notices others caused since they last opened the log, less those they looked at by their toast. The
// count and the mark are the shell's, at /activity/notices, so a refresh or a page opened later counts from the log, and
// no old toast is shown again; the shell reads the notices once, for the tabs they dot too. While the log is open no toast
// is shown: a toast on screen leaves into it, and a notice heard comes in as its newest line, lit a moment.
//
// The log is one line an entry, newest first, grouped by when: who did it as a small mark, what, where as a quiet token
// that goes there, and how long ago. What waits on the person, a tab that needs them, is pinned above, under Needs you.
// Hierarchy is type and colour alone: what was new when the log opened stays in the foreground with a dot until it closes;
// the rest is muted. It shows the notices, what the surfaces chose to say; All adds a line for every call; Needs you shows
// what waits alone. A line too long is cut; clicking it shows it whole.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "cn"
import { AppWindowIcon, BellIcon, BotIcon, CircleDotIcon, UserRoundIcon } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "../../kit/components/sheet"
import { Toasts, type ToastItem } from "../../kit/components/toast"
import { call, read, type Notice } from "./client.ts"

export type Who = "person" | "agent" | "surface"
/** An entry as /activity gives it: `when` UTC to the second, `at` null where its tab is closed; `kind` absent at /activity/notices, all notices. */
export type Row = { n: number; when: string; who: Who; kind?: "notice" | "call"; surface: string; at: string | null; what: string }
/** What the log shows: the notices, all activity, or only what waits on the person. */
export type Shown = "notices" | "all" | "needs"
/** A tab that needs someone, as / gathers it. */
export type Need = { at: string; surface: string; who: "person" | "agent"; why: string }
/** What was new as the log opened: the entries the person had not seen, and the newest entry then, after which all is new. */
export type Opened = { fresh: ReadonlySet<number>; newest: number }
type Page = { entries: Row[] | string; earlier?: { at: string }; unseen?: number }
export type Group = { label: string; rows: Row[] }
type Stream<T = void> = { subscribe: (fn: (value: T) => void) => () => void }

export const NOTICES = "/activity/notices"
const ALL = "/activity"
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** Who did it, in words, for a tooltip and a reader. */
export const BY: Record<Who, string> = { person: "by you", agent: "by the agent", surface: "by the surface" }
const MARK: Record<Who, ReactNode> = { person: <UserRoundIcon />, agent: <BotIcon />, surface: <AppWindowIcon /> }
const SHOWN: { value: Shown; label: string }[] = [
  { value: "all", label: "All" },
  { value: "notices", label: "Notices" },
  { value: "needs", label: "Needs you" },
]
const THROTTLE_MS = 400
/** How long a line heard while the log is open stays lit. */
const LIT_MS = 1600
/** The most toasts shown at once; an older one goes first. */
const TOASTS = 4

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const dateOf = (when: Date, now: Date) =>
  `${MONTHS[when.getMonth()]} ${when.getDate()}${when.getFullYear() === now.getFullYear() ? "" : `, ${when.getFullYear()}`}`

/** The group a time falls in, seen at `now`: the last hour, earlier today, yesterday, or its date. */
export function groupOf(when: Date, now: Date): string {
  if (now.getTime() - when.getTime() < HOUR) return "Now"

  const days = Math.round((dayOf(now) - dayOf(when)) / (24 * HOUR))

  if (days <= 0) return "Earlier today"
  if (days === 1) return "Yesterday"

  return dateOf(when, now)
}

/** Rows, newest first, in runs of the same group, in their order. */
export function groupsOf(rows: Row[], now: Date): Group[] {
  const groups: Group[] = []

  for (const row of rows) {
    const label = groupOf(new Date(row.when), now)
    const last = groups.at(-1)

    if (last?.label === label) last.rows.push(row)
    else groups.push({ label, rows: [row] })
  }

  return groups
}

/** How long ago, as the log's right edge says it: now, minutes, hours up to six, then the clock time. */
export function agoOf(when: Date, now: Date): string {
  const ago = now.getTime() - when.getTime()

  if (ago < MINUTE) return "now"
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`
  if (ago < 6 * HOUR) return `${Math.floor(ago / HOUR)}h`

  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/** The rows the log shows: the notices, or all activity; none where it shows what waits alone. */
export const inView = (rows: Row[], shown: Shown): Row[] => (shown === "needs" ? [] : shown === "notices" ? rows.filter((r) => r.kind !== "call") : rows)

/** What waits on the person: the tabs that need them, not the agent. */
export const needsOf = (needs: Need[]): Need[] => needs.filter((n) => n.who === "person")

/** Why a tab needs the person, as a line: "to approve or drop 1 draft" reads "Approve or drop 1 draft". */
export const needLine = (why: string): string => {
  const line = why.replace(/^to\s+/i, "")

  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** The count the button shows: what the shell counts unseen, less the toasts still showing, which count once they go into it. */
export const badgeOf = (unseen: number, showing: number, open: boolean): number => (open ? 0 : Math.max(0, unseen - showing))

/**
 * The notices the person has not seen, of the newest kept: the newest `unseen` that others caused. The shell counts them
 * from its mark, which may skip one looked at alone; these are the newest of that count, near enough to dot where they are.
 */
export const unseenRows = (rows: Row[], unseen: number): Row[] => rows.filter((r) => r.kind !== "call" && r.who !== "person").slice(0, Math.max(0, unseen))

/** What was new as the log opened on `rows`, the shell counting `unseen`: kept so, though opening sees it all. */
export const openedOn = (rows: Row[], unseen: number): Opened => ({ fresh: new Set(unseenRows(rows, unseen).map((r) => r.n)), newest: rows[0]?.n ?? 0 })

/** Whether a row reads as new while the log is open: unseen as it opened, or a notice by another heard since. */
export const isNew = (row: Row, opened: Opened): boolean => opened.fresh.has(row.n) || (row.n > opened.newest && row.kind !== "call" && row.who !== "person")

/** The toasts after a notice is heard: none added while the log is open, which shows it as a line; else the newest few. */
export const toastsAfter = <T,>(toasts: T[], toast: T, open: boolean): T[] => (open ? toasts : [...toasts, toast].slice(-TOASTS))

/** Who caused a notice heard, from its `by`: absent where the person did, "the surface" where it did it by itself. */
export const whoBy = (by: string | undefined): Who => (by === undefined ? "person" : by === "the surface" ? "surface" : "agent")

/** The entry a notice heard as a toast is, the newest that reads the same; undefined where none does. */
export const entryOf = (rows: Row[], notice: Notice): Row | undefined =>
  rows.find((r) => r.what === notice.text && (notice.from === undefined || r.surface === notice.from) && (notice.at === undefined || r.at === notice.at))

/** One feed of rows at `path`, newest first, read again on every change while `live`, and further back on asking. */
export function useFeed(path: string, changes: Stream, live: boolean) {
  const [rows, setRows] = useState<Row[]>([])
  const [earlier, setEarlier] = useState<string>()
  const [unseen, setUnseen] = useState(0)
  const older = useRef<Row[]>([])
  const load = useCallback(async () => {
    const page = await read<Page>(path).catch(() => undefined)

    if (!page) return

    const fresh = Array.isArray(page.entries) ? page.entries : []
    const oldest = fresh.at(-1)?.n ?? Infinity
    const kept = older.current.filter((r) => r.n < oldest)

    setRows([...fresh, ...kept])
    setUnseen(page.unseen ?? 0)
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

    void load()

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

  return { rows, earlier, unseen, more, load }
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

/** The small sign of who did it, or of what waits, before a line. */
const Mark = ({ children, className, label }: { children: ReactNode; className?: string; label: string }) => (
  <span title={label} className={cn("flex size-3 shrink-0 items-center justify-center text-muted-foreground/70 [&_svg]:size-3", className)}>
    {children}
    <span className="sr-only">{label}</span>
  </span>
)

/** Where a line is about, a quiet token that goes there; plain where its tab is closed. */
function Place({ name, at, go }: { name: string; at: string | null; go: (at: string) => void }) {
  if (at === null)
    return (
      <span title={`${name}, closed`} className="max-w-24 shrink-0 truncate text-meta text-muted-foreground/50 line-through decoration-muted-foreground/30">
        {name}
      </span>
    )

  return (
    <button
      type="button"
      tabIndex={-1}
      title={`Go to ${name}`}
      className="max-w-24 shrink-0 cursor-pointer truncate text-meta text-muted-foreground/70 outline-none hover:text-foreground hover:underline hover:underline-offset-2"
      onClick={(e) => {
        e.stopPropagation()
        go(at)
      }}
    >
      {name}
    </button>
  )
}

const LINE = "group/line relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-sm px-3 outline-none hover:bg-foreground/4 focus-visible:bg-foreground/6"

/** One entry of the log: who, what, where and when, on one line until it is opened whole. */
function Line({ row, fresh, lit, open, toggle, go }: { row: Row; fresh: boolean; lit: boolean; open: boolean; toggle: () => void; go: (at: string) => void }) {
  const self = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const when = new Date(row.when)

  // A line heard while the log is open is lit a moment, unless motion is reduced.
  useLayoutEffect(() => {
    if (!lit || !self.current || typeof self.current.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    self.current.animate([{ backgroundColor: "color-mix(in oklab, var(--primary) 10%, transparent)" }, { backgroundColor: "transparent" }], {
      duration: LIT_MS,
      easing: "ease-out",
    })
  }, [lit])

  const cut = () => !!text.current && text.current.scrollWidth > text.current.clientWidth

  return (
    <div
      ref={self}
      data-line
      tabIndex={-1}
      aria-expanded={open}
      className={cn(LINE, open ? "py-1.5" : "h-7")}
      onClick={() => (open || cut() ? toggle() : row.at !== null && go(row.at))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && row.at !== null) go(row.at)
        else if (e.key === " ") {
          e.preventDefault()
          toggle()
        }
      }}
    >
      <span
        aria-hidden
        className={cn("absolute left-1 size-1 rounded-full", fresh ? "bg-primary" : "bg-transparent", open ? "top-3" : "top-1/2 -translate-y-1/2")}
      />
      <Mark label={BY[row.who]} className={open ? "self-start mt-0.5" : undefined}>
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
        <Place name={row.surface} at={row.at} go={go} />
        <time dateTime={row.when} title={when.toLocaleString()} className="w-10 text-right text-meta text-muted-foreground/60 tabular-nums">
          {agoOf(when, new Date())}
        </time>
      </span>
    </div>
  )
}

/** A tab that waits on the person, pinned above the log. */
function NeedLine({ need, go }: { need: Need; go: (at: string) => void }) {
  return (
    <div data-line tabIndex={-1} className={cn(LINE, "h-7 cursor-pointer")} onClick={() => go(need.at)} onKeyDown={(e) => e.key === "Enter" && go(need.at)}>
      <Mark label="Needs you" className="text-primary">
        <CircleDotIcon />
      </Mark>
      <span className="min-w-0 flex-1 truncate text-foreground">{needLine(need.why)}</span>
      <Place name={need.surface} at={need.at} go={go} />
      <span className="w-10" aria-hidden />
    </div>
  )
}

const Heading = ({ children }: { children: ReactNode }) => <div className="px-3 pt-3 pb-1 text-meta font-medium text-muted-foreground/70">{children}</div>

/** The arrow keys move through the lines, Home and End to either end. */
function moveIn(e: KeyboardEvent<HTMLElement>) {
  const lines = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-line]")]
  const at = lines.indexOf(document.activeElement as HTMLElement)
  const to = { ArrowDown: at + 1, ArrowUp: at < 0 ? lines.length - 1 : at - 1, Home: 0, End: lines.length - 1 }[e.key]

  if (to === undefined || !lines.length) return
  e.preventDefault()
  lines[Math.max(0, Math.min(lines.length - 1, to))]!.focus()
}

/** Tab stays within the drawer while it is open, round from its last stop to its first. */
function keepFocus(e: KeyboardEvent<HTMLElement>) {
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

/**
 * The button, its drawer and the toasts. `changes` tells of every change, `notices` of each notice as it is heard, `told`
 * is the feed of notices; `go` goes to a place, a tab and the route within it; `title` names a toast whose notice names no surface.
 */
export function Notifications({
  changes,
  notices,
  told,
  go,
  title,
}: {
  changes: Stream
  notices: Stream<Notice>
  told: Feed
  go: (at: string) => void
  title: string
}) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<Shown>("notices")
  const [opened, setOpened] = useState<Opened>({ fresh: new Set(), newest: Infinity })
  const [expanded, setExpanded] = useState<number>()
  const [toasts, setToasts] = useState<(ToastItem & { counts: boolean })[]>([])
  // Toasts clicked through, until the shell has taken them as seen.
  const [looking, setLooking] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  // Whether the drawer closes back to the button: by Escape, not by a press elsewhere or by going to a place.
  const back = useRef(false)
  const all = useFeed(ALL, changes, open && shown === "all")
  const needs = useNeeds(changes, open)
  const marked = useRef(0)
  const isOpen = useRef(open)
  const newest = told.rows[0]?.n ?? 0

  isOpen.current = open

  // Opening the drawer sees every notice in it, and so does one heard while it is open.
  useEffect(() => {
    if (!open || newest <= marked.current) return
    marked.current = newest
    void call(NOTICES, "seen", { n: newest }).catch(() => undefined)
  }, [open, newest])

  // A toast clicked through was seen: the shell marks its entry, read fresh, since the toast may come before the feed has it.
  const look = async (notice: Notice) => {
    setLooking((n) => n + 1)
    try {
      const page = await read<Page>(NOTICES)
      const entry = entryOf(Array.isArray(page.entries) ? page.entries : [], notice)

      if (entry) await call(NOTICES, "looked", { n: entry.n })
      await told.load()
    } catch {
      // Not marked: it counts as unseen until the panel is opened.
    } finally {
      setLooking((n) => n - 1)
    }
  }
  const heard = useRef<(notice: Notice) => void>(() => {})

  // A notice names its tab by `at`, where it goes on a click; while the drawer is open it is a line there, not a toast.
  heard.current = (notice) => {
    const toast = {
      id: Date.now() + Math.random(),
      text: notice.text,
      title: notice.from ?? title,
      mark: <Mark label={BY[whoBy(notice.by)]}>{MARK[whoBy(notice.by)]}</Mark>,
      counts: notice.by !== undefined,
      ...(notice.at && {
        onSelect: () => {
          go(notice.at!)
          if (notice.by !== undefined) void look(notice)
        },
      }),
    }

    setToasts((all) => toastsAfter(all, toast, isOpen.current))
  }
  useEffect(() => notices.subscribe((notice) => heard.current(notice)), [notices])

  const toggle = (to: boolean) => {
    if (to) {
      setOpened(openedOn(told.rows, told.unseen))
      setExpanded(undefined)
    }
    setOpen(to)
  }
  const goTo = (at: string) => {
    back.current = false
    setOpen(false)
    go(at)
  }
  const badge = badgeOf(told.unseen, toasts.filter((t) => t.counts).length + looking, open)
  const feed = shown === "all" ? all : told
  const rows = inView(feed.rows, shown)
  const groups = groupsOf(rows, new Date())
  const fresh = feed.rows.some((r) => isNew(r, opened))

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
      <button
        ref={button}
        type="button"
        aria-label={badge ? `Activity, ${badge} new` : "Activity"}
        aria-expanded={open}
        title={badge ? `Activity, ${badge} new` : "Activity"}
        data-state={open ? "open" : "closed"}
        data-notifications
        className="relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/11 data-[state=open]:text-foreground"
        onClick={() => toggle(!open)}
      >
        <BellIcon className="size-4" aria-hidden />
        {badge > 0 && <span aria-hidden data-unseen={badge} className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-sidebar" />}
      </button>
      <Sheet open={open} onOpenChange={toggle}>
        <SheetContent
          ref={content}
          top="top-11"
          aria-label="Activity"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            content.current?.focus()
          }}
          onEscapeKeyDown={() => {
            back.current = true
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
            // From the drawer itself, as it opens focused, the arrows go into the lines.
            if (e.target === content.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault()
              content.current.querySelector<HTMLElement>("[data-line]")?.focus()
            }
          }}
        >
          <div className="flex h-9 shrink-0 items-center gap-3 px-3">
            <SheetTitle className="text-body font-medium">Activity</SheetTitle>
            <div role="tablist" aria-label="Show" className="flex items-center gap-2.5">
              {SHOWN.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="tab"
                  aria-selected={shown === s.value}
                  className={`relative cursor-pointer text-meta outline-none hover:text-foreground focus-visible:underline focus-visible:underline-offset-4 ${shown === s.value ? "text-foreground" : "text-muted-foreground/70"}`}
                  onClick={() => setShown(s.value)}
                >
                  {s.label}
                  {s.value === "needs" && needs.length > 0 && <span aria-hidden className="ml-1 inline-block size-1 rounded-full bg-primary align-middle" />}
                </button>
              ))}
            </div>
            {fresh && (
              <button
                type="button"
                className="ml-auto cursor-pointer text-meta text-muted-foreground/70 outline-none hover:text-foreground focus-visible:underline focus-visible:underline-offset-4"
                onClick={() => {
                  setOpened({ fresh: new Set(), newest: Infinity })
                  if (newest > 0) void call(NOTICES, "seen", { n: newest }).catch(() => undefined)
                }}
              >
                Mark all seen
              </button>
            )}
          </div>
          <div
            data-lines
            role="list"
            aria-label="Entries"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2 outline-none"
            onKeyDown={moveIn}
          >
            {needs.length > 0 && (
              <section aria-label="Needs you" className="border-b border-border/60 pb-2">
                <Heading>Needs you</Heading>
                {needs.map((need, i) => (
                  <div role="listitem" key={`${need.at}-${i}`}>
                    <NeedLine need={need} go={goTo} />
                  </div>
                ))}
              </section>
            )}
            {shown !== "needs" &&
              groups.map((group) => (
                <section key={`${group.label}-${group.rows[0]!.n}`} aria-label={group.label}>
                  <Heading>{group.label}</Heading>
                  {group.rows.map((row) => (
                    <div role="listitem" key={row.n}>
                      <Line
                        row={row}
                        fresh={isNew(row, opened)}
                        lit={row.n > opened.newest}
                        open={expanded === row.n}
                        toggle={() => setExpanded((n) => (n === row.n ? undefined : row.n))}
                        go={goTo}
                      />
                    </div>
                  ))}
                </section>
              ))}
            {(shown === "needs" ? !needs.length : !rows.length) && (
              <p className="px-3 py-6 text-center text-muted-foreground/70">
                {shown === "needs" ? "Nothing waits on you" : shown === "all" ? "Nothing has happened yet" : "Nothing new to say yet"}
              </p>
            )}
            {shown !== "needs" && feed.earlier && (
              <button
                type="button"
                className="mx-3 mt-2 cursor-pointer text-meta text-muted-foreground/70 outline-none hover:text-foreground focus-visible:underline"
                onClick={() => void feed.more()}
              >
                Show earlier
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
