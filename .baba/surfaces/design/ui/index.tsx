// The design document's page. The content is what the agent is given, and when: the selected scenario as one timeline,
// an entry per text that reached the agent, its moment in plain words and its tokens, the text shown as it reads: its
// prose as markdown, what the framework prints dense and coloured (text.tsx), or its source exactly; between them, quiet
// lines for what happened without the agent being told. At the right: the person's page as it stood after the selected
// step, drawn by the demo surfaces' own pages from what the play recorded; the scenarios, canonical and noise; the demo
// project's shape, folded; and the pin, in a line. The scenario and step are the tab's route, /scenarios/NAME/N, so a
// refresh and the agent's pointing land on them; up and down, or j and k, move the step. Preview or source, wrapping,
// folding and how a changed text is compared are the page's own, in one menu; what is not needed at a glance is on hover.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BellIcon, BookOpenTextIcon, ChevronDownIcon, ChevronRightIcon, EllipsisIcon, UserIcon } from "lucide-react"
import type { Handle, Json } from "babavoss/core/index.ts"
import { Popover, PopoverContent, PopoverTrigger } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"
import type { Page } from "../src/play.ts"
import type { Shape } from "../src/shape.ts"
import BuildPage, { type BuildView } from "../demo/surfaces/build/ui/view.tsx"
import { icon as buildIcon } from "../demo/surfaces/build/ui/index.tsx"
import TasksPage, { type TasksView } from "../demo/surfaces/tasks/ui/view.tsx"
import { icon as tasksIcon } from "../demo/surfaces/tasks/ui/index.tsx"
import { Preview, Source, type Compare } from "./text.tsx"

type Row = { at: string; name: string; group: string; title: string; steps: number; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string }
type Root = { scenarios: Row[]; playing?: true; failure?: string; pinned?: string; play?: Handle; pin?: Handle; unpin?: Handle }
type Demo = { about: string; surfaces: Shape[] | string }
type Telling = { carrier: string; lines: number; chars: number; tokens: number; delta?: string; text: string; pinned?: string }
type Step = { at: string; n: number; who: string; did: string; timing?: string; unhooked?: string; tellings: Telling[]; page: Page }
type Timeline = { name: string; title: string; about: string; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string; steps: Step[] }
type Mode = "preview" | "source"

export const icon = <BookOpenTextIcon aria-hidden />

/** A text longer than this many lines is folded, to a height of about ten. */
const LONG = 14
const FOLDED = "max-h-52 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]"
const COMPARES: [Compare, string][] = [
  ["diff", "Line diff"],
  ["side", "Side by side"],
  ["text", "Now only"],
]
/** The demo surfaces' own pages, each a function of its view at /, and their tabs' icons. */
const PAGES: Record<string, { icon: ReactNode; draw: (view: Json) => ReactNode }> = {
  tasks: { icon: tasksIcon, draw: (view) => <TasksPage view={view as TasksView} /> },
  build: { icon: buildIcon, draw: (view) => <BuildPage view={view as BuildView} /> },
}
const WORD = /^\S*\/baba\b/

/** The word as the person reads it: `baba …`, wherever the project keeps it. */
const call = (text: string) => text.replace(WORD, "baba")
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const quiet = "text-muted-foreground hover:text-foreground outline-none focus-visible:text-foreground"

/** The moment a text reached the agent, in plain words, the call in it apart, and what carried it, as a quiet tag. */
function momentOf(step: Step, telling: Telling): { when: string; code?: string; tag: string } {
  const carrier = telling.carrier

  if (carrier === "SessionStart hook") return { when: capital(step.did), tag: carrier }
  if (carrier === "UserPromptSubmit hook") return { when: `The person says: «${step.did.replace(/^says: /, "")}»`, tag: carrier }
  if (carrier === "Stop hook") return { when: "The turn ends", tag: carrier }
  if (carrier === "PostToolUse hook") {
    const other = /^another tool: (.*)$/.exec(step.did)?.[1]

    return other ? { when: "After the agent's tool call:", code: other, tag: carrier } : { when: "After that tool call", tag: carrier }
  }

  const answered = /^answer to (.*)$/.exec(carrier)?.[1]

  if (answered && step.did === "the wait ends") return { when: "The wait ends: the answer to", code: call(answered), tag: "the command's answer" }
  if (answered) return { when: "Answer to", code: call(answered), tag: "the command's answer" }

  return { when: carrier, tag: "" }
}

