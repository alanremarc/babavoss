// The lab's page: the timeline of what entered the agent under test's context as the main column, a chat to drive it at
// its foot, and the page under test beside it, live, where the person acts as the person. Hook injections, the word's
// answers and what the developing agent did as the person stand out and open in full; other tool calls stay folded.
// What is open is this tab's own; the entry in the tab's route, /entries/N, is open too and scrolled to, so a refresh or
// the agent's pointing lands on it; /runs shows the runs kept, each to open here.
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, Composer, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Plain, ToggleGroup, ToggleGroupItem } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"

type Kind = "hook" | "message" | "word" | "tool" | "reply" | "thinking" | "turn" | "act" | "note"
type Tokens = { input: number; cache_write: number; cache_read: number; output: number }
type Row = { at: string; i: number; kind: Kind; title: string; size: number; line: string; context?: number | null; growth?: number | null }
type Whole = Row & { t: number; text: string; call?: string; error?: boolean; pending?: boolean; tokens?: Tokens; cost?: number; ms?: number; calls?: number }
type Root = {
  status: string
  run?: string | null
  model?: string
  checkout?: string
  commit?: string
  uncommitted?: number
  page?: string
  ended?: string
  turns?: number
  tokens?: Tokens
  cost?: number
  start?: Handle
  say?: Handle
  end_move?: Handle
  stop?: Handle
  close?: Handle
}
type Past = {
  id: string
  began: string
  model: string
  status: string
  checkout?: string
  commit?: string
  uncommitted?: number
  turns: number
  cost: number
  shown?: boolean
  open?: Handle
}

export const icon = <FlaskConicalIcon aria-hidden />

