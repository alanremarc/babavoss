// The lab's page: a header with the run's identity and its lifecycle, the run as a conversation with a composer at its
// foot, and the page under test beside it, at the side the person prefers for a sidebar, live, where the person acts as the person. The model the next run takes, the
// split and which side is shown are the page's own; the entry in the tab's route, /entries/N, is open and scrolled to,
// and /runs opens the runs kept.
import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ChevronDownIcon,
  CircleStopIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  FolderGit2Icon,
  GlobeIcon,
  HandIcon,
  HistoryIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PlusIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import { useDefaultLayout } from "react-resizable-panels"
import type { Handle } from "babavoss/core/index.ts"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useNarrow,
} from "babavoss/kit/index.ts"
import { useConventions, useLive, useTab } from "babavoss/shell/ui/index.tsx"
import { Composer } from "./components/composer.tsx"
import { breakdown, k, MODELS, money, total, type Past, type Root, type Row, type Status } from "./parts.tsx"
import { RunThread } from "./thread.tsx"

export const icon = <FlaskConicalIcon aria-hidden />

/** Which side the page shows: both, split; the thread alone; or the page under test alone. */
type Side = "split" | "thread" | "page"
const SIDE = "babavoss.lab.side"
const remembered = (): Side => {
  try {
    const side = localStorage.getItem(SIDE)

    return side === "thread" || side === "page" ? side : "split"
  } catch {
    return "split"
  }
}
const remember = (side: Side) => {
  try {
    localStorage.setItem(SIDE, side)
  } catch {}
}
/** The storage a split's layout is kept in; none where the browser keeps nothing. */
const storage = (() => {
  try {
    return localStorage
  } catch {
    return undefined
  }
})()

const live = (s: Status) => s === "starting" || s === "idle" || s === "working" || s === "closing"

export default function Lab() {
  const { view } = useLive<Root>("/")
  const { view: timeline } = useLive<{ entries: Row[] }>("/entries")
  const { view: kept } = useLive<{ runs: Past[] }>("/runs")
  const { call, route, navigate } = useTab()
  const routed = Number(/^\/entries\/(\d+)$/.exec(route)?.[1] ?? NaN)
  const [model, setModel] = useState("haiku")
  const [refused, setRefused] = useState("")
  const [pending, setPending] = useState<string>()
  const [side, setSide] = useState<Side>(remembered)
  const [setArea, narrow] = useNarrow(760)
  const sending = useRef(false)
  const root = view!
  const entries = root.run !== undefined ? (timeline?.entries ?? []) : []
  const status = root.status
  const act = async (handle: Handle | undefined, args: Record<string, string> = {}, path = "/") => {
    if (!handle) return "not offered now"

    const answer = await call(path, handle.name, { ...handle.args, ...args })
    const reason = answer.outcome === "refused" ? answer.reason : undefined

    setRefused(reason ?? "")

    return reason
  }
  // Opening a step puts it in the route; folding the routed one takes it out.
  const go = (i: number, open: boolean) => {
    if (open) navigate(`/entries/${i}`)
    else if (i === routed) navigate("/")
  }
  const show = (next: Side) => {
    setSide(next)
    remember(next)
  }

  // A first message sent with no run up waits for the run it started, and is said once the agent can hear it.
  useEffect(() => {
    if (!pending || !root.say || sending.current) return
    sending.current = true
    void act(root.say, { text: pending }).finally(() => {
      sending.current = false
      setPending(undefined)
    })
  }, [pending, root.say])
  useEffect(() => {
    if (pending && !live(status) && !root.start) setPending(undefined)
  }, [pending, status, root.start])

  const working = status === "working"
  const composer = (
    <LabComposer
      root={root}
      model={model}
      setModel={setModel}
      pending={!!pending}
      send={async (text) => {
        if (root.say) return act(root.say, { text })
        if (!root.start) return "no run can be started now"

        const reason = await act(root.start, { model })

        if (reason === undefined) setPending(text.trim())

        return reason
      }}
      stop={working && root.stop ? () => void act(root.stop) : undefined}
    />
  )
  const empty = root.run === undefined && !pending
  // With no run there is no page under test: the welcome takes the whole width.
  const shown: Side = empty || (narrow && side === "split") ? "thread" : side
  const gone =
    status === "closed"
      ? "The run is closed, and its page with it."
      : status === "cleared"
        ? "The run was cleared when the lab started, and its page with it."
        : undefined
  const hasPage = !!root.page && !gone
  const conversation =
    route === "/runs" ? (
      <RunsPanel runs={kept?.runs ?? []} act={act} back={() => navigate("/")} />
    ) : empty ? (
      <Welcome>{composer}</Welcome>
    ) : (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <RunThread run={root.run ?? "new"} entries={entries} working={working || status === "starting"} routed={routed} go={go} pending={pending}>
          {root.ended && status === "ended" && <p className="text-center text-meta text-destructive">{root.ended}</p>}
        </RunThread>
        <div className="mx-auto w-full max-w-3xl shrink-0 px-2">{composer}</div>
      </div>
    )

  return (
    <div ref={setArea} className="flex min-h-0 flex-1 flex-col text-body">
      <Header
        root={root}
        runs={kept?.runs ?? []}
        model={model}
        act={act}
        side={shown}
        narrow={narrow}
        show={show}
        showRuns={() => navigate("/runs")}
      />
      {refused && (
        <div role="alert" className="flex h-row shrink-0 items-center gap-2 border-b bg-destructive/5 px-3 text-meta text-destructive">
          <span className="min-w-0 flex-1 truncate">{refused}</span>
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setRefused("")}>
            <XIcon />
          </Button>
        </div>
      )}
      {shown === "thread" ? (
        conversation
      ) : shown === "page" ? (
        <UnderTest page={hasPage ? root.page : undefined} gone={gone} side={shown} show={show} narrow={narrow} />
      ) : (
        <Split thread={conversation} page={<UnderTest page={hasPage ? root.page : undefined} gone={gone} side={shown} show={show} narrow={narrow} />} />
      )}
    </div>
  )
}

