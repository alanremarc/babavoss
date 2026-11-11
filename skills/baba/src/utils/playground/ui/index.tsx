// Playground: agent sessions with the app under development loaded, watched by the person, each a child of a workspace
// made from a preset. With several apps under the project, the first screen picks one. The person works in one
// workspace at a time: the toolbar's head picks it, and makes another from a preset; under it are its sessions, and the
// scenarios, a short list, each run where it belongs. A row tips the rest and carries what can be done to it. The content
// is the open workspace's overview, a scenario's file, or the session in view, two columns under a header each: the trace
// as a thread on the left, messages in full and the agent's work between them gathered into steps, under how the session
// stands; and the app's own page on the right, or its view at / as the agent sees it. A new session is started under a setup picked where it is asked for; the model and
// effort it runs on are picked in its composer from what its harness offers, beside how full its context is.
import { useEffect, useState, type ReactNode } from "react"
import {
  ArrowLeftIcon,
  BoxIcon,
  BookOpenIcon,
  BrainIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClapperboardIcon,
  ExternalLinkIcon,
  EyeIcon,
  InfoIcon,
  FolderPlusIcon,
  HistoryIcon,
  LoaderCircleIcon,
  MousePointerClickIcon,
  PaperclipIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  PowerIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import { Group, Panel, useDefaultLayout } from "react-resizable-panels"
import type { Handle, Json } from "babavoss/core/index.ts"
import {
  Bubble,
  BubbleContent,
  Button,
  Composer,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Thread,
  ThreadItem,
  ThreadEnd,
  ThreadEvent,
  ThreadStep,
  useLive,
  useNarrow,
  useTab,
  useThreadDetail,
  Workbench,
  WorkbenchButton,
  WorkbenchCode,
  WorkbenchEmpty,
  Popover,
  PopoverContent,
  PopoverTrigger,
  WorkbenchList,
  WorkbenchNotice,
  WorkbenchPage,
  WorkbenchPicker,
  WorkbenchProperties,
  WorkbenchSegments,
  WorkbenchSpacer,
  WorkbenchSplitter,
  WorkbenchToolbar,
  type MenuItem,
  type Scope,
  type Scopes,
  type WorkbenchAction,
  type WorkbenchFacts,
  type WorkbenchIcon,
} from "babavoss/shell/ui/index.ts"
import { MarkdownBody } from "../../../ui/markdown.tsx"
import { ContextKnob } from "./context.tsx"

// The views this page reads, as the playground's surface serves them.

type Setup = { name: string; harness: "claude-code" | "codex"; model?: string; effort?: string; sandbox?: boolean }
/** Tokens over turns: `input` all that was read; of it `cached` from the prompt cache and `written` to it, where the harness said. */
type Tokens = { input: number; output: number; cached?: number; written?: number }
type AppRef = { id: string; name: string; version?: string; dir: string }
type Preset = { name: string; description?: string; files: number; bytes: number; updated?: string; builtin?: true }
type Problem = { file: string; message: string }
type Status = "new" | "idle" | "busy" | "exited"
type ScenarioState = { name: string; state: "running" | "done" | "failed" }
type WorkspaceRef = { at: string; id: string; name: string; preset: string; created: string; kind: "local"; scenario?: string; sessions: number; live: boolean }
/** A workspace as the root lists it, to open or trash. */
type WorkspaceRow = WorkspaceRef & { open: Handle; delete: Handle }
type SessionRef = {
  at: string
  n: number
  setup: string
  harness: string
  status: Status
  startedAt: number
  endedAt?: number
  costUsd?: number
  scenario?: ScenarioState
}
/** A workspace read on its own: where it is, and its sessions to look at or resume. */
type WorkspaceView = WorkspaceRef & { dir: string; sessions: (SessionRef & { look: Handle; resume?: Handle })[]; open: Handle; delete: Handle; start?: Handle }
type Session = {
  at: "/session"
  status: Status
  setup: string
  harness: string
  /** What it runs on as asked; `ran`, the model as the harness named it. */
  model?: string
  effort?: string
  ran?: string
  session?: string
  app: AppRef
  workspace: WorkspaceRef
  n: number
  scenario?: ScenarioState & { error?: string }
  page?: string
  startedAt: number
  endedAt?: number
  error?: string
  costUsd?: number
  tokens?: Tokens
  durationMs?: number
  send?: Handle
  stop?: Handle
  resume?: Handle
}
type ScenarioRow = { at: string; name: string; description?: string; setup?: string; preset?: string; run: Handle; fresh: Handle }
type AppRow = AppRef & { at: string; description?: string; scenarios?: number; presets?: number; select: Handle }
/** The root with no app chosen: the apps found under the project, to pick one. */
type ListView = { title: "Playground"; project: string; apps: AppRow[]; app: null; rescan: Handle }
/** The root with an app chosen: its setups, presets, scenarios and workspaces, the open workspace and the session in view. */
type RootView = {
  title: "Playground"
  project: string
  app: AppRef
  apps?: AppRow[]
  back?: Handle
  workspaces: WorkspaceRow[]
  workspace: string | null
  create: Handle
  /** Each as a new session starts under it; `setup` the one last started under. */
  setups: Setup[]
  setup: string
  presets: Preset[]
  preset: string
  pick: Handle
  scenarios: ScenarioRow[]
  problems?: Problem[]
  session: Session | null
  start?: Handle
  rescan: Handle
}
/** A model the harness offers: the efforts it takes, the one it uses unasked. */
type Offered = { id: string; name: string; description?: string; efforts: string[]; effort?: string; default?: boolean }
type CommandsView = { commands: { name: string; description: string; insert: string }[] }
type ScenarioView = ScenarioRow & { file: string; source: string }
/** The app's part in a step, as the surface marks it: which part, by what, its size in tokens, estimated. */
type Mark = { part: "skills" | "calls"; by: string; tokens: number }
/** A command to the app's cli, read back as what it asked of the surface. */
type SurfaceCall = { verb: "open" | "read" | "call" | "wait" | "close" | "program"; path: string; handle?: string; input?: unknown; code?: string }
type SkillBody = { title: string; text: string; mark?: Mark }
type Entry =
  | { at: number; kind: "you"; text: string; by: "person" | "scenario" }
  | { at: number; kind: "text"; text: string }
  | { at: number; kind: "thinking"; text?: string; durationMs?: number }
  | {
      at: number
      kind: "tool"
      id: string
      name: string
      input: unknown
      output?: string
      error?: boolean
      skillBodies?: SkillBody[]
      mark?: Mark
      surface?: SurfaceCall
    }
  | ({ at: number; kind: "skill" } & SkillBody)
  | { at: number; kind: "call"; by: "person" | "scenario"; path: string; handle: string; input: unknown; refused?: string; result?: unknown }
  | { at: number; kind: "read"; path: string; view: unknown }
  | { at: number; kind: "turn"; durationMs?: number; costUsd?: number; tokens?: Tokens }
  | { at: number; kind: "note"; text: string }
  | { at: number; kind: "context"; tokens: number; cached?: number }
/** What the agent did between two messages: thinking, tools, skills it opened. */
type Work = Extract<Entry, { kind: "thinking" | "tool" | "skill" }>
/** The session in view as it reads alone: its trace, the app's view, and what its harness offers to run on. */
type SessionView = Session & {
  view?: Json
  transcript: Entry[]
  models?: Offered[]
  efforts?: string[]
  unasked?: string
  offersError?: string
  asking?: boolean
  setModel: Handle
  setEffort: Handle
}
/** Calls a handle where it was offered, showing a refusal to the person. */
type Act = (path: string, handle: Handle, extra?: Record<string, Json>) => Promise<boolean>

/** Below this width of the content, the chat and the page share one column, switched from the toolbar. */
const NARROW_PX = 720

const muted = "text-muted-foreground"
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-ring"
const size = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"]
  let n = bytes
  let u = 0

  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }

  return `${u === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`
}
/** When something last changed, as a person says it: just now, 5 min ago, 3 days ago, a date past a month. */
const ago = (iso: string, now = Date.now()) => {
  const ms = now - Date.parse(iso)

  if (!Number.isFinite(ms)) return iso
  if (ms < 60_000) return "just now"
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`
  if (ms < 30 * 86_400_000) return plural(Math.floor(ms / 86_400_000), "day") + " ago"

  return new Date(iso).toLocaleDateString()
}
const agoMs = (ms: number, now?: number) => ago(new Date(ms).toISOString(), now)
const stamp = (iso: string) => {
  const d = new Date(iso)

  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}
/** Which tool a problem belongs under, by its file: a preset's under the sessions, whose head makes workspaces from them; else the scenarios', the setups file among them. */
const problemTool = (p: Problem) => (p.file.startsWith("assets/presets/") ? "sessions" : "scenarios")
/** A path as a line has room for it: its last two parts after an ellipsis. */
const shortPath = (path: string) => {
  const parts = path.split("/").filter(Boolean)

  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path
}
const seconds = (ms: number) =>
  ms < 60_000
    ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
    : ms < 3_600_000
      ? `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
      : `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
const money = (usd: number) => `$${usd.toFixed(3)}`
const tokens = (t: Tokens) =>
  [
    `${t.input.toLocaleString()} in`,
    t.cached !== undefined && `${t.cached.toLocaleString()} cached`,
    t.written ? `${t.written.toLocaleString()} written to the cache` : false,
    `${t.output.toLocaleString()} out`,
  ]
    .filter(Boolean)
    .join(" · ")
/** Time since the session started, as a gutter reads it: +12.3s, +4:05. */
const since = (ms: number) => {
  const s = Math.max(0, ms) / 1000

  return s < 60 ? `+${s.toFixed(1)}s` : `+${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}
const pretty = (value: unknown) => (typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value)))
const compact = (value: unknown, max = 120) => {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))

  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
