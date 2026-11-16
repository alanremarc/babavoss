// The mark's sphere, to tune: the numbers that shape the eyes (gaze.ts) on sliders, kept in this browser, beside the mark
// as the shell draws it. Still, enlarged with the sphere's outline shown, at the strip's size, through each move, and
// following the pointer, so any pose can be held and looked at.
import { useEffect, useRef, useState, type ComponentType } from "react"
import { Logo } from "babavoss/shell/ui/mark.tsx"
import { between, eased, MOVES, next, outline, REST, settled, SIDES, SPHERE, within, type Gaze, type Sphere } from "babavoss/shell/ui/gaze.ts"
import { standingOf } from "babavoss/shell/ui/turn.ts"
import { WorkbenchSegments } from "babavoss/kit/index.ts"
import { State, States } from "./frame.tsx"

const KEY = "babavoss.guide.sphere.2"
/** The sphere's numbers and, with them, how far the moves turn the head: 1 as they are written. */
type Tuned = Sphere & { reach: number }
const START: Tuned = { ...SPHERE, reach: 1 }
const kept = (): Tuned => {
  try {
    return { ...START, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Tuned>) }
  } catch {
    return START
  }
}
/** How much of the sphere the camera sees, as the angle from its middle to its horizon, in degrees. */
const horizonOf = (s: Sphere): number => (Math.acos(1 / s.camera) * 180) / Math.PI

/** A move's gaze as far as the sphere reaches: a whole turn round stays whole. */
const reached = (gaze: Gaze, reach: number): Gaze => ({ ...gaze, yaw: Math.abs(gaze.yaw) > Math.PI ? gaze.yaw : gaze.yaw * reach, pitch: gaze.pitch * reach })

/** How far the head turns with the pointer at the pad's edge, in radians: round to the side, and up or down. */
const TURN = { yaw: 1.5, pitch: 1.1 }

/**
 * The eyes following the pointer: over the pad, where the pointer is from its middle is where the head looks, so any pose
 * can be held and looked at, with no move played. A click holds the pose, and another lets it go; off the pad the head rests.
 */
function Follow({ sphere }: { sphere: Tuned }) {
  const [gaze, setGaze] = useState<Gaze>(REST)
  const [held, setHeld] = useState(false)
  const look = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * 2 - 1
    const y = ((e.clientY - box.top) / box.height) * 2 - 1

    setGaze({ yaw: x * TURN.yaw, pitch: y * TURN.pitch, size: 1 })
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative grid cursor-crosshair place-items-center rounded-lg border bg-background p-8 select-none"
        onPointerMove={(e) => !held && look(e)}
        onPointerLeave={() => !held && setGaze(REST)}
        onClick={(e) => {
          if (held) look(e)
          setHeld(!held)
        }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/60" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/60" />
        <Eyes sphere={sphere} move="still" gaze={gaze} shown className="size-[200px]" />
        <span className="pointer-events-none absolute right-3 bottom-2 text-meta text-muted-foreground tabular-nums">
          yaw {gaze.yaw.toFixed(2)} · pitch {gaze.pitch.toFixed(2)}
          {held ? " · held: click to let go" : ""}
        </span>
      </div>
      <p className="text-meta text-muted-foreground">
        Follow the pointer: the head looks where the pointer is from the pad's middle. A click holds the pose.
      </p>
    </div>
  )
}

/** The two eyes on the sphere; `move` still, any, or one move's name, made again and again; `gaze` a pose to hold in place of a move; `shown` draws the sphere's outline. */
function Eyes({ sphere, move, gaze, shown, className }: { sphere: Tuned; move: string; gaze?: Gaze; shown?: boolean; className?: string }) {
  const paths = useRef<(SVGPathElement | null)[]>([])
  const now = useRef(sphere)

  now.current = sphere

  const place = (gaze: Gaze) => SIDES.forEach((side, i) => paths.current[i]?.setAttribute("d", outline(side, gaze, now.current)))

  useEffect(() => {
    let frame = 0
    let timer = 0
    let last: string | undefined
    let stopped = false
    let at: Gaze = REST

    place(REST)
    if (move === "still" || matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const turn = (to: Gaze, ms: number, then: () => void) => {
      const from = at
      const began = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - began) / ms)

        at = between(from, to, eased(k))
        place(at)
        if (k < 1) return void (frame = requestAnimationFrame(step))
        at = settled(at)
        then()
      }

      frame = requestAnimationFrame(step)
    }
    const go = () => {
      if (stopped) return

      const m = MOVES.find((x) => x.name === move) ?? next(last)
      const through = (i: number) => {
        if (stopped) return
        if (i === m.through.length) return void (timer = window.setTimeout(go, within(m.rest)))
        turn(reached(m.through[i]!, now.current.reach), within(m.turn), () => through(i + 1))
      }

      last = m.name
      through(0)
    }

    timer = window.setTimeout(go, 300)

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [move])
  // A slider moved while the eyes rest is seen at once, and so is a pose given.
  useEffect(() => {
    if (move === "still") place(gaze ?? REST)
  }, [sphere, move, gaze])

  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className} style={{ overflow: "visible" }}>
      {shown && <circle cx={50} cy={50} r={sphere.radius} className="fill-foreground/4 stroke-foreground/20" strokeWidth={0.5} />}
      <g className="fill-current">
        <path ref={(el) => void (paths.current[0] = el)} />
        <path ref={(el) => void (paths.current[1] = el)} />
      </g>
    </svg>
  )
}

