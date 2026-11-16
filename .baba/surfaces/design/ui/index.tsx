// The design document's page, in two places. At / the picker: the scenarios, canonical and noise, each with what it is
// about and its measure, and under them one quiet line for the pin, playing again and the demo project's shape. In a
// scenario, at /scenarios/NAME/N: two screens of one frame side by side, the person's page as it stood after step N, drawn
// by the demo surfaces' own pages from what the play recorded, and what the agent was given at that step, each text as it
// reads: its prose as markdown, what the framework prints dense and coloured (text.tsx), or its source exactly. Below them
// the playback: the steps in order, who moved and what they did, with the tokens given and a mark where a text differs
// from the pin; left and right, Home and End move the step, and play steps through by itself. The scenario and step are
// the tab's route, so a refresh and the agent's pointing land on them. What is not needed at a glance is on hover.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeftIcon, BellIcon, BookOpenTextIcon, EllipsisIcon, PauseIcon, PlayIcon, UserIcon } from "lucide-react"
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

type Row = { at: string; name: string; group: string; title: string; about?: string; steps: number; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string }
type Root = { scenarios: Row[]; playing?: true; failure?: string; pinned?: string; play?: Handle; pin?: Handle; unpin?: Handle }
type Demo = { about: string; surfaces: Shape[] | string }
type Telling = { carrier: string; lines: number; chars: number; tokens: number; delta?: string; text: string; pinned?: string }
type Step = { at: string; n: number; who: string; did: string; timing?: string; unhooked?: string; tellings: Telling[]; page: Page }
type Timeline = { name: string; title: string; about: string; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string; steps: Step[] }
type Mode = "preview" | "source"

export const icon = <BookOpenTextIcon aria-hidden />

const COMPARES: [Compare, string][] = [
  ["diff", "Line diff"],
  ["side", "Side by side"],
  ["text", "Now only"],
]
const MODES: [Mode, string][] = [
  ["preview", "Preview"],
  ["source", "Source"],
]
/** The demo surfaces' own pages, each a function of its view at /, and their tabs' icons. */
const PAGES: Record<string, { icon: ReactNode; draw: (view: Json) => ReactNode }> = {
  tasks: { icon: tasksIcon, draw: (view) => <TasksPage view={view as TasksView} /> },
  build: { icon: buildIcon, draw: (view) => <BuildPage view={view as BuildView} /> },
}
/** Who moved, as the strip marks them: the person, the agent and a surface by the colours the texts give them. */
const WHO: Record<string, string> = { person: "text-warning", agent: "text-primary", surface: "text-info" }
/** How long the playback stays on a step. */
const STEP_MS = 1600
const WORD = /^\S*\/baba\b/

/** The word as the person reads it: `baba …`, wherever the project keeps it. */
const call = (text: string) => text.replace(WORD, "baba")
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const quiet = "text-muted-foreground hover:text-foreground outline-none focus-visible:text-foreground"
const tokens = (n?: number) => `~${n?.toLocaleString("en") ?? "–"} tok`
const carried = (tellings: Telling[]) => tellings.map((t) => t.carrier.replace(/ to .*/, "")).join(" + ")

/**
 * What a step gave the agent, as the strip marks it, and why in words: its size where a text reached it; `0 tok` where a
 * hook ran, or a command answered, and said nothing; `—` where nothing ran that could tell it anything.
 */
function givenMark(step: Step): { mark: string; why: string } {
  const told = step.tellings.filter((t) => t.text)

  if (told.length) return { mark: tokens(told.reduce((a, t) => a + t.tokens, 0)), why: `Given by the ${carried(told)}` }
  if (step.tellings.length) return { mark: "0 tok", why: `The ${carried(step.tellings)} ran and said nothing` }

  return { mark: "—", why: step.unhooked ? "No hook ran: the harness runs none now, so nothing reached the agent" : "No hook runs for this step, so nothing reached the agent" }
}

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