/** A tool's input in a line: its command, path or pattern where it has one, its JSON otherwise. */
const gist = (input: unknown) => {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>

    for (const key of ["command", "file_path", "path", "pattern", "url", "query", "description"])
      if (typeof record[key] === "string") return compact(record[key], 100)
  }

  return compact(input, 100)
}
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`
const scenarioWord = { running: "running", done: "done", failed: "failed" } as const
const statusWord = { new: "starting", idle: "idle", busy: "working", exited: "exited" } as const
/** Terms that have a value. */
const facts = (rows: [string, ReactNode | undefined | false][]): WorkbenchFacts => rows.filter((r): r is [string, ReactNode] => !!r[1])
const mono = (text: string) => <span className="font-mono break-all">{text}</span>

/** Now, every second while `ticking`: a running session's clock. */
function useNow(ticking: boolean) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!ticking) return

    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [ticking])

  return now
}

// The thread: messages in full, and between them every step the agent took as a line of its own, folded to one line
// and opening onto its detail. Whose a step is shows in its colour: the app's skill and cli answers,
// in the accent; what the person or a scenario did on the app's
// page, in the user side's, at the near side like every step; the app's skills and its cli commands, read back as the
// surface calls they made, in the accent. Thinking with words to it is a line; a pause without is said on the line after it.

/** Which of the trace shows: all of it, or the app's part with the conversation around it. */
type Lens = "all" | "app"

const isWork = (entry: Entry): entry is Work => entry.kind === "thinking" || entry.kind === "tool" || entry.kind === "skill"

/** The transcript as the thread shows it: each message its own item, each run of steps one item of lines; what a call read is the context knob's. */
function grouped(transcript: Entry[]): ({ i: number; entry: Exclude<Entry, Work | { kind: "context" }> } | { i: number; work: Work[] })[] {
  const items: ReturnType<typeof grouped> = []

  transcript.forEach((entry, i) => {
    const last = items.at(-1)

    if (entry.kind === "context") return
    if (!isWork(entry)) items.push({ i, entry })
    else if (last && "work" in last) last.work.push(entry)
    else items.push({ i, work: [entry] })
  })

  return items
}

/** A size in tokens, as a line has room for it. */
const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k tok` : `${n} tok`)
/** The first line of a text, as a step's description shows it. */
const firstLine = (text: string) => text.trim().split("\n")[0] ?? ""
const PART: Record<Mark["part"], string> = { skills: "skill", calls: "cli" }

/** The text of a skill the agent opened. */
function SkillBodyStep({ a, aside }: { a: SkillBody; aside?: string }) {
  return (
    <ThreadStep
      icon={<PaperclipIcon />}
      title={a.mark ? PART[a.mark.part] : "skill"}
      description={a.title}
      aside={[a.mark ? tok(a.mark.tokens) : plural(a.text.split("\n").length, "line"), aside].filter(Boolean).join(" · ")}
      tone={a.mark ? "accent" : undefined}
    >
      <WorkbenchCode text={a.text} />
    </ThreadStep>
  )
}

/**
 * A tool the agent called, as one line: a command to the app's cli as the surface call it made, the app's own skill
 * with its body inside, anything else by its name and its input in brief.
 */
function ToolStep({ entry, running, aside }: { entry: Extract<Entry, { kind: "tool" }>; running: boolean; aside?: string }) {
  const pending = entry.output === undefined && running
  const status = entry.error ? "error" : pending ? "running" : undefined
  const call = entry.surface
  const body = entry.mark?.part === "skills" ? entry.skillBodies?.[0] : undefined
  const size = entry.mark && tok(entry.mark.tokens + (body?.mark?.tokens ?? 0))
  const after = [size, aside].filter(Boolean).join(" · ") || undefined
  const io = (
    <>
      <WorkbenchCode title="Input" text={pretty(entry.input)} />
      {entry.output !== undefined && (
        <WorkbenchCode title={entry.error ? "Error" : "Output"} text={entry.output || "(empty)"} tone={entry.error ? "error" : undefined} />
      )}
    </>
  )

  if (call)
    return (
      <ThreadStep
        icon={call.verb === "call" ? <MousePointerClickIcon /> : <EyeIcon />}
        title={call.verb === "call" ? call.handle : call.verb}
        description={
          <span className="font-mono">{[call.code ?? call.path, call.input !== undefined && compact(call.input, 80)].filter(Boolean).join("  ")}</span>
        }
        aside={after}
        status={status}
        tone="accent"
      >
        {io}
      </ThreadStep>
    )
  if (body)
    return (
      <ThreadStep icon={<BookOpenIcon />} title="skill" description={body.title} aside={after} status={status} tone="accent">
        <WorkbenchCode text={body.text} />
      </ThreadStep>
    )

  return (
    <ThreadStep
      icon={entry.name === "Bash" || entry.name === "command" ? <TerminalIcon /> : <WrenchIcon />}
      title={entry.name}
      description={<span className="font-mono">{gist(entry.input)}</span>}
      aside={after}
      status={status}
      tone={entry.mark ? "accent" : undefined}
    >
      {io}
    </ThreadStep>
  )
}