function Split({ thread, page }: { thread: ReactNode; page: ReactNode }) {
  const layout = useDefaultLayout({ id: "babavoss.lab.split", panelIds: ["thread", "page"], storage, onlySaveAfterUserInteractions: true })
  // The page under test is the split's sidebar: it stands at the side the person prefers for one.
  const { side } = useConventions()
  const pagePanel = (
    <ResizablePanel id="page" defaultSize="44" minSize={320} className="flex min-w-0 flex-col">
      {page}
    </ResizablePanel>
  )

  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged} className="min-h-0 flex-1">
      {side === "left" && pagePanel}
      {side === "left" && <ResizableHandle />}
      <ResizablePanel id="thread" defaultSize="56" minSize={360} className="flex min-w-0 flex-col">
        {thread}
      </ResizablePanel>
      {side === "right" && <ResizableHandle />}
      {side === "right" && pagePanel}
    </ResizablePanelGroup>
  )
}

/** No run: one line of what the lab is for, and the composer that starts one. */
function Welcome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 pb-[12vh]">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <FlaskConicalIcon className="size-4" />
        </span>
        <h1 className="text-sm font-medium">Try it on an agent</h1>
        <p className="max-w-md text-muted-foreground">
          An agent under test works in a copy of this checkout, uncommitted changes included, through its real surfaces and hooks. Everything that
          enters its context shows here.
        </p>
      </div>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  )
}

