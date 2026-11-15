// The design document's page. The content is what the agent is given, and when: the selected scenario as one timeline,
// an entry per text that reached the agent, its moment in plain words, its carrier, its size and the tokens given so far,
// the text verbatim and folded where long; between them, quiet lines for what happened without the agent being told. At
// the right: the person's page as it stood after the selected step, drawn by the demo surfaces' own pages from what the
// play recorded; the scenarios; the demo project's shape, read from its surfaces; and the pin. The scenario and step are
// the tab's route, /scenarios/NAME/N, so a refresh and the agent's pointing land on them; up and down, or j and k, move
// the step. How a changed text is compared with the pin, wrapping and folding are the page's own, in the timeline's toolbar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BellIcon, BookOpenTextIcon, ChevronDownIcon, ChevronRightIcon, PinIcon, UserIcon } from "lucide-react"
import type { Handle, Json } from "babavoss/core/index.ts"
import { Button } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"
import { lineDiff } from "../src/measure.ts"
import type { Page } from "../src/play.ts"
import type { Shape } from "../src/shape.ts"
import BuildPage, { type BuildView } from "../demo/surfaces/build/ui/view.tsx"
import { icon as buildIcon } from "../demo/surfaces/build/ui/index.tsx"
import TasksPage, { type TasksView } from "../demo/surfaces/tasks/ui/view.tsx"
import { icon as tasksIcon } from "../demo/surfaces/tasks/ui/index.tsx"

type Row = { at: string; name: string; group: string; title: string; steps: number; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string }
type Root = { scenarios: Row[]; playing?: true; failure?: string; pinned?: string; play?: Handle; pin?: Handle; unpin?: Handle }
type Demo = { about: string; surfaces: Shape[] | string }
type Telling = { carrier: string; lines: number; chars: number; tokens: number; delta?: string; text: string; pinned?: string }
type Step = { at: string; n: number; who: string; did: string; timing?: string; unhooked?: string; tellings: Telling[]; page: Page }
type Timeline = { name: string; title: string; about: string; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string; steps: Step[] }
type Compare = "text" | "diff" | "side"

export const icon = <BookOpenTextIcon aria-hidden />

