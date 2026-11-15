// The mark's specimens: home's tab in each standing, at the strip's size and enlarged so its motion can be judged, side
// by side and live; its moves, one at a time or one after another as while the agent works; and variants of the eyes
// being tried, each in the standings that move, beside the brand's.
import { useState, type ComponentType, type ReactNode } from "react"
import { HomeTab } from "babavoss/shell/ui/home.tsx"
import { Logo } from "babavoss/shell/ui/mark.tsx"
import { EYES, LOSTS, MOVES, type Eye, type Lost } from "babavoss/shell/ui/gaze.ts"
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

/**
 * The lens pair: two eyes of one size, 18, the same angle either side of the sphere's front, under a lens over its
 * middle; the face rests turned a quarter of a radian to the right, so the left eye, at the middle, is whole and round,
 * and the right, towards the edge, is smaller and narrower: nearly the brand's two circles, but made by a look. `dx`
 * centres the turned face in the mark's box.
 */
const HALF = 0.28
const LENS: Eye[] = [-1, 1].map((side) => ({ x: 50 + 70 * Math.sin(side * HALF), r: 18, lens: 2.2, yaw: 0.25, dx: -13.1 }))

/** Pairs of eyes being tried, the brand's first to compare with. Each is a constant: the mark takes a new array for a new pair. */
const VARIANTS: { label: string; about: string; pair: Eye[]; losts: readonly Lost[] }[] = [
  { label: "brand", about: "two circles, 18 and 12.7, 7 apart", pair: EYES, losts: ["orbit"] },
  { label: "lens", about: "two eyes of 18 on the sphere, at rest looking right; the lens makes the nearer one larger", pair: LENS, losts: LOSTS.filter((l) => l !== "orbit") },
]
const STILL = standingOf({ agent: "idle", waiting: 0 })
const WORKING = standingOf({ agent: "working", waiting: 0 })
const LOST = standingOf(undefined)

/** The mark on the strip's ground, at the strip's size or enlarged; the ground keeps its shape however narrow its place. */
const Ground = ({ zoom = 1, title, children }: { zoom?: number; title?: string; children: ReactNode }) => (
  <span title={title} className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar" style={{ zoom }}>
    {children}
  </span>
)

function Variants() {
  return (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((v) => (
        <div key={v.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-foreground">{v.label}</span>
            <span className="text-meta text-muted-foreground">{v.about}</span>
          </div>
          <States min={190}>
            <State label="strip" className="justify-center gap-3">
              <Ground title="still">
                <Logo standing={STILL} pair={v.pair} />
              </Ground>
              <Ground title="working">
                <Logo standing={WORKING} pair={v.pair} />
              </Ground>
              {v.losts.map((lostAs) => (
                <Ground key={lostAs} title={`lost: ${lostAs}`}>
                  <Logo standing={LOST} pair={v.pair} lost lostAs={lostAs} />
                </Ground>
              ))}
            </State>
            <State label={`still, ×${LARGE}`} className="justify-center p-4">
              <Ground zoom={LARGE}>
                <Logo standing={STILL} pair={v.pair} />
              </Ground>
            </State>
            <State label={`working, ×${LARGE}`} className="justify-center p-4">
              <Ground zoom={LARGE}>
                <Logo standing={WORKING} pair={v.pair} />
              </Ground>
            </State>
            {v.losts.map((lostAs) => (
              <State key={lostAs} label={`lost: ${lostAs}, ×${LARGE}`} className="justify-center p-4">
                <Ground zoom={LARGE}>
                  <Logo standing={LOST} pair={v.pair} lost lostAs={lostAs} />
                </Ground>
              </State>
            ))}
          </States>
        </div>
      ))}
    </div>
  )
}

export const mark: Record<EntryOf<"mark">, ComponentType> = { states: States_, moves: Moves, variants: Variants }
