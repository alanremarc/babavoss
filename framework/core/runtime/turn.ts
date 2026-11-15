// The turn: whose move it is in the session, as its harness's hooks tell the runtime. A turn starts with the person's
// message and ends when the agent stops; between, each tool call says it is still working. It is information, never
// control: kept in memory alone, told to the page, and a runtime that starts again does not know it until the next hook.
// Hooks can miss: an interrupted turn has no Stop, a harness without hooks says nothing. So working with no word from
// the hooks for STALE_MS, and no call of the agent's under way, reads as unknown rather than stuck.

/** What a hook tells of the turn: begun with a message, still under way, ended, or the session gone. */
export type TurnEvent = "started" | "working" | "ended" | "gone"
export const TURN_EVENTS: readonly TurnEvent[] = ["started", "working", "ended", "gone"]
/** Whose move it is: the agent's, while it works; the person's, while it is idle; or not known. */
export type Agent = "working" | "idle" | "unknown"
/** `since` when it became so; `heard` when a hook last spoke while it worked. */
export type Turn = { agent: Agent; since: number; heard: number }

/** How long a working agent may go unheard before its turn reads as unknown: longer than a tool call commonly runs. */
export const STALE_MS = 5 * 60_000

export const unknownTurn = (now: number): Turn => ({ agent: "unknown", since: now, heard: now })

/** The turn after a hook's event at `now`. A message starts a new turn; a tool call is work, even after a turn the hooks missed. */
export function turned(turn: Turn, event: TurnEvent, now: number): Turn {
  if (event === "started") return { agent: "working", since: now, heard: now }
  if (event === "working") return { agent: "working", since: turn.agent === "working" ? turn.since : now, heard: now }

  const agent = event === "ended" ? "idle" : "unknown"

  return turn.agent === agent ? turn : { agent, since: now, heard: turn.heard }
}

/** The turn as it reads at `now`: working gone unheard for STALE_MS, with nothing of the agent's under way, is unknown. */
export function reading(turn: Turn, now: number, busy = false): Turn {
  if (turn.agent !== "working" || busy || now - turn.heard <= STALE_MS) return turn

  return { agent: "unknown", since: turn.heard + STALE_MS, heard: turn.heard }
}

/** What a harness that can be driven from code does: starts a turn of the session's agent with a message. */
export type Driver = { startTurn(message: string): Promise<{ started: true } | { cannot: string }> }

/** The message the person would send to end their move, where no driver can start the turn for them. */
export const END_MESSAGE = "I've made changes on the page: take them up."

/**
 * The driver for a session's harness, where one can be driven. None can be yet: a harness started by the person in a terminal
 * takes its turns from the person alone, so this says so, and the page offers the message instead.
 */
export function driverOf(_session: string): Driver | undefined {
  return undefined
}

/** Starts a turn of the session's agent, where its harness can be driven; otherwise why it cannot. */
export async function startTurn(session: string, message: string): Promise<{ started: true } | { cannot: string }> {
  const driver = driverOf(session)

  return driver ? driver.startTurn(message) : { cannot: "this session's harness takes its turns from the person: send the agent a message" }
}
