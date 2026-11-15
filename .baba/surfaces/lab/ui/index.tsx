// The lab's page: the timeline of what entered the agent under test's context as the main column, a chat to drive it at
// its foot, and the sandbox's own root page beside it, live, where the person acts as the person. Hook injections and
// the word's answers stand out and open in full; other tool calls stay folded. What is open is this tab's own.
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, Composer, Empty, EmptyDescription, EmptyHeader, EmptyTitle, ToggleGroup, ToggleGroupItem, useMenus } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"

type Kind = "hook" | "message" | "word" | "tool" | "reply" | "thinking" | "turn" | "note"
type Tokens = { input: number; cache_write: number; cache_read: number; output: number }
type Row = { at: string; i: number; kind: Kind; title: string; size: number; line: string; context?: number | null; growth?: number | null }
type Whole = Row & { t: number; text: string; call?: string; error?: boolean; pending?: boolean; tokens?: Tokens; cost?: number; ms?: number; calls?: number }
type Root = {
  status: string
  run?: number
  model?: string
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

export const icon = <FlaskConicalIcon aria-hidden />

const MODELS = ["haiku", "sonnet", "opus"]
/** What each kind of chunk is called, and how it is marked: injections and the word's answers in colour, the rest quiet. */
const LOOK: Record<Kind, { label: string; edge: string; tag: string }> = {
  hook: { label: "hook", edge: "border-l-amber-500", tag: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  word: { label: "word", edge: "border-l-violet-500", tag: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  message: { label: "message", edge: "border-l-sky-500", tag: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
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

function Entry({ row, open, toggle }: { row: Row; open: boolean; toggle: () => void }) {
  const look = LOOK[row.kind]
  const inline = INLINE.has(row.kind)
  const entry = useEntry(row.at, row.size, open || inline)

  if (row.kind === "turn")
    return (
      <li className="text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-[11px] tabular-nums">
        <span className="bg-border h-px flex-1" />
        <span className={entry?.error ? "text-destructive" : "font-medium"}>{row.title}</span>
        <TurnFacts row={row} />
        <span className="bg-border h-px w-6" />
      </li>
    )

  return (
    <li className={`border-l-2 ${look.edge}`}>
      <button
        type="button"
        onClick={inline ? undefined : toggle}
        aria-expanded={inline ? undefined : open}
        className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs ${inline ? "cursor-default" : "hover:bg-muted/60"}`}
      >
        <span className={`inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-[10px] font-medium ${look.tag}`}>{look.label}</span>
        <span className={`shrink-0 ${row.kind === "hook" || row.kind === "word" ? "font-medium" : "text-muted-foreground"}`}>
          {row.kind === "word" ? "" : row.title}
        </span>
        <span className={`min-w-0 flex-1 truncate ${row.kind === "word" || row.kind === "tool" ? "font-mono text-[11px]" : "text-muted-foreground"}`}>
          {inline ? "" : row.line}
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
  const { call } = useTab()
  const [model, setModel] = useState("haiku")
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [refused, setRefused] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const entries = view?.run !== undefined ? (timeline?.entries ?? []) : []
  const act = async (handle: Handle | undefined, args: Record<string, string> = {}) => {
    if (!handle) return "not offered now"

    const answer = await call("/", handle.name, { ...handle.args, ...args })
    const reason = answer.outcome === "refused" ? answer.reason : undefined

    setRefused(reason ?? "")

    return reason
  }
  const toggle = (i: number) =>
    setOpen((was) => {
      const next = new Set(was)

      if (!next.delete(i)) next.add(i)

      return next
    })
  const injections = entries.filter((e) => e.kind === "hook" || e.kind === "word").map((e) => e.i)
  const allOpen = injections.length > 0 && injections.every((i) => open.has(i))

  // The page's own commands, in the frame's View menu and the palette: how the timeline is shown, and the next run's model.
  useMenus([
    {
      id: "view",
      label: "View",
      items: [
        {
          kind: "action",
          id: "injections",
          label: allOpen ? "Fold injections" : "Open injections",
          disabled: !injections.length,
          run: () => setOpen(allOpen ? new Set() : new Set([...open, ...injections])),
        },
        { kind: "choice", id: "model", label: "Model", value: model, options: MODELS.map((m) => ({ id: m, label: m })), set: setModel },
      ],
    },
  ])

  // The timeline follows its end while the person is at it, and stays where they scrolled to otherwise.
  useLayoutEffect(() => {
    const el = scroller.current

    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries.length, open])

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col border-r" aria-label="Timeline">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
            <Status status={view?.status ?? ""} />
            {view?.run !== undefined && (
              <span className="text-muted-foreground tabular-nums">
                run {view.run} · {view.model} · {view.turns} turns · {view.tokens && tokens(view.tokens)} · {money(view.cost ?? 0)}
              </span>
            )}
            <span className="flex-1" />
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
          {view?.ended && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{view.ended}</p>}
          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-auto"
            onScroll={(e) => {
              const el = e.currentTarget

              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {entries.length ? (
              <ol className="flex flex-col gap-px py-2">
                {entries.map((row) => (
                  <Entry key={`${view?.run}-${row.i}`} row={row} open={open.has(row.i)} toggle={() => toggle(row.i)} />
                ))}
              </ol>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{view?.status === "starting" ? "Making the sandbox…" : "No run"}</EmptyTitle>
                  <EmptyDescription>
                    Start a run: an agent under test in a sandbox with the greeting and queue surfaces. What enters its context shows here.
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
        <aside className="flex w-[46%] shrink-0 flex-col" aria-label="The sandbox's page">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
            <span className="font-medium">Sandbox page</span>
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
            <iframe key={view.page} src={view.page} title="The sandbox's root page" className="min-h-0 flex-1 border-0 bg-background" />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No page yet</EmptyTitle>
                <EmptyDescription>
                  The sandbox's root starts with the agent's first message; its page shows here, for you to act on as the person.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </aside>
      </div>
    </>
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
