// The notifications: one button at the strip's right and the drawer it pulls in from the right edge, under the strip and
// over the content, the same for every surface; Escape, the button or a press outside it closes it. Each notice heard while
// the page is open is a toast, once: the surface, what happened, and who did it where not the person; clicking it goes
// where it happened and counts it seen. A toast that passes goes into the button, which counts what the person has not
// seen: the notices others caused since they last opened the drawer, less those they looked at by their toast. The count
// and the mark are the shell's, at /activity/notices, so a refresh or a page opened later counts from the log, and no
// old toast is shown again; the shell reads the notices once, for the tabs they dot too. The drawer opens on the notices,
// what the surfaces chose to say; a switch shows all activity,
// the same with a line for every call. It groups by how long ago, names who did each, and goes where one happened.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "cn"
import { BellIcon } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "../../kit/components/sheet"
import { Toasts, type ToastItem } from "../../kit/components/toast"
import { ToggleGroup, ToggleGroupItem } from "../../kit/components/toggle-group"
import { call, read, type Notice } from "./client.ts"

export type Who = "person" | "agent" | "surface"
/** An entry as /activity gives it: `when` UTC to the second, `at` null where its tab is closed; `kind` absent at /activity/notices, all notices. */
export type Row = { n: number; when: string; who: Who; kind?: "notice" | "call"; surface: string; at: string | null; what: string }
/** What the panel shows: the notices alone, or all activity. */
export type Shown = "notifications" | "all"
type Page = { entries: Row[] | string; earlier?: { at: string }; unseen?: number }
export type Group = { label: string; rows: Row[] }
type Stream<T = void> = { subscribe: (fn: (value: T) => void) => () => void }

