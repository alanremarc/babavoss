// The activity panel: who did what in this session, the same for every surface, opened from the strip's right. It reads
// the shell's /activity, newest first, again as the surface changes and further back on asking; it groups the entries by
// how long ago, names who did each as a toast does, and goes where one happened on a click, where its tab is still open.
// What the person has not looked at since they last opened it, done by someone else, is counted on the button.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "cn"
import { HistoryIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../../kit/components/popover"
import { ToggleGroup, ToggleGroupItem } from "../../kit/components/toggle-group"
import { read } from "./client.ts"

export type Who = "person" | "agent" | "surface"
/** An entry as /activity gives it: `when` UTC to the second, `at` null where its tab is closed. */
export type Row = { n: number; when: string; who: Who; surface: string; at: string | null; what: string }
type Page = { entries: Row[] | string; earlier?: { at: string } }
export type Group = { label: string; rows: Row[] }

const MINUTE = 60_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** Who did it, in the words a toast uses. */
export const BY: Record<Who, string> = { person: "by you", agent: "by the agent", surface: "by the surface" }
const DOT: Record<Who, string> = { person: "bg-primary", agent: "bg-info", surface: "bg-muted-foreground/60" }
const SEEN = "babavoss-activity-seen"
const THROTTLE_MS = 400

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

/** How many rows, done by someone other than the person, are newer than the last one they saw. */
export const unseenOf = (rows: Row[], seen: number): number => rows.filter((r) => r.n > seen && r.who !== "person").length

/** The rows a filter keeps: by surface and by who, either one "all". */
export const filtered = (rows: Row[], surface: string, who: Who | "all"): Row[] => rows.filter((r) => (surface === "all" || r.surface === surface) && (who === "all" || r.who === who))

const clock = (when: string) => new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
const remembered = () => {
  try {
    return Number(localStorage.getItem(SEEN) ?? 0) || 0
  } catch {
    return 0
  }
}
const remember = (n: number) => {
  try {
    localStorage.setItem(SEEN, String(n))
  } catch {
    // A page that cannot keep it counts from nothing again.
  }
}

/** The button and its panel. `changes` tells of every change; `go` goes to a place, a tab and the route within it. */
export function ActivityButton({ changes, go }: { changes: { subscribe: (fn: () => void) => () => void }; go: (at: string) => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [earlier, setEarlier] = useState<string>()
  const [seen, setSeen] = useState(remembered)
  const [surface, setSurface] = useState("all")
  const [who, setWho] = useState<Who | "all">("all")
  const older = useRef<Row[]>([])

  // The newest page again, and what was read further back kept below it.
  const load = useCallback(async () => {
    const page = await read<Page>("/activity").catch(() => undefined)

    if (!page) return

    const fresh = Array.isArray(page.entries) ? page.entries : []
    const oldest = fresh.at(-1)?.n ?? Infinity
    const kept = older.current.filter((r) => r.n < oldest)

    setRows([...fresh, ...kept])
    if (!kept.length) setEarlier(page.earlier?.at)
  }, [])
  const more = async () => {
    if (!earlier) return

    const page = await read<Page>(earlier).catch(() => undefined)

    if (!page) return
    older.current = [...older.current, ...(Array.isArray(page.entries) ? page.entries : [])]
    setRows((all) => [...all, ...older.current.filter((r) => !all.some((a) => a.n === r.n))])
    setEarlier(page.earlier?.at)
  }

  useEffect(() => {
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
  }, [changes, load])

  const newest = rows[0]?.n ?? 0
  // A seen mark past the newest is from another session at this address: it counts from here.
  const from = seen > newest ? newest : seen
  const unseen = open ? 0 : unseenOf(rows, from)

  useEffect(() => {
    if (open && newest !== seen) {
      setSeen(newest)
      remember(newest)
    }
  }, [open, newest, seen])

  const surfaces = useMemo(() => [...new Set(rows.map((r) => r.surface))].sort(), [rows])
  const shown = filtered(rows, surface, who)
  const groups = groupsOf(shown, new Date())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unseen ? `Activity, ${unseen} new` : "Activity"}
        title="Activity: who did what"
        className="relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/11 data-[state=open]:text-foreground"
      >
        <HistoryIcon className="size-4" aria-hidden />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-0.5 text-badge leading-none font-medium text-primary-foreground tabular-nums">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} collisionPadding={8} aria-label="Activity" className="w-[min(24rem,calc(100vw-16px))] gap-0 p-0">
        <div className="flex flex-col gap-1.5 border-b px-2.5 pt-2 pb-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-large font-medium">Activity</span>
            <span className="text-meta text-muted-foreground">who did what in this session</span>
          </div>
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
        </div>
        <ol className="max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain py-1" aria-label="Entries">
          {!groups.length && <li className="px-2.5 py-6 text-center text-muted-foreground">{rows.length ? "Nothing matches" : "Nothing has happened yet"}</li>}
          {groups.map((group) => (
            <li key={`${group.label}-${group.rows[0]!.n}`}>
              <div className="sticky top-0 bg-popover px-2.5 pt-1.5 pb-0.5 text-meta font-medium text-muted-foreground">{group.label}</div>
              <ol>
                {group.rows.map((row) => {
                  const body = (
                    <>
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[row.who])} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="line-clamp-2 text-foreground">{row.what}</span>
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
          {earlier && (
            <li className="px-2.5 py-1">
              <button type="button" className="cursor-pointer text-meta text-muted-foreground hover:text-foreground" onClick={() => void more()}>
                Show earlier
              </button>
            </li>
          )}
        </ol>
      </PopoverContent>
    </Popover>
  )
}
