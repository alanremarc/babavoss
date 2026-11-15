// The mark's specimens: home's tab in each standing, at the strip's size and enlarged so its motion can be judged, side
// by side and live; its moves, one at a time or one after another as while the agent works; and variants of the eyes
// being tried, each in the standings that move, beside the brand's.
import { useState, type ComponentType } from "react"
import { HomeTab } from "babavoss/shell/ui/home.tsx"
import { Logo } from "babavoss/shell/ui/mark.tsx"
import { EYES, MOVES, type Eye } from "babavoss/shell/ui/gaze.ts"
import { standingOf, type Standing } from "babavoss/shell/ui/turn.ts"
import { WorkbenchSegments } from "babavoss/kit/index.ts"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"

/** Each standing of the mark, as the strip gives it to home's tab. */
const STANDINGS: { label: string; standing: Standing; animate?: false; lost?: string }[] = [
  { label: "still", standing: standingOf({ agent: "idle", waiting: 0 }) },
  { label: "working", standing: standingOf({ agent: "working", waiting: 0 }) },
  { label: "working, animation off", standing: standingOf({ agent: "working", waiting: 0 }), animate: false },
  { label: "waiting: 2 changes", standing: standingOf({ agent: "idle", waiting: 2 }) },
  { label: "lost: reconnecting", standing: standingOf(undefined), lost: "Reconnecting" },
]
/** How much bigger the enlarged mark is than the strip's. */
const LARGE = 5

/** Home's tab as the strip has it, on the strip's ground; `zoom` enlarges the whole of it, crisp, as it is drawn. */
const Tab = ({ standing, animate = true, lost, zoom = 1 }: { standing: Standing; animate?: boolean; lost?: string; zoom?: number }) => (
  <div className="grid place-items-center rounded-md bg-sidebar p-1" style={{ zoom }}>
    <HomeTab active={false} standing={standing} animate={animate} keys="⌘P" {...(lost && { lost })} onSelect={() => {}} />
  </div>
)

function States_() {
  return (
    <div className="flex flex-col gap-3">
      <States min={120}>
        {STANDINGS.map((s) => (
          <State key={s.label} label={s.label} className="justify-center">
            <Tab standing={s.standing} {...(s.animate === false && { animate: false })} {...(s.lost && { lost: s.lost })} />
          </State>
        ))}
      </States>
      <States min={180}>
        {STANDINGS.map((s) => (
          <State key={s.label} label={`${s.label}, ×${LARGE}`} className="justify-center p-4">
            <Tab standing={s.standing} zoom={LARGE} {...(s.animate === false && { animate: false })} {...(s.lost && { lost: s.lost })} />
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

/** Two eyes of one radius, the same distance either side of the mark's centre, `gap` apart at their edges. */
const twins = (r: number, gap: number): Eye[] => [
  { x: 50 - r - gap / 2, r },
  { x: 50 + r + gap / 2, r },
]

/**
 * Pairs of eyes being tried, the brand's first to compare with. Each is a constant: the mark moves the pair it is given
 * and takes a new array for a new pair. The brand's eyes are 18 and 12.7 in radius, 7 apart, 68.5 across. The lens pair
 * is two eyes of one size, as wide across as the brand's, under a lens over the sphere's middle: at rest they are equal,
 * and as the face turns the eye that comes to the middle grows and the one that goes to the edge shrinks.
 */
const VARIANTS: { label: string; about: string; pair: Eye[] }[] = [
  { label: "brand", about: "18 and 12.7, 7 apart", pair: EYES },
  { label: "lens", about: "15.4 each, 7 apart; the middle of the sphere enlarges", pair: twins(15.364, 7).map((eye) => ({ ...eye, lens: 2.2 })) },
]
/** The standings a variant is judged in: at rest, looking about, and with the runtime lost. */
const SHOWN: { label: string; standing: Standing; lost?: true }[] = [
  { label: "still", standing: standingOf({ agent: "idle", waiting: 0 }) },
  { label: "working", standing: standingOf({ agent: "working", waiting: 0 }) },
  { label: "lost", standing: standingOf(undefined), lost: true },
]

function Variants() {
  return (
    <div className="flex flex-col gap-3">
      {VARIANTS.map((v) => (
        <div key={v.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-foreground">{v.label}</span>
            <span className="text-meta text-muted-foreground tabular-nums">{v.about}</span>
          </div>
          <States min={190}>
            <State label="strip" className="justify-center gap-3">
              {SHOWN.map((s) => (
                <span key={s.label} title={s.label} className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar">
                  <Logo standing={s.standing} pair={v.pair} {...(s.lost && { lost: true })} />
                </span>
              ))}
            </State>
            {SHOWN.map((s) => (
              <State key={s.label} label={`${s.label}, ×${LARGE}`} className="justify-center p-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar" style={{ zoom: LARGE }}>
                  <Logo standing={s.standing} pair={v.pair} {...(s.lost && { lost: true })} />
                </span>
              </State>
            ))}
          </States>
        </div>
      ))}
    </div>
  )
}

export const mark: Record<EntryOf<"mark">, ComponentType> = { states: States_, moves: Moves, variants: Variants }
