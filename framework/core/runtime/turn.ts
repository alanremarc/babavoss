// The turn: whose move it is in the session, as its harness's hooks tell the runtime. A turn starts with the person's
// message and ends when the agent stops; between, each tool call says it is still working. It is information, never
// control: kept in memory alone, told to the page, and a runtime that starts again does not know it until the next hook.
// Hooks can miss: an interrupted turn has no Stop, a harness without hooks says nothing. So working with no word from
// the hooks for STALE_MS, and no call of the agent's under way, reads as unknown rather than stuck. Where the hooks have
// gone quiet (Hooks), a call under way keeps nothing: calls alone never read as work.

/** What a hook tells of the turn: begun with a message, still under way, ended, or the session gone. */
export type TurnEvent = "started" | "working" | "ended" | "gone"
export const TURN_EVENTS: readonly TurnEvent[] = ["started", "working", "ended", "gone"]
/** Whose move it is: the agent's, while it works; the person's, while it is idle; or not known. */
export type Agent = "working" | "idle" | "unknown"
/** `since` when it became so; `heard` when a hook last spoke while it worked. */
export type Turn = { agent: Agent; since: number; heard: number }

/**
 * How long a working agent may go unheard before its turn reads as unknown. Short, so a turn whose end the hooks missed
 * stops reading as work soon; a tool call that runs longer reads as unknown until it ends, and then as work again.
 */
export const STALE_MS = 90_000

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

/**
 * The hooks' silence, as the agent's word finds it. Each run of the word is one tool call of the agent's, and a harness's
 * hooks speak after each tool call; so a run that begins more than HUSH_MS after another run's last answer, with no hook
 * heard since, finds them quiet. One tool call that runs long, a wait or a program of many calls, is one run, and never
 * finds them so. Only the session's own agent's runs carry a call: one in its name from elsewhere, another session's agent
 * by --session or a script, carries none and counts for nothing (bv.ts). `ever`: a hook was heard in this session; `told`: the agent was told of this stretch of silence, which the
 * next hook heard ends, and `since` when it was; `last`: the run answered last since a hook was heard, and when.
 */
export type Hooks = { ever: boolean; told: boolean; since?: number; last?: { call: string; at: number }; harness?: string }
export const HUSH_MS = 10_000
export const QUIET_LINE = "baba: this session's hooks are not being heard; what changes is told only when you read it. Start a new session to get them back."
export const NO_HOOKS_LINE = "baba: no hook of this session's harness is heard; what changes is told only when you read it."

export const unheardHooks = (): Hooks => ({ ever: false, told: false })
/** A hook was heard: the silence, if any, has ended. */
export const hooksHeard = (harness?: string): Hooks => ({ ever: true, told: false, ...(harness && { harness }) })
/** The header a hook names its harness in, by its adapter's name, with what it tells of the turn; `harness` in Hooks is the one last heard. */
export const HARNESS_HEADER = "babavoss-harness"
/** A harness's name as a hook may say it: an adapter's, short and plain. */
export const harnessOf = (said: unknown): string | undefined => (typeof said === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(said) ? said : undefined)
/** A run of the word was answered at `now`. */
export const answered = (hooks: Hooks, call: string, now: number): Hooks => ({ ...hooks, last: { call, at: now } })

/** What a run of the word asking at `now` is told of the hooks' silence: a line once a stretch, where they are quiet. */
export function hushed(hooks: Hooks, call: string, now: number): { hooks: Hooks; line?: string } {
  const quiet = hooks.last !== undefined && hooks.last.call !== call && now - hooks.last.at > HUSH_MS

  if (hooks.told || !quiet) return { hooks }

  return { hooks: { ...hooks, told: true, since: now }, line: hooks.ever ? QUIET_LINE : NO_HOOKS_LINE }
}

/**
 * The hooks' silence as the person is shown it, by the runtime's own finding and never a timer of the page's: from the
 * run that found them quiet, `since`, to the next hook heard; `ever` where one was heard before, so they went quiet rather
 * than never spoke. Nothing while they are heard or no silence was found, as before a session's first run of the word.
 */
export type Unheard = { ever: boolean; since: number }

export const unheardOf = (hooks: Hooks): Unheard | undefined => (hooks.told ? { ever: hooks.ever, since: hooks.since ?? 0 } : undefined)

/** What a harness that can be driven from code does: starts a turn of the session's agent with a message. */
export type Driver = { startTurn(message: string): Promise<{ started: true } | { cannot: string }> }

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
