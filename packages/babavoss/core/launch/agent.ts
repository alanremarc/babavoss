// Start an agent in a harness and talk to it without a terminal: prompts in, a stream of what it said, did and was told out.
// Claude Code holds one process over stdin with stream-json. Codex runs one exec per turn and resumes its thread; its rollout file is
// tailed for what each model call read, which its stream leaves out.
// The events are the thin common shape a page shows; the raw line rides along for anything else.
// What a run holds fixed, model, effort, sandbox, is mapped to each harness's own flags here and nowhere else, and so is
// the agent's home and the session it resumes.
import { spawn, type ChildProcess } from "node:child_process"
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readlinkSync, readSync, statSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { createInterface } from "node:readline"
import * as claudeCode from "../harness-adapters/claude-code/index.ts"
import * as codex from "../harness-adapters/codex/index.ts"

export type Harness = "claude-code" | "codex"
export type AgentOptions = {
  harness: Harness
  cwd: string
  /** App directories linked as skills into the isolated harness home. Requires `home`. */
  skillDirs?: string[]
  /** Claude Code: the session id to give; Codex: ignored, the thread id arrives with `started`. */
  sessionId?: string
  /** The harness's own session id to continue, in the same home: Claude Code resumes it; Codex resumes the thread from the first turn. */
  resume?: string
  /**
   * The agent's home, created when missing: HOME for the harness and everything it runs, Claude Code's config under
   * <home>/.claude, Codex's under <home>/.codex, the harness's sessions with them. Given one, the agent has nothing of the
   * person's but the apps given here: no settings, skills, plugins, memory, git identity or ssh agent, and a shell that
   * reads none of their startup files, with this process's bun first on the path. What the account brings in any home is
   * turned off: Claude Code's claude.ai connectors, Codex's apps and remote plugins. Claude Code reads the home's own
   * settings and nothing of the project's, since the working directory's parents may hold the person's: with no settings
   * source at all it lists no skills from the home either, and the agent is never told the app exists. Verified.
   * The harness's own bundled skills and tools stay.
   * Credentials are passed in: Codex's auth file is copied into its home; Claude Code takes ANTHROPIC_API_KEY or
   * CLAUDE_CODE_OAUTH_TOKEN from `env`, and without either, on macOS, finds its own keychain item through a link to the
   * person's login keychain, the one thing of theirs in the home.
   */
  home?: string
  model?: string
  /** Claude Code: low, medium, high, xhigh, max. Codex: what the model lists, low, medium, high, xhigh. */
  effort?: string
  /** The harness's shell sandbox: writes inside cwd, no network but loopback. False lifts it: Codex gets full access. Unset leaves the harness's default. */
  sandbox?: boolean
  /** Claude Code: default bypassPermissions, since nobody answers a prompt; the sandbox, when on, still confines. */
  permissionMode?: claudeCode.Launch["permissionMode"]
  env?: NodeJS.ProcessEnv
  /** The executable, for specs that shim a harness. */
  bin?: string
}
export type AgentEvent =
  /** `commands`: the slash commands the harness loaded for the session, where it says: its own, and each plugin skill as `plugin:skill`. */
  | { kind: "started"; session: string; model?: string; commands?: string[] }
  | { kind: "thinking"; text?: string; durationMs?: number }
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown }
  | { kind: "result"; id: string; output: string; error?: boolean }
  /** A skill opened by the agent. `tool` names the call that loaded it. */
  | { kind: "skill"; title: string; text: string; tool?: string }
  /**
   * What one model call read: the tokens in the agent's context then, cached ones included, and of them `cached`, read
   * from the cache, where the harness says; the model's context window where it says it with them.
   */
  | { kind: "context"; tokens: number; cached?: number; window?: number }
  /**
   * Cost when the harness reports it; tokens over the turn's calls when it reports those; the model's context window when
   * it says.
   */
  | { kind: "turn-done"; durationMs?: number; costUsd?: number; tokens?: Tokens; window?: number }
  | { kind: "exited"; code: number | null; error?: string }
  | { kind: "raw"; line: string }

/** How long a stopped agent may take to exit on its own before it is terminated. */
export const STOP_GRACE_MS = 3000
/** How often the Codex rollout is read for model usage. */
export const ROLLOUT_POLL_MS = 500