/** A text longer than this is folded, to the height of about eight lines. */
const LONG = 12
const FOLDED = "max-h-38 overflow-hidden"
const COMPARES: [Compare, string, string][] = [
  ["text", "Now", "Now only"],
  ["diff", "Diff", "Line diff against the pin"],
  ["side", "Side by side", "Pinned and now side by side"],
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

const Delta = ({ delta }: { delta?: string }) =>
  delta === undefined ? null : (
    <span className={`text-meta tabular-nums whitespace-nowrap ${delta === "same" ? "text-muted-foreground/70" : delta === "new" ? "text-info" : "text-warning"}`}>
      {delta === "same" ? "= pin" : delta === "new" ? "new: not pinned" : delta}
    </span>
  )

/** Lines of text, each as it is; wrapped at the block's edge, a wrapped line hangs, or kept whole and scrolled sideways. */
function Lines({ lines, wrap, mark }: { lines: string[]; wrap: boolean; mark?: (i: number) => string }) {
  return (
    <pre className={`px-3 py-2 font-mono text-meta leading-relaxed ${wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre"}`}>
      {lines.map((line, i) => (
        <div key={i} className={`${wrap ? "pl-[2ch] -indent-[2ch]" : ""} ${mark?.(i) ?? ""}`}>
          {line || " "}
        </div>
      ))}
    </pre>
  )
}

/** One text the agent was given: when, what carried it, its size and the tokens by then; then the text, now or against the pin, folded where long. */
function Entry(props: { step: Step; telling: Telling; total: number; compare: Compare; wrap: boolean; open: boolean; toggle: () => void }) {
  const { step, telling, total, compare, wrap, open, toggle } = props
  const { when, code, tag } = momentOf(step, telling)
  const pinned = telling.pinned
  const diff = pinned !== undefined && compare === "diff" ? lineDiff(pinned, telling.text) : undefined
  const all = diff ? diff.map((d) => `${d.op} ${d.line}`) : telling.text.split("\n")
  const long = all.length > LONG
  const body =
    pinned !== undefined && compare === "side" ? (
      <div className="grid grid-cols-2 divide-x">
        {[
          ["pinned", pinned],
          ["now", telling.text],
        ].map(([label, text]) => (
          <div key={label} className="min-w-0">
            <div className="text-muted-foreground px-3 pt-1 text-badge uppercase">{label}</div>
            <Lines lines={text!.split("\n")} wrap={wrap} />
          </div>
        ))}
      </div>
    ) : (
      <Lines lines={all} wrap={wrap} mark={diff && ((i) => (diff[i]!.op === "+" ? "bg-success/10 text-success" : diff[i]!.op === "-" ? "bg-destructive/10 text-destructive" : ""))} />
    )

  return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-body">
        <span className="min-w-0 truncate">
          <span className="font-medium">{when}</span>
          {code && <code className="bg-muted ml-1.5 rounded-sm px-1 py-px font-mono text-meta">{code}</code>}
        </span>
        {tag && <span className="text-muted-foreground shrink-0 rounded-sm border px-1 text-badge whitespace-nowrap">{tag}</span>}
        <span className="text-muted-foreground ml-auto shrink-0 text-meta tabular-nums whitespace-nowrap">
          {telling.lines} {telling.lines === 1 ? "line" : "lines"} · {telling.chars.toLocaleString("en")} chars · ~{telling.tokens.toLocaleString("en")} tok
        </span>
        <Delta delta={telling.delta} />
        <span className="text-muted-foreground w-20 shrink-0 text-right text-meta tabular-nums whitespace-nowrap" title="Tokens given so far in the scenario">
          Σ {total.toLocaleString("en")}
        </span>
      </div>
      <div className="bg-card relative min-w-0 overflow-hidden rounded-md border">
        <div className={long && !open ? FOLDED : ""}>{body}</div>
        {long && (
          <div className={`flex justify-center ${open ? "border-t" : "from-card via-card/90 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent pt-8"}`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              className="text-muted-foreground hover:text-foreground flex h-6 items-center gap-1 px-2 text-meta outline-none"
            >
              {open ? <ChevronDownIcon className="size-3" aria-hidden /> : <ChevronRightIcon className="size-3" aria-hidden />}
              {open ? "Fold" : `Show all ${all.length} lines`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const Gap = ({ children }: { children: ReactNode }) => (
  <div className="text-muted-foreground flex min-h-6 items-center gap-2 py-0.5 text-meta">
    <span className="bg-border h-px w-3 shrink-0" aria-hidden />
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

/** The person's page after the selected step: a strip of the open tabs, and the one in front drawn by its surface's own page, inert. */
function PagePreview({ step, before }: { step?: Step; before?: Step }) {
  const frame = useRef<HTMLDivElement | null>(null)
  const page = step?.page
  const tabs = page?.tabs ?? []
  const front = tabs.find((t) => t.at === page?.shown)
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
    <section className="bg-sidebar sticky top-0 z-10 flex flex-col gap-2 border-b px-3 pt-2 pb-3" aria-label="The page at this step">
      <h2 className="text-muted-foreground flex h-6 items-center gap-2 text-meta font-medium">
        The page at step {step?.n ?? "–"}
        <span className="rounded-sm border px-1 text-badge font-normal">snapshot</span>
        {page?.asleep && <span className="text-badge font-normal">the root is asleep: as it last was</span>}
      </h2>
      <div className="bg-background flex h-48 flex-col overflow-hidden rounded-md border shadow-xs">
        <div className="bg-muted/40 flex h-7 shrink-0 items-center gap-0.5 border-b px-1">
          <span className="text-muted-foreground px-1.5 text-meta">Home</span>
          {tabs.map((t) => {
            const view = (t.view ?? {}) as { title?: string; attention?: { who?: string } }
            const isNew = !earlier.some((e) => e.at === t.at)

            return (
              <span
                key={t.at}
                className={`flex h-5 items-center gap-1 rounded-sm px-1.5 text-meta [&_svg]:size-3 ${t.at === front?.at ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"} ${isNew ? "ring-primary/50 ring-1" : ""}`}
              >
                {PAGES[t.surface]?.icon}
                {view.title ?? t.surface}
                {view.attention && <span className={`size-1.5 rounded-full ${view.attention.who === "person" ? "bg-warning" : "bg-primary"}`} aria-label={`needs the ${view.attention.who}`} />}
              </span>
            )
          })}
        </div>
        <div ref={frame} inert className="min-h-0 flex-1 overflow-auto select-none [&_[data-changed]]:bg-primary/10 [&_[data-changed]]:ring-primary/30 [&_[data-changed]]:ring-1">
          {!step ? (
            <p className="text-muted-foreground p-3 text-body">Not played yet.</p>
          ) : !front ? (
            <p className="text-muted-foreground p-3 text-body">No tab is open: the page shows Home.</p>
          ) : (
            (PAGES[front.surface]?.draw(front.view) ?? <p className="text-muted-foreground p-3 text-body">No page for {front.surface}.</p>)
          )}
        </div>
      </div>
    </section>
  )
}

/** The demo project's shape, as /demo reads it from its surfaces: each surface's places, their facts and actions. */
function DemoShape({ demo }: { demo?: Demo }) {
  const [open, setOpen] = useState(true)
  const surfaces = Array.isArray(demo?.surfaces) ? demo.surfaces : []

  return (
    <section className="flex flex-col pb-3" aria-label="Demo project">
      <button type="button" onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground flex h-6 items-center gap-1 px-3 text-left text-meta font-medium outline-none">
        {open ? <ChevronDownIcon className="size-3" aria-hidden /> : <ChevronRightIcon className="size-3" aria-hidden />}
        Demo project
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3">
          <p className="text-muted-foreground text-body">{demo?.about.split(/(?<=\.) /)[0] ?? "Not played yet."}</p>
          {surfaces.map((s) => (
            <div key={s.name} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-body [&_svg]:size-3.5">
                {PAGES[s.name]?.icon}
                <span className="font-mono font-medium">{s.name}</span>
              </div>
              <p className="text-muted-foreground text-meta">{s.description}</p>
              <ul className="flex flex-col gap-1.5 border-l pl-2.5">
                {s.views.map((v) => (
                  <li key={v.path} className="flex flex-col gap-0.5">
                    <span className="font-mono text-meta">{v.path}</span>
                    <span className="text-muted-foreground text-meta">{v.facts.join(" · ")}</span>
                    {v.actions.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {v.actions.map((a) => (
                          <span
                            key={a.name}
                            title={`${a.description}${a.ask ? " — an ask: the person's alone" : ""}${a.notice ? " — a call gives a notice" : ""}`}
                            className={`flex h-5 items-center gap-1 rounded-sm border px-1.5 font-mono text-meta [&_svg]:size-2.5 ${a.ask ? "border-warning/40 bg-warning/10" : ""}`}
                          >
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
                {s.itself && <li className="text-muted-foreground text-meta">changes by itself: its command {s.itself.map((c) => <code key={c} className="font-mono">{c}</code>)}</li>}
              </ul>
            </div>
          ))}
          {surfaces.length > 0 && (
            <p className="text-muted-foreground flex items-center gap-2 text-badge [&_svg]:size-2.5">
              <UserIcon aria-hidden /> an ask, the person's alone <BellIcon aria-hidden /> a call gives a notice
            </p>
          )}
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
  const [wrap, setWrap] = useState(true)
  const [unfolded, setUnfolded] = useState(false)
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const [refused, setRefused] = useState("")
  const scenarios = view?.scenarios ?? []
  const [, name, picked] = /^\/scenarios\/([^/]+)(?:\/(\d+))?/.exec(route) ?? []
  const current = scenarios.find((s) => s.name === name) ?? scenarios[0]
  const { view: timeline } = useLive<Timeline>(current ? `/timeline/${current.name}` : "/")
  const steps = timeline?.name === current?.name && Array.isArray(timeline?.steps) ? timeline.steps : []
  const selected = steps.find((s) => String(s.n) === picked) ?? steps[0]
  const focused = useRef<HTMLLIElement | null>(null)
  const pinned = steps.some((s) => s.tellings.some((t) => t.pinned !== undefined))
  const act = async (handle?: Handle) => {
    if (!handle) return

    const answer = await callTab("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }
  const go = (n: number) => current && navigate(`/scenarios/${current.name}/${n}`)

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
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {current && (
          <header className="bg-background/95 sticky top-0 z-20 flex flex-col gap-1.5 border-b px-4 pt-3 pb-2 backdrop-blur">
            <div className="flex items-baseline gap-3">
              <h1 className="text-sm font-medium">{current.title}</h1>
              <span className="text-muted-foreground font-mono text-meta">{current.name}</span>
              <span className="text-muted-foreground ml-auto text-body tabular-nums whitespace-nowrap">
                {current.steps} steps · {current.lines ?? "–"} lines · ~{current.tokens?.toLocaleString("en") ?? "–"} tok given
              </span>
              <Delta delta={current.delta} />
            </div>
            {timeline?.about && <p className="text-muted-foreground max-w-[100ch] text-body">{timeline.about}</p>}
            {(current.error || view?.failure) && <p className="text-destructive text-body">{current.error ?? view?.failure}</p>}
            <div className="text-muted-foreground flex items-center gap-3 text-meta">
              {pinned && (
                <span className="flex items-center gap-0.5" role="group" aria-label="A changed text">
                  <span className="mr-1">Changed text</span>
                  {COMPARES.map(([id, label, hint]) => (
                    <button key={id} type="button" title={hint} aria-pressed={compare === id} onClick={() => setCompare(id)} className="hover:bg-muted aria-pressed:bg-accent aria-pressed:text-accent-foreground h-5 rounded-sm px-1.5 outline-none">
                      {label}
                    </button>
                  ))}
                </span>
              )}
              <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)} title="Wrap long lines at the block's edge, or keep them whole and scroll sideways" className="hover:bg-muted aria-pressed:bg-accent aria-pressed:text-accent-foreground h-5 rounded-sm px-1.5 outline-none">
                Wrap
              </button>
              <button
                type="button"
                onClick={() => {
                  setUnfolded(!unfolded)
                  setFolds({})
                }}
                className="hover:bg-muted h-5 rounded-sm px-1.5 outline-none"
              >
                {unfolded ? "Fold all" : "Unfold all"}
              </button>
              <span className="ml-auto">↑ ↓ or j k move the step</span>
            </div>
          </header>
        )}
        <ol className="flex flex-col px-2 pb-8">
          {steps.map((step, si) => {
            const here = step === selected

            return (
              <li
                key={step.n}
                ref={here ? focused : undefined}
                onClick={() => go(step.n)}
                aria-current={here ? "step" : undefined}
                className={`flex scroll-mt-32 scroll-mb-24 gap-2 rounded-md border-l-2 py-0.5 pr-2 ${here ? "border-primary bg-accent/40" : "hover:bg-muted/30 border-transparent"}`}
              >
                <span className={`w-6 shrink-0 pt-2 text-right text-meta tabular-nums ${here ? "text-primary font-medium" : "text-muted-foreground/70"}`}>{step.n}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  {step.timing && (
                    <Gap>
                      <span className="text-warning">timing-dependent:</span> {step.timing}
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
                          {telling.delta && telling.delta !== "same" && <span className="text-warning ml-2">{telling.delta}</span>}
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
                        compare={compare}
                        wrap={wrap}
                        open={folds[key] ?? unfolded}
                        toggle={() => setFolds({ ...folds, [key]: !(folds[key] ?? unfolded) })}
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
      <aside className="bg-sidebar flex w-[26rem] shrink-0 flex-col overflow-auto border-l" aria-label="Scenarios">
        <PagePreview step={selected} before={selected && steps[steps.indexOf(selected) - 1]} />
        <h2 className="text-muted-foreground flex h-6 items-center justify-between px-3 pt-2 text-meta font-medium">
          Scenarios
          <span>{view?.playing ? "playing…" : "~tokens"}</span>
        </h2>
        <ul className="pt-1 pb-3">
          {scenarios.map((s, i) => (
            <li key={s.name}>
              {s.group !== scenarios[i - 1]?.group && <div className="text-muted-foreground/70 px-3 pt-2 pb-0.5 text-badge uppercase">{s.group}</div>}
              <button
                type="button"
                onClick={() => navigate(`/scenarios/${s.name}`)}
                aria-current={s.name === current?.name}
                title={s.title}
                className="hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground flex h-7 w-full items-center gap-2 px-3 text-left text-body outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <Delta delta={s.delta === "same" ? undefined : s.delta === "new" ? "new" : s.delta && s.delta.split(";")[0]} />
                <span className={`text-meta tabular-nums ${s.error ? "text-destructive" : "text-muted-foreground"}`}>{s.error ? "failed" : (s.tokens?.toLocaleString("en") ?? "–")}</span>
              </button>
            </li>
          ))}
        </ul>
        <DemoShape demo={demo} />
        <h2 className="text-muted-foreground flex h-6 items-center px-3 text-meta font-medium">Pin</h2>
        <div className="flex flex-col gap-2 px-3 pb-4">
          <p className="text-muted-foreground text-body">
            {view?.pinned ? `Pinned ${view.pinned.replace("T", " ").replace("Z", " UTC")}; each text shows its difference from it.` : "Nothing pinned: pin to keep these tellings as the baseline."}
          </p>
          <div className="flex gap-2">
            {view?.pin && (
              <Button size="sm" onClick={() => void act(view.pin)}>
                <PinIcon aria-hidden /> {view.pinned ? "Pin again" : "Pin"}
              </Button>
            )}
            {view?.unpin && (
              <Button size="sm" variant="ghost" onClick={() => void act(view.unpin)}>
                Unpin
              </Button>
            )}
            {view?.play && (
              <Button size="sm" variant="ghost" onClick={() => void act(view.play)}>
                Play again
              </Button>
            )}
          </div>
          {(refused || error) && (
            <p role="alert" className="text-destructive text-body">
              {refused || error}
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