/** One of the scenario's two screens: a header, a line, and its content, which scrolls inside it. */
function Screen({ label, title, aside, children }: { label: ReactNode; title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border" aria-label={title}>
      <header className="bg-sidebar flex h-menubar shrink-0 items-center gap-2 border-b px-2.5 text-meta">
        <span className="text-muted-foreground min-w-0 truncate">{label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2.5">{aside}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  )
}

/** One text the agent was given: when, what carried it, its tokens; then the text, as it reads or as it is. */
function Entry(props: { step: Step; telling: Telling; total: number; mode: Mode; setMode: (m: Mode) => void; compare: Compare; wrap: boolean; onPath: (path: string) => boolean }) {
  const { step, telling, total, mode, setMode, compare, wrap, onPath } = props
  const { when, code, tag } = momentOf(step, telling)

  return (
    <div className="group/entry flex flex-col gap-1">
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
            {tokens(telling.tokens)}
          </span>
        </span>
      </div>
      <div className="bg-muted/30 min-w-0 rounded-md px-3 py-2">
        {mode === "source" ? <Source text={telling.text} pinned={telling.pinned} compare={compare} wrap={wrap} /> : <Preview text={telling.text} pinned={telling.pinned} wrap={wrap} onPath={onPath} />}
      </div>
    </div>
  )
}

const Gap = ({ children }: { children: ReactNode }) => <p className="text-muted-foreground text-meta">{children}</p>

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

/** The person's page after a step: its tabs, and the one in front, or the one a path picked, drawn by its surface's own page, inert. */
function PageScreen({ step, before, peek }: { step?: Step; before?: Step; peek?: string }) {
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
    <Screen
      title="The person's page after this step"
      label={<>The person's page{step && ` after step ${step.n}`}</>}
      aside={page?.asleep && <span className="text-muted-foreground/70">asleep, as it last was</span>}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden border-b px-1">
          <span className="text-muted-foreground/70 px-1.5 text-meta">Home</span>
          {tabs.map((t) => {
            const view = (t.view ?? {}) as { title?: string; attention?: { who?: string } }
            const isNew = !earlier.some((e) => e.at === t.at)

            return (
              <span
                key={t.at}
                title={t.at}
                className={`flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-meta [&_svg]:size-3 ${t.at === front?.at ? "bg-muted text-foreground" : "text-muted-foreground"} ${isNew ? "ring-primary/40 ring-1" : ""}`}
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
    </Screen>
  )
}

/** What the agent was given at a step, each text as it reads; a step that gave it nothing says so, and what happened. */
function AgentScreen(props: { step?: Step; total: number; compare: Compare; setCompare: (c: Compare) => void; wrap: boolean; setWrap: (w: boolean) => void; onPath: (path: string) => boolean }) {
  const { step, total, compare, setCompare, wrap, setWrap, onPath } = props
  const [mode, setMode] = useState<Mode>("preview")
  const [modes, setModes] = useState<Record<string, Mode>>({})
  const told = step?.tellings.filter((t) => t.text) ?? []
  const silent = step?.tellings.filter((t) => !t.text && t.carrier !== "no wait") ?? []
  const size = told.reduce((a, t) => a + t.tokens, 0)
  const moved = step?.tellings.find((t) => t.delta && t.delta !== "same")?.delta
  let given = total

  return (
    <Screen
      title="What the agent was given at this step"
      label={<>The agent{step && ` at step ${step.n}`}</>}
      aside={
        <>
          {moved && <Delta delta={step!.tellings.length === 1 ? moved : moved === "new" ? "new" : "changed"} />}
          {told.length > 1 && <span className="text-muted-foreground tabular-nums">{tokens(size)}</span>}
          <Popover>
            <PopoverTrigger className={`${quiet} flex size-5 items-center justify-center rounded-sm`} aria-label="View options">
              <EllipsisIcon className="size-3.5" aria-hidden />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 gap-2 text-meta">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground/70 text-badge uppercase">Every text</span>
                <Choice
                  value={mode}
                  options={MODES}
                  set={(m) => {
                    setMode(m)
                    setModes({})
                  }}
                  label="Show every text"
                />
              </div>
              <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)} className={`${quiet} aria-pressed:text-foreground text-left`}>
                {wrap ? "✓ " : ""}Wrap long lines
              </button>
              <div className="flex flex-col gap-1 border-t pt-2">
                <span className="text-muted-foreground/70 text-badge uppercase">A changed text's source</span>
                <Choice value={compare} options={COMPARES} set={setCompare} label="Compare with the pin" />
              </div>
              <span className="text-muted-foreground/70 border-t pt-2">← → step · Home End the first and last</span>
            </PopoverContent>
          </Popover>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        {!step && <Gap>Not played yet.</Gap>}
        {step?.timing && (
          <Gap>
            <span className="text-warning mr-1">timing-dependent:</span> {step.timing}
          </Gap>
        )}
        {step && told.length === 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-body font-medium">The agent is given nothing at this step.</p>
            {step.tellings.length === 0 && <Gap>{gapOf(step)}</Gap>}
          </div>
        )}
        {step?.tellings.map((telling, i) => {
          if (!telling.text) return null

          const key = `${step.n}:${i}`

          given += telling.tokens

          return (
            <Entry
              key={key}
              step={step}
              telling={telling}
              total={given}
              mode={modes[key] ?? mode}
              setMode={(m) => setModes({ ...modes, [key]: m })}
              compare={compare}
              wrap={wrap}
              onPath={onPath}
            />
          )
        })}
        {step &&
          silent.map((telling, i) => {
            const { when, code, tag } = momentOf(step, telling)

            return (
              <Gap key={i}>
                {when}
                {code && <code className="ml-1 font-mono">{code}</code>} — {tag.replace(/ hook$/, "")}: nothing
                {telling.delta && telling.delta !== "same" && <span className={`ml-2 ${telling.delta === "new" ? "text-info" : "text-warning"}`}>{telling.delta}</span>}
              </Gap>
            )
          })}
      </div>
    </Screen>
  )
}

/** What a step did, in the strip's words: the person's message quoted, the word's call as code. */
function didOf(step: Step): ReactNode {
  const said = /^says: (.*)$/.exec(step.did)?.[1]

  if (said) return <>«{said}»</>
  if (WORD.test(step.did)) return <code className="font-mono">{call(step.did)}</code>

  return capital(step.did.replace(/^another tool: /, "tool: ").replace(/^on the page: /, ""))
}

/** The playback: every step in order, the selected one in view; play steps through by itself. */
function Strip({ steps, selected, go }: { steps: Step[]; selected?: Step; go: (n: number) => void }) {
  const [playing, setPlaying] = useState(false)
  const here = useRef<HTMLButtonElement | null>(null)
  const last = steps.at(-1)

  useEffect(() => {
    const show = () => here.current?.scrollIntoView({ block: "nearest", inline: "nearest" })

    show()
    window.addEventListener("resize", show)

    return () => window.removeEventListener("resize", show)
  }, [selected?.n, steps.length])
  useEffect(() => {
    if (!playing || !selected) return
    if (selected === last) {
      setPlaying(false)

      return
    }

    const timer = setTimeout(() => go(selected.n + 1), STEP_MS)

    return () => clearTimeout(timer)
  }, [playing, selected?.n])

  return (
    <div className="flex shrink-0 items-stretch gap-2">
      <button
        type="button"
        onClick={() => {
          if (!playing && selected === last && steps[0]) go(steps[0].n)
          setPlaying(!playing)
        }}
        aria-label={playing ? "Pause" : "Play the steps"}
        title={playing ? "Pause" : "Play the steps one by one"}
        className={`${quiet} hover:bg-muted flex w-8 shrink-0 items-center justify-center rounded-md border [&_svg]:size-3.5`}
      >
        {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
      </button>
      <ol className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-3" aria-label="Steps">
        {steps.map((step) => {
          const given = givenMark(step)
          const moved = step.tellings.find((t) => t.delta && t.delta !== "same")?.delta
          const on = step === selected

          return (
            <li key={step.n} className="shrink-0">
              <button
                ref={on ? here : undefined}
                type="button"
                onClick={() => {
                  setPlaying(false)
                  go(step.n)
                }}
                aria-current={on ? "step" : undefined}
                title={`${step.n}. ${step.who}: ${call(step.did)} · ${given.why}${moved ? ` · ${moved}` : ""}`}
                className={`flex h-16 w-40 flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left outline-none focus-visible:ring-ring focus-visible:ring-1 ${on ? "border-primary/60 bg-accent text-accent-foreground" : "hover:bg-muted/50 border-transparent"}`}
              >
                <span className="flex items-center gap-1.5 text-badge">
                  <span className={`tabular-nums ${on ? "text-foreground" : "text-muted-foreground/70"}`}>{step.n}</span>
                  <span className={`uppercase ${WHO[step.who] ?? "text-muted-foreground"}`}>{step.who}</span>
                  {moved && <span className={`size-1.5 rounded-full ${moved === "new" ? "bg-info" : "bg-warning"}`} aria-label={moved === "new" ? "new since the pin" : "differs from the pin"} />}
                  <span className="text-muted-foreground ml-auto tabular-nums" title={given.why}>
                    {given.mark}
                  </span>
                </span>
                <span className={`line-clamp-2 min-w-0 text-meta break-words ${on ? "" : "text-muted-foreground"}`}>{didOf(step)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The demo project's shape, as /demo reads it from its surfaces: each surface's places, their facts and actions. */
function DemoShape({ demo }: { demo?: Demo }) {
  const surfaces = Array.isArray(demo?.surfaces) ? demo.surfaces : []

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-meta">{demo?.about}</p>
      {!surfaces.length && <p className="text-muted-foreground text-meta">Not played yet.</p>}
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
  )
}

/** The first screen: the scenarios by group, each with what it is about and its measure; the pin and the demo in a quiet line. */
function Picker({ view, demo, enter }: { view: Root; demo?: Demo; enter: (name: string) => void }) {
  const { call: callTab } = useTab()
  const [refused, setRefused] = useState("")
  const scenarios = view.scenarios
  const act = async (handle?: Handle) => {
    if (!handle) return

    const answer = await callTab("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-6">
        <h1 className="px-2 text-sm font-medium">Scenarios</h1>
        <p className="text-muted-foreground px-2 pb-2 text-body">What the agent is given, step by step, beside what the person's page shows.</p>
        <ul className="flex flex-col">
          {scenarios.map((s, i) => (
            <li key={s.name}>
              {s.group !== scenarios[i - 1]?.group && <div className="text-muted-foreground/70 px-2 pt-4 pb-1 text-badge uppercase">{s.group}</div>}
              <button
                type="button"
                onClick={() => enter(s.name)}
                title={`${s.name} · ${s.lines ?? "–"} lines · ${s.chars?.toLocaleString("en") ?? "–"} chars`}
                className="hover:bg-muted/60 focus-visible:bg-muted/60 flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left outline-none"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium">{s.title}</span>
                  {s.about && (
                    <span className="text-muted-foreground truncate text-meta" title={s.about}>
                      {s.about}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground/70 shrink-0 text-meta tabular-nums max-sm:hidden">{s.steps} steps</span>
                <Delta delta={s.delta} short />
                <span className={`w-16 shrink-0 text-right text-meta tabular-nums ${s.error ? "text-destructive" : "text-muted-foreground"}`} {...(s.error && { title: s.error })}>
                  {s.error ? "failed" : tokens(s.tokens)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-2 pt-3 text-meta">
          {view.playing && <span className="text-foreground">Playing…</span>}
          <span title={view.pinned ? "Each text shows its difference from the pin" : "Pin to keep these tellings as the baseline"}>
            {view.pinned ? `Pinned ${view.pinned.replace("T", " ").replace(/:\d\dZ$/, "")}` : "Not pinned"}
          </span>
          {view.pin && (
            <button type="button" className={quiet} onClick={() => void act(view.pin)}>
              {view.pinned ? "Pin again" : "Pin"}
            </button>
          )}
          {view.unpin && (
            <button type="button" className={quiet} onClick={() => void act(view.unpin)}>
              Unpin
            </button>
          )}
          {view.play && (
            <button type="button" className={quiet} onClick={() => void act(view.play)}>
              Play again
            </button>
          )}
          <Popover>
            <PopoverTrigger className={`${quiet} ml-auto`}>Demo project</PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70vh] w-96 overflow-auto">
              <DemoShape demo={demo} />
            </PopoverContent>
          </Popover>
        </div>
        {(refused || view.failure) && (
          <p role="alert" className="text-destructive px-2 pt-2 text-body">
            {refused || view.failure}
          </p>
        )}
      </div>
    </div>
  )
}

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

/** A scenario: its bar, the two screens at the selected step, and the playback. */
function Scenario({ row, timeline, playing, picked, back }: { row: Row; timeline?: Timeline; playing?: true; picked?: string; back: () => void }) {
  const { navigate, active } = useTab()
  const [compare, setCompare] = useState<Compare>("diff")
  const [wrap, setWrap] = useState(true)
  const [peek, setPeek] = useState<{ step: number; at: string }>()
  const steps = timeline?.name === row.name && Array.isArray(timeline?.steps) ? timeline.steps : []
  const selected = steps.find((s) => String(s.n) === picked) ?? steps[0]
  const at = selected ? steps.indexOf(selected) : -1
  const go = (n: number) => navigate(`/scenarios/${row.name}/${n}`)
  /** A path clicked in a text: the page shows the tab it is in, where the page has it. */
  const onPath = (path: string) => {
    const tab = selected?.page.tabs.find((t) => path === t.at || path.startsWith(`${t.at}/`))?.at

    if (!tab || !selected) return false
    setPeek({ step: selected.n, at: tab })

    return true
  }
  // The tokens given before the selected step.
  const before = steps.slice(0, Math.max(at, 0)).reduce((a, s) => a + s.tellings.reduce((b, t) => b + t.tokens, 0), 0)

  useEffect(() => {
    if (!active || !selected) return

    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const to = e.key === "ArrowRight" ? steps[at + 1] : e.key === "ArrowLeft" ? steps[at - 1] : e.key === "Home" ? steps[0] : e.key === "End" ? steps.at(-1) : undefined

      if (!to) return
      e.preventDefault()
      go(to.n)
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
      <header className="flex h-bar shrink-0 items-center gap-2 px-1">
        <button type="button" onClick={back} className={`${quiet} flex h-6 items-center gap-1 rounded-sm px-1 text-meta`} title="All scenarios">
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Scenarios
        </button>
        <h1 className="min-w-0 truncate text-body font-medium" title={timeline?.about ?? row.about}>
          {row.title}
        </h1>
        {(row.error || timeline?.error) && <span className="text-destructive min-w-0 truncate text-meta" title={row.error ?? timeline?.error}>failed: {row.error ?? timeline?.error}</span>}
        <span className="ml-auto flex shrink-0 items-baseline gap-2.5">
          <Delta delta={row.delta} short />
          <span className="text-muted-foreground text-meta tabular-nums" title={`${row.steps} steps · ${row.lines ?? "–"} lines · ${row.chars?.toLocaleString("en") ?? "–"} chars, over the scenario`}>
            {tokens(row.tokens)}
          </span>
        </span>
      </header>
      {!steps.length ? (
        // A played scenario's timeline is on its way: the view before it is kept until it lands.
        row.tokens === undefined && <p className="text-muted-foreground p-6 text-body">{playing ? "Playing the scenarios…" : "Not played yet."}</p>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 max-md:grid-cols-1 max-md:grid-rows-2">
            <PageScreen step={selected} before={at > 0 ? steps[at - 1] : undefined} peek={peek?.step === selected?.n ? peek?.at : undefined} />
            <AgentScreen step={selected} total={before} compare={compare} setCompare={setCompare} wrap={wrap} setWrap={setWrap} onPath={onPath} />
          </div>
          <Strip steps={steps} selected={selected} go={go} />
        </>
      )}
    </div>
  )
}

export default function Design() {
  const { view } = useLive<Root>("/")
  const { view: demo } = useLive<Demo>("/demo")
  const { route, navigate } = useTab()
  const [, name, picked] = /^\/scenarios\/([^/]+)(?:\/(\d+))?/.exec(route) ?? []
  const row = view?.scenarios.find((s) => s.name === name)
  // Read here, so a move to another scenario keeps the timeline it had until the new one lands.
  const { view: timeline } = useLive<Timeline>(row ? `/timeline/${row.name}` : "/")

  if (!view) return null
  if (!row) return <Picker view={view} demo={demo} enter={(n) => navigate(`/scenarios/${n}/1`)} />

  return <Scenario key={row.name} row={row} timeline={timeline} playing={view.playing} picked={picked} back={() => navigate("/")} />
}