/** The composer: say to the agent under test, or start a run with the first message; the model the next run takes in it. */
function LabComposer({
  root,
  model,
  setModel,
  pending,
  send,
  stop,
}: {
  root: Root
  model: string
  setModel: (model: string) => void
  pending: boolean
  send: (text: string) => Promise<string | undefined>
  stop?: () => void
}) {
  const s = root.status
  const starts = !root.say && !!root.start && !pending
  const open = !!root.say && s !== "working"
  const closed = pending
    ? "The run is starting; your message is sent once it is up"
    : s === "working"
      ? "The agent under test is working: stop the turn, or wait for it to end"
      : s === "starting"
        ? "The run is starting…"
        : s === "closing"
          ? "The run is closing…"
          : "No run can be started now"
  const fixed = live(s) && root.model

  return (
    <Composer
      className="border-t-0 px-0 pt-0 pb-3"
      label="Message to the agent under test"
      placeholder={starts ? `Message to start a run on ${model}` : "Message the agent under test"}
      closed={closed}
      send={open || starts ? send : undefined}
      stop={stop}
      footer={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!!fixed}>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                title={fixed ? "The run's model; a new run can take another" : "The model the next run takes"}
              >
                {fixed || model}
                {!fixed && <ChevronDownIcon data-icon="inline-end" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-40">
              <DropdownMenuLabel>Model for the next run</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                {MODELS.map((m) => (
                  <DropdownMenuRadioItem key={m} value={m}>
                    {m}
                    {m === "haiku" && <span className="text-meta text-muted-foreground">cheapest</span>}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="hidden truncate text-muted-foreground/70 sm:inline">{starts ? "Enter starts a run" : open ? "Enter to send · Shift+Enter, a new line" : ""}</span>
        </>
      }
    />
  )
}

const TONE: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  "no run": "outline",
  starting: "secondary",
  idle: "secondary",
  working: "default",
  ended: "destructive",
  closing: "secondary",
  closed: "outline",
  cleared: "outline",
}

/** The run's identity and state in one line, and at the right what can be done to it now. */
function Header({
  root,
  runs,
  model,
  act,
  side,
  narrow,
  show,
  showRuns,
}: {
  root: Root
  runs: Past[]
  model: string
  act: (handle: Handle | undefined, args?: Record<string, string>, path?: string) => Promise<string | undefined>
  side: Side
  narrow: boolean
  show: (side: Side) => void
  showRuns: () => void
}) {
  const [from, setFrom] = useState(false)
  const s = root.status
  const there = root.checkout?.split("/").filter(Boolean).at(-1)

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <Badge variant={TONE[s]} className={s === "working" || s === "starting" ? "animate-pulse" : undefined}>
        {s}
      </Badge>
      {/* A run whose agent was told nothing by a hook says so beside its status, wherever the page is read. */}
      {typeof root.hooks === "string" && root.turns ? (
        <Badge variant="destructive" title={`${root.hooks}: it did what it did without the surfaces' words and present`}>
          no hook heard
        </Badge>
      ) : null}
      {root.run !== undefined && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground tabular-nums">
          <span className="shrink-0 font-medium text-foreground">{root.model}</span>
          {there && (
            <span className="flex min-w-0 items-center gap-1 truncate" title={`${root.checkout}${root.commit ? ` @ ${root.commit}` : ""}`}>
              <span className="text-muted-foreground/50">·</span>
              <FolderGit2Icon className="size-3 shrink-0" />
              <span className="truncate">{there}</span>
              {root.commit && <span className="font-mono text-meta">{root.commit.slice(0, 7)}</span>}
              {root.uncommitted ? <span className="text-warning">+{root.uncommitted}</span> : null}
            </span>
          )}
          <span className="hidden shrink-0 items-center gap-1.5 md:flex">
            <span className="text-muted-foreground/50">·</span>
            <span>
              {root.turns ?? 0} {root.turns === 1 ? "turn" : "turns"}
            </span>
            {root.tokens && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span title={breakdown(root.tokens)}>{k(total(root.tokens))} tokens</span>
              </>
            )}
            <span className="text-muted-foreground/50">·</span>
            <span>{money(root.cost ?? 0)}</span>
          </span>
        </div>
      )}
      {root.run === undefined && <span className="min-w-0 flex-1" />}
      <div className="flex shrink-0 items-center gap-0.5">
        {root.stop && (
          <Button size="sm" variant="ghost" onClick={() => void act(root.stop)} title="Interrupt the agent under test's turn">
            <CircleStopIcon data-icon="inline-start" />
            <span className="hidden lg:inline">Stop turn</span>
          </Button>
        )}
        {root.end_move && (
          <Button size="sm" variant="ghost" onClick={() => void act(root.end_move)} title="Tell the agent you ended your move on its page">
            <HandIcon data-icon="inline-start" />
            <span className="hidden lg:inline">End my move</span>
          </Button>
        )}
        {root.close && (
          <Button size="sm" variant="ghost" onClick={() => void act(root.close)} title="Close the run: its process and project go, its record stays">
            <XIcon data-icon="inline-start" />
            <span className="hidden lg:inline">Close run</span>
          </Button>
        )}
        {(root.start || root.start_from) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" title="Start a new run">
                <PlusIcon data-icon="inline-start" />
                <span className="hidden sm:inline">New run</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {root.start && (
                <DropdownMenuItem onSelect={() => void act(root.start, { model })}>
                  On this repository
                  <span className="ml-auto text-meta text-muted-foreground">{model}</span>
                </DropdownMenuItem>
              )}
              {root.start_from && <DropdownMenuItem onSelect={() => setFrom(true)}>From a checkout…</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Runs runs={runs} act={act} all={showRuns} />
      </div>
      {root.run !== undefined && (
        <>
          <span className="h-4 w-px bg-border" aria-hidden />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={side === "thread" ? "Show the page under test" : "Hide the page under test"}
            title={side === "thread" ? "Show the page under test" : narrow ? "Show the thread" : "Hide the page under test"}
            onClick={() => show(side === "thread" ? (narrow ? "page" : "split") : "thread")}
          >
            {side === "thread" ? <PanelRightOpenIcon className="side-left:-scale-x-100" /> : <PanelRightCloseIcon className="side-left:-scale-x-100" />}
          </Button>
        </>
      )}
      <StartFrom open={from} setOpen={setFrom} model={model} start={(path) => act(root.start_from, { model, from: path })} />
    </header>
  )
}

/** When a run began, as a short date and time. */
const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })

