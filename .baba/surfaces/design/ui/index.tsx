// The design document's page: the selected scenario from above, in three lanes in time order, the person, the demo
// project and what the agent is given, one row per step, each text verbatim with its size and its difference from the pin;
// and at the right the scenarios as one-liners, the demo's surfaces and the pin. The scenario and step are the tab's
// route, /scenarios/NAME/N, so a refresh and the agent's pointing land on them. How a changed text is compared with the
// pinned one is the page's own: View, in the frame's menus.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { BookOpenTextIcon, PinIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, useMenus } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"
import { lineDiff } from "../src/measure.ts"

type Row = { at: string; name: string; title: string; steps: number; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string }
type Root = { scenarios: Row[]; playing?: true; failure?: string; pinned?: string; play?: Handle; pin?: Handle; unpin?: Handle }
type Demo = { surfaces: { name: string; about: string }[] }
type Telling = { carrier: string; lines: number; chars: number; tokens: number; delta?: string; text: string; pinned?: string }
type Step = { n: number; who: string; did: string; changed: string[] | string; tellings: Telling[] }
type Lanes = { name: string; title: string; about: string; lines?: number; chars?: number; tokens?: number; delta?: string; error?: string; steps: Step[] }
type Compare = "text" | "diff" | "side"

export const icon = <BookOpenTextIcon aria-hidden />

const Delta = ({ delta }: { delta?: string }) =>
  delta === undefined ? null : (
    <span className={`text-meta tabular-nums ${delta === "same" ? "text-muted-foreground/70" : "text-warning"}`}>{delta === "same" ? "= pin" : delta}</span>
  )

const Pre = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <pre className={`overflow-x-auto px-3 py-2 font-mono text-meta leading-relaxed whitespace-pre ${className}`}>{children}</pre>
)

/** One text the agent is given: its header line, then the text as it is, or against the pinned one. */
function Given({ telling, compare }: { telling: Telling; compare: Compare }) {
  const empty = !telling.text
  const header = (
    <div className="text-muted-foreground flex h-6 items-center gap-2 border-b px-3 text-meta">
      <span className="text-foreground min-w-0 truncate font-medium">{telling.carrier}</span>
      {!empty && (
        <span className="tabular-nums">
          {telling.lines} lines · {telling.chars} chars · ~{telling.tokens} tok
        </span>
      )}
      <span className="ml-auto">
        <Delta delta={telling.delta} />
      </span>
    </div>
  )

  if (empty)
    return (
      <div className="text-muted-foreground/70 flex h-6 items-center gap-2 rounded-md border border-dashed px-3 text-meta">
        <span className="min-w-0 truncate">{telling.carrier}</span>
        <span>· nothing</span>
        <span className="ml-auto">
          <Delta delta={telling.delta} />
        </span>
      </div>
    )

  const pinned = telling.pinned

  return (
    <div className="bg-card min-w-0 overflow-hidden rounded-md border">
      {header}
      {pinned === undefined || compare === "text" ? (
        <Pre>{telling.text}</Pre>
      ) : compare === "diff" ? (
        <Pre>
          {lineDiff(pinned, telling.text).map((d, i) => (
            <div key={i} className={d.op === "+" ? "bg-success/10 text-success" : d.op === "-" ? "bg-destructive/10 text-destructive" : ""}>
              {d.op} {d.line}
            </div>
          ))}
        </Pre>
      ) : (
        <div className="grid grid-cols-2 divide-x">
          <div className="min-w-0">
            <div className="text-muted-foreground px-3 pt-1 text-badge uppercase">pinned</div>
            <Pre>{pinned}</Pre>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground px-3 pt-1 text-badge uppercase">now</div>
            <Pre>{telling.text}</Pre>
          </div>
        </div>
      )}
    </div>
  )
}

const WHO: Record<string, string> = { harness: "harness", agent: "agent", surface: "surface", root: "root" }

