// The babavoss mark, the two eyes of the brand, as home's tab, the rail's first; and the agent's standing in it: at rest,
// looking about like a face that thinks while the agent works, a tint instead where motion is reduced, by the conventions,
// or the person turned the mark's animation off in the settings; the person's changes that wait are said on hover, and counted in the
// activity. The eyes are patches on a sphere seen by a close camera, gaze.ts; here they are moved, a frame at a time and
// only while they turn.
import { useEffect, useRef } from "react"
import { cn } from "../../kit/cn.ts"
import { between, eased, MOVES, next, outline, REST, SEARCH, settled, SIDES, within, type Gaze } from "./gaze.ts"
import { useConventions } from "./tab.tsx"
import type { Standing } from "./turn.ts"

const place = (eyes: (SVGPathElement | null)[], gaze: Gaze) => eyes.forEach((el, i) => el?.setAttribute("d", outline(SIDES[i]!, gaze)))

/**
 * Moves the eyes. While `looking`: one move after another in no fixed order, each an eased turn and then a rest; frames
 * are asked for only during a turn, a rest is a timer, and a page not shown waits. Stopping eases the eyes back to rest.
 * While `lost`, whatever else: the face looks slowly from one side to the other, until the page has its runtime again,
 * when the eyes return to where they rest. `only` names the one move to make, again and again, in place of one after
 * another: a move looked at on its own.
 */
function useGaze(eyes: { current: (SVGPathElement | null)[] }, looking: boolean, lost: boolean, only?: string) {
  const at = useRef<Gaze>(REST)
  const still = useConventions().motion === "reduced"

  useEffect(() => {
    if (typeof window === "undefined") return

    // Where motion is reduced the eyes are put where they rest, with no turn.
    if (still) {
      at.current = REST

      return void place(eyes.current, REST)
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
        if (t < 1) return void (frame = requestAnimationFrame(step))
        // A head that went round is where it was: said so, the next turn takes the short way.
        at.current = settled(at.current)
        then()
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
    // Lost: from one side to the other, again and again.
    const search = (i: number) => {
      if (stopped) return

      const { to, turn: ms, hold } = SEARCH[i % SEARCH.length]!

      turn(to, ms, () => (timer = window.setTimeout(() => search(i + 1), hold)))
    }

    if (lost) search(0)
    else if (looking) timer = window.setTimeout(move, 300)
    // Wherever a turn was cut, the eyes settle from there, the short way: nothing jumps.
    else if (at.current !== REST) {
      at.current = settled(at.current)
      turn(REST, 900, () => (at.current = REST))
    }

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [eyes, looking, lost, only, still])
}

/**
 * The eyes alone, in the current colour; `looking` has them look about, or make the one `move` named again and again;
 * `lost` dims them and has them look from side to side.
 */
export function Eyes({ looking = false, lost = false, move, className }: { looking?: boolean; lost?: boolean; move?: string; className?: string }) {
  const eyes = useRef<(SVGPathElement | null)[]>([])

  useGaze(eyes, looking, lost, move)

  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("overflow-visible", className)}>
      <g className={cn("fill-current transition-opacity duration-300 motion-reduce:transition-none", lost && "opacity-60")}>
        {SIDES.map((side, i) => (
          <path key={side} ref={(el) => void (eyes.current[i] = el)} d={outline(side, REST)} />
        ))}
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
