// A harness's adapter, the only code that knows the harness, with three faces. Set up: what makes the harness aware of a
// project's surfaces, written into the project and withdrawn from it again. Hooks: how the harness's hook input becomes
// the framework's moment, and how what the framework tells becomes the harness's hook output. Run: a session of an agent
// started in a project, with a home of its own, spoken to, and its stream read as the framework's own events; an adapter
// that cannot run its harness yet leaves it out. A run hands on nothing of the account's: no account, organisation or user
// id and no address, so what records a session's events never holds them.

export type Tokens = { input: number; cache_write: number; cache_read: number; output: number }
/** The API request a chunk of the agent's came from, and the tokens it was given; left out where a harness does not say. */
export type Request = { id: string; context: number }
/** What a session began with, as the harness reports it: what reaches the agent besides the project's own. */
export type Loaded = { model: string; cwd: string; tools: string[]; skills: string[]; plugins: string[]; mcp: string[]; commands: string[] }

/**
 * A session's stream, normalised. `injected` is context a hook added, `hook` a hook that ran and added none, so a session
 * whose hooks never ran is told from one they told nothing; `message` a message as it entered the context; a
 * `call` is a tool's, `word` where it is the root's word, and its `result` follows under the same id; a `turn` ends one,
 * with its tokens and the session's cost so far; `ended` is the process's end, the stream's last event.
 */
export type HarnessEvent =
  | { kind: "started"; session: string; loaded: Loaded }
  | { kind: "injected"; event: string; text: string; error?: boolean }
  | { kind: "hook"; event: string }
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
  /**
   * Takes back from `home` what `home` linked there, and what the harness kept there of the session and the account. Its
   * transcripts it leaves to whoever made the home: they go only with the home, where that is deleted.
   */
  release(home: string): void
  start(options: Start): Session
}

export const NONE: Tokens = { input: 0, cache_write: 0, cache_read: 0, output: 0 }

/** The moments of a session the framework's hook knows, named as the harnesses commonly name their hooks. */
export type Moment = "SessionStart" | "UserPromptSubmit" | "PostToolUse" | "Stop" | "SessionEnd"
/** How a session started, where its harness says: new, resumed, cleared, after a compaction, or forked from another. */
export type Source = "startup" | "resume" | "clear" | "compact" | "fork"
export const SOURCES: readonly Source[] = ["startup", "resume", "clear", "compact", "fork"]
/** One hook's input, read: the session's id, the harness's own name for its event, the framework's moment, and at a start its source where said. */
export type HookEvent = { session?: string; event: string; moment: Moment; source?: Source }
/** A start's source in a hook's input; undefined where it is none the framework knows. */
export const sourceOf = (event: string, source: unknown): { source: Source } | {} =>
  event === "SessionStart" && (SOURCES as readonly unknown[]).includes(source) ? { source: source as Source } : {}

/** What a set-up face did: the paths it wrote or removed, relative to the project, and a line to say to the person. */
export type SetUp = { paths: string[]; said?: string }

export interface Adapter<O extends { events: string[] } = { events: string[] }> {
  /** The harness's name: its section of .baba/baba.config.ts. */
  name: string
  /** The options it is set up with where the configuration does not say: every event among them. */
  defaults: O
  /** The harness's hook events the framework is told at; an option `events` names some of them. */
  events: readonly string[]
  /** Writes into `project` what makes the harness aware of its surfaces, and only what differs. */
  provision(project: string, options: O): SetUp
  /**
   * What keeps the harness on this machine from running what `provision` wrote, as an organisation's policy can, in one line
   * for the person with what they can do; undefined where nothing that can be read does. It reads, and changes nothing.
   */
  blocked?(): string | undefined
  /** Removes from `project` what `provision` wrote there, and nothing else. */
  withdraw(project: string): SetUp
  /** The framework's moment in what the harness gave its hook on standard input; undefined where it is none of them. */
  hookEvent(input: unknown): HookEvent | undefined
  /** What the hook prints for the harness to add `context`. */
  hookOutput(event: HookEvent, context: string): string
  /** The harness, run; left out where the adapter cannot run it. */
  run?: () => Harness
}