/** What happened at a step with nothing told, in a line. */
function gapOf(step: Step): ReactNode {
  const acted = /^on the page: (\w+)(.*?) at (\S+?)(, refused: .*)?$/.exec(step.did)
  const tab = acted && step.page.tabs.find((t) => acted[3]!.startsWith(t.at))

  if (step.unhooked) {
    const said = /^says: (.*)$/.exec(step.did)?.[1]

    if (said) return <>The person says: «{said}» — no hook runs, so nothing is told</>

    return <>{capital(step.did.replace(/^another tool: /, "the agent's tool call: "))} — no hook runs</>
  }
  if (acted && tab?.surface === "settings")
    return (
      <>
        The person changes a setting: <b className="font-medium">{acted[1]}</b>
        {acted[2]} — the agent is not told yet
      </>
    )
  if (acted)
    return (
      <>
        The person clicks <b className="font-medium">{capital(acted[1]!)}</b>
        {acted[2]} on the page, at <code className="font-mono">{acted[3]}</code>
        {acted[4]} — the agent is not told yet
      </>
    )

  const build = /^the build moves by itself: (.*)$/.exec(step.did)?.[1]

  if (build) {
    const said = build === "running" ? "starts a run" : build === "passed" ? "passes" : `fails: ${build.replace(/^failed: /, "")}`

    return <>build {said} by itself — nothing told</>
  }

  const waits = /^(\S+ wait \d+), and waits$/.exec(step.did)?.[1]

  if (waits)
    return (
      <>
        The agent runs <code className="font-mono">{call(waits)}</code> and waits — its answer comes when the wait ends
      </>
    )

  if (step.who === "project") return <>{capital(step.did)} on disk — nothing told</>
  if (step.did.startsWith("the harness")) return <>{capital(step.did)}</>

  return <>{capital(step.did)} — nothing told</>
}

const Delta = ({ delta, short }: { delta?: string; short?: boolean }) =>
  delta === undefined || (short && delta === "same") ? null : (
    <span
      title={delta === "new" ? "Not there when the pin was taken: pin again to take it in" : delta === "same" ? "The same as the pin" : delta}
      className={`text-meta tabular-nums whitespace-nowrap ${delta === "same" ? "text-muted-foreground/60" : delta === "new" ? "text-info" : "text-warning"}`}
    >
      {delta === "same" ? "= pin" : delta === "new" ? "new" : short ? (/^([+-]\d+) tokens/.exec(delta)?.[1]?.concat(" tok") ?? "changed") : delta}
    </span>
  )

/** A choice of two or three, as quiet words; the chosen one in the foreground. */
function Choice<T extends string>({ value, options, set, label }: { value: T; options: [T, string][]; set: (v: T) => void; label: string }) {
  return (
    <span role="group" aria-label={label} className="flex items-center gap-1.5">
      {options.map(([id, name]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => set(id)} className={`${quiet} aria-pressed:text-foreground text-meta`}>
          {name}
        </button>
      ))}
    </span>
  )
}
const MODES: [Mode, string][] = [
  ["preview", "Preview"],
  ["source", "Source"],
]

