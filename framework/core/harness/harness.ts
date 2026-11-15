// A harness as the framework drives one: a session of an agent started in a project, with a home of its own, spoken to,
// and its stream read as the framework's own events. An adapter is the only code that knows a harness: its command and
// flags, what its stream means, and where its login is kept. Claude Code's is the first; another harness is another
// adapter with this interface. What makes an agent aware, the hooks and the skill, is provisioned elsewhere.

export type Tokens = { input: number; cache_write: number; cache_read: number; output: number }
/** The API request a chunk of the agent's came from, and the tokens it was given; left out where a harness does not say. */
export type Request = { id: string; context: number }
/** What a session began with, as the harness reports it: what reaches the agent besides the project's own. */
export type Loaded = { model: string; cwd: string; tools: string[]; skills: string[]; plugins: string[]; mcp: string[]; commands: string[] }

/**
 * A session's stream, normalised. `injected` is context a hook added; `message` a message as it entered the context; a
 * `call` is a tool's, `word` where it is the root's word, and its `result` follows under the same id; a `turn` ends one,
 * with its tokens and the session's cost so far; `ended` is the process's end, the stream's last event.
 */
export type HarnessEvent =
  | { kind: "started"; session: string; loaded: Loaded }
  | { kind: "injected"; event: string; text: string; error?: boolean }
  | { kind: "message"; text: string }
  | { kind: "call"; id: string; tool: string; input: string; word: boolean; request?: Request }
  | { kind: "result"; id: string; text: string; error?: boolean }
  | { kind: "reply"; text: string; request?: Request }
  | { kind: "thinking"; text: string; request?: Request }
  | { kind: "turn"; ok: boolean; text: string; tokens: Tokens; total: number; ms: number; calls: number }
  | { kind: "ended"; code: number | null; stderr: string }

export type Start = {
  /** The project the session works in, its directory. */
  project: string
  /** The session's home, made one by `home` first: what the harness writes of the session lands there. */
  home: string
  /** The session's id, which the framework's hooks see too. */
  session: string
  model: string
  /** What the session may spend at most, in US dollars. */
  budget?: number
}

/** A running session: a message starts a turn or waits for the one running; `stop` interrupts a turn; `end` ends the process, and resolves once it has. */
export interface Session {
  events: AsyncIterable<HarnessEvent>
  say(text: string): void
  stop(): void
  end(): Promise<void>
}

export interface Harness {
  /** The harness's name, as its section of a project's configuration will know it. */
  name: string
  /** Makes `home` a home the harness can run in, its login reached from the person's by a link and never a copy; answers with how. */
  home(home: string): string
  /** Takes back from `home` what `home` linked there. */
  release(home: string): void
  start(options: Start): Session
}

export const NONE: Tokens = { input: 0, cache_write: 0, cache_read: 0, output: 0 }
