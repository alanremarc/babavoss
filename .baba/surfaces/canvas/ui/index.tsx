// The canvas's page: a content column and a sidebar beside it, on the side the person keeps sidebars. The sidebar holds the
// pages (the overview, the journal, the notes) and below them the plan, the tickets by phase as steps; what is chosen there is shown in
// the content column, by the tab's route. The overview (/) is where the work stands: the title and the
// brief, progress as one bar, now with the journal's latest, and what waits on the person, asks to answer by a click and
// tickets waiting. A note (/notes/N) is read whole, its contents listed under it in the sidebar; the journal (/journal) is
// latest first, by day; a ticket (/tickets/N) has all of it. Below a width the sidebar is its own page, /side.
import type { Handle } from "babavoss/core/index.ts"
import { Button, cn, Input, useNarrow } from "babavoss/kit/index.ts"
import { useConventions, useLive, useTab } from "babavoss/shell/ui/index.tsx"
import {
  Bot,
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  Copy,
  FileText,
  Hand,
  History,
  ListChecks,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Rich } from "./markdown.tsx"

export const icon = <PanelsTopLeft aria-hidden />

type Section = { text: string; updatedAt?: string }
type By = "main" | "worker" | "person"
type Post = { at: string; by: By; text: string }
type Status = "open" | "working" | "waiting" | "done" | "dropped"
type Row = { at: string; n: number; title: string; status: Status; worker: "main" | "subagent"; phase?: string; worktree?: string; last?: Post; posts: number }
type AskRow = { at: string; n: number; question: string; options: string[]; recommended?: string; context?: string; createdAt: string; answer?: { text: string; by: By; at: string }; withdrawn?: string }
type NoteRow = { at: string; name: string; title: string; summary: string; updatedAt: string; problems?: number }
type Entry = { at: string; by: By; text: string }
type Root = {
  title: string
  reading?: true
  broken?: string
  brief: Section
  now: Section
  progress: Record<Status, number>
  phases: string[]
  asks: AskRow[]
  tickets: Row[]
  notes: NoteRow[]
  journal: Entry[]
}
type TicketView = Row & {
  about: string
  createdAt: string
  git?: { branch?: string; dirty?: number; ahead?: number; gone?: string }
  posts: Post[]
  report?: { report: string; wait: string; done: string }
  start?: Handle
  done?: Handle
}
type NoteView = Omit<NoteRow, "problems"> & { text: string; figures: Record<string, string | null>; problems: string[] }

type Tone = "warning" | "info" | "destructive" | "success" | "muted"
const TONE: Record<Tone, string> = {
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
  muted: "bg-muted text-muted-foreground",
}
const Pill = ({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) => (
  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-badge leading-5 whitespace-nowrap", TONE[tone], className)}>{children}</span>
)
const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center rounded-full bg-muted px-2 text-badge leading-5 text-muted-foreground tabular-nums">{children}</span>
)

const STATUS: Record<Status, Tone | undefined> = { open: undefined, working: "info", waiting: "warning", done: "success", dropped: "muted" }
const StatusPill = ({ status, always = false }: { status: Status; always?: boolean }) => {
  const tone = STATUS[status]

  return tone ? <Pill tone={tone}>{status}</Pill> : always ? <Pill tone="muted">open</Pill> : null
}
/** A ticket's status as a mark: what is done, what moves, what waits, what is next. */
const MARK: Record<Status, { Icon: LucideIcon; className: string; label: string }> = {
  done: { Icon: CircleCheck, className: "text-success", label: "done" },
  working: { Icon: CircleDot, className: "text-info motion-safe:animate-pulse", label: "working" },
  waiting: { Icon: CircleAlert, className: "text-warning", label: "waiting on you" },
  open: { Icon: Circle, className: "text-muted-foreground/60", label: "next" },
  dropped: { Icon: CircleX, className: "text-muted-foreground/60", label: "dropped" },
}
const StatusMark = ({ status, className }: { status: Status; className?: string }) => {
  const { Icon, className: tone, label } = MARK[status]

  return <Icon aria-label={label} className={cn("size-4 shrink-0", tone, className)} />
}