/** One text the agent was given: when, what carried it, its tokens; then the text, as it reads or as it is, folded where long. */
function Entry(props: { step: Step; telling: Telling; total: number; mode: Mode; setMode: (m: Mode) => void; compare: Compare; wrap: boolean; open: boolean; toggle: () => void; onPath: (path: string) => boolean }) {
  const { step, telling, total, mode, setMode, compare, wrap, open, toggle, onPath } = props
  const { when, code, tag } = momentOf(step, telling)
  const pinned = telling.pinned
  const long = telling.lines > LONG

  return (
    <div className="group/entry flex flex-col gap-1 py-1.5">
      <div className="flex min-w-0 items-baseline gap-2 text-body">
        <span className="min-w-0 truncate">
          <span className="font-medium">{when}</span>
          {code && <code className="bg-muted ml-1.5 rounded-sm px-1 py-px font-mono text-meta">{code}</code>}
        </span>
        {tag && <span className="text-muted-foreground/70 shrink-0 text-badge whitespace-nowrap max-sm:hidden">{tag.replace(/ hook$/, "")}</span>}
        <span className="ml-auto flex shrink-0 items-baseline gap-2.5">
          <span className="opacity-0 transition-opacity group-focus-within/entry:opacity-100 group-hover/entry:opacity-100">
            <Choice value={mode} options={MODES} set={setMode} label="Show the text" />
          </span>
          <Delta delta={telling.delta} />
          <span className="text-muted-foreground text-meta tabular-nums whitespace-nowrap" title={`${telling.lines} lines · ${telling.chars.toLocaleString("en")} chars · ${total.toLocaleString("en")} tokens given so far`}>
            ~{telling.tokens.toLocaleString("en")} tok
          </span>
        </span>
      </div>
      <div className="bg-muted/30 min-w-0 overflow-hidden rounded-md">
        <div className={`px-3 py-2 ${long && !open ? FOLDED : ""}`}>
          {mode === "source" ? <Source text={telling.text} pinned={pinned} compare={compare} wrap={wrap} /> : <Preview text={telling.text} pinned={pinned} wrap={wrap} onPath={onPath} />}
        </div>
        {long && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              className={`${quiet} flex h-6 items-center gap-1 px-2 text-meta`}
            >
              {open ? <ChevronDownIcon className="size-3" aria-hidden /> : <ChevronRightIcon className="size-3" aria-hidden />}
              {open ? "Fold" : `All ${telling.lines} lines`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const Gap = ({ children }: { children: ReactNode }) => (
  <div className="text-muted-foreground flex min-h-6 items-center py-0.5 text-meta">
    <span className="min-w-0">{children}</span>
  </div>
)

/** Where a tab's view changed from the step before: its rows by path, its other facts by name. */
function changedIn(now: Json, before: Json | undefined): Set<string> {
  const out = new Set<string>()
  const row = (v: Json | undefined) => (v && typeof v === "object" && !Array.isArray(v) ? v : {})
  const was = row(before)

  for (const [k, v] of Object.entries(row(now))) {
    if (Array.isArray(v)) {
      const old = Array.isArray(was[k]) ? (was[k] as Json[]) : []

      for (const r of v) {
        const at = row(r).at

        if (typeof at === "string" && JSON.stringify(old.find((o) => row(o).at === at)) !== JSON.stringify(r)) out.add(`at ${at}`)
      }
    } else if (JSON.stringify(was[k]) !== JSON.stringify(v)) out.add(`fact ${k}`)
  }

  return out
}

/** A view no demo page draws, as its facts. */
function Facts({ view }: { view: Json }) {
  const facts = Object.entries(view && typeof view === "object" && !Array.isArray(view) ? view : {}).filter(([, v]) => !(v && typeof v === "object" && !Array.isArray(v) && v.kind === "handle"))

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 p-3 font-mono text-meta">
      {facts.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="truncate">{JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The person's page after the selected step: its tabs, and the one in front, or the one a path picked, drawn by its surface's own page, inert. */
function PagePreview({ step, before, peek }: { step?: Step; before?: Step; peek?: string }) {
  const frame = useRef<HTMLDivElement | null>(null)
  const page = step?.page
  const tabs = page?.tabs ?? []
  const front = tabs.find((t) => t.at === peek) ?? tabs.find((t) => t.at === page?.shown)
  const earlier = before?.page.tabs ?? []
  const changed = useMemo(() => (front ? changedIn(front.view, earlier.find((t) => t.at === front.at)?.view) : new Set<string>()), [front, earlier])
  const fresh = !earlier.some((t) => t.at === front?.at)

  useEffect(() => {
    for (const el of frame.current?.querySelectorAll<HTMLElement>("[data-at], [data-fact]") ?? []) {
      const key = el.dataset.at !== undefined ? `at ${el.dataset.at}` : `fact ${el.dataset.fact}`

      if (!fresh && changed.has(key)) el.setAttribute("data-changed", "")
      else el.removeAttribute("data-changed")
    }
  })

  return (
    <section className="bg-sidebar sticky top-0 z-10 flex flex-col gap-1.5 px-3 pt-2 pb-3" aria-label="The page after this step">
      <h2 className="text-muted-foreground flex h-5 items-center gap-2 text-meta">
        The page after step {step?.n ?? "–"}
        {page?.asleep && <span className="text-muted-foreground/70">· asleep, as it last was</span>}
      </h2>
      <div className="bg-background flex h-48 flex-col overflow-hidden rounded-md border">
        <div className="flex h-6 shrink-0 items-center gap-0.5 border-b px-1">
          <span className="text-muted-foreground/70 px-1.5 text-meta">Home</span>
          {tabs.map((t) => {
            const view = (t.view ?? {}) as { title?: string; attention?: { who?: string } }
            const isNew = !earlier.some((e) => e.at === t.at)

            return (
              <span
                key={t.at}
                title={t.at}
                className={`flex h-5 items-center gap-1 rounded-sm px-1.5 text-meta [&_svg]:size-3 ${t.at === front?.at ? "bg-muted text-foreground" : "text-muted-foreground"} ${isNew ? "ring-primary/40 ring-1" : ""}`}
              >
                {PAGES[t.surface]?.icon}
                {view.title ?? t.surface}
                {view.attention && <span className={`size-1.5 rounded-full ${view.attention.who === "person" ? "bg-warning" : "bg-primary"}`} aria-label={`needs the ${view.attention.who}`} />}
              </span>
            )
          })}
        </div>
        <div ref={frame} inert className="min-h-0 flex-1 overflow-auto select-none [&_[data-changed]]:bg-primary/10">
          {!step ? (
            <p className="text-muted-foreground p-3 text-body">Not played yet.</p>
          ) : !front ? (
            <p className="text-muted-foreground p-3 text-body">No tab is open: the page shows Home.</p>
          ) : (
            (PAGES[front.surface]?.draw(front.view) ?? <Facts view={front.view} />)
          )}
        </div>
      </div>
    </section>
  )
}

/** The demo project's shape, as /demo reads it from its surfaces, folded until asked for: each surface's places, their facts and actions. */
function DemoShape({ demo }: { demo?: Demo }) {
  const [open, setOpen] = useState(false)
  const surfaces = Array.isArray(demo?.surfaces) ? demo.surfaces : []

  return (
    <section className="flex flex-col" aria-label="Demo project">
      <button type="button" onClick={() => setOpen(!open)} title={demo?.about} className={`${quiet} flex h-7 items-center gap-1 px-3 text-left text-meta`}>
        {open ? <ChevronDownIcon className="size-3" aria-hidden /> : <ChevronRightIcon className="size-3" aria-hidden />}
        Demo project
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {surfaces.map((s) => (
            <div key={s.name} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-body [&_svg]:size-3.5" title={s.description}>
                {PAGES[s.name]?.icon}
                <span className="font-mono">{s.name}</span>
              </div>
              <ul className="flex flex-col gap-1.5 pl-5">
                {s.views.map((v) => (
                  <li key={v.path} className="flex flex-col gap-0.5">
                    <span className="font-mono text-meta">{v.path}</span>
                    <span className="text-muted-foreground text-meta">{v.facts.join(" · ")}</span>
                    {v.actions.length > 0 && (
                      <span className="flex flex-wrap gap-x-2 font-mono text-meta [&_svg]:size-2.5">
                        {v.actions.map((a) => (
                          <span key={a.name} title={`${a.description}${a.ask ? " — an ask: the person's alone" : ""}${a.notice ? " — a call gives a notice" : ""}`} className={`flex items-center gap-0.5 ${a.ask ? "text-warning" : ""}`}>
                            {a.name}
                            {a.inputs.length > 0 && <span className="text-muted-foreground">({a.inputs.join(", ")})</span>}
                            {a.ask && <UserIcon aria-label="ask" />}
                            {a.notice && <BellIcon aria-label="notice" />}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
                {s.itself && <li className="text-muted-foreground text-meta">changes by itself: {s.itself.join(", ")}</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

export default function Design() {
  const { view, error } = useLive<Root>("/")
  const { view: demo } = useLive<Demo>("/demo")
  const { call: callTab, route, navigate, active } = useTab()
  const [compare, setCompare] = useState<Compare>("diff")
  const [mode, setMode] = useState<Mode>("preview")
  const [modes, setModes] = useState<Record<string, Mode>>({})
  const [wrap, setWrap] = useState(true)
  const [unfolded, setUnfolded] = useState(false)
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const [peek, setPeek] = useState<{ step: number; at: string }>()
  const [refused, setRefused] = useState("")
  const scenarios = view?.scenarios ?? []
  const [, name, picked] = /^\/scenarios\/([^/]+)(?:\/(\d+))?/.exec(route) ?? []
  const current = scenarios.find((s) => s.name === name) ?? scenarios[0]
  const { view: timeline } = useLive<Timeline>(current ? `/timeline/${current.name}` : "/")
  const steps = timeline?.name === current?.name && Array.isArray(timeline?.steps) ? timeline.steps : []
  const selected = steps.find((s) => String(s.n) === picked) ?? steps[0]
  const focused = useRef<HTMLLIElement | null>(null)
  const differs = steps.some((s) => s.tellings.some((t) => t.pinned !== undefined))
  const act = async (handle?: Handle) => {
    if (!handle) return

    const answer = await callTab("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }
  const go = (n: number) => current && navigate(`/scenarios/${current.name}/${n}`)
  /** A path clicked in a text: the step's page shows the tab it is in, where the page has it. */
  const pathIn = (step: Step) => (path: string) => {
    const tab = /^\/tabs\/\d+/.exec(path)?.[0]

    if (!tab || !step.page.tabs.some((t) => t.at === tab)) return false
    go(step.n)
    setPeek({ step: step.n, at: tab })

    return true
  }

  // Braced: in some browsers scrolling gives a promise, which an effect may not return.
  useEffect(() => {
    focused.current?.scrollIntoView({ block: "nearest" })
  }, [picked, timeline?.name])
  useEffect(() => {
    if (!active || !selected) return

    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return

      const by = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0
      const next = steps[steps.indexOf(selected) + by]

      if (!by || !next) return
      e.preventDefault()
      go(next.n)
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  })

  // The tokens given so far, after each text.
  let total = 0
  const totals = steps.map((s) => s.tellings.map((t) => (total += t.tokens)))

  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-auto">
      <main className="flex min-w-0 flex-1 flex-col md:overflow-auto">
        {current && (
          <header className="bg-background/95 sticky top-0 z-20 flex flex-col gap-0.5 px-4 pt-3 pb-2 backdrop-blur">
            <div className="flex items-baseline gap-3">
              <h1 className="min-w-0 truncate text-sm font-medium" title={current.name}>
                {current.title}
              </h1>
              <span className="text-muted-foreground ml-auto shrink-0 text-meta tabular-nums whitespace-nowrap" title={`${current.steps} steps · ${current.lines ?? "–"} lines · ${current.chars?.toLocaleString("en") ?? "–"} chars`}>
                ~{current.tokens?.toLocaleString("en") ?? "–"} tok
              </span>
              <Delta delta={current.delta} />
              <Choice
                value={mode}
                options={MODES}
                set={(m) => {
                  setMode(m)
                  setModes({})
                }}
                label="Show every text"
              />
              <Popover>
                <PopoverTrigger className={`${quiet} flex size-5 items-center justify-center self-center rounded-sm`} aria-label="View options">
                  <EllipsisIcon className="size-3.5" aria-hidden />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 gap-2 text-meta">
                  <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)} className={`${quiet} aria-pressed:text-foreground text-left`}>
                    {wrap ? "✓ " : ""}Wrap long lines
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUnfolded(!unfolded)
                      setFolds({})
                    }}
                    className={`${quiet} text-left`}
                  >
                    {unfolded ? "Fold long texts" : "Unfold long texts"}
                  </button>
                  {differs && (
                    <div className="flex flex-col gap-1 border-t pt-2">
                      <span className="text-muted-foreground/70 text-badge uppercase">A changed text's source</span>
                      <Choice value={compare} options={COMPARES} set={setCompare} label="Compare with the pin" />
                    </div>
                  )}
                  <span className="text-muted-foreground/70 border-t pt-2">↑ ↓ or j k move the step</span>
                </PopoverContent>
              </Popover>
            </div>
            {timeline?.about && (
              <p className="text-muted-foreground truncate text-body" title={timeline.about}>
                {timeline.about}
              </p>
            )}
            {(current.error || view?.failure) && <p className="text-destructive text-body">{current.error ?? view?.failure}</p>}
          </header>
        )}
        <ol className="flex flex-col px-2 pb-8">
          {steps.map((step, si) => {
            const here = step === selected

            return (
              <li
                key={step.n}
                ref={here ? focused : undefined}
                onClick={() => {
                  go(step.n)
                  if (peek?.step !== step.n) setPeek(undefined)
                }}
                aria-current={here ? "step" : undefined}
                className={`flex scroll-mt-24 scroll-mb-24 gap-2 rounded-md py-0.5 pr-2 ${here ? "bg-accent/40" : "hover:bg-muted/20"}`}
              >
                <span className={`w-6 shrink-0 pt-[0.4rem] text-right text-meta tabular-nums ${here ? "text-foreground font-medium" : "text-muted-foreground/50"}`}>{step.n}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  {step.timing && (
                    <Gap>
                      <span className="text-warning mr-1">timing-dependent:</span> {step.timing}
                    </Gap>
                  )}
                  {step.tellings.length === 0 && <Gap>{gapOf(step)}</Gap>}
                  {step.tellings.map((telling, i) => {
                    if (!telling.text && telling.carrier === "no wait") return null
                    if (!telling.text) {
                      const { when, code, tag } = momentOf(step, telling)

                      return (
                        <Gap key={i}>
                          {when}
                          {code && <code className="ml-1 font-mono">{code}</code>} — {tag.replace(/ hook$/, "")}: nothing
                          {telling.delta && telling.delta !== "same" && <span className={`ml-2 ${telling.delta === "new" ? "text-info" : "text-warning"}`}>{telling.delta}</span>}
                        </Gap>
                      )
                    }

                    const key = `${step.n}:${i}`

                    return (
                      <Entry
                        key={i}
                        step={step}
                        telling={telling}
                        total={totals[si]![i]!}
                        mode={modes[key] ?? mode}
                        setMode={(m) => setModes({ ...modes, [key]: m })}
                        compare={compare}
                        wrap={wrap}
                        open={folds[key] ?? unfolded}
                        toggle={() => setFolds({ ...folds, [key]: !(folds[key] ?? unfolded) })}
                        onPath={pathIn(step)}
                      />
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ol>
        {!steps.length && <p className="text-muted-foreground p-6 text-body">{view?.playing ? "Playing the scenarios…" : "Not played yet."}</p>}
      </main>
      <aside className="bg-sidebar flex shrink-0 flex-col md:w-[24rem] md:overflow-auto md:border-l max-md:border-t" aria-label="Scenarios">
        <PagePreview step={selected} before={selected && steps[steps.indexOf(selected) - 1]} peek={peek?.step === selected?.n ? peek?.at : undefined} />
        <ul className="pb-2">
          {scenarios.map((s, i) => (
            <li key={s.name}>
              {s.group !== scenarios[i - 1]?.group && (
                <div className="text-muted-foreground/70 flex items-center justify-between px-3 pt-3 pb-1 text-badge uppercase">
                  {s.group}
                  {i === 0 && view?.playing && <span className="normal-case">playing…</span>}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate(`/scenarios/${s.name}`)}
                aria-current={s.name === current?.name}
                title={`${s.name} · ${s.steps} steps`}
                className="hover:bg-muted/60 aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground flex h-7 w-full items-center gap-2 px-3 text-left text-body outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <Delta delta={s.delta} short />
                <span className={`w-12 text-right text-meta tabular-nums ${s.error ? "text-destructive" : "text-muted-foreground"}`}>{s.error ? "failed" : (s.tokens?.toLocaleString("en") ?? "–")}</span>
              </button>
            </li>
          ))}
        </ul>
        <DemoShape demo={demo} />
        <div className="text-muted-foreground flex h-7 items-center gap-2.5 px-3 text-meta">
          <span className="min-w-0 truncate" title={view?.pinned ? "Each text shows its difference from the pin" : "Pin to keep these tellings as the baseline"}>
            {view?.pinned ? `Pinned ${view.pinned.replace("T", " ").replace(/:\d\dZ$/, "")}` : "Not pinned"}
          </span>
          <span className="ml-auto flex shrink-0 gap-2.5">
            {view?.pin && (
              <button type="button" className={quiet} onClick={() => void act(view.pin)}>
                {view.pinned ? "Pin again" : "Pin"}
              </button>
            )}
            {view?.unpin && (
              <button type="button" className={quiet} onClick={() => void act(view.unpin)}>
                Unpin
              </button>
            )}
            {view?.play && (
              <button type="button" className={quiet} onClick={() => void act(view.play)}>
                Play again
              </button>
            )}
          </span>
        </div>
        {(refused || error) && (
          <p role="alert" className="text-destructive px-3 pb-3 text-body">
            {refused || error}
          </p>
        )}
      </aside>
    </div>
  )
}
