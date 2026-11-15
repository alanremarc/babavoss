// Whose move it is, at the right of the strip, once for every surface: the agent working, quietly animated; idle, its turn
// over; or not known, where the harness has not said. While the agent is idle, what the person did on the page that it has
// not been told waits for their next message, and the strip counts it. Ending the move is the shell's, so no surface makes
// its own: where the harness can be driven the button starts the agent's turn; where it cannot, as in a terminal the person
// types into, nothing on the page can, so the button copies a message for them to send, and says that is how it ends.
import { useEffect, useState } from "react"
import { cn } from "cn"
import { Button } from "../../kit/components/button"
import { END_MESSAGE } from "../../core/runtime/turn.ts"
import type { Turn } from "./client.ts"

const plural = (n: number) => `${n} change${n === 1 ? "" : "s"}`

/** What the indicator says, in words: its label, and its longer why on hover. */
export function turnWords({ agent, waiting }: Pick<Turn, "agent" | "waiting">): { label: string; why: string } {
  const told = waiting ? `${plural(waiting)} of yours ${waiting === 1 ? "waits" : "wait"} for it` : ""

  if (agent === "working") return { label: "Agent working", why: "The agent is working: what you do on the page reaches it as it goes." }
  if (agent === "idle")
    return waiting
      ? { label: `${plural(waiting)} waiting`, why: `The agent's turn is over and ${told}: they reach it with your next message.` }
      : { label: "Agent idle", why: "The agent's turn is over: it hears from you with your next message." }

  return {
    label: waiting ? `${plural(waiting)} waiting` : "",
    why: `Not known whether the agent is working: its harness has not said.${waiting ? ` ${told}, and reach it when it next reads the root.` : ""}`,
  }
}

const DOT = { working: "bg-primary animate-pulse motion-reduce:animate-none", idle: "bg-muted-foreground/60", unknown: "bg-muted-foreground/25", waiting: "bg-warning" }

export function TurnIndicator({ turn }: { turn?: Turn }) {
  const [said, setSaid] = useState<string>()

  // What the button last did is said until the turn moves on.
  useEffect(() => setSaid(undefined), [turn?.agent, turn?.waiting])

  if (!turn) return null

  const { label, why } = turnWords(turn)
  const waiting = turn.agent !== "working" && turn.waiting > 0
  const end = async () => {
    if (turn.drivable) {
      type Started = { started?: true; cannot?: string; error?: string }
      const answer: Started = await fetch("/_/turn", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ message: END_MESSAGE }),
      })
        .then((r) => r.json() as Promise<Started>)
        .catch((error: unknown) => ({ cannot: error instanceof Error ? error.message : String(error) }))

      return setSaid(answer.started ? "Sent" : (answer.cannot ?? answer.error ?? "Not sent"))
    }
    try {
      await navigator.clipboard.writeText(END_MESSAGE)
      setSaid("Copied: send it to the agent")
    } catch {
      setSaid(`Send the agent: “${END_MESSAGE}”`)
    }
  }

  return (
    <div data-turn={turn.agent} className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-meta text-muted-foreground" role="status" aria-label={why}>
      <span className="flex items-center gap-1.5" title={why}>
        <span aria-hidden className={cn("size-1.5 rounded-full", DOT[waiting ? "waiting" : turn.agent])} />
        {label && <span className="whitespace-nowrap">{label}</span>}
      </span>
      {waiting && turn.agent === "idle" && (
        <Button
          variant="ghost"
          size="xs"
          title={turn.drivable ? "Start the agent's turn with your changes" : `Nothing here can start the agent's turn: copy a message to send it — “${END_MESSAGE}”`}
          onClick={() => void end()}
        >
          {said ?? (turn.drivable ? "End my move" : "Copy message")}
        </Button>
      )}
    </div>
  )
}