/** A worktree's folder name, which says which one it is. */
const folder = (path: string) => path.replace(/\/+$/, "").split("/").at(-1) ?? path
const Worker = ({ worktree }: { worktree?: string }) => (
  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-chart-2/10 px-2 text-badge leading-5 whitespace-nowrap" title={worktree ?? "no worktree assigned"}>
    <Bot aria-hidden className="size-3" />
    {worktree ? folder(worktree) : "subagent"}
  </span>
)

const span = (ms: number) => {
  const s = ms / 1000

  return s < 90 ? `${Math.max(1, Math.round(s))}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 129600 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`
}
const ago = (iso: string) => (Date.now() - Date.parse(iso) < 60000 ? "just now" : `${span(Date.now() - Date.parse(iso))} ago`)
const Ago = ({ iso, prefix = "", className }: { iso: string; prefix?: string; className?: string }) => (
  <time dateTime={iso} title={new Date(iso).toLocaleString()} className={cn("shrink-0 text-meta text-muted-foreground tabular-nums", className)}>
    {prefix}
    {ago(iso)}
  </time>
)
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
const day = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 864e5)

  return d.toDateString() === today.toDateString()
    ? "Today"
    : d.toDateString() === yesterday.toDateString()
      ? "Yesterday"
      : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
}
/** Re-renders now and then, so times ago stay true. */
function useNow(every = 30000) {
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), every)

    return () => clearInterval(t)
  }, [every])
}

/** A block of the homepage: a small heading with its mark and count, then what it holds. */
function Block({ icon: Icon, title, count, aside, children, label }: { icon: LucideIcon; title: string; count?: ReactNode; aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-7 items-center gap-2">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="text-body font-semibold">{title}</h2>
        {count !== undefined && <Chip>{count}</Chip>}
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  )
}
/** The brief: its start, and the rest a click away when it runs long. */
function Brief({ section }: { section: Section }) {
  const [whole, setWhole] = useState(false)
  const [long, setLong] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current

    if (!el) return
    const measure = () => setLong(el.scrollHeight > 160)

    measure()
    const seen = new ResizeObserver(measure)

    seen.observe(el)

    return () => seen.disconnect()
  }, [section.text])

  if (!section.text.trim()) return null

  return (
    <div className="flex flex-col gap-1">
      <div ref={box} className={cn("relative overflow-hidden text-muted-foreground", !whole && "max-h-40")}>
        <Rich text={section.text} />
        {long && !whole && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background" />}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setWhole(!whole)}
          className="self-start text-meta text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          {whole ? "Show less of the brief" : "Show the whole brief"}
        </button>
      )}
    </div>
  )
}

/** The tickets by status as one bar, with its legend: where the work stands at a glance. */
function Progress({ progress }: { progress: Record<Status, number> }) {
  const order: Status[] = ["done", "working", "waiting", "open"]
  const total = order.reduce((s, k) => s + progress[k], 0)
  const fill: Record<Status, string> = { done: "bg-success", working: "bg-info", waiting: "bg-warning", open: "bg-muted-foreground/20", dropped: "" }
  const word: Record<Status, string> = { done: "done", working: "working", waiting: "waiting on you", open: "next", dropped: "dropped" }

  if (!total) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={order.map((k) => `${progress[k]} ${word[k]}`).join(", ")} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {order.map((k) => progress[k] > 0 && <div key={k} className={cn("h-full first:rounded-l-full last:rounded-r-full", fill[k])} style={{ flexGrow: progress[k] }} />)}
      </div>
      <p className="flex flex-wrap gap-x-3 text-meta text-muted-foreground tabular-nums">
        {order.map(
          (k) =>
            progress[k] > 0 && (
              <span key={k} className="inline-flex items-center gap-1">
                <span aria-hidden className={cn("size-2 rounded-full", fill[k])} />
                {progress[k]} {word[k]}
              </span>
            ),
        )}
        {progress.dropped > 0 && <span>{progress.dropped} dropped</span>}
      </p>
    </div>
  )
}

