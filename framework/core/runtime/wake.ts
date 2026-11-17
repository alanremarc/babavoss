// How long a runtime stays up for what woke it. Each request is a signal, classified once where it enters the door, and
// each signal has a strength: how long it keeps the runtime up from now. A weak one keeps it a short time, a strong one
// long; one that only watches keeps it no longer; the session's end cuts what is left. The runtime sleeps, ends with its
// state kept, once the furthest deadline it was given has passed and nothing runs; any call wakes it again (runtime.ts).
import type { TurnEvent } from "./turn.ts"

/** How long a signal keeps the runtime up from now; `end` is no longer than that, whatever was given before. */
export type Strength = "weak" | "strong" | "none" | "end"

/** What each request is, and its strength. A new signal is one line here, and one where the door classifies it. */
export const SIGNALS = {
  /** The shell opened in the session, as a session's start, resume or compaction does, by its hook or by the skill. */
  opened: "weak",
  /** The hook of a session that starts or resumes, or of the agent's turn ending. */
  ended: "weak",
  /** The hook with the person's message. */
  started: "strong",
  /** The hook after the agent's tool call. */
  working: "strong",
  /** The agent's command: a read, a call, a wait, a restart, a program's read or call. */
  agent: "strong",
  /** An action the person takes on the page, or a message they end their move with there. */
  person: "strong",
  /** A page that only watches: its event stream, its reads, its assets, the settings it polls; and a client's probe. */
  watching: "none",
  /** The hook of the session's end. */
  gone: "end",
} as const satisfies Record<string, Strength>
export type Signal = keyof typeof SIGNALS

/** How long each strength keeps the runtime up. */
export const STRENGTHS: Record<Exclude<Strength, "none">, number> = { weak: 5 * 60_000, strong: 30 * 60_000, end: 60_000 }

/**
 * The strengths, where BABAVOSS_WAKE_MS sets some for specs and for trying it out: `weak=2000,strong=20000,end=1000`,
 * in milliseconds; what it does not set, or sets wrong, stays as it is.
 */
export function strengthsOf(env: NodeJS.ProcessEnv = process.env): Record<Exclude<Strength, "none">, number> {
  const set = { ...STRENGTHS }

  for (const pair of (env.BABAVOSS_WAKE_MS ?? "").split(",")) {
    const [key, value] = pair.split("=").map((part) => part.trim())
    const ms = Number(value)

    if ((key === "weak" || key === "strong" || key === "end") && value && Number.isFinite(ms) && ms >= 0) set[key] = ms
  }

  return set
}

/** What the door reads of a request to classify it. */
export type Request = { method: string; path: string; open: boolean; plain: boolean; stream: boolean; html: boolean; probe: boolean; agent: boolean; turn?: TurnEvent }

/**
 * The signal a request is. The agent's word speaks plain text, and so do the hooks: an open of the shell, a hook's word on
 * the turn by its event, read from its body, any other its command. The page speaks JSON, and only what it does is more than watching; a
 * program of the agent's speaks JSON too, as the agent.
 */
export function signalOf(r: Request): Signal {
  if (r.probe) return "watching"
  if (r.plain) {
    if (r.method === "POST" && r.path === "/_/turn") return r.turn ?? "watching"

    return r.method === "GET" && r.path === "/" && r.open ? "opened" : "agent"
  }
  if (r.method === "POST" && r.path === "/_/turn") return "person"
  if (r.path.startsWith("/_/") || r.html || r.stream) return "watching"
  if (r.agent) return "agent"

  return r.method === "POST" ? "person" : "watching"
}

/** The deadline a runtime keeps: the furthest one its signals gave, or what the session's end left of it. */
export function wakeful(strengths: Record<Exclude<Strength, "none">, number>, from: number) {
  let until = from + strengths.weak

  return {
    get until() {
      return until
    },
    /** A signal at `now`: the deadline it gives, where further; the session's end cuts it. */
    signal(signal: Signal, now: number) {
      const strength: Strength = SIGNALS[signal]

      if (strength === "end") until = Math.min(until, now + strengths.end)
      else if (strength !== "none") until = Math.max(until, now + strengths[strength])
    },
    /** The deadline a runtime before this one carried over, as it restarted. */
    carry(deadline: number) {
      until = deadline
    },
  }
}
