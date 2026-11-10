// The composer's context knob: how full the session's context is at a glance, as a ring of its window with the app's
// part in the accent; opened, the skill text and cli answers, then conversation, tools, the harness's own and the rest;
// a chart of every call, and what the app put in, largest first. The parts are estimates.
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger, useLive } from "#babavoss/shell/ui/index.ts"

type AppPart = "skills" | "calls"
type Part = AppPart | "conversation" | "tools" | "harness" | "rest"
type Parts = Record<Part, number>
type Call = { n: number; at: number; tokens: number; cached?: number; parts: Parts; compacted?: true }
type Contributor = { part: AppPart; title: string; times: number; tokens: number }
type ContextView = { at: "/session/context"; tokens?: number; window?: number; parts: Parts; calls: Call[]; contributors: Contributor[] }

const muted = "text-muted-foreground"
const APP: AppPart[] = ["skills", "calls"]
/** Each part's name, what it is, and its fill: the app's in the accent, the rest in ink, quieter as they matter less. */
const PARTS: Record<Part, { label: string; about: string; fill: string; bg: string }> = {
  skills: { label: "Skills", about: "The app's skill text when opened", fill: "fill-primary/50", bg: "bg-primary/50" },
  calls: { label: "Cli calls", about: "The app's cli answers", fill: "fill-primary/30", bg: "bg-primary/30" },
  conversation: { label: "Conversation", about: "The person's messages and the agent's replies", fill: "fill-foreground/55", bg: "bg-foreground/55" },
  tools: { label: "Other tools", about: "Every other tool call and its result, other skills", fill: "fill-foreground/35", bg: "bg-foreground/35" },
  harness: {
    label: "Harness",
    about: "Its system prompt, tools and reminders: what the first call read beyond what came before it",
    fill: "fill-foreground/20",
    bg: "bg-foreground/20",
  },
  rest: {
    label: "Rest",
    about: "Thinking, the harness's later reminders, summaries, and what the estimate misses",
    fill: "fill-foreground/10",
    bg: "bg-foreground/10",
  },
}
const OTHERS: Part[] = ["conversation", "tools", "harness", "rest"]