/** What a running agent's next model call runs under; what is left out stays as it is. */
export type Tuning = { model?: string; effort?: string }

export type Agent = {
  harness: Harness
  /** A prompt for the next turn; Codex queues it until the current turn ends. */
  send(text: string): void
  /** The model and effort from the next call on: Claude Code is told over its control channel, Codex takes them with its next turn. */
  tune(tuning: Tuning): void
  stop(): void
  /** Resolves when the agent is gone. */
  done: Promise<void>
}

/** What a harness tells its own children, which this new session must not inherit. */
export const PARENT_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_PROJECT_DIR",
  claudeCode.vars.sessionId,
  "CLAUDE_CODE_ENTRYPOINT",
  codex.vars.sessionId,
]

const lines = (child: ChildProcess, onLine: (line: string) => void) => {
  const reader = createInterface({ input: child.stdout! })

  reader.on("line", (line) => line.trim() && onLine(line))
}
const parse = (line: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return undefined
  }
}
const asText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((b: { type?: string; text?: string }) => (b.type === "text" && b.text ? b.text : "")).join("\n")
      : content === undefined || content === null
        ? ""
        : JSON.stringify(content)

/**
 * Tokens over a turn: `input` everything the model read, cached or not; of it `cached`, read from the prompt cache, and
 * `written`, written to it, where the harness says; `output` what it wrote.
 */
export type Tokens = { input: number; output: number; cached?: number; written?: number }

const count = (u: Record<string, unknown> | undefined, key: string): number | undefined => (typeof u?.[key] === "number" ? (u[key] as number) : undefined)
/** Claude Code's usage: `input_tokens` is only what was not cached; the cache's reads and writes come beside it. */
const claudeTokens = (usage: unknown): Tokens | undefined => {
  const u = usage as Record<string, unknown> | undefined
  const input = count(u, "input_tokens")
  const output = count(u, "output_tokens")

  if (input === undefined || output === undefined) return undefined

  const cached = count(u, "cache_read_input_tokens") ?? 0
  const written = count(u, "cache_creation_input_tokens") ?? 0

  return { input: input + cached + written, output, cached, written }
}
/** Codex's usage: `input_tokens` holds all that was read, `cached_input_tokens` the part of it from the cache. */
const codexTokens = (usage: unknown): Tokens | undefined => {
  const u = usage as Record<string, unknown> | undefined
  const input = count(u, "input_tokens")
  const output = count(u, "output_tokens")
  const cached = count(u, "cached_input_tokens")
  const written = count(u, "cache_write_input_tokens")

  return input === undefined || output === undefined
    ? undefined
    : { input, output, ...(cached !== undefined && { cached }), ...(written !== undefined && { written }) }
}

