// The babavoss mark, the two eyes of the brand, as the strip's first tab, home; and the agent's standing in it: still,
// looking about while the agent works, a tint where motion is reduced, and a count of the person's changes waiting.
import { cn } from "cn"
import type { Standing } from "./turn.ts"

/** The eyes alone, in the current colour; `looking` moves them, slowly and without end. */
export function Eyes({ looking, className }: { looking?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <g data-looking={looking || undefined} className="fill-current data-[looking]:animate-[baba-look_3.2s_ease-in-out_infinite] motion-reduce:animate-none">
        <circle cx="33.772" cy="50" r="18" />
        <circle cx="71.5" cy="50" r="12.728" />
      </g>
    </svg>
  )
}

/** The mark with the agent's standing on it. */
export function Logo({ standing }: { standing: Standing }) {
  return (
    <span data-turn={standing.state} className="relative grid size-[22px] place-items-center">
      <Eyes
        looking={standing.state === "working"}
        className={cn("size-5", standing.state === "working" && "motion-reduce:text-primary")}
      />
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