/** An ask: its question, its context behind a fold, and its options as buttons, the proposed one first in weight. */
function AskCard({ a }: { a: AskRow }) {
  const { call } = useTab()
  const [other, setOther] = useState<string | undefined>()
  const [problem, setProblem] = useState<string>()
  const settle = async (choice: string) => {
    const r = await call(a.at, "answer", { n: a.n, choice })

    if (r.outcome === "refused") setProblem(r.reason)
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-start gap-2">
        <Hand aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 font-medium">{a.question}</p>
        <Ago iso={a.createdAt} />
      </div>
      {a.context && (
        <details className="group/ctx pl-6">
          <summary className="cursor-pointer list-none text-meta text-muted-foreground outline-none select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open/ctx:hidden">Why it matters</span>
            <span className="hidden group-open/ctx:inline">Hide</span>
          </summary>
          <div className="pt-1.5 text-meta">
            <Rich text={a.context} />
          </div>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        {a.options.map((o) => (
          <Button key={o} size="sm" variant={o === a.recommended ? "default" : "outline"} onClick={() => void settle(o)} className="h-auto min-h-6 py-0.5 text-left whitespace-normal">
            {o}
            {o === a.recommended && <span className="rounded-sm bg-primary-foreground/20 px-1 text-badge">proposed</span>}
          </Button>
        ))}
        {other === undefined ? (
          <Button size="sm" variant="ghost" onClick={() => setOther("")}>
            Other…
          </Button>
        ) : (
          <form
            className="flex min-w-[16rem] flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (other.trim()) void settle(other)
            }}
          >
            <Input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Your answer" className="h-6" />
            <Button size="sm" type="submit" disabled={!other.trim()}>
              Answer
            </Button>
          </form>
        )}
      </div>
      {problem && <p className="pl-6 text-meta text-destructive">{problem}</p>}
    </li>
  )
}

/** A ticket as a line of the plan: its mark and title, the one shown marked. */
function Step({ r, here }: { r: Row; here: boolean }) {
  const { navigate } = useTab()

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(r.at)}
        aria-current={here ? "page" : undefined}
        title={[r.title, r.last?.text.split("\n")[0]].filter(Boolean).join("\n")}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-meta outline-none hover:bg-accent focus-visible:bg-accent",
          here && "bg-accent font-medium",
        )}
      >
        <StatusMark status={r.status} className="size-3.5" />
        <span className={cn("min-w-0 flex-1 truncate", (r.status === "done" || r.status === "dropped") && "text-muted-foreground", r.status === "dropped" && "line-through")}>{r.title}</span>
        {r.worker === "subagent" && <Bot aria-label="subagent" className="size-3 shrink-0 text-muted-foreground" />}
      </button>
    </li>
  )
}

type Phase = { name?: string; rows: Row[] }
/** The tickets grouped by phase, in the order of the phases, those of none last; each phase's tickets in the order they were added. */
function grouped(view: Root): Phase[] {
  const byN = (a: Row, b: Row) => a.n - b.n
  const out: Phase[] = view.phases.map((name) => ({ name, rows: view.tickets.filter((t) => t.phase === name).sort(byN) }))
  const loose = view.tickets.filter((t) => !t.phase).sort(byN)

  if (loose.length) out.push({ rows: loose })

  return out
}
const stateOf = (p: Phase): "done" | "current" | "next" => {
  const live = p.rows.filter((r) => r.status !== "dropped")

  if (live.length && live.every((r) => r.status === "done")) return "done"
  if (p.rows.some((r) => r.status === "working" || r.status === "waiting" || r.status === "done")) return "current"

  return "next"
}