type Block = {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

/** What a Claude Code call read: its input, cache reads and writes included, and of it what came from the cache. */
const claudeRead = (usage: unknown): { tokens: number; cached: number } | undefined => {
  const u = usage as Record<string, unknown> | undefined
  const n = (key: string) => count(u, key) ?? 0

  return typeof u?.input_tokens === "number"
    ? { tokens: n("input_tokens") + n("cache_read_input_tokens") + n("cache_creation_input_tokens"), cached: n("cache_read_input_tokens") }
    : undefined
}
/** The largest context window among the models a Claude Code result says it used. */
const claudeWindow = (modelUsage: unknown): number | undefined => {
  const windows = Object.values((modelUsage ?? {}) as Record<string, { contextWindow?: unknown }>)
    .map((m) => m?.contextWindow)
    .filter((w): w is number => typeof w === "number" && w > 0)

  return windows.length ? Math.max(...windows) : undefined
}

/**
 * Claude Code's stream, line by line. One call's message arrives a block per line, each with the call's usage, so what
 * it read is said once per message. A skill's body follows its call's result as a synthetic user message.
 */
const claudeParser = () => {
  const read = new Set<string>()
  let lastResult: { id: string; command?: string } | undefined

  return (line: string): AgentEvent[] => {
    const events = claudeEvents(line, lastResult)
    const e = parse(line)
    const message = e?.message as { id?: unknown; usage?: unknown; content?: unknown } | undefined

    if (e?.type === "assistant") {
      lastResult = undefined

      const call = claudeRead(message?.usage)
      const id = typeof message?.id === "string" ? message.id : undefined

      if (call !== undefined && (!id || !read.has(id))) {
        if (id) read.add(id)
        events.unshift({ kind: "context", ...call })
      }
    }
    if (e?.type === "user") {
      const result = Array.isArray(message?.content) ? (message.content as Block[]).findLast((b) => b.type === "tool_result") : undefined
      const meta = e.tool_use_result as { commandName?: unknown } | undefined

      if (result) lastResult = { id: result.tool_use_id ?? "", ...(typeof meta?.commandName === "string" && { command: meta.commandName }) }
      else if (e.isSynthetic !== true) lastResult = undefined
    }

    return events
  }
}

const claudeEvents = (line: string, lastResult?: { id: string; command?: string }): AgentEvent[] => {
  const e = parse(line)

  if (!e) return [{ kind: "raw", line }]

  const message = e.message as { content?: unknown } | undefined
  const blocks = Array.isArray(message?.content) ? (message.content as Block[]) : []

  if (e.type === "system") {
    if (e.subtype === "init" && typeof e.session_id === "string")
      return [
        {
          kind: "started",
          session: e.session_id,
          ...(typeof e.model === "string" && { model: e.model }),
          ...(Array.isArray(e.slash_commands) && { commands: e.slash_commands.filter((c): c is string => typeof c === "string") }),
        },
      ]

    return []
  }
  if (e.type === "assistant")
    return blocks.flatMap((b): AgentEvent[] =>
      b.type === "thinking"
        ? [
            {
              kind: "thinking",
              ...(b.thinking && { text: b.thinking }),
              ...(typeof e.thinking_duration_ms === "number" && { durationMs: e.thinking_duration_ms }),
            },
          ]
        : b.type === "text" && b.text
          ? [{ kind: "text", text: b.text }]
          : b.type === "tool_use"
            ? [{ kind: "tool", id: b.id ?? "", name: b.name ?? "", input: b.input }]
            : []
    )
  if (e.type === "user") {
    // Text put in by the harness, not the person: a skill's body after the call that loaded it, or other context.
    if (e.isSynthetic === true) {
      const text = typeof message?.content === "string" ? message.content : blocks.every((b) => b.type === "text") ? asText(blocks) : ""

      if (!text.trim()) return []

      return lastResult?.command ? [{ kind: "skill", title: lastResult.command, text, tool: lastResult.id }] : []
    }

    return blocks.flatMap((b): AgentEvent[] =>
      b.type === "tool_result" ? [{ kind: "result", id: b.tool_use_id ?? "", output: asText(b.content), ...(b.is_error && { error: true }) }] : []
    )
  }
  if (e.type === "result") {
    const used = claudeTokens(e.usage)
    const window = claudeWindow(e.modelUsage)

    return [
      {
        kind: "turn-done",
        ...(typeof e.duration_ms === "number" && { durationMs: e.duration_ms }),
        ...(typeof e.total_cost_usd === "number" && { costUsd: e.total_cost_usd }),
        ...(used && { tokens: used }),
        ...(window && { window }),
      },
    ]
  }

  return []
}

/** What a Codex rollout records that its stream does not: what each model call read, and the model's context window. */
const rolloutEvents = (line: string): AgentEvent[] => {
  const e = parse(line)
  const payload = e?.type === "event_msg" ? (e.payload as { type?: string; info?: Record<string, unknown> | null } | undefined) : undefined

  if (payload?.type !== "token_count" || !payload.info) return []

  const last = payload.info.last_token_usage as Record<string, unknown> | undefined
  const window = payload.info.model_context_window
  const tokens = count(last, "input_tokens")
  const cached = count(last, "cached_input_tokens")

  return tokens !== undefined
    ? [{ kind: "context", tokens, ...(cached !== undefined && { cached }), ...(typeof window === "number" && window > 0 && { window }) }]
    : []
}

/**
 * Reads a file from where it left off, line by line, every ROLLOUT_POLL_MS; `at` names it, and may not know it yet.
 * `skip` starts past what the file holds when first found, as a resumed session's earlier calls. Returns read and stop.
 */
const tail = (at: string | (() => string | undefined), onLine: (line: string) => void, skip = false): { read: () => void; stop: () => void } => {
  let offset: number | undefined = skip ? undefined : 0
  let rest = ""
  const read = () => {
    const file = typeof at === "string" ? at : at()

    if (!file || !existsSync(file)) return
    if (offset === undefined) offset = statSync(file).size

    const size = statSync(file).size

    if (size <= offset) return

    const fd = openSync(file, "r")

    try {
      const buffer = Buffer.alloc(size - offset)

      readSync(fd, buffer, 0, buffer.length, offset)
      offset = size
      rest += buffer.toString("utf8")
    } finally {
      closeSync(fd)
    }

    const parts = rest.split("\n")

    rest = parts.pop() ?? ""
    for (const part of parts) if (part.trim()) onLine(part)
  }
  const timer = setInterval(read, ROLLOUT_POLL_MS)

  timer.unref()

  return {
    read,
    stop: () => {
      clearInterval(timer)
      read()
    },
  }
}

const codexEvents = (line: string, started: Set<string>): AgentEvent[] => {
  const e = parse(line)

  if (!e) return [{ kind: "raw", line }]
  if (e.type === "thread.started" && typeof e.thread_id === "string") return [{ kind: "started", session: e.thread_id }]

  const item = (e.item ?? {}) as { id?: string; type?: string; text?: string; command?: string; aggregated_output?: string; exit_code?: number | null }

  if (e.type === "item.started" && item.type === "command_execution" && item.id) {
    started.add(item.id)

    return [{ kind: "tool", id: item.id, name: "command", input: item.command }]
  }
  if (e.type === "item.completed") {
    if (item.type === "agent_message" && item.text) return [{ kind: "text", text: item.text }]
    if (item.type === "reasoning" && item.text) return [{ kind: "thinking", text: item.text }]
    if (item.type === "command_execution" && item.id) {
      const call: AgentEvent[] = started.has(item.id) ? [] : [{ kind: "tool", id: item.id, name: "command", input: item.command }]

      return [...call, { kind: "result", id: item.id, output: item.aggregated_output ?? "", ...(item.exit_code ? { error: true } : {}) }]
    }
  }
  if (e.type === "turn.completed") {
    const used = codexTokens(e.usage)

    return [{ kind: "turn-done", ...(used && { tokens: used }) }]
  }

  return []
}

/**
 * Variables that point the agent back into the person's home past a moved HOME: the harnesses' own homes, a startup file
 * a non-interactive bash or sh reads for every command, zsh's startup directory, the XDG directories git and others read,
 * git's global config, the ssh agent.
 */
const PERSONAL_VARS = [
  claudeCode.vars.configDir,
  codex.vars.home,
  "BASH_ENV",
  "ENV",
  "ZDOTDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_CACHE_HOME",
  "GIT_CONFIG_GLOBAL",
  "SSH_AUTH_SOCK",
]
/** What Claude Code authenticates with from the environment, before its keychain. */
const CLAUDE_CREDENTIAL_VARS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]