/**
 * A run of steps as lines, each its own and folded: a thought with words, every tool and what it brought along, each
 * skill opened. A pause in thought with nothing to read is said on the line after it. Through the app's lens,
 * only the app's lines.
 */
function stepLines(work: Work[], running: boolean, lens: Lens): ReactNode[] {
  const lines: ReactNode[] = []
  let paused = 0

  work.forEach((entry, n) => {
    const last = n === work.length - 1

    if (entry.kind === "thinking") {
      const thinking = running && last && entry.durationMs === undefined

      if (!entry.text && !thinking) paused += entry.durationMs ?? 0
      else if (lens === "all")
        lines.push(
          <ThreadStep
            key={n}
            icon={<BrainIcon />}
            title={thinking ? "Thinking" : "Thought"}
            description={entry.text && firstLine(entry.text)}
            aside={entry.durationMs !== undefined ? seconds(entry.durationMs) : undefined}
            status={thinking ? "running" : undefined}
          >
            {entry.text && <p className="whitespace-pre-wrap">{entry.text}</p>}
          </ThreadStep>
        )

      return
    }

    const aside = paused ? `thought ${seconds(paused)}` : undefined

    paused = 0
    if (entry.kind === "skill") {
      if (lens === "all" || entry.mark) lines.push(<SkillBodyStep key={n} a={entry} aside={aside} />)

      return
    }
    if (lens === "all" || entry.mark) lines.push(<ToolStep key={n} entry={entry} running={running && last} aside={aside} />)
    entry.skillBodies?.forEach((a, k) => {
      // The app's skill carries its body in its own line.
      if (entry.mark?.part === "skills") return
      if (lens === "all" || a.mark) lines.push(<SkillBodyStep key={`${n}.${k}`} a={a} />)
    })
  })

  return lines
}

/** What happened to the session, by how its note begins: another model from here on, a resume, a stop or restart, a scenario's end. */
const noteIcon = (text: string) =>
  text.startsWith("from here on") ? (
    <SlidersHorizontalIcon />
  ) : text.startsWith("resumed") ? (
    <HistoryIcon />
  ) : text.startsWith("scenario") ? (
    <ClapperboardIcon />
  ) : text.startsWith("stopped") || text.includes("restarted") || text.includes("exited") ? (
    <PowerIcon />
  ) : (
    <InfoIcon />
  )

/** A message of the thread: the user side at the far end, the agent at the near one; a turn's figures under it, what happened to the session in the middle. */
function MessageView({ entry }: { entry: Exclude<Entry, Work | { kind: "context" }> }) {
  switch (entry.kind) {
    case "you":
      return (
        <Bubble align="end" variant={entry.by === "person" ? "muted" : "tinted"}>
          <BubbleContent className="whitespace-pre-wrap">{entry.text}</BubbleContent>
        </Bubble>
      )
    case "text":
      // github-markdown-css is imported after the shell's defaults, so its unlayered size and background win over plain utilities.
      return <MarkdownBody className="bg-transparent! text-body! [&_ol]:list-decimal [&_ul]:list-disc" text={entry.text} />
    case "call":
      return (
        <ThreadStep
          icon={<MousePointerClickIcon />}
          title={entry.handle}
          description={<span className="font-mono">{[entry.path, entry.input !== undefined && compact(entry.input, 80)].filter(Boolean).join("  ")}</span>}
          aside={entry.refused !== undefined ? "refused" : entry.result !== undefined ? "written" : "no answer yet"}
          status={entry.refused !== undefined ? "error" : undefined}
          tone="user"
          initial={entry.refused !== undefined}
        >
          <WorkbenchCode title="Arguments" text={pretty(entry.input ?? {})} />
          {entry.refused !== undefined ? (
            <WorkbenchCode title="Refused" text={entry.refused} tone="error" />
          ) : (
            entry.result !== undefined && <WorkbenchCode title="Answer" text={pretty(entry.result)} />
          )}
        </ThreadStep>
      )
    case "read":
      return (
        <ThreadStep icon={<EyeIcon />} title="read" description={<span className="font-mono">{entry.path}</span>} tone="user">
          <WorkbenchCode text={pretty(entry.view)} />
        </ThreadStep>
      )
    case "note":
      return (
        <ThreadEvent icon={noteIcon(entry.text)} title={entry.text}>
          {entry.text}
        </ThreadEvent>
      )
    case "turn":
      return (
        <ThreadEnd title={entry.tokens ? `Turn done · ${tokens(entry.tokens)}` : "Turn done"}>
          {[entry.durationMs !== undefined && seconds(entry.durationMs), entry.costUsd !== undefined && money(entry.costUsd)].filter(Boolean).join(" · ") ||
            undefined}
        </ThreadEnd>
      )
  }
}

/** The trace as a thread, through `lens`; when each thing happened is on hover. */
function Transcript({ view, detail, lens }: { view: SessionView; detail: ReturnType<typeof useThreadDetail>["detail"]; lens: Lens }) {
  const busy = view.status === "busy"
  const items = grouped(view.transcript)
  const last = items.at(-1)
  const when = (entry: Entry, who?: string) => [who, since(entry.at - view.startedAt), new Date(entry.at).toLocaleTimeString()].filter(Boolean).join(" · ")

  return (
    <Thread detail={detail}>
      {items.length === 0 && !busy && (
        <ThreadItem id="empty">
          <p className={muted}>{view.send ? "Nothing yet. Prompt the agent below; / completes the app's skills." : "Nothing yet."}</p>
        </ThreadItem>
      )}
      {items.map((item) => {
        if ("work" in item) {
          const lines = stepLines(item.work, busy && item === last, lens)

          return (
            lines.length > 0 && (
              <ThreadItem key={item.i} id={`entry-${item.i}`} title={when(item.work[0]!)}>
                <div className="flex flex-col gap-1">{lines}</div>
              </ThreadItem>
            )
          )
        }

        // The user side's messages sit at the far end; what it did on the app's page is a step like the agent's, in its colour.
        const user = item.entry.kind === "you" || item.entry.kind === "call" || item.entry.kind === "read"
        const who = !user ? undefined : "by" in item.entry && item.entry.by === "person" ? "The person" : "The scenario"

        return (
          <ThreadItem key={item.i} id={`entry-${item.i}`} end={item.entry.kind === "you"} title={when(item.entry, who)}>
            <MessageView entry={item.entry} />
          </ThreadItem>
        )
      })}
      {busy && !(last && "work" in last) && (
        <ThreadItem id="busy">
          <ThreadStep title="Working" status="running" />
        </ThreadItem>
      )}
    </Thread>
  )
}

/** Why nothing can be sent, when nothing can. */
const closedBecause = (view: Session) =>
  view.status === "exited"
    ? view.resume
      ? "The session has exited."
      : "The session has exited. Start another to prompt."
    : view.scenario?.state === "running"
      ? "A scenario is running: it speaks for the user."
      : view.status === "busy"
        ? "The agent is working."
        : "Not taking messages now."