const app = (p: Parts) => APP.reduce((n, k) => n + p[k], 0)
const k = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M` : n >= 1000 ? `${+(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : String(n)
const pct = (n: number, of: number) => {
  const p = of > 0 ? (n / of) * 100 : 0

  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`
}

/** A ring of the window: what is used in ink, the app's part of it in the accent from the top. */
function Ring({ used, app: own, window }: { used: number; app: number; window?: number }) {
  const r = 5.5
  const c = 2 * Math.PI * r
  const of = window ?? used
  const arc = (share: number) => `${Math.max(0, Math.min(1, share)) * c} ${c}`

  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0 -rotate-90">
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-foreground/12" />
      {of > 0 && <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" strokeDasharray={arc(used / of)} className="stroke-foreground/45" />}
      {of > 0 && own > 0 && <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" strokeDasharray={arc(own / of)} className="stroke-primary" />}
    </svg>
  )
}

/** The parts of what was read, side by side, the app's first, a hairline of the surface between them. */
function Composition({ parts, tokens }: { parts: Parts; tokens: number }) {
  return (
    <div aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
      {[...APP, ...OTHERS]
        .filter((p) => parts[p] > 0)
        .map((p) => (
          <span key={p} className={`h-full min-w-0.5 ${PARTS[p].bg}`} style={{ flexGrow: parts[p] / tokens, flexBasis: 0 }} />
        ))}
    </div>
  )
}

/** A part's line: its swatch, its name, its tokens and share of what was read. */
function Line({ part, tokens, of, strong }: { part: Part | "app"; tokens: number; of: number; strong?: boolean }) {
  const about = part === "app" ? "Everything the app put into the context" : PARTS[part].about

  return (
    <div title={about} className={`grid grid-cols-[0.5rem_minmax(0,1fr)_3rem_2.5rem] items-center gap-x-2 ${strong ? "font-medium" : ""}`}>
      <span aria-hidden className={`size-2 rounded-sm ${part === "app" ? "bg-primary" : PARTS[part].bg}`} />
      <span className="truncate">{part === "app" ? "App" : PARTS[part].label}</span>
      <span className={`text-right tabular-nums ${tokens ? "" : muted}`}>{tokens ? k(tokens) : "–"}</span>
      <span className={`text-right tabular-nums ${muted}`}>{tokens ? pct(tokens, of) : ""}</span>
    </div>
  )
}

/** Every call as a column of `order`'s parts, on a scale of its own; `at` the call under the pointer, a faint band behind it. */
function Columns({ calls, order, label, at, point }: { calls: Call[]; order: Part[]; label: string; at?: number; point: (i?: number) => void }) {
  const sum = (c: Call) => order.reduce((n, p) => n + c.parts[p], 0)
  const top = Math.max(1, ...calls.map(sum))
  const w = 280
  const h = 56
  const step = w / calls.length
  const bar = Math.max(1, Math.min(12, step - (step > 3 ? 1 : 0)))

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-baseline justify-between text-meta ${muted}`}>
        <span>{label}</span>
        <span className="tabular-nums">{k(top)}</span>
      </div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full" onMouseLeave={() => point(undefined)}>
        <line x1="0" x2={w} y1={h - 0.5} y2={h - 0.5} className="stroke-foreground/15" strokeWidth="1" />
        {calls.map((c, i) => {
          let y = h
          const x = i * step + (step - bar) / 2

          return (
            <g key={c.n} onMouseEnter={() => point(i)}>
              <rect x={i * step} y="0" width={step} height={h} fill="transparent" />
              {at === i && <rect x={x - 2} y="0" width={bar + 4} height={h} rx="1" className="fill-foreground/8" />}
              {order.map((p) => {
                const height = (c.parts[p] / top) * h

                y -= height

                return height > 0 && <rect key={p} x={x} y={y} width={bar} height={height} className={PARTS[p].fill} />
              })}
              {c.compacted && <line x1={x} x2={x + bar} y1="0.5" y2="0.5" className="stroke-foreground" strokeWidth="1" />}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Every call twice over: all it read, the app's part at the base; and the app's part alone, on its own scale, so it
 * can be seen however small its share. */
function Calls({ calls, at, point }: { calls: Call[]; at?: number; point: (i?: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Columns calls={calls} order={[...APP, "harness", "conversation", "tools", "rest"]} label="What each call read" at={at} point={point} />
      <Columns calls={calls} order={APP} label="Of it the app's" at={at} point={point} />
    </div>
  )
}

const BY: Record<AppPart, string> = { skills: "skill", calls: "cli" }

/** The context of the session in view, as a knob for the composer: a ring and a figure, a popover of what it holds. */
export function ContextKnob() {
  const { view } = useLive<ContextView>("/session/context")
  const [at, point] = useState<number>()

  if (!view || view.at !== "/session/context") return null

  // The call under the pointer, else the last: the parts below are its, in rows that keep their place.
  const pointed = at === undefined ? undefined : view.calls[at]
  const parts = pointed?.parts ?? view.parts
  const read = pointed?.tokens ?? view.tokens ?? 0

  const used = view.tokens ?? 0
  const own = app(view.parts)
  const figure = view.tokens === undefined ? "–" : view.window ? pct(used, view.window) : k(used)
  const title =
    view.tokens === undefined
      ? "Context: nothing read yet"
      : `Context: ${k(used)}${view.window ? ` of ${k(view.window)}` : ""}, the app's part ${k(own)} (${pct(own, used)})`

  return (
    <Popover onOpenChange={() => point(undefined)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          title={title}
          className="flex h-row shrink-0 items-center gap-1 rounded-md px-1.5 tabular-nums outline-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground/6"
        >
          <Ring used={used} app={own} window={view.window} />
          <span>{figure}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-96 max-w-[calc(100vw-2rem)] gap-3 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Context</span>
          <span className={`truncate tabular-nums ${muted}`}>
            {view.tokens === undefined
              ? "nothing read yet"
              : pointed
                ? `call ${pointed.n}${pointed.compacted ? ", compacted" : ""} · ${k(read)}${pointed.cached !== undefined ? ` · ${pct(pointed.cached, read)} cached` : ""}`
                : `${k(used)}${view.window ? ` of ${k(view.window)} · ${pct(used, view.window)}` : ""}`}
          </span>
        </div>
        {view.tokens === undefined ? (
          <p className={muted}>What the context holds shows once the agent has made its first call.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Composition parts={parts} tokens={read} />
              <div className="flex flex-col gap-1">
                <Line part="app" tokens={app(parts)} of={read} strong />
                <div className="ml-1 flex flex-col gap-1 border-l border-primary/30 pl-2">
                  {APP.map((p) => (
                    <Line key={p} part={p} tokens={parts[p]} of={read} />
                  ))}
                </div>
                {OTHERS.map((p) => (
                  <Line key={p} part={p} tokens={parts[p]} of={read} />
                ))}
              </div>
            </div>
            {view.calls.length > 1 && <Calls calls={view.calls} at={at} point={point} />}
            {view.contributors.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className={`text-meta ${muted}`}>What the app put in</span>
                {view.contributors.slice(0, 6).map((c) => (
                  <div key={`${c.part} ${c.title}`} className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-baseline gap-x-2">
                    <span className="truncate">
                      <span className="font-mono">{c.title}</span> {c.title !== BY[c.part] && <span className={muted}>{BY[c.part]}</span>}
                    </span>
                    <span className={`tabular-nums ${muted}`}>{c.times > 1 ? `×${c.times}` : ""}</span>
                    <span className="text-right tabular-nums">{k(c.tokens)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <p className={`text-meta ${muted}`}>Totals measured; parts estimated, about four characters a token.</p>
      </PopoverContent>
    </Popover>
  )
}
