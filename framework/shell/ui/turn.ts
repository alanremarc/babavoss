// Whose move it is, as the mark on the rail shows it, once for every surface: still while the agent is idle or
// it is not known, the harness having said nothing; moving while it works; and, while it does not, a count of what the
// person did on the page that it has not been told, which waits for their next message. What the indicator said is the
// logo's label.
import type { Turn } from "./client.ts"

/** How the logo stands: still, working, or still with the person's changes waiting, counted. */
export type Standing = { state: "still" | "working" | "waiting"; waiting: number; said: string }

const plural = (n: number) => `${n} of your change${n === 1 ? "" : "s"} ${n === 1 ? "waits" : "wait"} for its next turn`

/** The logo's standing for a turn, and what it says: the agent working, idle, or not known, and what waits for it. */
export function standingOf(turn: Pick<Turn, "agent" | "waiting"> | undefined): Standing {
  const waiting = turn && turn.agent !== "working" ? turn.waiting : 0
  const state = turn?.agent === "working" ? "working" : waiting > 0 ? "waiting" : "still"

  if (turn?.agent === "working") return { state, waiting, said: "The agent is working: what you do on the page reaches it as it goes" }
  if (turn?.agent === "idle") return { state, waiting, said: waiting ? `Idle; ${plural(waiting)}` : "Idle: the agent hears from you with your next message" }

  return { state, waiting, said: `Not known whether the agent is working: its harness has not said${waiting ? `; ${plural(waiting)}` : ""}` }
}