/** The runs kept, newest first, from the header: each opens here while no run is up, and is forgotten once it is not shown live. */
function Runs({
  runs,
  act,
  all,
}: {
  runs: Past[]
  act: (handle: Handle | undefined, args?: Record<string, string>, path?: string) => Promise<string | undefined>
  all: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" title="The runs kept">
          <HistoryIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Runs</span>
          {runs.length > 0 && <span className="text-meta text-muted-foreground tabular-nums">{runs.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Runs kept, the last 20</DropdownMenuLabel>
        {runs.length === 0 && <p className="px-2 pb-1.5 text-muted-foreground">No runs yet.</p>}
        {runs.length > 0 && <DropdownMenuSeparator />}
        {runs.map((run) => {
          const label = (
            <span className="flex min-w-0 flex-1 items-center gap-2 tabular-nums">
              <span className="shrink-0">{when(run.began)}</span>
              <span className="shrink-0 text-muted-foreground">{run.model}</span>
              <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
                {run.turns} {run.turns === 1 ? "turn" : "turns"} · {money(run.cost)}
              </span>
              {run.shown && <span className="text-meta text-primary">shown</span>}
            </span>
          )

          if (!run.open && !run.forget)
            return (
              <DropdownMenuItem key={run.id} disabled>
                {label}
              </DropdownMenuItem>
            )

          return (
            <DropdownMenuSub key={run.id}>
              <DropdownMenuSubTrigger title={`${run.id}${run.checkout ? ` · ${run.checkout} @ ${run.commit}` : ""}`}>{label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                {run.open && <DropdownMenuItem onSelect={() => void act(run.open, {}, "/runs")}>Open here</DropdownMenuItem>}
                {run.forget && (
                  <DropdownMenuItem variant="destructive" onSelect={() => void act(run.forget, {}, "/runs")}>
                    Forget
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
        {runs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={all}>All runs, as a list</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The runs kept, at /runs, in place of the thread: a line each, newest first, to open here or forget. */
function RunsPanel({
  runs,
  act,
  back,
}: {
  runs: Past[]
  act: (handle: Handle | undefined, args?: Record<string, string>, path?: string) => Promise<string | undefined>
  back: () => void
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Runs kept">
      <div className="flex h-bar shrink-0 items-center gap-2 border-b px-3">
        <HistoryIcon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Runs kept</span>
        <span className="text-meta text-muted-foreground">the last 20, under .babavoss/lab/runs</span>
        <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={back}>
          Back to the run
        </Button>
      </div>
      <ol className="min-h-0 flex-1 overflow-auto py-1">
        {runs.length === 0 && <li className="px-3 py-6 text-center text-muted-foreground">No runs yet.</li>}
        {runs.map((run) => (
          <li key={run.id} className={`flex h-row items-center gap-3 px-3 tabular-nums ${run.shown ? "bg-accent/40" : ""}`} title={run.id}>
            <span className="w-24 shrink-0">{when(run.began)}</span>
            <span className="w-12 shrink-0 text-muted-foreground">{run.model}</span>
            <span className="w-14 shrink-0 text-muted-foreground">{run.status}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground" title={run.checkout}>
              {run.checkout?.split("/").at(-1)} {run.commit?.slice(0, 7)}
              {run.uncommitted ? ` +${run.uncommitted}` : ""}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {run.turns} {run.turns === 1 ? "turn" : "turns"} · {money(run.cost)}
            </span>
            {run.open ? (
              <Button size="xs" variant="outline" onClick={() => void act(run.open, {}, "/runs").then((refused) => refused === undefined && back())}>
                Open
              </Button>
            ) : (
              <span className="w-11 shrink-0 text-right text-meta text-primary">{run.shown ? "shown" : ""}</span>
            )}
            {run.forget ? (
              <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => void act(run.forget, {}, "/runs")}>
                Forget
              </Button>
            ) : (
              <span className="w-13 shrink-0" />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Where a run from another checkout is asked: its path, the model from the composer. */
function StartFrom({ open, setOpen, model, start }: { open: boolean; setOpen: (open: boolean) => void; model: string; start: (path: string) => Promise<string | undefined> }) {
  const [path, setPath] = useState("")
  const [refused, setRefused] = useState("")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start from a checkout</DialogTitle>
          <DialogDescription>The top of a checkout with a .baba/, such as the worktree you built in; the run takes {model}.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void start(path).then((reason) => {
              setRefused(reason ?? "")
              if (reason === undefined) setOpen(false)
            })
          }}
        >
          <Input autoFocus value={path} onChange={(e) => setPath(e.target.value)} placeholder="/path/to/checkout" className="font-mono" />
          {refused && <p className="text-meta text-destructive">{refused}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!path.trim()}>
              Start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The page under test, live, under a slim bar of its own: its address, reload, open in a tab, and which side is shown. */
function UnderTest({ page, gone, side, show, narrow }: { page?: string; gone?: string; side: Side; show: (side: Side) => void; narrow: boolean }) {
  const [loads, setLoads] = useState(0)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/20" aria-label="The page under test">
      <div className="flex h-bar shrink-0 items-center gap-1 border-b bg-background px-2">
        <GlobeIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground" title={page}>
          {page ?? "no page"}
        </span>
        {page && (
          <>
            <Button size="icon-xs" variant="ghost" aria-label="Reload" title="Reload the page under test" onClick={() => setLoads((n) => n + 1)}>
              <RotateCwIcon />
            </Button>
            <Button size="icon-xs" variant="ghost" asChild>
              <a href={page} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab">
                <ExternalLinkIcon />
              </a>
            </Button>
          </>
        )}
        {!narrow && (
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            title={side === "page" ? "Show the thread beside it" : "Give the page the whole width"}
            onClick={() => show(side === "page" ? "split" : "page")}
          >
            {side === "page" ? "Split" : "Full width"}
          </Button>
        )}
      </div>
      {page ? (
        // On this page's own host name: a frame from another host is another site's, and the runtime refuses it.
        <iframe key={`${page}-${loads}`} src={page.replace("//127.0.0.1:", `//${location.hostname}:`)} title="The page under test" className="min-h-0 flex-1 border-0 bg-background" />
      ) : (
        <div className="grid flex-1 place-items-center p-6 text-center text-muted-foreground">
          <p className="max-w-64">
            {gone ?? "The root under test starts with the run; its page shows here, for you to act on as the person."}
          </p>
        </div>
      )}
    </section>
  )
}
