// The babavoss mark, the two eyes of the brand, as the strip's first tab, home; and the agent's standing in it: at rest,
// looking about like a face that thinks while the agent works, a tint instead where motion is reduced or the person turned
// the mark's animation off in the settings; the person's changes that wait are said on hover, and counted in the activity. The eyes sit on an invisible sphere, gaze.ts; here they are moved, a frame at a time and
// only while they turn.
import { useEffect, useRef } from "react"
import { cn } from "../../kit/cn.ts"
import { between, drawn, eased, EYES, MOVES, next, ORBIT_MS, orbiting, REST, within, type Drawn, type Gaze } from "./gaze.ts"
import type { Standing } from "./turn.ts"

const put = (el: SVGEllipseElement | null | undefined, { cx, cy, rx, ry, turn }: Drawn) => {
  if (!el) return
  el.setAttribute("cx", cx.toFixed(2))
  el.setAttribute("cy", cy.toFixed(2))
  el.setAttribute("rx", rx.toFixed(2))
  el.setAttribute("ry", ry.toFixed(2))
  el.setAttribute("transform", `rotate(${turn.toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})`)
}
const place = (eyes: (SVGEllipseElement | null)[], gaze: Gaze) => eyes.forEach((el, i) => put(el, drawn(EYES[i]!, gaze)))
const round = (eyes: (SVGEllipseElement | null)[], into: number, angle: number) => orbiting(into, angle).forEach((d, i) => put(eyes[i], d))

/**
 * Moves the eyes. While `looking`: one move after another in no fixed order, each an eased turn and then a rest; frames
 * are asked for only during a turn, a rest is a timer, and a page not shown waits. Stopping eases the eyes back to rest.
 * While `lost`, whatever else: the larger eye comes to the centre and the smaller goes round it, until the page has its
 * runtime again, when it finishes its round and both return to where they rest. `only` names the one move to make, again
 * and again, in place of one after another: a move looked at on its own.
 */
function useGaze(eyes: { current: (SVGEllipseElement | null)[] }, looking: boolean, lost: boolean, only?: string) {
  const at = useRef<Gaze>(REST)
  const orbit = useRef({ into: 0, angle: 0 })

  useEffect(() => {
    if (typeof window === "undefined") return

    // Where motion is reduced the eyes are put where they belong, with no turn.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      orbit.current = { into: lost ? 1 : 0, angle: 0 }
      at.current = REST

      return void round(eyes.current, orbit.current.into, 0)
    }

    let frame = 0
    let timer = 0
    let last: string | undefined
    let stopped = false
    const turn = (to: Gaze, ms: number, then: () => void) => {
      const from = at.current
      const began = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / ms)

        at.current = between(from, to, eased(t))
        place(eyes.current, at.current)
        if (t < 1) frame = requestAnimationFrame(step)
        else then()
      }

      frame = requestAnimationFrame(step)
    }
    const move = () => {
      if (stopped) return
      // A page nobody looks at does not animate: look again once it is shown.
      if (document.hidden) return void (timer = window.setTimeout(move, 1500))

      const { name, through, turn: turns, rest } = MOVES.find((m) => m.name === only) ?? next(last)
      const go = (i: number) => {
        if (stopped) return
        if (i === through.length) return void (timer = window.setTimeout(move, within(rest)))

        turn(through[i]!, within(turns), () => go(i + 1))
      }

      last = name
      go(0)
    }
    const look = () => {
      if (looking) timer = window.setTimeout(move, 300)
      // Wherever a turn was cut, the eyes settle from there: nothing jumps.
      else if (at.current !== REST) turn(REST, 900, () => (at.current = REST))
    }
    // Into the orbit from wherever the eyes are, then round and round.
    const circle = () => {
      const from = orbit.current.into
      const began = performance.now()
      let before = began
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / 500)

        orbit.current.into = from + (1 - from) * eased(t)
        if (!document.hidden) orbit.current.angle += ((now - before) / ORBIT_MS) * 2 * Math.PI * orbit.current.into
        before = now
        round(eyes.current, orbit.current.into, orbit.current.angle)
        frame = requestAnimationFrame(step)
      }

      frame = requestAnimationFrame(step)
    }
    // Out of it: the smaller eye finishes its round as both go back to where they rest.
    const land = (then: () => void) => {
      const { into, angle } = orbit.current
      const end = Math.ceil(angle / (2 * Math.PI)) * 2 * Math.PI
      const began = performance.now()
      const step = (now: number) => {
        const t = eased(Math.min(1, (now - began) / 700))

        orbit.current = { into: into * (1 - t), angle: angle + (end - angle) * t }
        round(eyes.current, orbit.current.into, orbit.current.angle)
        if (t < 1) return void (frame = requestAnimationFrame(step))
        orbit.current = { into: 0, angle: 0 }
        then()
      }

      frame = requestAnimationFrame(step)
    }

    if (lost) {
      // A gaze is left where it is: the orbit starts from rest, which a cut turn is brought to first.
      if (at.current !== REST) turn(REST, 250, () => ((at.current = REST), circle()))
      else circle()
    } else if (orbit.current.into > 0) land(look)
    else look()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [eyes, looking, lost, only])
}

/**
 * The eyes alone, in the current colour; `looking` has them look about, or make the one `move` named again and again; `lost`
 * reddens the larger and sends the smaller round it.
 */
export function Eyes({ looking = false, lost = false, move, className }: { looking?: boolean; lost?: boolean; move?: string; className?: string }) {
  const eyes = useRef<(SVGEllipseElement | null)[]>([])

  useGaze(eyes, looking, lost, move)

  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("overflow-visible", className)}>
      <g className="fill-current">
        {EYES.map((eye, i) => {
          const { cx, cy, rx, ry } = drawn(eye, REST)

          return (
            <ellipse
              key={i}
              ref={(el) => void (eyes.current[i] = el)}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              className={cn("transition-[fill] duration-300 motion-reduce:transition-none", i === 0 && lost && "fill-destructive")}
            />
          )
        })}
      </g>
    </svg>
  )
}

/** The mark with the agent's standing on it; `animate` false keeps it still, the work shown by its tint alone; `move` as the eyes'. */
export function Logo({ standing, animate = true, lost = false, move }: { standing: Standing; animate?: boolean; lost?: boolean; move?: string }) {
  // A page that lost its runtime knows nothing of the turn: the mark says the loss, and nothing else, until it is back.
  const working = standing.state === "working" && !lost

  return (
    <span data-turn={lost ? "lost" : standing.state} data-animate={animate || undefined} className="relative grid size-[22px] place-items-center">
      <Eyes looking={working && animate} lost={lost} move={move} className={cn("size-5", working && (animate ? "motion-reduce:text-primary" : "text-primary"))} />
    </span>
  )
}