const MODELS = ["haiku", "sonnet", "opus"]
/** What each kind of chunk is called, and how it is marked: injections and the word's answers in colour, the rest quiet. */
const LOOK: Record<Kind, { label: string; edge: string; tag: string }> = {
  hook: { label: "hook", edge: "border-l-amber-500", tag: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  word: { label: "word", edge: "border-l-violet-500", tag: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  message: { label: "message", edge: "border-l-sky-500", tag: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  act: { label: "as person", edge: "border-l-rose-500", tag: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  reply: { label: "reply", edge: "border-l-emerald-500", tag: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  tool: { label: "tool", edge: "border-l-border", tag: "bg-muted text-muted-foreground" },
  thinking: { label: "thinking", edge: "border-l-border", tag: "bg-muted text-muted-foreground" },
  turn: { label: "turn", edge: "border-l-transparent", tag: "bg-muted text-muted-foreground" },
  note: { label: "lab", edge: "border-l-transparent", tag: "text-muted-foreground" },
}
/** Shown whole without asking: what the person and the agent said to each other. */
const INLINE = new Set<Kind>(["message", "reply"])

const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const money = (n: number) => `$${n.toFixed(4)}`
const tokens = (t: Tokens) => `in ${k(t.input)} · cache write ${k(t.cache_write)} · cache read ${k(t.cache_read)} · out ${k(t.output)}`

/** An entry whole, read once and again only when it grows, as a tool's result arrives. */
function useEntry(path: string, size: number, wanted: boolean) {
  const { read } = useTab()
  const [entry, setEntry] = useState<Whole>()

  useEffect(() => {
    if (!wanted) return

    let stale = false

    void read<Whole>(path).then((e) => !stale && setEntry(e), () => {})

    return () => {
      stale = true
    }
  }, [read, path, size, wanted])

  return entry
}

const PRE = "max-h-[60vh] overflow-auto rounded-md bg-muted/60 p-2.5 font-mono text-[11px] leading-[1.55] whitespace-pre-wrap break-words"
const Pre = ({ children, tone }: { children: string; tone?: "error" }) => (
  <pre className={`${PRE} ${tone ? "text-destructive" : ""}`}>
    {children || "(empty)"}
  </pre>
)

function Entry({ row, open, toggle, here }: { row: Row; open: boolean; toggle: () => void; here?: boolean }) {
  const look = LOOK[row.kind]
  const inline = INLINE.has(row.kind)
  const entry = useEntry(row.at, row.size, open || inline)
  const item = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (here) item.current?.scrollIntoView({ block: "center" })
  }, [here])

  if (row.kind === "turn")
    return (
      <li ref={item} className="text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-[11px] tabular-nums">
        <span className="bg-border h-px flex-1" />
        <span className={entry?.error ? "text-destructive" : "font-medium"}>{row.title}</span>
        <TurnFacts row={row} />
        <span className="bg-border h-px w-6" />
      </li>
    )

  return (
    <li ref={item} aria-current={here || undefined} className={`border-l-2 ${look.edge} ${here ? "bg-accent/40" : ""}`}>
      <button
        type="button"
        onClick={inline ? undefined : toggle}
        aria-expanded={inline ? undefined : open}
        className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs ${inline ? "cursor-default" : "hover:bg-muted/60"}`}
      >
        <span className={`inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-[10px] font-medium ${look.tag}`}>{look.label}</span>
        <span className={`shrink-0 ${row.kind === "hook" || row.kind === "word" || row.kind === "act" ? "font-medium" : "text-muted-foreground"}`}>
          {row.kind === "word" ? "" : row.title}
        </span>
        <span className={`min-w-0 flex-1 truncate ${row.kind === "word" || row.kind === "tool" ? "font-mono text-[11px]" : "text-muted-foreground"}`}>
          {inline || row.kind === "act" ? "" : row.line}
        </span>
        <Context row={row} />
        <span className="text-muted-foreground/80 w-14 shrink-0 text-right text-[10px] tabular-nums" title={`${row.size} characters`}>
          {row.kind === "note" && !row.size ? "" : `${k(row.size)} ch`}
        </span>
      </button>
      {inline && entry && <p className="px-3 pt-0.5 pb-2 text-[13px] leading-[1.6] whitespace-pre-wrap">{entry.text}</p>}
      {!inline && open && entry && (
        <div className="flex flex-col gap-1.5 px-3 pt-0.5 pb-2.5">
          {entry.call !== undefined && <Pre>{entry.call}</Pre>}
          {entry.pending ? (
            <p className="text-muted-foreground text-xs">waiting for its result…</p>
          ) : (
            <Pre tone={entry.error ? "error" : undefined}>{entry.text}</Pre>
          )}
        </div>
      )}
    </li>
  )
}

/** The tokens an API call was given and how much the context grew, on the first chunk of the call. */
function Context({ row }: { row: Row }) {
  if (row.context == null) return null

  return (
    <span className="text-muted-foreground/80 shrink-0 text-[10px] tabular-nums" title="tokens given to this API call, and the growth since the one before">
      ctx {k(row.context)}
      {row.growth ? ` +${k(row.growth)}` : ""}
    </span>
  )
}

function TurnFacts({ row }: { row: Row }) {
  const entry = useEntry(row.at, row.size, true)

  if (!entry?.tokens) return null

  return (
    <span>
      {(entry.ms ?? 0) / 1000}s · {entry.calls} calls · {tokens(entry.tokens)} · {money(entry.cost ?? 0)}
    </span>
  )
}

export default function Lab() {
  const { view, error } = useLive<Root>("/")
  const { view: timeline } = useLive<{ entries: Row[] }>("/entries")
  const { call, route, navigate } = useTab()
  const routed = Number(/^\/entries\/(\d+)$/.exec(route)?.[1] ?? NaN)
  const listing = route === "/runs"
  const [model, setModel] = useState("haiku")
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [refused, setRefused] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const entries = view?.run !== undefined ? (timeline?.entries ?? []) : []
  const act = async (handle: Handle | undefined, args: Record<string, string> = {}, path = "/") => {
    if (!handle) return "not offered now"

    const answer = await call(path, handle.name, { ...handle.args, ...args })
    const reason = answer.outcome === "refused" ? answer.reason : undefined

    setRefused(reason ?? "")

    return reason
  }
  // Opening an entry puts it in the route; folding the routed one takes it out.
  const toggle = (i: number) => {
    const opening = !open.has(i) && i !== routed

    if (opening) navigate(`/entries/${i}`)
    else if (i === routed) navigate("/")
    setOpen((was) => {
      const next = new Set(was)

      if (opening) next.add(i)
      else next.delete(i)

      return next
    })
  }
  const injections = entries.filter((e) => e.kind === "hook" || e.kind === "word" || e.kind === "act").map((e) => e.i)
  const allOpen = injections.length > 0 && injections.every((i) => open.has(i))

  // The timeline follows its end while the person is at it, and stays where they scrolled to otherwise.
  useLayoutEffect(() => {
    const el = scroller.current

    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries.length, open])

  return (
    <Plain label="Lab">
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col border-r" aria-label="Timeline">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
            <Status status={view?.status ?? ""} />
            {view?.run !== undefined && (
              <span className="text-muted-foreground min-w-0 truncate tabular-nums" title={view.run ?? undefined}>
                {view.model} · {view.turns} turns · {view.tokens && tokens(view.tokens)} · {money(view.cost ?? 0)}
              </span>
            )}
            <span className="flex-1" />
            <Button size="sm" variant={listing ? "secondary" : "ghost"} onClick={() => navigate(listing ? "/" : "/runs")} aria-pressed={listing}>
              Runs
            </Button>
            {injections.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(allOpen ? new Set() : new Set([...open, ...injections]))}>
                {allOpen ? "Fold injections" : "Open injections"}
              </Button>
            )}
            {view?.start && (
              <>
                <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={model} onValueChange={(m) => m && setModel(m)} aria-label="Model">
                  {MODELS.map((m) => (
                    <ToggleGroupItem key={m} value={m} className="text-[11px]">
                      {m}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button size="sm" onClick={() => void act(view.start, { model })}>
                  Start run
                </Button>
              </>
            )}
            {view?.close && (
              <Button size="sm" variant="outline" onClick={() => void act(view.close)}>
                Close run
              </Button>
            )}
          </header>
          {view?.checkout && <Checkout of={view} />}
          {view?.ended && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{view.ended}</p>}
          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-auto"
            onScroll={(e) => {
              const el = e.currentTarget

              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {listing ? (
              <Runs open={(handle) => void act(handle, {}, "/runs").then((refusal) => !refusal && navigate("/"))} />
            ) : entries.length ? (
              <ol className="flex flex-col gap-px py-2">
                {entries.map((row) => (
                  <Entry
                    key={`${view?.run}-${row.i}`}
                    row={row}
                    open={open.has(row.i) || row.i === routed}
                    here={row.i === routed}
                    toggle={() => toggle(row.i)}
                  />
                ))}
              </ol>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{view?.status === "starting" ? "Copying the checkout…" : "No run"}</EmptyTitle>
                  <EmptyDescription>
                    Start a run: an agent under test in a copy of this repository as it is now, uncommitted work included, with its real
                    surfaces and hooks and a home of its own. What enters its context shows here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          {(refused || error) && (
            <p role="alert" className="text-destructive px-3 py-1 text-xs">
              {refused || error}
            </p>
          )}
          <Composer
            label="Message to the agent under test"
            placeholder="Message the agent under test"
            closed="Start a run to message the agent under test"
            send={view?.say ? (text) => act(view.say, { text }) : undefined}
            stop={view?.stop ? () => void act(view.stop) : undefined}
            footer={
              view?.end_move && (
                <Button size="xs" variant="outline" onClick={() => void act(view.end_move)} title="Tell the agent you ended your move on its page">
                  End my move
                </Button>
              )
            }
          />
        </section>
        <aside className="flex w-[46%] shrink-0 flex-col" aria-label="The page under test">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
            <span className="font-medium">Page under test</span>
            {view?.page && (
              <a
                href={view.page}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-1 font-mono text-[11px]"
              >
                <span className="truncate">{view.page}</span>
                <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
              </a>
            )}
          </header>
          {view?.page && view.status !== "closed" ? (
            <iframe key={view.page} src={view.page} title="The page under test" className="min-h-0 flex-1 border-0 bg-background" />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No page yet</EmptyTitle>
                <EmptyDescription>
                  The root under test starts with the run; its page shows here, for you to act on as the person.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </aside>
      </div>
    </Plain>
  )
}

/** Which checkout the run is a copy of, at which commit, and whether it carried uncommitted work. */
function Checkout({ of }: { of: Root }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 border-b px-3 py-1 text-[11px]">
      <span className="min-w-0 truncate font-mono" title={of.checkout}>
        {of.checkout}
      </span>
      {of.commit && <span className="font-mono">@ {of.commit}</span>}
      {of.uncommitted ? <span className="text-warning">+ {of.uncommitted} uncommitted</span> : of.commit && <span>clean</span>}
    </p>
  )
}

/** The runs kept, newest first, each to open here while no run is up. */
function Runs({ open }: { open: (handle: Handle) => void }) {
  const { view } = useLive<{ runs: Past[] }>("/runs")
  const runs = view?.runs ?? []

  if (!runs.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No runs yet</EmptyTitle>
          <EmptyDescription>Each run's record is kept under .babavoss/lab/runs, and listed here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <ol className="flex flex-col py-1">
      {runs.map((run) => (
        <li key={run.id} className={`flex items-center gap-3 px-3 py-1.5 text-xs ${run.shown ? "bg-accent/40" : ""}`}>
          <span className="w-36 shrink-0 tabular-nums">{new Date(run.began).toLocaleString()}</span>
          <span className="text-muted-foreground w-12 shrink-0">{run.model}</span>
          <span className="text-muted-foreground w-14 shrink-0">{run.status}</span>
          <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]" title={run.checkout}>
            {run.checkout?.split("/").at(-1)} @ {run.commit}
            {run.uncommitted ? ` + ${run.uncommitted}` : ""}
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {run.turns} turns · {money(run.cost)}
          </span>
          {run.open ? (
            <Button size="xs" variant="outline" onClick={() => open(run.open!)}>
              Open
            </Button>
          ) : (
            <span className="w-11 shrink-0 text-right text-[11px] text-muted-foreground">{run.shown ? "shown" : ""}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

function Status({ status }: { status: string }) {
  const tone =
    status === "working"
      ? "bg-primary animate-pulse"
      : status === "idle"
        ? "bg-emerald-500"
        : status === "starting" || status === "closing"
          ? "bg-amber-500 animate-pulse"
          : "bg-border"

  return (
    <span className="flex items-center gap-1.5 font-medium">
      <span className={`size-2 rounded-full ${tone}`} aria-hidden />
      {status}
    </span>
  )
}
