// The run as a conversation: what was said to the agent under test as the user's bubbles, its replies as its own, and
// between them, in the order they happened, everything else that entered its context or was done on its page as steps,
// each one line that opens onto its content. A chain of steps folds under one line that says how many and how much,
// open while its turn runs; a turn's end is a quiet divider with what it took. The entry in the tab's route is open and
// scrolled to.
import { useEffect, useRef, type ReactNode } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  BrainIcon,
  EyeIcon,
  FlaskConicalIcon,
  HandIcon,
  ListTreeIcon,
  MousePointerClickIcon,
  SquareTerminalIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react"
import {
  Bubble,
  BubbleContent,
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
  Marker,
  MarkerContent,
  Message,
  MessageContent,
  MessageHeader,
  Thread,
  ThreadEvent,
  ThreadItem,
  ThreadStep,
  ThreadSteps,
} from "babavoss/kit/index.ts"
import { approx, breakdown, END_MOVE, money, PROSE, seconds, Told, useEntry, type Kind, type Row } from "./parts.tsx"

type Item =
  | { kind: "said"; row: Row }
  | { kind: "reply"; row: Row }
  | { kind: "turn"; row: Row }
  | { kind: "steps"; rows: Row[]; live: boolean }

/** The entries as the thread's items: messages, replies and turns stand alone; what comes between them is one chain of steps. */
export function items(entries: Row[], working: boolean): Item[] {
  const out: Item[] = []
  const lastTurn = entries.findLast((e) => e.kind === "turn")?.i ?? 0

  for (const row of entries) {
    if (row.kind === "message") out.push({ kind: "said", row })
    else if (row.kind === "reply") out.push({ kind: "reply", row })
    else if (row.kind === "turn") out.push({ kind: "turn", row })
    else {
      const last = out.at(-1)

      if (last?.kind === "steps") last.rows.push(row)
      else out.push({ kind: "steps", rows: [row], live: false })
    }
  }
  for (const item of out) if (item.kind === "steps") item.live = working && item.rows[0]!.i > lastTurn

  return out
}

const ICON: Record<Kind, ReactNode> = {
  hook: <ZapIcon />,
  word: <SquareTerminalIcon />,
  tool: <WrenchIcon />,
  thinking: <BrainIcon />,
  act: <MousePointerClickIcon />,
  person: <HandIcon />,
  note: <FlaskConicalIcon />,
  message: null,
  reply: null,
  turn: null,
}
/** Whose a step is, by colour: what was put into the agent's context, the root's word, and what was done on its page as the person. */
const TONE: Partial<Record<Kind, "context" | "accent" | "user">> = { hook: "context", word: "accent", act: "user", person: "user" }
/** What a tool was asked, in a line: the field of its input that says the most, else the input as it is. */
const asked = (line: string) => /"(?:command|file_path|path|pattern|url|query|skill|description|prompt)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(line)?.[1] ?? line
/** A call of the root's word as it reads: `baba` and what it was given, whatever path led to it. */
const word = (line: string) => line.replace(/^.*?\bbaba(?:\.ts)?\s+/, "").replace(/^--session\s+\S+\s+/, "")

/** A step's line: its title, what it says in a line, and its size where something entered the context. */
function line(row: Row): { title: ReactNode; description?: string; aside?: string } {
  const size = row.size ? approx(row.size) : undefined

  switch (row.kind) {
    case "hook":
      return { title: row.title, description: row.line, aside: size }
    case "word":
      return { title: <span className="font-mono">baba {word(row.line)}</span>, aside: size }
    case "tool":
      return { title: row.title, description: asked(row.line), aside: size }
    case "thinking":
      return { title: "Thinking", description: row.line, aside: size }
    case "act": {
      const [who, what] = row.title.split(", as the person: ")

      return { title: what ?? row.title, description: what ? `${who}, as the person` : undefined, aside: size }
    }
    case "person":
      return { title: row.line || row.title, description: row.title }
    default:
      return { title: row.title, description: row.line }
  }
}