/** What the session runs on, picked from what its harness offers: the model, then the effort that model takes. */
function Tuning({ view, act }: { view: SessionView; act: Act }) {
  const model = view.models?.find((m) => m.id === view.model) ?? (view.model ? undefined : view.models?.find((m) => m.default))
  const why = view.offersError ?? (view.asking ? `Asking ${view.harness} what it offers` : undefined)
  const effort = view.effort ?? view.unasked

  return (
    <>
      <WorkbenchPicker
        label={why ?? `Model, of what ${view.harness} offers; from the next call on`}
        value={model?.id}
        none={view.model ?? view.ran ?? (view.asking ? "asking" : "default model")}
        options={(view.models ?? []).map((m) => ({ id: m.id, label: m.name, description: m.description, detail: m.default ? "default" : undefined }))}
        set={(id) => void act(view.at, view.setModel, { model: id })}
      />
      {view.efforts?.length !== 0 && (
        <WorkbenchPicker
          label="Effort, of what the model takes; from the next call on"
          value={effort}
          none={effort ?? "default effort"}
          options={(view.efforts ?? []).map((e) => ({ id: e, label: e, detail: e === view.unasked ? "default" : undefined }))}
          set={(e) => void act(view.at, view.setEffort, { effort: e })}
        />
      )}
    </>
  )
}

/** The prompt: a message as the person, the app's skills completing by name; what the session runs on and how full its context is below it. */
function Prompt({ view, act }: { view: SessionView; act: Act }) {
  const { call } = useTab()
  const { view: offered } = useLive<CommandsView>("/commands")

  return (
    <Composer
      placeholder="Prompt the agent, as the person"
      closed={closedBecause(view)}
      send={
        view.send &&
        (async (text) => {
          const answer = await call(view.at, view.send!.name, { ...view.send!.args, text })

          return answer.outcome === "refused" ? answer.reason : undefined
        })
      }
      stop={view.stop && (() => void call(view.at, view.stop!.name, view.stop!.args))}
      reopen={view.resume && { label: "Resume", title: `Resume session ${view.n} where it stopped`, run: () => void act(view.at, view.resume!) }}
      completions={offered?.commands.map((c) => ({ id: c.name, label: c.insert.trim(), description: c.description, insert: c.insert }))}
      footer={
        <>
          <Tuning view={view} act={act} />
          <ContextKnob />
          <SessionInfo view={view} />
        </>
      }
    />
  )
}

/**
 * The app's page under the host this page was opened on. A runtime names itself 127.0.0.1; a person may have opened the
 * playground on localhost. A page keeps its service token in a cookie that only travels within one site, so embedded
 * across the two names it would be refused its own views.
 */
const sameHost = (url: string): string => {
  try {
    const at = new URL(url)

    at.hostname = window.location.hostname

    return at.toString().replace(/\/$/, "")
  } catch {
    return url
  }
}

/** The app's own page for this session, or its view at / as the agent reads it, under a header of its own; `column` switches to the chat where the two share one column. */
function AppPane({ view, column }: { view: SessionView; column?: ReactNode }) {
  const [lens, setLens] = useState<"page" | "view">("page")
  const [loads, setLoads] = useState(0)
  const page = view.page && sameHost(view.page)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkbenchToolbar label="App page">
        {column}
        <WorkbenchSegments
          label="Show"
          options={[
            { id: "page", label: "Page" },
            { id: "view", label: "View" },
          ]}
          value={lens}
          set={setLens}
        />
        <WorkbenchSpacer />
        <WorkbenchButton
          action={{ id: "reload", label: "Reload the page", icon: RefreshCwIcon, run: () => setLoads((n) => n + 1), disabled: !page || lens !== "page" }}
        />
        <WorkbenchButton
          action={{
            id: "browser",
            label: page ? `Open ${page} in the browser` : "No page yet",
            icon: ExternalLinkIcon,
            run: () => page && window.open(page, "_blank", "noopener"),
            disabled: !page,
          }}
        />
      </WorkbenchToolbar>
      {lens === "view" ? (
        view.view !== undefined ? (
          <WorkbenchPage wide>
            <WorkbenchCode title="The app's view at /, as the agent sees it" text={pretty(view.view)} copy />
          </WorkbenchPage>
        ) : (
          <WorkbenchEmpty>
            {view.status === "exited" ? "The session ended before the app's view was read." : "The app's view appears once its runtime is up."}
          </WorkbenchEmpty>
        )
      ) : page ? (
        <iframe key={loads} title="The app's page" src={page} className="min-h-0 w-full flex-1 border-0 bg-background" />
      ) : (
        <WorkbenchEmpty>
          {view.status === "exited"
            ? "The session ended before the app's runtime came up."
            : "The app's runtime is not up yet. Its page appears here once the agent wakes it."}
        </WorkbenchEmpty>
      )}
    </div>
  )
}

/** A workspace's directory, read-only: shortened, the whole path on hover, copied on a click. */
function WorkspacePath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopied(false), 1500)

    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      title={`${path}\nClick to copy`}
      aria-label={`Copy the workspace path ${path}`}
      className={`max-w-full truncate rounded-sm font-mono hover:underline ${ring}`}
      onClick={() => void navigator.clipboard?.writeText(path).then(() => setCopied(true))}
    >
      {copied ? "copied" : shortPath(path)}
    </button>
  )
}

/** A session's state as a mark: spinning while it works or its scenario runs, the scenario's outcome, stopped, or idle. */
function markOf(status: Status, scenario?: ScenarioState): { icon: WorkbenchIcon; busy?: boolean; tone?: "error"; word: string } {
  const word = `${scenario ? `${scenario.name} ${scenarioWord[scenario.state]} · ` : ""}${statusWord[status]}`

  if (scenario?.state === "running" || status === "busy" || status === "new") return { icon: LoaderCircleIcon, busy: true, word }
  if (scenario?.state === "failed") return { icon: CircleXIcon, tone: "error", word }
  if (scenario?.state === "done") return { icon: CircleCheckIcon, word }

  return { icon: status === "exited" ? SquareIcon : PlayIcon, word }
}

/** A workspace that may be trashed: what the confirmation names. */
type Trashable = { at: string; name: string; sessions: number; live: boolean; delete: Handle }

/** The one confirmation before a workspace goes to the trash. */
function TrashDialog({ target, close, confirm }: { target?: Trashable; close: () => void; confirm: (t: Trashable) => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Move to the trash?</DialogTitle>
        <DialogDescription>
          {target &&
            `${target.name} goes to the system trash: its files, the harness's home, the app's state${target.sessions ? ` and ${plural(target.sessions, "session")}` : ""}.${target.live ? " Its live session is stopped." : ""}`}
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (target) confirm(target)
              close()
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            Move to the trash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The setups a new session may start under, as a picker lists them: what each runs on, in which harness. */
const setupOptions = (setups: Setup[]) =>
  setups.map((s) => ({
    id: s.name,
    label: s.name,
    description: [s.model ?? "default model", s.effort].filter(Boolean).join(" · "),
    detail: s.harness === "claude-code" ? "Claude Code" : s.harness === "codex" ? "Codex" : s.harness,
  }))

/** The action that starts a session in a workspace: it asks under which setup, the one last started under marked. */
const newSession = (setups: Setup[], last: string, where: string, start?: (setup: string) => void): WorkbenchAction => ({
  id: "new",
  label: `Start a session in ${where}`,
  icon: PlusIcon,
  run: () => {},
  disabled: !start,
  choose: { label: "Start a session under", value: last, options: setupOptions(setups), set: (setup) => start?.(setup) },
})

/**
 * How long the agent worked in a session: its turns' durations summed, the one under way counted to now. A session
 * resumed after hours is not hours of work. Without a trace yet, since it started.
 */
const worked = (view: Session, transcript: Entry[] | undefined, now: number) => {
  if (!transcript) return view.durationMs ?? (view.endedAt ?? now) - view.startedAt

  const done = transcript.reduce((ms, e) => ms + (e.kind === "turn" ? (e.durationMs ?? 0) : 0), 0)
  const asked = transcript.findLast((e) => e.kind === "you" || e.kind === "turn")

  return done + (view.status === "busy" && asked?.kind === "you" ? now - asked.at : 0)
}
/** When the session last did something: the last of its trace that is not a note about it, such as a restart. */
const lastActive = (view: Session, transcript: Entry[] | undefined) => transcript?.findLast((e) => e.kind !== "note")?.at ?? view.endedAt ?? view.startedAt

/** A count as a figure has room for it: 81k, 1.2M. */
const short = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n).toLowerCase()

/** One figure of a session: its value, and under it what it counts. */
const Figure = ({ value, label, title }: { value: string; label: string; title?: string }) => (
  <div title={title} className="flex shrink-0 flex-col gap-0.5">
    <span className="text-sm font-medium whitespace-nowrap tabular-nums">{value}</span>
    <span className={`truncate text-meta ${muted}`}>{label}</span>
  </div>
)

/** A term and its value, as the info's sections line them up. */
const Fact = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-2">
    <span className={muted}>{term}</span>
    <span className="min-w-0 truncate">{children}</span>
  </div>
)