/** Where macOS looks for the login keychain under a home; Claude Code keeps its credentials item there. */
export const LOGIN_KEYCHAIN = join("Library", "Keychains", "login.keychain-db")

/**
 * The child's environment: the caller's, without what a harness told this process. Given a home, HOME is that home and
 * nothing points back into the person's: its shell reads the home's startup files, which there are none of, and finds
 * first the bun running this process, so an app's cli runs whatever the person's profile would have put on the path.
 * Claude Code's config directory is left to default under the home: setting it would name another keychain item.
 */
const childEnv = (options: AgentOptions): NodeJS.ProcessEnv => {
  const env = { ...(options.env ?? process.env) }

  for (const name of PARENT_VARS) delete env[name]
  if (options.home) {
    for (const name of PERSONAL_VARS) delete env[name]
    env.HOME = options.home
    if (options.harness === "codex") env[codex.vars.home] = join(options.home, ".codex")
    env.BABAVOSS_HOME = options.env?.BABAVOSS_HOME ?? join(options.home, ".babavoss")
    mkdirSync(env.BABAVOSS_HOME, { recursive: true })
    env.BABAVOSS_BIN = join(options.home, "bin")
    mkdirSync(env.BABAVOSS_BIN, { recursive: true })
    env.PATH = [dirname(process.execPath), env.BABAVOSS_BIN, env.PATH].filter(Boolean).join(delimiter)
  }

  return env
}