/** What a step holds, read when it is opened: what it was asked, and what came back or entered the context. */
function Content({ row }: { row: Row }) {
  const entry = useEntry(row.at, row.size)

  if (!entry) return <p className="text-meta text-muted-foreground">Reading…</p>
  if (row.kind === "thinking") return <p className="text-body whitespace-pre-wrap text-muted-foreground italic">{entry.text}</p>
  if (row.kind === "hook" || row.kind === "note") return <Told text={entry.text} error={entry.error} />

  const result = entry.pending ? (
    <p className="text-meta text-muted-foreground">Waiting for its result…</p>
  ) : row.kind === "word" || row.kind === "act" ? (
    <Told text={entry.text} error={entry.error} />
  ) : (
    <Code title={entry.error ? "error" : "result"} text={entry.text} error={entry.error} />
  )

  return (
    <>
      {entry.call !== undefined && !entry.call.startsWith("look at ") && <Code title={row.kind === "tool" ? "input" : "command"} text={entry.call} />}
      {result}
    </>
  )
}

function Code({ title, text, error }: { title: string; text: string; error?: boolean }) {
  return (
    <CodeBlock size="sm" variant={error ? "destructive" : "default"}>
      <CodeBlockHeader>
        <CodeBlockTitle className="text-meta font-normal text-muted-foreground">{title}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={text} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap className="max-h-80 text-meta">
        {text || "(empty)"}
      </CodeBlockContent>
    </CodeBlock>
  )
}

function Step({ row, live, routed, go }: { row: Row; live: boolean; routed: number; go: (i: number, open: boolean) => void }) {
  const { title, description, aside } = line(row)
  const calling = live && row.size === 0 && (row.kind === "word" || row.kind === "tool" || row.kind === "act")

  return (
    <div data-entry={row.i} className={row.i === routed ? "-mx-1.5 rounded-md bg-accent/50 px-1.5" : undefined}>
      <ThreadStep
        icon={row.kind === "act" && row.title.includes(": look at ") ? <EyeIcon /> : ICON[row.kind]}
        title={title}
        description={description}
        aside={aside}
        tone={TONE[row.kind]}
        status={calling ? "running" : undefined}
        initial={row.i === routed}
        onOpenChange={(open) => go(row.i, open)}
      >
        {row.kind !== "person" && <Content row={row} />}
      </ThreadStep>
    </div>
  )
}

/** What a chain of steps counts in its line, each kind as one and as many. */
const COUNTED: Partial<Record<Kind, [string, string]>> = {
  hook: ["hook", "hooks"],
  word: ["baba", "baba"],
  tool: ["tool", "tools"],
  act: ["on the page", "on the page"],
  person: ["by you", "by you"],
}

/** A chain of steps: alone, its one step; more, under a line that says how many and how much entered the context. */
function Steps({ rows, live, routed, go }: { rows: Row[]; live: boolean; routed: number; go: (i: number, open: boolean) => void }) {
  if (rows.length === 1) return <Step row={rows[0]!} live={live} routed={routed} go={go} />

  const size = rows.reduce((n, r) => n + r.size, 0)
  const kinds = Object.entries(COUNTED)
    .map(([kind, [one, many]]) => [rows.filter((r) => r.kind === kind).length, one, many] as const)
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)

  return (
    <ThreadSteps
      icon={<ListTreeIcon />}
      summary={`${rows.length} steps`}
      description={kinds.join(" · ")}
      aside={size ? approx(size) : undefined}
      running={live}
      initial={live || rows.some((r) => r.i === routed)}
    >
      {rows.map((row) => (
        <Step key={row.i} row={row} live={live} routed={routed} go={go} />
      ))}
    </ThreadSteps>
  )
}