/**
 * Everything about the session, behind a button in its composer beside the context knob, and laid out as its popover
 * is: the session and how it stands; what it spent, as figures; what it runs on; where and since when.
 */
function SessionInfo({ view }: { view: SessionView }) {
  const now = useNow(view.endedAt === undefined && view.status !== "exited")
  const mark = markOf(view.status, view.scenario)
  const turns = view.transcript.filter((e) => e.kind === "you").length
  const model = view.models?.find((m) => m.id === view.model)
  const harness = view.harness === "claude-code" ? "Claude Code" : view.harness === "codex" ? "Codex" : view.harness

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="About this session"
          title="About this session"
          className={`grid size-row shrink-0 place-items-center rounded-md outline-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground/6 ${muted}`}
        >
          <InfoIcon aria-hidden className="size-icon" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-96 max-w-[calc(100vw-2rem)] gap-3 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-sm font-medium">Session {view.n}</span>
            {view.scenario && <span className={`truncate ${muted}`}>{view.scenario.name}</span>}
          </span>
          <span className={`flex shrink-0 items-center gap-1 ${mark.tone === "error" ? "text-destructive" : muted}`}>
            <mark.icon aria-hidden className={`size-glyph ${mark.busy ? "animate-spin" : ""}`} />
            {statusWord[view.status]}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-y py-2.5">
          <Figure value={seconds(worked(view, view.transcript, now))} label="worked" title="The agent's turns, summed" />
          <Figure value={String(turns)} label={turns === 1 ? "turn" : "turns"} />
          <Figure value={view.costUsd !== undefined ? money(view.costUsd) : "–"} label="cost" />
          <Figure
            value={view.tokens ? `${short(view.tokens.input)} / ${short(view.tokens.output)}` : "–"}
            label="tokens in / out"
            title={view.tokens && tokens(view.tokens)}
          />
          {view.tokens?.cached !== undefined && (
            <Figure value={`${Math.round((view.tokens.cached / Math.max(1, view.tokens.input)) * 100)}%`} label="input cached" title={tokens(view.tokens)} />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className={`text-meta ${muted}`}>Runs on</span>
          <Fact term="Model">
            {model?.name ?? view.model ?? "the harness's default"}
            {view.ran && view.ran !== view.model && <span className={muted}> · {view.ran}</span>}
          </Fact>
          <Fact term="Effort">{view.effort ?? view.unasked ?? <span className={muted}>the model's default</span>}</Fact>
          <Fact term="Setup">
            {view.setup}
            <span className={muted}> · {harness}</span>
          </Fact>
        </div>
        <div className="flex flex-col gap-1">
          <span className={`text-meta ${muted}`}>Where</span>
          <Fact term="Workspace">
            {view.workspace.name}
            <span className={muted}> · from {view.workspace.preset}</span>
          </Fact>
          <Fact term="Started">
            <span title={new Date(view.startedAt).toLocaleString()}>{agoMs(view.startedAt, now)}</span>
          </Fact>
          <Fact term="Session id">{view.session ? <span className="font-mono select-all">{view.session}</span> : <span className={muted}>not yet</span>}</Fact>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The chat's header: which session it is and how it stands, and in a line how long the agent worked, how many turns, what it
 * cost where the harness said, and when it was last active. Moving between sessions and starting one is the Sessions
 * tool's; stopping, resuming and the rest about it are the composer's. `column` switches to the page where the two
 * share one column.
 */
function SessionBar({ view, transcript, narrow, column }: { view: Session; transcript?: Entry[]; narrow: boolean; column?: ReactNode }) {
  const now = useNow(true)
  const scenario = view.scenario
  const mark = markOf(view.status, scenario)
  const turns = transcript?.filter((e) => e.kind === "you").length
  const last = view.status === "busy" ? now : lastActive(view, transcript)
  const line = [
    seconds(worked(view, transcript, now)),
    turns !== undefined && plural(turns, "turn"),
    view.costUsd !== undefined && money(view.costUsd),
    view.status === "busy" ? "active now" : `active ${agoMs(last, now)}`,
  ].filter(Boolean)

  return (
    <>
      <WorkbenchToolbar label="Session">
        {column}
        <span role="img" aria-label={mark.word} title={mark.word} className={`flex shrink-0 ${mark.tone === "error" ? "text-destructive" : muted}`}>
          <mark.icon aria-hidden className={`size-icon ${mark.busy ? "animate-spin" : ""}`} />
        </span>
        <span
          className="flex min-w-0 shrink-0 items-baseline gap-1.5"
          title={`${view.workspace.name} › session ${view.n}${scenario ? `, scenario ${scenario.name}` : ""}`}
        >
          <span className="shrink-0 font-medium">{narrow ? `#${view.n}` : `Session ${view.n}`}</span>
          {scenario && <span className={`min-w-0 truncate ${muted}`}>{scenario.name}</span>}
        </span>
        <WorkbenchSpacer />
        <span title={line.join(" · ")} className={`min-w-0 truncate px-1 text-meta tabular-nums ${muted}`}>
          {line.join(" · ")}
        </span>
      </WorkbenchToolbar>
      {[scenario?.error && `Scenario failed: ${scenario.error}`, view.error].filter(Boolean).map((error) => (
        <WorkbenchNotice key={error as string} bar>
          <span className="whitespace-pre-wrap">{error}</span>
        </WorkbenchNotice>
      ))}
    </>
  )
}

/** The session in view: the chat and the app's page side by side, each under its own header, or one at a time where narrow. */
function SessionPage({ root, act, lens }: { root: Session; act: Act; lens: Lens }) {
  const { view } = useLive<SessionView>("/session")
  const [measure, narrow] = useNarrow(NARROW_PX)
  const [pane, setPane] = useState<"chat" | "page">("chat")
  const { detail } = useThreadDetail()
  const split = useDefaultLayout({ id: "babavoss.playground.split", panelIds: ["chat", "page"], storage: localStorage })
  // The chat's header reads the root's copy until /session's first read lands, so it shows at once.
  const current: Session = view ?? root
  // Where the chat and the page share one column, each header switches to the other.
  const column = narrow && (
    <WorkbenchSegments
      label="Column"
      options={[
        { id: "chat", label: "Chat" },
        { id: "page", label: "App" },
      ]}
      value={pane}
      set={setPane}
    />
  )
  const chat = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SessionBar view={current} transcript={view?.transcript} narrow={narrow} column={column} />
      {view ? (
        <>
          <Transcript view={view} detail={detail} lens={lens} />
          <Prompt view={view} act={act} />
        </>
      ) : (
        <WorkbenchEmpty>Reading the session.</WorkbenchEmpty>
      )}
    </div>
  )
  const page = view ? <AppPane view={view} column={column} /> : null

  return (
    <div ref={measure} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {narrow ? (
        pane === "chat" || !page ? (
          chat
        ) : (
          page
        )
      ) : (
        <Group orientation="horizontal" defaultLayout={split.defaultLayout} onLayoutChanged={split.onLayoutChanged} className="min-h-0 flex-1">
          <Panel id="chat" defaultSize="50" minSize={320} className="flex flex-col">
            {chat}
          </Panel>
          <WorkbenchSplitter orientation="horizontal" />
          <Panel id="page" minSize={280} className="flex min-h-0 flex-col">
            {page}
          </Panel>
        </Group>
      )}
    </div>
  )
}

/** The open workspace with no session in view: what it is and where it is, and a session to start in it. */
function WorkspaceOverview({
  at,
  act,
  setups,
  last,
  shown,
  trash,
}: {
  at: string
  act: Act
  setups: Setup[]
  last: string
  shown: () => void
  trash: (t: Trashable) => void
}) {
  const { view, error } = useLive<WorkspaceView>(at)
  const now = useNow(true)

  if (!view) return <WorkbenchEmpty>{error ?? "Reading the workspace."}</WorkbenchEmpty>

  const start = view.start

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkbenchToolbar label="Workspace">
        <BoxIcon aria-hidden className={`size-icon shrink-0 ${muted}`} />
        <span className="min-w-0 truncate font-medium" title={view.name}>
          {view.name}
        </span>
        <WorkbenchSpacer />
        <WorkbenchButton
          action={{
            id: "trash",
            label: `Move ${view.name} to the trash`,
            icon: Trash2Icon,
            run: () => trash({ at: view.at, name: view.name, sessions: view.sessions.length, live: view.live, delete: view.delete }),
          }}
        />
        <WorkbenchButton action={newSession(setups, last, view.name, start && ((setup) => void act(view.at, start, { setup }).then((ok) => ok && shown())))} />
      </WorkbenchToolbar>
      <WorkbenchPage>
        <WorkbenchProperties
          label="Workspace"
          rows={facts([
            ["Preset", view.preset],
            [
              "Created",
              <span key="created" title={stamp(view.created)}>
                {ago(view.created, now)}
              </span>,
            ],
            ["Directory", <WorkspacePath key="dir" path={view.dir} />],
            ["Made by", view.scenario && `scenario ${view.scenario}`],
            ["Sessions", plural(view.sessions.length, "session")],
          ])}
        />
        {view.sessions.length === 0 && (
          <WorkbenchEmpty>
            <p>No sessions yet. Start one to prompt the agent here, or run a scenario in this workspace.</p>
          </WorkbenchEmpty>
        )}
      </WorkbenchPage>
    </div>
  )
}

/** The open workspace's sessions, newest first, as its tool lists them: how each stands, to look at or resume. */
function Sessions({ at, act, inView, shown }: { at: string; act: Act; inView?: number; shown: () => void }) {
  const { view, error } = useLive<WorkspaceView>(at)
  const live = view?.sessions.some((s) => s.status !== "exited") ?? false
  const now = useNow(live)

  if (!view || view.at !== at) return <WorkbenchEmpty>{error ?? "Reading the workspace."}</WorkbenchEmpty>

  const sessions = [...view.sessions].sort((a, b) => b.n - a.n)
  const look = async (handle: Handle) => {
    if (await act(view.at, handle)) shown()
  }

  return (
    <WorkbenchList
      label="Sessions"
      rows={sessions.map((s) => {
        const mark = markOf(s.status, s.scenario)
        const ended = s.endedAt ?? (s.status === "exited" ? undefined : now)

        return {
          id: String(s.n),
          icon: s.scenario && !mark.busy && !mark.tone && s.scenario.state !== "done" ? ClapperboardIcon : mark.icon,
          busy: mark.busy,
          tone: mark.tone,
          label: s.scenario ? `${s.n} · ${s.scenario.name}` : `Session ${s.n}`,
          badge: agoMs(s.startedAt, now),
          tip: facts([
            ["State", mark.word],
            ["Setup", `${s.setup} · ${s.harness}`],
            ["Started", new Date(s.startedAt).toLocaleString()],
            ["Lasted", ended !== undefined && seconds(ended - s.startedAt)],
            ["Cost", s.costUsd !== undefined && money(s.costUsd)],
          ]),
          actions: s.resume ? [{ id: "resume", label: `Resume session ${s.n}`, icon: HistoryIcon, run: () => void look(s.resume!) }] : undefined,
        }
      })}
      active={inView === undefined ? undefined : String(inView)}
      open={(n) => {
        const s = sessions.find((x) => String(x.n) === n)

        if (s) void look(s.look)
      }}
      empty="No sessions yet. Start one with +, or run a scenario here."
    />
  )
}

/** Where a scenario runs when it is just run: a workspace of its own when it names a preset, else the open one. */
const runsIn = (s: ScenarioRow, here: WorkspaceRow | undefined, preset: string) =>
  s.preset ? `a fresh workspace from ${s.preset}` : here ? here.name : `a fresh workspace from ${preset}`

/** A scenario, opened: what it does, what it runs under, its file, and how to run it. */
function ScenarioPage({
  at,
  back,
  run,
  fresh,
  here,
  preset,
}: {
  at: string
  back: () => void
  run: (s: ScenarioRow) => void
  fresh: (s: ScenarioRow) => void
  here?: WorkspaceRow
  preset: string
}) {
  const { view: found, error } = useLive<ScenarioView>(at)
  const view = found?.at === at ? found : undefined

  if (!view) return <WorkbenchEmpty>{error ?? "Reading the scenario."}</WorkbenchEmpty>

  return (
    <>
      <WorkbenchToolbar label="Scenario">
        <WorkbenchButton action={{ id: "back", label: "Back", icon: ArrowLeftIcon, run: back }} />
        <ClapperboardIcon aria-hidden className={`size-icon shrink-0 ${muted}`} />
        <span className="min-w-0 truncate font-medium">{view.name}</span>
        <WorkbenchSpacer />
        {!view.preset && here && <WorkbenchButton action={{ id: "fresh", label: "Run in a fresh workspace", icon: FolderPlusIcon, run: () => fresh(view) }} />}
        <Button size="sm" title={`Run in ${runsIn(view, here, preset)}`} onClick={() => run(view)}>
          <PlayIcon data-icon="inline-start" />
          Run
        </Button>
      </WorkbenchToolbar>
      <WorkbenchPage
        title={view.name}
        meta={
          <>
            {view.setup && <span>setup {view.setup}</span>}
            {view.preset && <span>preset {view.preset}</span>}
            {mono(view.file)}
          </>
        }
      >
        {view.description && <p className="break-words">{view.description}</p>}
        <WorkbenchCode title="The scenario, as written" text={view.source} copy />
      </WorkbenchPage>
    </>
  )
}

/** A tool's problems above its rows, each with the file it is in. */
const Problems = ({ list }: { list: Problem[] }) =>
  list.length > 0 && (
    <div className="flex flex-col gap-1 px-1 pt-1">
      {list.map((p, i) => (
        <WorkbenchNotice key={i}>
          <span className="font-mono text-meta break-all">{p.file}</span> {p.message}
        </WorkbenchNotice>
      ))}
    </div>
  )

/** An app as the welcome page lists it: its name, where it is and what it is, its version and how much it holds. */
const scopeOf = (p: AppRow): Scope => ({
  id: p.id,
  label: p.name,
  description: [p.dir, p.description].filter(Boolean).join(" · "),
  aside: (
    <span className="flex flex-col items-end tabular-nums sm:flex-row sm:items-center sm:gap-3">
      {p.version && <span className="hidden sm:inline">{p.version}</span>}
      {p.scenarios !== undefined && <span>{plural(p.scenarios, "scenario")}</span>}
      {p.presets !== undefined && <span>{plural(p.presets, "preset")}</span>}
    </span>
  ),
})

/** Which of the trace shows, kept in this browser: a way of looking, the person's own. */
function useStoredLens(): [Lens, (lens: Lens) => void] {
  const key = "babavoss.playground.lens"
  const [lens, setLens] = useState<Lens>(() => {
    try {
      return localStorage.getItem(key) === "app" ? "app" : "all"
    } catch {
      return "all"
    }
  })

  return [
    lens,
    (next) => {
      setLens(next)
      try {
        localStorage.setItem(key, next)
      } catch {
        /* Kept for this page alone without browser storage. */
      }
    },
  ]
}

/** The route that shows the open workspace's overview even while a session is in view. */
const OVERVIEW = "/workspace"

/**
 * The playground on the workbench. With several apps under the project, the first screen lists them; once one is
 * chosen, its tools are the open workspace's sessions, the workspace picked and made at their head, and the scenarios;
 * the content is the open workspace's overview, a scenario, or the session in view, its toolbar above the thread and the
 * app's page.
 */
export function Playground() {
  const { call, route, navigate } = useTab()
  const { view: root } = useLive<RootView | ListView>("/")
  const [query, setQuery] = useState("")
  const [refused, setRefused] = useState<string>()
  const [trashing, setTrashing] = useState<Trashable>()
  const [lens, setLens] = useStoredLens()
  const act: Act = async (path, handle, extra = {}) => {
    const answer = await call(path, handle.name, { ...handle.args, ...extra })

    setRefused(answer.outcome === "refused" ? answer.reason : undefined)

    return answer.outcome !== "refused"
  }
  const list = root && root.app === null ? root : undefined
  const view = root && root.app !== null ? root : undefined
  /** Calls, then shows the session in view where the call put one there. */
  const toSession = (path: string, handle: Handle, extra?: Record<string, Json>) =>
    void act(path, handle, extra).then((ok) => ok && route !== "/" && navigate("/"))
  const run = (s: ScenarioRow) => toSession(s.at, s.run, { workspace: "" })
  const fresh = (s: ScenarioRow) => toSession(s.at, s.fresh)
  const start = view?.start ? (setup: string) => toSession("/", view.start!, { setup }) : undefined
  const create = (preset = "") => view && toSession("/", view.create, { preset })
  const pick = (preset: string) => view && void act("/", view.pick, { preset })
  const open = (w: WorkspaceRow) => void act(w.at, w.open).then((ok) => ok && navigate("/"))
  const trash = (t: Trashable) => void act(t.at, t.delete)
  const here = view?.workspaces.find((w) => w.id === view.workspace)
  const session = view?.session ?? undefined
  const scenarioAt = route.startsWith("/scenarios/") ? route : undefined
  // The session shows unless the person asked for the overview or a scenario, or the open workspace is another one.
  const showSession = session && route !== OVERVIEW && !scenarioAt && (!view?.workspace || session.workspace.id === view.workspace)
  const overview = () => navigate(OVERVIEW)
  const loaded = session?.scenario && view?.scenarios.find((s) => s.name === session.scenario!.name)
  const rerun = loaded ? () => run(loaded) : undefined
  const running = session?.scenario?.state === "running"
  const problems: Record<ReturnType<typeof problemTool>, Problem[]> = { scenarios: [], sessions: [] }

  for (const p of view?.problems ?? []) problems[problemTool(p)].push(p)

  const errors = (n: number) => (n ? { badge: { value: n, tone: "error" as const } } : {})
  const waiting = (what: string) => <WorkbenchEmpty>{list ? "Pick an app first." : `Reading the ${what}.`}</WorkbenchEmpty>
  const q = query.trim().toLowerCase()

  // The apps are the scopes: the welcome page lists them until one is chosen, the scope's menu switches directly, and
  // with only one there is no list to return to.
  const apps = list?.apps ?? view?.apps ?? []
  const scopes: Scopes | undefined = root
    ? {
        title: "Apps",
        hint: list && `Pick the app to try, found under ${list.project}.`,
        list: apps.length ? apps.map(scopeOf) : view ? [{ id: view.app.id, label: view.app.name }] : [],
        current: view?.app.id,
        ...(view && !view.back && { all: false as const }),
        open: (id) => {
          if (id === undefined) return view?.back && void act("/", view.back)

          const p = apps.find((x) => x.id === id)

          if (p && id !== view?.app.id) void act(p.at, p.select).then((ok) => ok && navigate("/"))
        },
      }
    : undefined

  const workspaceMenu: MenuItem[] = view
    ? [
        { kind: "action", id: "create", label: `New workspace from ${view.preset}`, run: () => create() },
        {
          kind: "submenu",
          id: "create-from",
          label: "New workspace from",
          disabled: !view.presets.length,
          items: view.presets.map((p): MenuItem => ({ kind: "action", id: p.name, label: p.name, run: () => create(p.name) })),
        },
        { kind: "separator", id: "open-edge" },
        {
          kind: "submenu",
          id: "open",
          label: "Open workspace",
          disabled: !view.workspaces.length,
          items: view.workspaces.map((w): MenuItem => ({ kind: "action", id: w.id, label: w.live ? `${w.name} (live)` : w.name, run: () => open(w) })),
        },
        { kind: "action", id: "overview", label: "Workspace overview", run: overview, disabled: !here || !showSession },
        {
          kind: "action",
          id: "trash",
          label: here ? `Move ${here.name} to the trash…` : "Move to the trash…",
          run: () => here && setTrashing({ at: here.at, name: here.name, sessions: here.sessions, live: here.live, delete: here.delete }),
          disabled: !here,
        },
        { kind: "separator", id: "preset-edge" },
        { kind: "choice", id: "preset", label: "Preset", value: view.preset, options: view.presets.map((p) => ({ id: p.name, label: p.name })), set: pick },
      ]
    : []

  const sessionMenu: MenuItem[] = view
    ? [
        {
          kind: "submenu",
          id: "start",
          label: here ? `Start a session in ${here.name}` : "Start a session",
          disabled: !start || !view.setups.length,
          items: view.setups.map((s): MenuItem => ({ kind: "action", id: s.name, label: `${s.name} (${s.harness})`, run: () => start?.(s.name) })),
        },
        {
          kind: "action",
          id: "resume",
          label: session ? `Resume session ${session.n}` : "Resume",
          run: () => session?.resume && toSession(session.at, session.resume),
          disabled: !session?.resume,
        },
        { kind: "action", id: "stop", label: "Stop the agent", run: () => session?.stop && void act(session.at, session.stop), disabled: !session?.stop },
        { kind: "separator", id: "run-edge" },
        {
          kind: "submenu",
          id: "run",
          label: "Run scenario",
          disabled: !view.scenarios.length,
          items: view.scenarios.map((s): MenuItem => ({ kind: "action", id: s.name, label: s.name, run: () => run(s) })),
        },
        {
          kind: "submenu",
          id: "run-fresh",
          label: "Run scenario in a fresh workspace",
          disabled: !view.scenarios.length,
          items: view.scenarios.map((s): MenuItem => ({ kind: "action", id: s.name, label: s.name, run: () => fresh(s) })),
        },
        { kind: "action", id: "rerun", label: loaded ? `Run ${loaded.name} again` : "Run again", run: () => rerun?.(), disabled: !rerun },
        { kind: "separator", id: "scan-edge" },
        { kind: "action", id: "rescan", label: "Read scenarios, presets and what the harnesses offer again", run: () => void act("/", view.rescan) },
      ]
    : list
      ? [{ kind: "action", id: "rescan", label: "Look for apps again", run: () => void act("/", list.rescan) }]
      : []

  return (
    <>
      <Workbench
        label="Playground"
        scopes={scopes}
        tools={[
          {
            id: "sessions",
            label: "Sessions",
            icon: BoxIcon,
            ...(view && {
              title: (
                <WorkbenchPicker
                  label="Workspace"
                  value={view.workspace ?? undefined}
                  none="No workspace"
                  options={view.workspaces.map((w) => ({
                    id: w.id,
                    label: w.name,
                    description: w.scenario ? `made by scenario ${w.scenario}` : `from ${w.preset}`,
                    detail: w.live ? "live" : plural(w.sessions, "session"),
                  }))}
                  set={(id) => {
                    const w = view.workspaces.find((x) => x.id === id)

                    if (w) open(w)
                  }}
                  actions={[
                    ...view.presets.map((p) => ({
                      id: `new ${p.name}`,
                      label: `New workspace from ${p.name}`,
                      description: p.builtin
                        ? "Nothing in it but the app"
                        : [p.description, `${plural(p.files, "file")} · ${size(p.bytes)}`].filter(Boolean).join(" · "),
                      icon: FolderPlusIcon,
                      run: () => create(p.name),
                    })),
                    ...(here
                      ? [
                          { id: "overview", label: `About ${here.name}`, icon: InfoIcon, run: overview },
                          {
                            id: "trash",
                            label: `Move ${here.name} to the trash…`,
                            icon: Trash2Icon,
                            run: () => setTrashing({ at: here.at, name: here.name, sessions: here.sessions, live: here.live, delete: here.delete }),
                          },
                        ]
                      : []),
                  ]}
                />
              ),
            }),
            ...(problems.sessions.length ? errors(problems.sessions.length) : view?.workspaces.some((w) => w.live) ? { badge: { value: "▶" } } : {}),
            actions: view && here ? [newSession(view.setups, view.setup, here.name, start)] : [],
            content: view ? (
              <>
                <Problems list={problems.sessions} />
                {here ? (
                  <Sessions
                    key={here.id}
                    at={here.at}
                    act={act}
                    inView={showSession && session?.workspace.id === here.id ? session.n : undefined}
                    shown={() => navigate("/")}
                  />
                ) : (
                  <WorkbenchEmpty>
                    <p>
                      {view.workspaces.length
                        ? "Pick a workspace above, or make one from a preset."
                        : "Make a workspace from a preset to start sessions in it."}
                    </p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => create()}>
                      <FolderPlusIcon data-icon="inline-start" />
                      New workspace from {view.preset}
                    </Button>
                  </WorkbenchEmpty>
                )}
              </>
            ) : (
              waiting("workspaces")
            ),
          },
          {
            id: "scenarios",
            label: "Scenarios",
            icon: ClapperboardIcon,
            fit: true,
            ...(problems.scenarios.length ? errors(problems.scenarios.length) : running ? { badge: { value: "▶" } } : {}),
            filter: { label: "Filter scenarios", value: query, set: setQuery },
            actions: view ? [{ id: "rescan", label: "Read scenarios and presets again", icon: RefreshCwIcon, run: () => void act("/", view.rescan) }] : [],
            content: view ? (
              <>
                <Problems list={problems.scenarios} />
                <WorkbenchList
                  label="Scenarios"
                  rows={view.scenarios
                    .filter((s) => !q || `${s.name} ${s.description ?? ""}`.toLowerCase().includes(q))
                    .map((s) => {
                      const state = session?.scenario?.name === s.name ? session.scenario.state : undefined

                      return {
                        id: s.at,
                        icon: state === "running" ? LoaderCircleIcon : state === "failed" ? CircleXIcon : state === "done" ? CircleCheckIcon : undefined,
                        busy: state === "running",
                        tone: state === "failed" ? ("error" as const) : undefined,
                        label: s.name,
                        tip: facts([
                          ["Does", s.description],
                          ["Setup", s.setup ?? `${view.setup}, the last started under`],
                          ["Runs in", runsIn(s, here, view.preset)],
                          ["Last run", state && scenarioWord[state]],
                        ]),
                        actions: [
                          ...(!s.preset && here
                            ? [{ id: "fresh", label: `Run ${s.name} in a fresh workspace`, icon: FolderPlusIcon, run: () => fresh(s) }]
                            : []),
                          {
                            id: "run",
                            label: `Run ${s.name} in ${runsIn(s, here, view.preset)}`,
                            icon: state === "running" ? RotateCcwIcon : PlayIcon,
                            run: () => run(s),
                          },
                        ],
                      }
                    })}
                  active={scenarioAt}
                  open={navigate}
                  empty={view.scenarios.length ? "No scenario matches." : "No scenarios yet. Ask your agent to write one under scenarios/."}
                />
              </>
            ) : (
              waiting("scenarios")
            ),
          },
        ]}
        viewMenu={[
          {
            kind: "choice",
            id: "lens",
            label: "Trace",
            value: lens,
            options: [
              { id: "all", label: "Everything" },
              { id: "app", label: "The app's part" },
            ],
            set: (id) => setLens(id as Lens),
          },
        ]}
        menus={[
          ...(view ? [{ id: "workspace", label: "Workspace", items: workspaceMenu }] : []),
          { id: "play", label: "Session", items: sessionMenu, disabled: !root },
        ]}
        main={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {refused && (
              <WorkbenchNotice bar dismiss={() => setRefused(undefined)}>
                {refused}
              </WorkbenchNotice>
            )}
            {!view ? (
              <WorkbenchEmpty>Reading the playground.</WorkbenchEmpty>
            ) : scenarioAt ? (
              <ScenarioPage key={scenarioAt} at={scenarioAt} back={() => navigate("/")} run={run} fresh={fresh} here={here} preset={view.preset} />
            ) : showSession && session ? (
              <SessionPage key={`${session.workspace.id}/${session.n}`} root={session} act={act} lens={lens} />
            ) : here ? (
              <WorkspaceOverview key={here.id} at={here.at} act={act} setups={view.setups} last={view.setup} shown={() => navigate("/")} trash={setTrashing} />
            ) : (
              <WorkbenchEmpty>
                <p>
                  {view.workspaces.length
                    ? "Open a workspace from Workspaces, or make one from a preset to start sessions in it."
                    : "Make a workspace from a preset to start sessions in it. A scenario makes its own when it runs."}
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => create()}>
                  <FolderPlusIcon data-icon="inline-start" />
                  New workspace from {view.preset}
                </Button>
              </WorkbenchEmpty>
            )}
          </div>
        }
      />
      <TrashDialog target={trashing} close={() => setTrashing(undefined)} confirm={trash} />
    </>
  )
}