export default function Design() {
  const { view, error } = useLive<Root>("/")
  const { view: demo } = useLive<Demo>("/demo")
  const { call, route, navigate } = useTab()
  const [compare, setCompare] = useState<Compare>("diff")
  const [refused, setRefused] = useState("")
  const scenarios = view?.scenarios ?? []
  const [, name, picked] = /^\/scenarios\/([^/]+)(?:\/(\d+))?$/.exec(route) ?? []
  const current = scenarios.find((s) => s.name === name) ?? scenarios[0]
  const { view: lanes } = useLive<Lanes>(current ? `/lanes/${current.name}` : "/")
  const focused = useRef<HTMLDivElement | null>(null)
  const act = async (handle?: Handle) => {
    if (!handle) return

    const answer = await call("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  useMenus([
    {
      id: "view",
      label: "View",
      items: [{ kind: "choice", id: "compare", label: "Changed text", value: compare, options: [{ id: "text", label: "Now only" }, { id: "diff", label: "Line diff against the pin" }, { id: "side", label: "Pinned and now side by side" }], set: (v) => setCompare(v as Compare) }],
    },
  ])
  useEffect(() => focused.current?.scrollIntoView({ block: "nearest" }), [picked, lanes?.name])

  const steps = lanes?.name === current?.name && Array.isArray(lanes?.steps) ? lanes.steps : []

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {current && (
          <header className="bg-background/95 sticky top-0 z-10 flex flex-col gap-1 border-b px-4 py-3 backdrop-blur">
            <div className="flex items-baseline gap-3">
              <h1 className="text-sm font-medium">{current.title}</h1>
              <span className="text-muted-foreground font-mono text-meta">{current.name}</span>
              <span className="text-muted-foreground ml-auto text-body tabular-nums">
                {current.steps} steps · {current.lines ?? "–"} lines · {current.chars ?? "–"} chars · ~{current.tokens ?? "–"} tok
              </span>
              <Delta delta={current.delta} />
            </div>
            {lanes?.about && <p className="text-muted-foreground max-w-[80ch] text-body">{lanes.about}</p>}
            {(current.error || view?.failure) && <p className="text-destructive text-body">{current.error ?? view?.failure}</p>}
          </header>
        )}
        <div className="grid grid-cols-[minmax(9rem,13rem)_minmax(14rem,22rem)_minmax(0,1fr)] text-body">
          <div className="text-muted-foreground bg-muted/30 contents text-badge font-medium tracking-wide uppercase">
            <div className="bg-muted/30 border-b px-3 py-1.5">Person</div>
            <div className="bg-muted/30 border-b border-l px-3 py-1.5">Demo project</div>
            <div className="bg-muted/30 border-b border-l px-3 py-1.5">The agent is given</div>
          </div>
          {steps.map((step) => {
            const here = String(step.n) === picked
            const person = step.who === "person"
            const changed = Array.isArray(step.changed) ? step.changed : []

            return (
              <Fragment key={step.n}>
                <div
                  ref={here ? focused : undefined}
                  onClick={() => navigate(`/scenarios/${current!.name}/${step.n}`)}
                  className={`flex cursor-default gap-2 border-b px-3 py-2 ${here ? "bg-accent text-accent-foreground" : ""}`}
                >
                  <span className="text-muted-foreground/70 w-4 shrink-0 text-right text-meta tabular-nums">{step.n}</span>
                  {person && <span className="min-w-0">{step.did}</span>}
                </div>
                <div className={`flex min-w-0 flex-col gap-1 border-b border-l px-3 py-2 ${here ? "bg-accent/50" : ""}`}>
                  {!person && (
                    <div className="flex min-w-0 gap-2">
                      <span className="text-muted-foreground shrink-0 text-meta">{WHO[step.who] ?? step.who}</span>
                      <span className={`min-w-0 break-words ${step.who === "agent" ? "font-mono text-meta" : ""}`}>{step.did}</span>
                    </div>
                  )}
                  {changed.length > 0 && (
                    <ul className="text-muted-foreground flex flex-col font-mono text-badge leading-snug">
                      {changed.map((line, i) => (
                        <li key={i} className="break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={`flex min-w-0 flex-col gap-2 border-b border-l px-3 py-2 ${here ? "bg-accent/50" : ""}`}>
                  {step.tellings.map((telling, i) => (
                    <Given key={i} telling={telling} compare={compare} />
                  ))}
                </div>
              </Fragment>
            )
          })}
        </div>
        {!steps.length && <p className="text-muted-foreground p-6 text-body">{view?.playing ? "Playing the scenarios…" : "Not played yet."}</p>}
      </main>
      <aside className="bg-muted/30 flex w-80 shrink-0 flex-col overflow-auto border-l py-2" aria-label="Scenarios">
        <h2 className="text-muted-foreground flex h-6 items-center justify-between px-3 text-meta font-medium">
          Scenarios
          <span>{view?.playing ? "playing…" : "~tokens"}</span>
        </h2>
        <ul className="pb-2">
          {scenarios.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => navigate(`/scenarios/${s.name}`)}
                aria-current={s.name === current?.name}
                title={s.title}
                className="hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground flex h-7 w-full items-center gap-2 px-3 text-left text-body outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <Delta delta={s.delta === "same" ? undefined : s.delta && s.delta.split(";")[0]} />
                <span className={`text-meta tabular-nums ${s.error ? "text-destructive" : "text-muted-foreground"}`}>{s.error ? "failed" : (s.tokens ?? "–")}</span>
              </button>
            </li>
          ))}
        </ul>
        <h2 className="text-muted-foreground flex h-6 items-center px-3 text-meta font-medium">Demo project</h2>
        <ul className="pb-3">
          {demo?.surfaces.map((s) => (
            <li key={s.name} className="flex gap-2 px-3 py-1 text-body" title={s.about}>
              <span className="font-mono text-meta">{s.name}</span>
              <span className="text-muted-foreground min-w-0 truncate">{s.about}</span>
            </li>
          ))}
        </ul>
        <h2 className="text-muted-foreground flex h-6 items-center px-3 text-meta font-medium">Pin</h2>
        <div className="flex flex-col gap-2 px-3">
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