const SLIDERS: { key: keyof Tuned; label: string; min: number; max: number; step: number; note: string }[] = [
  { key: "camera", label: "Camera distance", min: 1.05, max: 6, step: 0.01, note: "in the sphere's radii: nearer is a stronger perspective" },
  { key: "radius", label: "Sphere size", min: 20, max: 90, step: 0.5, note: "its outline, in the mark's box of 100" },
  { key: "eye", label: "Eye size", min: 0.05, max: 0.8, step: 0.005, note: "the angle from an eye's centre to its edge" },
  { key: "apart", label: "Eyes apart", min: 0, max: 0.9, step: 0.005, note: "the angle either side of the head's front" },
  { key: "turned", label: "Turned at rest", min: -0.9, max: 0.9, step: 0.005, note: "how far to the right the head rests" },
  { key: "reach", label: "Reach of the moves", min: 0.1, max: 2, step: 0.01, note: "how far the moves turn the head, 1 as they are written" },
]
const ZOOM = 10

function Tuner() {
  const [sphere, setSphere] = useState(kept)
  const [move, setMove] = useState("still")
  const set = (key: keyof Tuned, value: number) => {
    const to = { ...sphere, [key]: value }

    setSphere(to)
    try {
      localStorage.setItem(KEY, JSON.stringify(to))
    } catch {}
  }
  const working = standingOf({ agent: move === "still" ? "idle" : "working", waiting: 0 })
  const named = MOVES.find((m) => m.name === move)

  return (
    <div className="flex flex-col gap-3">
      <WorkbenchSegments label="Move" options={[{ id: "still", label: "still" }, { id: "any", label: "any" }, ...MOVES.map((m) => ({ id: m.name, label: m.name }))]} value={move} set={setMove} />
      <States min={220}>
        <State label={`as tuned, ×${ZOOM}, the sphere's outline shown`} className="justify-center p-6">
          <Eyes key={move} sphere={sphere} move={move} shown className="size-[200px]" />
        </State>
        <State label={`the mark as the shell draws it, ×${ZOOM}`} className="justify-center p-6">
          <span className="grid place-items-center" style={{ zoom: ZOOM }}>
            <Logo key={move} standing={working} {...(named && { move: named.name })} />
          </span>
        </State>
        <State label="at the strip's size: as tuned, then the shell's" className="justify-center gap-6">
          <span className="grid size-7 place-items-center rounded-full bg-sidebar">
            <Eyes key={move} sphere={sphere} move={move} className="size-5" />
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-sidebar">
            <Logo key={move} standing={working} {...(named && { move: named.name })} />
          </span>
        </State>
      </States>
      <Follow sphere={sphere} />
      <div className="grid gap-x-6 gap-y-2 rounded-lg border p-3 sm:grid-cols-2">
        {SLIDERS.map((s) => (
          <label key={s.key} className="flex flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-foreground">{s.label}</span>
              <span className="text-meta text-muted-foreground tabular-nums">{sphere[s.key].toFixed(s.step < 0.1 ? 3 : 1)}</span>
            </span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={sphere[s.key]} onChange={(e) => set(s.key, Number(e.target.value))} className="w-full accent-primary" />
            <span className="text-meta text-muted-foreground">{s.note}</span>
          </label>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
        <span>The camera sees {horizonOf(sphere).toFixed(0)}° of the sphere from its middle to its horizon.</span>
        <code className="font-mono select-all">{JSON.stringify(sphere)}</code>
        <button type="button" className="cursor-pointer underline underline-offset-2 hover:text-foreground" onClick={() => (setSphere(START), localStorage.removeItem(KEY))}>
          Reset
        </button>
      </p>
    </div>
  )
}

export const sphere: ComponentType = Tuner