/**
 * Claude Code's credentials for a moved home, when the environment carries none: on macOS a link to the person's login
 * keychain, where the harness finds its own item as it does at home. Nothing is copied; elsewhere there is nothing to link.
 */
const claudeCredentials = (home: string, own: NodeJS.ProcessEnv) => {
  if (process.platform !== "darwin" || CLAUDE_CREDENTIAL_VARS.some((name) => own[name])) return

  const from = join(own.HOME ?? homedir(), LOGIN_KEYCHAIN)
  const to = join(home, LOGIN_KEYCHAIN)

  if (!existsSync(from) || existsSync(to)) return
  mkdirSync(dirname(to), { recursive: true })
  symlinkSync(from, to)
}

/** What the account brings a Claude Code session in any home: its claude.ai connectors. */
const HOMED_CLAUDE_SETTINGS = { disableClaudeAiConnectors: true }
/** What the account brings a Codex session in any home: its apps and connectors, and its remote plugins. */
const HOMED_CODEX_DISABLE = ["apps", "remote_plugin"]

/**
 * What a run's sandbox lets the agent's commands write besides the working directory: in a moved home, the app's home and
 * the bin its word is put in, so the app's door and runtime work under the sandbox as the design says.
 */
const writable = (options: AgentOptions, env: NodeJS.ProcessEnv): string[] => (options.home ? [env.BABAVOSS_HOME!, env.BABAVOSS_BIN!] : [])

/** Claude Code's session settings: the sandbox when asked, and what a home cannot keep out. */
const claudeSettings = (options: AgentOptions, env: NodeJS.ProcessEnv): string =>
  JSON.stringify({
    ...(options.sandbox && (JSON.parse(claudeCode.sandboxSettings(writable(options, env))) as object)),
    ...(options.home && HOMED_CLAUDE_SETTINGS),
  })