/** A phase's mark on the plan's line: done, under way, or still to come. */
const PhaseMark = ({ state }: { state: "done" | "current" | "next" }) => (
  <span
    aria-hidden
    className={cn(
      "z-10 flex size-4 shrink-0 items-center justify-center rounded-full border-2 bg-background",
      state === "done" && "border-success bg-success text-background",
      state === "current" && "border-primary",
      state === "next" && "border-muted-foreground/30",
    )}
  >
    {state === "done" ? <Check className="size-2.5" strokeWidth={3} /> : state === "current" ? <span className="size-1.5 rounded-full bg-primary" /> : null}
  </span>
)

/** The plan: the phases as steps on one line, each with its tickets; a finished phase folds to its count. */
function Plan({ view, route }: { view: Root; route: string }) {
  const phases = grouped(view)

  if (!view.tickets.length) return <p className="px-2 text-meta text-muted-foreground">No tickets yet.</p>
  if (!phases.some((p) => p.name))
    return (
      <ul className="flex flex-col">
        {phases[0]!.rows.map((r) => (
          <Step key={r.at} r={r} here={route === r.at} />
        ))}
      </ul>
    )

  return (
    <ol className="flex flex-col">
      {phases.map((p, i) => {
        const state = stateOf(p)
        const done = p.rows.filter((r) => r.status === "done").length
        const live = p.rows.filter((r) => r.status !== "dropped").length
        const last = i === phases.length - 1
        const head = (
          <span className="flex min-h-6 items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-meta font-semibold", state !== "current" && "text-muted-foreground")}>{p.name ?? "Other"}</span>
            <span className="text-badge text-muted-foreground tabular-nums">
              {done}/{live}
            </span>
          </span>
        )
        const rows = (
          <ul className="-ml-2 flex flex-col">
            {p.rows.map((r) => (
              <Step key={r.at} r={r} here={route === r.at} />
            ))}
          </ul>
        )

        return (
          <li key={p.name ?? "(none)"} className="relative flex gap-2">
            <div className="flex w-4 shrink-0 flex-col items-center pt-1">
              <PhaseMark state={state} />
              {!last && <span aria-hidden className={cn("w-0.5 flex-1", state === "done" ? "bg-success/50" : "bg-border")} />}
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-col", !last && "pb-2")}>
              {state === "done" && !p.rows.some((r) => r.at === route) ? (
                <details>
                  <summary className="cursor-pointer list-none outline-none select-none [&::-webkit-details-marker]:hidden">{head}</summary>
                  {rows}
                </details>
              ) : (
                <>
                  {head}
                  {rows}
                </>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** The headings of a note's text, for its contents: second and third level. */
const headings = (text: string) =>
  [...text.matchAll(/^(#{2,3})\s+(.+?)\s*#*\s*$/gm)].map((m) => ({ level: m[1]!.length, text: m[2]!.replace(/[*_`]/g, "") }))
/** Scrolls the note shown to its heading of that text. */
const jump = (text: string) =>
  [...document.querySelectorAll("[data-note-body] h2, [data-note-body] h3")].find((el) => el.textContent?.trim() === text)?.scrollIntoView({ block: "start" })

/** The note open in the content column: its own contents, to jump through it. */
function Contents({ at }: { at: string }) {
  const { view } = useLive<NoteView | undefined>(at)
  const toc = view ? headings(view.text) : []

  if (toc.length < 2) return null

  return (
    <ul className="mt-0.5 mb-1 ml-4 flex flex-col border-l">
      {toc.map((h, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => jump(h.text)}
            className={cn("w-full truncate py-0.5 pr-1 text-left text-badge text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground", h.level === 2 ? "pl-2.5" : "pl-5")}
          >
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  )
}

const SIDE_BUTTON = "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-meta outline-none hover:bg-accent focus-visible:bg-accent"
const RAIL_BUTTON = "h-8 justify-center px-0"
const SIDE_ICON = "size-3.5 shrink-0 text-muted-foreground"

/** A place of the canvas in the sidebar: the overview, the journal, a note. */
function Place({ to, icon: Icon, label, aside, here, title, compact = false }: { to: string; icon: LucideIcon; label: string; aside?: ReactNode; here: boolean; title?: string; compact?: boolean }) {
  const { navigate } = useTab()

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      aria-current={here ? "page" : undefined}
      title={title ?? (compact ? label : undefined)}
      aria-label={compact ? label : undefined}
      className={cn(SIDE_BUTTON, compact && RAIL_BUTTON, here && "bg-accent font-medium")}
    >
      <Icon aria-hidden className={SIDE_ICON} />
      {!compact && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!compact && aside !== undefined && <span className="shrink-0 text-badge text-muted-foreground tabular-nums">{aside}</span>}
    </button>
  )
}

const SideHeading = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <h2 className="flex items-center gap-2 px-2 pb-1 text-badge font-semibold tracking-wide text-muted-foreground uppercase">
    {children}
    {aside !== undefined && <span className="ml-auto font-normal tracking-normal normal-case tabular-nums">{aside}</span>}
  </h2>
)

/** The sidebar: the canvas's pages, the overview, the journal and the notes, and the plan below them. */
function Sidebar({ route, compact = false }: { route: string; compact?: boolean }) {
  const { view } = useLive<Root>("/")

  if (!view) return null
  const open = view.asks.filter((a) => !a.answer && !a.withdrawn).length + view.tickets.filter((t) => t.status === "waiting").length
  const done = view.progress.done
  const total = view.progress.done + view.progress.working + view.progress.waiting + view.progress.open

  return (
    <nav aria-label="Canvas" className={cn("flex flex-col gap-5 px-2 pb-10", !compact && "pt-4")}>
      <div className="flex flex-col">
        <Place to="/" icon={PanelsTopLeft} label="Overview" here={route === "/"} compact={compact} aside={open ? <Pill tone="warning">{open} for you</Pill> : undefined} />
        <Place to="/journal" icon={History} label="Journal" here={route === "/journal"} compact={compact} aside={view.journal.length || undefined} />
      </div>
      {!compact && (
        <>
          <section aria-label="Notes" className="flex flex-col">
            <SideHeading aside={view.notes.length || undefined}>Notes</SideHeading>
            {view.notes.length ? (
              <ul className="flex flex-col">
                {view.notes.map((x) => (
                  <li key={x.at}>
                    <Place to={x.at} icon={FileText} label={x.title} here={route === x.at} title={x.summary} aside={x.problems ? <CircleAlert aria-label={`${x.problems} figure problems`} className="size-3 text-warning" /> : undefined} />
                    {route === x.at && <Contents at={x.at} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 text-meta text-muted-foreground">No notes yet.</p>
            )}
          </section>
          <section aria-label="Plan" className="flex flex-col">
            <SideHeading aside={total ? `${done}/${total}` : undefined}>Plan</SideHeading>
            <div className="px-2">
              <Plan view={view} route={route} />
            </div>
          </section>
        </>
      )}
    </nav>
  )
}

const WHO: Record<By, string> = { main: "bg-primary/10 text-primary", worker: "bg-chart-2/15 text-foreground", person: "bg-warning/10 text-warning" }

/** The journal, latest first, by day: each entry its time and headline, the rest behind it. */
function Journal({ entries }: { entries: Entry[] }) {
  const days: { day: string; entries: Entry[] }[] = []

  for (const e of entries) {
    const d = day(e.at)

    if (days.at(-1)?.day !== d) days.push({ day: d, entries: [] })
    days.at(-1)!.entries.push(e)
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => (
        <div key={d.day} className="flex flex-col gap-1">
          <h3 className="text-meta font-medium text-muted-foreground">{d.day}</h3>
          <ol className="flex flex-col border-l pl-4">
            {d.entries.map((e, i) => {
              const [headline, ...rest] = e.text.split("\n")
              const body = rest.join("\n").trim()
              const head = (
                <span className="flex min-w-0 items-baseline gap-2">
                  <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="w-16 shrink-0 text-meta whitespace-nowrap text-muted-foreground tabular-nums">
                    {clock(e.at)}
                  </time>
                  {e.by !== "main" && <span className={cn("rounded-full px-1.5 text-badge leading-4", WHO[e.by])}>{e.by}</span>}
                  <span className="min-w-0 flex-1">{headline}</span>
                </span>
              )

              return (
                <li key={`${e.at}-${i}`} className="relative py-1">
                  <span aria-hidden className="absolute top-2.5 -left-[1.3rem] size-2 rounded-full border-2 border-background bg-muted-foreground/50" />
                  {body ? (
                    <details className="group/entry">
                      <summary className="cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">{head}</summary>
                      <div className="pt-1 pl-18 text-meta text-muted-foreground">
                        <Rich text={body} />
                      </div>
                    </details>
                  ) : (
                    head
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

function Home() {
  const { view } = useLive<Root>("/")
  const { navigate } = useTab()

  useNow()
  if (!view) return null
  const open = view.asks.filter((a) => !a.answer && !a.withdrawn)
  const waiting = view.tickets.filter((t) => t.status === "waiting")
  const latest = view.journal[0]
  const empty = !view.now.text && !view.brief.text && !view.tickets.length && !view.notes.length && !view.journal.length && !view.asks.length

  return (
    <article className="@container mx-auto flex max-w-3xl flex-col gap-7 px-4 pt-6 pb-16">
      <header className="flex flex-col gap-3">
        <h1 className={cn("text-large font-semibold text-balance break-words", view.title === "Canvas" && "text-muted-foreground")}>{view.title}</h1>
        <Brief section={view.brief} />
        <Progress progress={view.progress} />
        {view.broken && (
          <p role="alert" className="text-meta text-destructive">
            {view.broken}
          </p>
        )}
      </header>
      {view.reading ? null : empty ? (
        <p className="text-muted-foreground">Nothing on the canvas yet: its title, brief, plan, notes and journal are set from the menu or by the agent.</p>
      ) : (
        <>
          {view.now.text && (
            <section aria-label="Now" className="flex min-w-0 flex-col gap-0.5 rounded-lg border-l-4 border-l-primary bg-primary/5 px-4 py-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-meta font-semibold tracking-wide text-primary uppercase">Now</h2>
                {view.now.updatedAt && <Ago iso={view.now.updatedAt} className="ml-auto" />}
              </div>
              <Rich text={view.now.text} />
              {latest && (
                <button
                  type="button"
                  onClick={() => navigate("/journal")}
                  className="mt-1 flex min-w-0 items-baseline gap-2 self-start text-left text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
                >
                  <History aria-hidden className="size-3 shrink-0 translate-y-0.5" />
                  <span className="min-w-0 truncate">Last in the journal: {latest.text.split("\n")[0]}</span>
                  <Ago iso={latest.at} />
                </button>
              )}
            </section>
          )}
          {(open.length > 0 || waiting.length > 0) && (
            <Block icon={Hand} title="Waiting on you" count={open.length + waiting.length}>
              <ul className="flex flex-col gap-2">
                {open.map((a) => (
                  <AskCard key={a.at} a={a} />
                ))}
                {waiting.map((r) => (
                  <li key={r.at}>
                    <button
                      type="button"
                      onClick={() => navigate(r.at)}
                      className="flex w-full min-w-0 items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-left outline-none hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">{r.last?.text ?? r.title}</span>
                        <span className="text-meta text-muted-foreground">
                          #{r.n} {r.title}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </>
      )}
    </article>
  )
}

function JournalPage() {
  const { view } = useLive<{ journal: Entry[] }>("/journal")

  useNow()

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-large font-semibold">Journal</h1>
        <p className="text-muted-foreground">What happened, latest first: milestones, decisions, tickets finished.</p>
      </header>
      {view?.journal.length ? <Journal entries={view.journal} /> : <p className="text-muted-foreground">Nothing entered yet.</p>}
    </article>
  )
}

function NotePage({ at }: { at: string }) {
  const { view } = useLive<NoteView | undefined>(at)

  useNow()
  if (!view) return <p className="p-4 text-muted-foreground">No such note.</p>

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-large font-semibold text-balance break-words">{view.title}</h1>
        {view.summary && <p className="text-muted-foreground">{view.summary}</p>}
        <Ago iso={view.updatedAt} prefix="updated " />
      </header>
      {!!view.problems.length && (
        <ul role="alert" className="flex flex-col gap-0.5 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-meta text-warning">
          {view.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div data-note-body>
        <Rich text={view.text} figures={view.figures} />
      </div>
    </article>
  )
}

function Copyable({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="group flex min-w-0 items-start gap-2 px-3 py-2">
      <span className="w-12 shrink-0 pt-0.5 text-meta text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 font-mono text-meta break-all">{text}</code>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Copy the ${label} command`}
        title="Copy"
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}

function TicketPage({ at }: { at: string }) {
  const { view } = useLive<TicketView | undefined>(at)

  useNow()
  if (!view)
    return <p className="p-4 text-muted-foreground">No such ticket.</p>
  const g = view.git

  return (
    <>
      <div>
        <article className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-6 pb-16">
          <header className="flex flex-col gap-2">
            {view.phase && <p className="text-meta font-medium text-muted-foreground">{view.phase}</p>}
            <h1 className="text-large font-semibold text-balance break-words">
              <span className="font-normal text-muted-foreground tabular-nums">#{view.n} </span>
              {view.title}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={view.status} always />
              {view.worker === "subagent" ? <Worker worktree={view.worktree} /> : <Pill tone="muted">main</Pill>}
              {g?.branch && <span className="font-mono text-meta text-muted-foreground">{g.branch}</span>}
              {!!g?.ahead && <Pill tone="info">{g.ahead} to merge</Pill>}
              {!!g?.dirty && <Pill tone="warning">{g.dirty} uncommitted</Pill>}
              {g?.gone && <Pill tone="destructive">worktree gone</Pill>}
            </div>
            {view.worktree && <p className="font-mono text-meta break-all text-muted-foreground">{view.worktree}</p>}
          </header>
          {view.about.trim() && <Rich text={view.about} />}
          <section aria-label="Posts" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-body font-semibold">Posts</h2>
              {!!view.posts.length && <Chip>{view.posts.length}</Chip>}
            </div>
            {view.posts.length ? (
              <ol className="flex flex-col border-l pl-4">
                {view.posts.map((p, i) => (
                  <li key={i} className="relative flex flex-col gap-0.5 py-1.5">
                    <span aria-hidden className="absolute top-3 -left-[1.3rem] size-2 rounded-full border-2 border-background bg-muted-foreground/50" />
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2 text-badge leading-5", WHO[p.by])}>{p.by}</span>
                      <Ago iso={p.at} />
                    </div>
                    <p className="whitespace-pre-line break-words">{p.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-meta text-muted-foreground">No posts yet.</p>
            )}
          </section>
          {view.report && (
            <section aria-label="Worker's commands" className="flex flex-col gap-2">
              <h2 className="text-body font-semibold">Worker's commands</h2>
              <p className="text-meta text-muted-foreground">Run from any directory; each text one or two lines.</p>
              <div className="divide-y rounded-lg border bg-muted/40">
                <Copyable label="report" text={view.report.report} />
                <Copyable label="wait" text={view.report.wait} />
                <Copyable label="done" text={view.report.done} />
              </div>
            </section>
          )}
        </article>
      </div>
    </>
  )
}

const SIDEBAR_WIDTH_KEY = "canvas:sidebar-width"
const RAIL_WIDTH = 3
const SNAP_WIDTH = 9
const MIN_WIDTH = 13
const MAX_WIDTH = 28

const snapWidth = (width: number) => width < SNAP_WIDTH ? RAIL_WIDTH : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))

function savedSidebarWidth() {
  try {
    const width = Number(sessionStorage.getItem(SIDEBAR_WIDTH_KEY))

    if (width >= RAIL_WIDTH && width <= MAX_WIDTH) return snapWidth(width)
    if (sessionStorage.getItem("canvas:sidebar-collapsed") === "true") return RAIL_WIDTH
  } catch {
    // Use the default width if the browser denies storage.
  }

  return 18
}

function DesktopSidebar({ route, width, setWidth }: { route: string; width: number; setWidth: (width: number) => void }) {
  const { side } = useConventions()
  const navigation = useId()
  const drag = useRef({ x: 0, width: 0, rem: 16 })
  const direction = side === "left" ? 1 : -1
  const collapsed = width === RAIL_WIDTH

  return (
    <aside
      className="relative flex max-w-[55%] shrink-0 flex-col border-l bg-muted/30 side-left:border-r side-left:border-l-0"
      style={{ width: `${width}rem` }}
    >
      <div id={navigation} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Sidebar route={route} compact={collapsed} />
      </div>
      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-controls={navigation}
        aria-valuemin={RAIL_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        className="absolute inset-y-0 left-0 z-10 flex w-2 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none hover:bg-primary/20 focus-visible:bg-primary/30 side-left:right-0 side-left:left-auto side-left:translate-x-1/2"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
          const sidebar = event.currentTarget.parentElement!
          drag.current = { x: event.clientX, width: sidebar.getBoundingClientRect().width / rem, rem }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const start = drag.current
          setWidth(snapWidth(start.width + direction * (event.clientX - start.x) / start.rem))
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          const step = direction * (event.key === "ArrowRight" ? 1 : -1)
          const next = width + step
          setWidth(next < MIN_WIDTH ? (step > 0 ? MIN_WIDTH : RAIL_WIDTH) : snapWidth(next))
        }}
      >
        <span aria-hidden className="h-6 w-0.5 rounded-full bg-muted-foreground/45" />
      </div>
    </aside>
  )
}

/** Below this width the sidebar is a page of its own, reached from the bar above the content. */
const NARROW = 860

export default function Canvas() {
  const { route, navigate } = useTab()
  const [measure, narrow] = useNarrow(NARROW)
  const [sidebarWidth, setSidebarWidth] = useState(savedSidebarWidth)
  const content = useRef<HTMLDivElement>(null)
  const page = /^\/tickets\/\d+$/.test(route) ? (
    <TicketPage key={route} at={route} />
  ) : /^\/notes\/[\w.-]+$/.test(route) ? (
    <NotePage key={route} at={route} />
  ) : route === "/journal" ? (
    <JournalPage />
  ) : (
    <Home />
  )

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
    } catch {
      // The sidebar still works if the browser denies storage.
    }
  }, [sidebarWidth])

  // A new page starts at its top.
  useEffect(() => {
    content.current?.scrollTo({ top: 0 })
  }, [route])

  if (narrow)
    return (
      <div ref={measure} className="flex min-h-0 flex-1 flex-col">
        <div role="toolbar" aria-label="Canvas" className="flex h-bar shrink-0 items-center gap-1 border-b px-2">
          <Button size="sm" variant={route === "/side" ? "ghost" : "secondary"} onClick={() => navigate("/")}>
            <PanelsTopLeft /> Overview
          </Button>
          <Button size="sm" variant={route === "/side" ? "secondary" : "ghost"} onClick={() => navigate("/side")}>
            <ListChecks /> Plan and notes
          </Button>
        </div>
        <div ref={content} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {route === "/side" ? <Sidebar route={route} /> : page}
        </div>
      </div>
    )

  return (
    <div ref={measure} className="flex min-h-0 flex-1 side-left:flex-row-reverse">
      <div ref={content} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {route === "/side" ? <Home /> : page}
      </div>
      <DesktopSidebar route={route} width={sidebarWidth} setWidth={setSidebarWidth} />
    </div>
  )
}
