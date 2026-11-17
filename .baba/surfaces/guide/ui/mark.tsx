// The mark's specimens: home's tab in each standing, and with its dot, the highlight that the session's hooks are not heard, at the
// rail's size and enlarged so its motion can be judged, side by side and live; and its moves, one at a time or one after
// another as while the agent works.
import { useState, type ComponentType } from "react"
import { RailEntry } from "../../../../framework/shell/ui/rail.tsx"
import { markOf } from "../../../../framework/shell/ui/rail.ts"
import { unheardLine } from "../../../../framework/shell/ui/thread.ts"
import type { Unheard } from "../../../../framework/shell/ui/client.ts"
import { Logo } from "../../../../framework/shell/ui/mark.tsx"
import { MOVES } from "../../../../framework/shell/ui/gaze.ts"
import { standingOf, type Standing } from "../../../../framework/shell/ui/turn.ts"
import { WorkbenchSegments } from "babavoss/kit/index.ts"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"
import { sphere } from "./sphere.tsx"

/** Each standing of the mark, as the rail gives it to home's tab. */
const STANDINGS: { label: string; standing: Standing; animate?: false; lost?: string; unheard?: Unheard }[] = [
  { label: "still", standing: standingOf({ agent: "idle", waiting: 0 }) },
  { label: "working", standing: standingOf({ agent: "working", waiting: 0 }) },
  { label: "working, animation off", standing: standingOf({ agent: "working", waiting: 0 }), animate: false },
  { label: "waiting: 2 changes", standing: standingOf({ agent: "idle", waiting: 2 }) },
  { label: "lost: reconnecting", standing: standingOf(undefined), lost: "Reconnecting" },
  { label: "hooks not heard: its highlight's dot", standing: standingOf({ agent: "idle", waiting: 0 }), unheard: { ever: true, since: 0 } },
]
/** How much bigger the enlarged mark is than the strip's. */
const LARGE = 5

/** Home's tab as a rail along the top has it, on the rail's ground; `zoom` enlarges the whole of it, crisp, as it is drawn. */
type Shown = { standing: Standing; animate?: boolean; lost?: string; unheard?: Unheard; zoom?: number }

function Tab({ standing, animate = true, lost, unheard, zoom = 1 }: Shown) {
  const mark = markOf({ highlights: unheard ? [unheardLine(unheard)] : [] })

  return (
    <div className="grid place-items-center rounded-md bg-sidebar p-1" style={{ zoom }}>
      <RailEntry
        item={{
          id: "home",
          label: "Home",
          icon: <Logo standing={standing} animate={animate} lost={!!lost} />,
          ...(mark && { mark }),
          why: [lost ?? standing.said, ...(unheard ? [unheardLine(unheard)] : [])],
        }}
        home
        column={false}
        side="top"
        active={false}
        open={false}
        select={() => {}}
        toggle={() => {}}
      />
    </div>
  )
}

function States_() {
  return (
    <div className="flex flex-col gap-3">
      <States min={120}>
        {STANDINGS.map((s) => (
          <State key={s.label} label={s.label} className="justify-center">
            <Tab {...s} />
          </State>
        ))}
      </States>
      <States min={180}>
        {STANDINGS.map((s) => (
          <State key={s.label} label={`${s.label}, ×${LARGE}`} className="justify-center p-4">
            <Tab {...s} zoom={LARGE} />
          </State>
        ))}
      </States>
    </div>
  )
}

function Moves() {
  const [move, setMove] = useState("any")
  const working = standingOf({ agent: "working", waiting: 0 })
  const shown = MOVES.find((m) => m.name === move)
  const only = shown ? { move: shown.name } : {}

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <WorkbenchSegments label="Move" options={[{ id: "any", label: "any" }, ...MOVES.map((m) => ({ id: m.name, label: m.name }))]} value={move} set={setMove} />
        <span className="text-meta text-muted-foreground tabular-nums">
          {shown
            ? `${shown.through.length} pose${shown.through.length > 1 ? "s" : ""} · turn ${shown.turn.join("–")}ms · rest ${shown.rest.join("–")}ms`
            : "one move after another, never the same twice, as while the agent works"}
        </span>
      </div>
      <States min={180}>
        <State label="strip" className="justify-center">
          <span className="grid size-7 place-items-center rounded-full bg-sidebar">
            <Logo key={move} standing={working} {...only} />
          </span>
        </State>
        <State label={`×${LARGE * 2}`} wide className="justify-center p-6">
          <span className="grid place-items-center" style={{ zoom: LARGE * 2 }}>
            <Logo key={move} standing={working} {...only} />
          </span>
        </State>
      </States>
    </div>
  )
}

export const mark: Record<EntryOf<"mark">, ComponentType> = { states: States_, moves: Moves, sphere }