/** Starts the agent; `onEvent` hears everything until `exited`, which is always last. */
export function startAgent(options: AgentOptions, onEvent: (event: AgentEvent) => void): Agent {
  const env = childEnv(options)
  let ended = false
  const exited = (code: number | null, error?: string) => {
    if (ended) return
    ended = true
    onEvent({ kind: "exited", code, error })
  }

  if (options.home) mkdirSync(options.home, { recursive: true })
  if (options.skillDirs?.length) {
    if (!options.home) throw new Error("Skills require an isolated harness home")

    const root = options.harness === "claude-code" ? claudeCode.configDir({ [claudeCode.vars.configDir]: join(options.home, ".claude") }) : codex.home(env)
    const skills = join(root, "skills")

    mkdirSync(skills, { recursive: true })
    for (const dir of options.skillDirs) {
      const text = readFileSync(join(dir, "SKILL.md"), "utf8")
      const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] ?? ""
      const name = /^name:\s*["']?([^\n"']+)["']?\s*$/m.exec(header)?.[1]?.trim()

      if (!name || !/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") throw new Error(`Invalid skill name in ${dir}`)

      const link = join(skills, name)

      if (existsSync(link)) {
        if (resolve(skills, readlinkSync(link)) !== resolve(dir)) throw new Error(`Skill already installed at ${link}`)
      } else symlinkSync(resolve(dir), link)
    }
  }

  if (options.harness === "claude-code") {
    if (options.home) claudeCredentials(options.home, options.env ?? process.env)

    const argv = claudeCode.launch({
      ...(options.resume ? { resume: options.resume } : { sessionId: options.sessionId }),
      settingSources: ["user"],
      ...((options.sandbox || options.home) && { settings: claudeSettings(options, env) }),
      permissionMode: options.permissionMode ?? "bypassPermissions",
      model: options.model,
      effort: options.effort as claudeCode.Launch["effort"],
      // What the agent thinks is part of the trace, so it is asked for, summarized.
      thinkingDisplay: "summarized",
      print: "",
      outputFormat: "stream-json",
      inputFormat: "stream-json",
      verbose: true,
    })
    const child = spawn(options.bin ?? claudeCode.claudeCode.bin, argv, { cwd: options.cwd, env, stdio: ["pipe", "pipe", "pipe"] })
    let stderr = ""
    const parseClaude = claudeParser()

    child.stderr!.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    lines(child, (line) => {
      parseClaude(line).forEach(onEvent)
    })
    child.on("error", (error) => exited(null, error.message))

    const done = new Promise<void>((resolve) =>
      child.on("close", (code) => {
        exited(code, code ? stderr.trim() || undefined : undefined)
        resolve()
      })
    )

    let controls = 0

    return {
      harness: "claude-code",
      send: (text) => child.stdin!.write(JSON.stringify({ type: "user", message: { role: "user", content: text } }) + "\n"),
      tune: ({ model, effort }) => {
        if (model) child.stdin!.write(claudeCode.control.model(`tune-${++controls}`, model) + "\n")
        if (effort) child.stdin!.write(claudeCode.control.effort(`tune-${++controls}`, effort) + "\n")
      },
      // Closing stdin ends the session; a harness that lingers is terminated after a grace period.
      stop: () => {
        child.stdin!.end()
        setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill("SIGTERM"), STOP_GRACE_MS).unref()
      },
      done,
    }
  }

  const bin = options.bin ?? codex.codex.bin
  // A resumed thread goes on from the first turn; `started` is still heard once, from that turn.
  let thread: string | undefined = options.resume
  let announced = false
  let current: ChildProcess | undefined
  const queue: string[] = []
  const startedItems = new Set<string>()
  let stopped = false
  let finish: () => void = () => {}
  const done = new Promise<void>((resolve) => (finish = resolve))
  // The rollout is tailed once the thread is known, across every turn's exec; a resumed thread's earlier calls are past.
  let rollout: ReturnType<typeof tail> | undefined
  let window: number | undefined
  const fromRollout = (line: string) =>
    rolloutEvents(line).forEach((event) => {
      if (event.kind === "context" && event.window) window = event.window
      onEvent(event)
    })

  // A fresh home needs the person's auth before the first turn.
  try {
    if (options.home) {
      const own = codex.authFile(options.env ?? process.env)
      const fresh = codex.authFile(env)

      mkdirSync(codex.home(env), { recursive: true })
      if (!existsSync(fresh) && existsSync(own)) copyFileSync(own, fresh)
    }
  } catch (error) {
    queueMicrotask(() => {
      exited(null, error instanceof Error ? error.message : String(error))
      finish()
    })

    return { harness: "codex", send: () => {}, tune: () => {}, stop: () => {}, done }
  }

  const tuned: Tuning = { model: options.model, effort: options.effort }
  const turn = (prompt: string) => {
    const argv = codex.exec(prompt, {
      cwd: options.cwd,
      json: true,
      skipGitRepoCheck: true,
      resume: thread,
      model: tuned.model,
      effort: tuned.effort,
      ...(options.sandbox === true && { sandbox: "workspace-write", sandboxNetwork: true, addDirs: writable(options, env) }),
      ...(options.sandbox === false && { sandbox: "danger-full-access" }),
      ...(options.home && { disable: HOMED_CODEX_DISABLE }),
    })
    const child = spawn(bin, argv, { cwd: options.cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""

    current = child
    child.stderr!.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    lines(child, (line) => {
      for (const event of codexEvents(line, startedItems)) {
        if (event.kind === "started") {
          if (announced) continue
          announced = true
          thread = event.session
          rollout ??= tail(() => codex.rolloutPath(event.session, env), fromRollout, !!options.resume)
        }
        if (event.kind === "turn-done") {
          rollout?.read()
          onEvent({ ...event, ...(window && { window }) })
          continue
        }
        onEvent(event)
      }
    })
    child.on("error", (error) => exited(null, error.message))
    child.on("close", (code) => {
      current = undefined
      if (code) {
        rollout?.stop()
        exited(code, stderr.trim() || undefined)
        finish()
      } else if (stopped) {
        rollout?.stop()
        exited(0)
        finish()
      } else if (queue.length) turn(queue.shift()!)
    })
  }

  return {
    harness: "codex",
    send: (text) => {
      if (stopped || ended) return
      if (current) queue.push(text)
      else turn(text)
    },
    tune: ({ model, effort }) => {
      if (model) tuned.model = model
      if (effort) tuned.effort = effort
    },
    stop: () => {
      stopped = true
      if (current) current.kill("SIGTERM")
      else {
        rollout?.stop()
        exited(0)
        finish()
      }
    },
    done,
  }
}