/** What was said to the agent under test, by the person or the developing agent, as the user's bubble; ending a move is an event. */
function Said({ row, routed }: { row: Row; routed: number }) {
  const entry = useEntry(row.at, row.size)

  if (entry?.text === END_MOVE)
    return (
      <div data-entry={row.i}>
        <ThreadEvent icon={<HandIcon />}>{row.title === "the person" ? "You" : "The developing agent"} ended the move on the page</ThreadEvent>
      </div>
    )

  return (
    <Message align="end" data-entry={row.i}>
      <MessageContent>
        <MessageHeader className="justify-end px-0">{row.title === "the person" ? "You" : row.title === "message" ? "Message" : "Developing agent"}</MessageHeader>
        <Bubble variant="tinted" align="end" className={row.i === routed ? "ring-2 ring-ring/40 rounded-lg" : undefined}>
          <BubbleContent className="text-body whitespace-pre-wrap">{entry?.text ?? row.line}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

/** What the agent under test replied, as markdown, in its own voice. */
function Reply({ row, routed }: { row: Row; routed: number }) {
  const entry = useEntry(row.at, row.size)

  return (
    <Message data-entry={row.i}>
      <MessageContent className={row.i === routed ? "-mx-1.5 rounded-md bg-accent/50 px-1.5" : undefined}>
        <div className={`${PROSE} text-body`}>
          <Markdown remarkPlugins={[remarkGfm]}>{entry?.text ?? row.line}</Markdown>
        </div>
      </MessageContent>
    </Message>
  )
}

/** Where a turn ended: a quiet line across the thread with what it took and cost. */
function TurnEnd({ row }: { row: Row }) {
  const entry = useEntry(row.at, row.size)
  const facts = entry?.tokens
    ? [row.title, seconds(entry.ms ?? 0), `${entry.calls ?? 0} ${entry.calls === 1 ? "call" : "calls"}`, breakdown(entry.tokens), money(entry.cost ?? 0)]
    : [row.title]

  return (
    <Marker variant="separator" data-entry={row.i} className={`tabular-nums ${entry?.error ? "text-destructive" : "text-muted-foreground/80"}`}>
      <MarkerContent title={entry?.error ? entry.text : undefined}>{facts.join(" · ")}</MarkerContent>
    </Marker>
  )
}

/** The thread of a run. `pending` is a first message waiting for its run to start; `routed` the entry in the route, or NaN. */
export function RunThread({
  run,
  entries,
  working,
  routed,
  go,
  pending,
  children,
}: {
  run: string
  entries: Row[]
  working: boolean
  routed: number
  go: (i: number, open: boolean) => void
  pending?: string
  children?: ReactNode
}) {
  const scrolled = useRef<string>("")
  const thread = useRef<HTMLDivElement>(null)

  // The routed entry is scrolled to once each time the route names it, after its fold has opened.
  useEffect(() => {
    const key = `${run}:${routed}`

    if (Number.isNaN(routed) || scrolled.current === key) return

    const el = thread.current?.querySelector(`[data-entry="${routed}"]`)

    if (!el) return
    scrolled.current = key
    requestAnimationFrame(() => requestAnimationFrame(() => el.scrollIntoView({ block: "center" })))
  }, [run, routed, entries.length])

  return (
    <div ref={thread} className="flex min-h-0 flex-1 flex-col">
      <Thread className="[&_[data-slot=message-scroller-content]]:mx-auto [&_[data-slot=message-scroller-content]]:max-w-3xl [&_[data-slot=message-scroller-content]]:px-4">
        {items(entries, working).map((item) => {
          const id = item.kind === "steps" ? `${run}-${item.rows[0]!.i}` : `${run}-${item.row.i}`

          return (
            <ThreadItem key={id} id={id}>
              {item.kind === "said" ? (
                <Said row={item.row} routed={routed} />
              ) : item.kind === "reply" ? (
                <Reply row={item.row} routed={routed} />
              ) : item.kind === "turn" ? (
                <TurnEnd row={item.row} />
              ) : (
                <Steps rows={item.rows} live={item.live} routed={routed} go={go} />
              )}
            </ThreadItem>
          )
        })}
        {pending && (
          <ThreadItem id={`${run}-pending`}>
            <Message align="end">
              <MessageContent>
                <MessageHeader className="justify-end px-0">You · sent once the run is up</MessageHeader>
                <Bubble variant="tinted" align="end" className="opacity-60">
                  <BubbleContent className="text-body whitespace-pre-wrap">{pending}</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </ThreadItem>
        )}
        {children}
      </Thread>
    </div>
  )
}

