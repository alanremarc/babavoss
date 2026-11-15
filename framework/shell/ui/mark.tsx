// The babavoss mark, the two eyes of the brand, as the strip's first tab, home; and the agent's standing in it: at rest,
// looking about like a face that thinks while the agent works, a tint where motion is reduced, and a count of the
// person's changes waiting. The eyes sit on an invisible sphere, gaze.ts; here they are moved, a frame at a time and
// only while they turn.
import { useEffect, useRef } from "react"
import { cn } from "cn"
import { between, drawn, eased, EYES, next, REST, within, type Gaze } from "./gaze.ts"
import type { Standing } from "./turn.ts"

const place = (eyes: (SVGEllipseElement | null)[], gaze: Gaze) =>
  eyes.forEach((el, i) => {
    if (!el) return

    const { cx, cy, rx, ry, turn } = drawn(EYES[i]!, gaze)

    el.setAttribute("cx", cx.toFixed(2))
    el.setAttribute("cy", cy.toFixed(2))
    el.setAttribute("rx", rx.toFixed(2))
    el.setAttribute("ry", ry.toFixed(2))
    el.setAttribute("transform", `rotate(${turn.toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})`)
  })

/**
 * Moves the eyes while `looking`: one move after another in no fixed order, each an eased turn and then a rest. Frames
 * are asked for only during a turn; a rest is a timer; a page not shown waits. Stopping eases the eyes back to rest.
 */
function useGaze(eyes: { current: (SVGEllipseElement | null)[] }, looking: boolean) {
  const at = useRef<Gaze>(REST)

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

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

      const { name, through, turn: turns, rest } = next(last)
      const go = (i: number) => {
        if (stopped) return
        if (i === through.length) return void (timer = window.setTimeout(move, within(rest)))

        turn(through[i]!, within(turns), () => go(i + 1))
      }

      last = name
      go(0)
    }

    if (looking) timer = window.setTimeout(move, 300)
    else if (at.current !== REST) turn(REST, 600, () => (at.current = REST))

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [eyes, looking])
}

/** The eyes alone, in the current colour; `looking` has them look about. */
export function Eyes({ looking = false, className }: { looking?: boolean; className?: string }) {
  const eyes = useRef<(SVGEllipseElement | null)[]>([])

  useGaze(eyes, looking)

  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("overflow-visible", className)}>
      <g className="fill-current">
        {EYES.map((eye, i) => {
          const { cx, cy, rx, ry } = drawn(eye, REST)

          return <ellipse key={i} ref={(el) => void (eyes.current[i] = el)} cx={cx} cy={cy} rx={rx} ry={ry} />
        })}
      </g>
    </svg>
  )
}

/** The mark with the agent's standing on it. */
export function Logo({ standing }: { standing: Standing }) {
  return (
    <span data-turn={standing.state} className="relative grid size-[22px] place-items-center">
      <Eyes looking={standing.state === "working"} className={cn("size-5", standing.state === "working" && "motion-reduce:text-primary")} />
      {standing.state === "waiting" && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-muted-foreground px-0.5 text-badge leading-none font-medium text-background tabular-nums ring-2 ring-sidebar"
        >
          {standing.waiting > 9 ? "9+" : standing.waiting}
        </span>
      )}
    </span>
  )
}