export const NOTICES = "/activity/notices"
const ALL = "/activity"
const MINUTE = 60_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** Who did it, in the words a toast uses. */
export const BY: Record<Who, string> = { person: "by you", agent: "by the agent", surface: "by the surface" }
const DOT: Record<Who, string> = { person: "bg-primary", agent: "bg-info", surface: "bg-muted-foreground/60" }
const THROTTLE_MS = 400
/** The most toasts shown at once; an older one goes first. */
const TOASTS = 4

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** The group a time falls in, seen at `now`: just now, the last hour, today, yesterday, or its date. */
export function groupOf(when: Date, now: Date): string {
  const ago = now.getTime() - when.getTime()

  if (ago < 5 * MINUTE) return "Just now"
  if (ago < 60 * MINUTE) return "Last hour"

  const days = Math.round((dayOf(now) - dayOf(when)) / (24 * 60 * MINUTE))

  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"

  return `${MONTHS[when.getMonth()]} ${when.getDate()}${when.getFullYear() === now.getFullYear() ? "" : `, ${when.getFullYear()}`}`
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

/** The rows the panel shows: the notices alone, unfiltered; or all activity, by surface and by who, either one "all". */
export const inView = (rows: Row[], shown: Shown, surface = "all", who: Who | "all" = "all"): Row[] =>
  shown === "notifications"
    ? rows.filter((r) => r.kind !== "call")
    : rows.filter((r) => (surface === "all" || r.surface === surface) && (who === "all" || r.who === who))

/** The count the button shows: what the shell counts unseen, less the toasts still showing, which count once they go into it. */
export const badgeOf = (unseen: number, showing: number, open: boolean): number => (open ? 0 : Math.max(0, unseen - showing))

/**
 * The notices the person has not seen, of the newest kept: the newest `unseen` that others caused. The shell counts them
 * from its mark, which may skip one looked at alone; these are the newest of that count, near enough to dot where they are.
 */
export const unseenRows = (rows: Row[], unseen: number): Row[] => rows.filter((r) => r.kind !== "call" && r.who !== "person").slice(0, Math.max(0, unseen))

/** The entry a notice heard as a toast is, the newest that reads the same; undefined where none does. */
export const entryOf = (rows: Row[], notice: Notice): Row | undefined =>
  rows.find((r) => r.what === notice.text && (notice.from === undefined || r.surface === notice.from) && (notice.at === undefined || r.at === notice.at))

const clock = (when: string) => new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

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
  const [shown, setShown] = useState<Shown>("notifications")
  const [surface, setSurface] = useState("all")
  const [who, setWho] = useState<Who | "all">("all")
  const [toasts, setToasts] = useState<(ToastItem & { counts: boolean })[]>([])
  // Toasts clicked through, until the shell has taken them as seen.
  const [looking, setLooking] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const all = useFeed(ALL, changes, open && shown === "all")
  const marked = useRef(0)
  const newest = told.rows[0]?.n ?? 0

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

  // A notice names its tab by `at`, where it goes on a click.
  heard.current = (notice) => {
    const toast = {
      id: Date.now() + Math.random(),
      title: notice.from ?? title,
      text: notice.text,
      counts: notice.by !== undefined,
      ...(notice.by && { meta: `by ${notice.by}` }),
      ...(notice.at && {
        onSelect: () => {
          go(notice.at!)
          if (notice.by !== undefined) void look(notice)
        },
      }),
    }

    setToasts((all) => [...all, toast].slice(-TOASTS))
  }
  useEffect(() => notices.subscribe((notice) => heard.current(notice)), [notices])

  const badge = badgeOf(told.unseen, toasts.filter((t) => t.counts).length + looking, open)
  const feed = shown === "all" ? all : told
  const surfaces = useMemo(() => [...new Set(all.rows.map((r) => r.surface))].sort(), [all.rows])
  const groups = groupsOf(inView(feed.rows, shown, surface, who), new Date())

  return (
    <>
      <Toasts toasts={toasts} into={button} dismiss={(id) => setToasts((all) => all.filter((t) => t.id !== id))} className="top-13 right-2" from="top" />
      <button
        ref={button}
        type="button"
        aria-label={badge ? `Notifications, ${badge} new` : "Notifications"}
        aria-expanded={open}
        title="Notifications"
        data-state={open ? "open" : "closed"}
        data-notifications
        className="relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/11 data-[state=open]:text-foreground"
        onClick={() => {
          if (!open) setShown("notifications")
          setOpen(!open)
        }}
      >
        <BellIcon className="size-4" aria-hidden />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-0.5 text-badge leading-none font-medium text-primary-foreground tabular-nums">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          top="top-11"
          aria-label="Notifications"
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The button toggles the drawer itself; a press on it is no press outside.
          onInteractOutside={(e) => {
            if (button.current?.contains(e.target as Node)) e.preventDefault()
          }}
        >
          <div className="flex flex-col gap-1.5 border-b px-2.5 pt-2 pb-1.5">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>{shown === "all" ? "All activity" : "Notifications"}</SheetTitle>
              <ToggleGroup type="single" size="sm" spacing={0} variant="outline" value={shown} onValueChange={(v) => v && setShown(v as Shown)} aria-label="Show">
                <ToggleGroupItem value="notifications">Notifications</ToggleGroupItem>
                <ToggleGroupItem value="all">All activity</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {shown === "all" && (
              <div className="flex flex-wrap items-center gap-1">
                <ToggleGroup type="single" size="sm" spacing={0} value={who} onValueChange={(v) => setWho((v || "all") as Who | "all")} aria-label="Who">
                  <ToggleGroupItem value="all">All</ToggleGroupItem>
                  <ToggleGroupItem value="person">You</ToggleGroupItem>
                  <ToggleGroupItem value="agent">Agent</ToggleGroupItem>
                  <ToggleGroupItem value="surface">Surface</ToggleGroupItem>
                </ToggleGroup>
                {surfaces.length > 1 && (
                  <ToggleGroup type="single" size="sm" spacing={0} value={surface} onValueChange={(v) => setSurface(v || "all")} aria-label="Surface">
                    <ToggleGroupItem value="all">Every surface</ToggleGroupItem>
                    {surfaces.map((s) => (
                      <ToggleGroupItem key={s} value={s}>
                        {s}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              </div>
            )}
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" aria-label="Entries">
            {!groups.length && (
              <li className="px-2.5 py-6 text-center text-muted-foreground">
                {feed.rows.length ? "Nothing matches" : shown === "all" ? "Nothing has happened yet" : "No notifications yet"}
              </li>
            )}
            {groups.map((group) => (
              <li key={`${group.label}-${group.rows[0]!.n}`}>
                <div className="sticky top-0 bg-popover px-2.5 pt-1.5 pb-0.5 text-meta font-medium text-muted-foreground">{group.label}</div>
                <ol>
                  {group.rows.map((row) => {
                    const body = (
                      <>
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[row.who])} aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn("line-clamp-2", row.kind === "call" ? "text-muted-foreground" : "text-foreground")}>{row.what}</span>
                          <span className="truncate text-meta text-muted-foreground">
                            {row.surface} · {BY[row.who]}
                            {row.at === null && " · closed"}
                          </span>
                        </span>
                        <time dateTime={row.when} className="shrink-0 pt-px text-meta text-muted-foreground tabular-nums">
                          {clock(row.when)}
                        </time>
                      </>
                    )

                    return (
                      <li key={row.n}>
                        {row.at !== null ? (
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-start gap-2 px-2.5 py-1 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                            onClick={() => {
                              setOpen(false)
                              go(row.at!)
                            }}
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="flex items-start gap-2 px-2.5 py-1 opacity-70">{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </li>
            ))}
            {feed.earlier && (
              <li className="px-2.5 py-1">
                <button type="button" className="cursor-pointer text-meta text-muted-foreground hover:text-foreground" onClick={() => void feed.more()}>
                  Show earlier
                </button>
              </li>
            )}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  )
}
