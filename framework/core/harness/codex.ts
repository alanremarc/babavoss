// Codex's adapter. Set up: the one method (setup.ts), the skill baba in .agents/skills/baba and the framework's hook in
// the project's .codex/hooks.json for each of Codex's events that is one of the framework's moments, among the person's
// own hooks; and, where the option asks, the sandbox's network opened in .codex/config.toml, so the shell's command reaches its
// runtime over loopback. Codex loads project hooks in a trusted project only, once the person has reviewed them. Hooks:
// Codex's input and output, which follow Claude Code's names. Run: `codex exec`, a process a turn, the first starting
// the thread and each after resuming it, in a home of its own (CODEX_HOME), the person's login file linked there; the
// project is trusted and its hooks run unreviewed by flags given to that run alone. The hook face and the file's format
// are from Codex's documentation (learn.chatgpt.com/docs/hooks); the run face was run against codex-cli 0.169.0.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Json } from "../surface/view.ts"
import { cleanEnv, postToolUse, redact, WORD } from "./claude.ts"
import { NONE, sourceOf, type Adapter, type Harness, type HarnessEvent, type HookEvent, type Moment, type Session, type SetUp, type Start } from "./harness.ts"
import { install, installedHooks, replace, uninstall, type Method } from "./setup.ts"

/** Codex's hook events the framework is told at: an interrupted turn ends as a stop does. */
export const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "Interrupt", "SessionEnd"] as const
export type CodexOptions = { events: (typeof CODEX_EVENTS)[number][]; network: boolean }

const CONFIG = ".codex/config.toml"
/** How Codex is set up in a project. A session's end has a second by default, three at most; the hook tells the shell the turn is unknown. */
const METHOD: Method = { name: "codex", skill: ".agents/skills/baba", hooks: ".codex/hooks.json", events: CODEX_EVENTS, timeouts: { SessionEnd: 3 } }
/** The lines baba writes into the person's config.toml end with this, so it can take them out again and nothing else. */
const MARK = "# babavoss: the shell's command reaches its runtime over loopback"
const TABLE = /^\[sandbox_workspace_write\]\s*(#.*)?$/

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

/** config.toml with network access in the workspace sandbox, added only where it does not say; and what was done. */
function opened(text: string): { text: string; said?: string } {
  const lines = text.split("\n")
  const table = lines.findIndex((line) => TABLE.test(line.trim()))
  const end = table < 0 ? -1 : lines.findIndex((line, i) => i > table && /^\s*\[/.test(line))
  const body = table < 0 ? [] : lines.slice(table + 1, end < 0 ? undefined : end)

  const says = [...body.filter((line) => /^\s*network_access\s*=/.test(line)), ...lines.filter((line) => /^\s*sandbox_workspace_write\.network_access\s*=/.test(line))]

  // What baba wrote before is as it was; what the person wrote is theirs.
  if (says.some((line) => line.endsWith(MARK))) return { text }
  if (says.length) return { text, said: `${CONFIG} already says whether the sandbox has the network: left as it is` }
  if (table >= 0) {
    lines.splice(table + 1, 0, `network_access = true ${MARK}`)

    return { text: lines.join("\n"), said: `${CONFIG}: network_access = true added to [sandbox_workspace_write]` }
  }

  const head = text && !text.endsWith("\n") ? `${text}\n` : text

  return { text: `${head}${head ? "\n" : ""}[sandbox_workspace_write] ${MARK}\nnetwork_access = true ${MARK}\n`, said: `${CONFIG}: the workspace sandbox's network opened` }
}

/** config.toml without the lines baba wrote; undefined where nothing else is left. */
const closed = (text: string): string | undefined => {
  const left = text
    .split("\n")
    .filter((line) => !line.endsWith(MARK))
    .join("\n")

  return left === text ? text : left.trim() ? left.replace(/\n+$/, "\n") : undefined
}

/** config.toml must still be TOML once baba's lines are in or out of it. */
const toml = (text: string) => void Bun.TOML.parse(text)

/** Sets config.toml in `project` to `text`, by `replace`, or removes it where undefined; the path and the backup's line where it changed. */
function configured(project: string, text: string | undefined): { paths: string[]; said: string[] } {
  const done = replace(project, join(project, CONFIG), text, toml)

  return { paths: done.changed ? [CONFIG] : [], said: done.backup ? [`${CONFIG} as it was is kept at ${done.backup}`] : [] }
}

/** Removes from config.toml the lines baba wrote, the file with them where nothing else is left. */
function closeNetwork(project: string): { paths: string[]; said: string[] } {
  const file = join(project, CONFIG)

  if (!existsSync(file)) return { paths: [], said: [] }

  const text = readFileSync(file, "utf8")
  const left = closed(text)

  return left === text ? { paths: [], said: [] } : configured(project, left)
}

/**
 * What a turn of a session is started with: the thread's first, or one resuming `thread`. The project is trusted for the
 * run with --trust, which writes it into the run's own CODEX_HOME, and its hooks run unreviewed with
 * --dangerously-bypass-hook-trust, for this invocation only (`codex exec --help`; learn.chatgpt.com/docs/hooks). As
 * Claude Code's run bypasses permissions, commands run unsandboxed in the project's copy. Codex sets no budget.
 */
export const codexArgs = ({ project, model }: Pick<Start, "project" | "model">, thread?: string): string[] => [
  "codex",
  "exec",
  ...(thread ? ["resume", thread] : []),
  ...["--json", "-m", model, "--trust", "--dangerously-bypass-hook-trust", "--dangerously-bypass-approvals-and-sandbox"],
  // resume takes no --cd: the thread keeps the directory it began in, which is the process's own.
  ...(thread ? [] : ["-C", project]),
  // The message is read from standard input.
  "-",
]

type O = { [key: string]: Json | undefined }
const o = (value: Json | undefined): O => (value && typeof value === "object" && !Array.isArray(value) ? value : {})
const s = (value: Json | undefined): string => (typeof value === "string" ? value : "")
const n = (value: Json | undefined): number => (typeof value === "number" ? value : 0)

/** A command as the agent wrote it: Codex runs each in a login shell, `/bin/zsh -lc '…'`. */
const unwrapped = (command: string): string => {
  const m = command.match(/^\S*\/(?:ba|z)?sh -l?c (?:(['"])([\s\S]*)\1|(\S+))$/)

  return m ? (m[2] ?? m[3]!) : command
}

/** The framework's events in one line of `codex exec --json`, as documented at learn.chatgpt.com/docs/non-interactive-mode. */
export function codexEvents(line: Json): HarnessEvent[] {
  const e = o(line)
  const item = o(e.item)
  const type = s(e.type)

  if (type === "item.started" && item.type === "command_execution") {
    const input = unwrapped(s(item.command))

    return [{ kind: "call", id: s(item.id), tool: "shell", input: redact(input), word: WORD.test(input) }]
  }
  if (type === "item.completed") {
    if (item.type === "command_execution") return [{ kind: "result", id: s(item.id), text: redact(s(item.aggregated_output)), ...(n(item.exit_code) !== 0 && { error: true }) }]
    if (item.type === "agent_message" && s(item.text)) return [{ kind: "reply", text: redact(s(item.text)) }]
    if (item.type === "reasoning" && s(item.text)) return [{ kind: "thinking", text: redact(s(item.text)) }]
    if (item.type === "file_change" || item.type === "mcp_tool_call" || item.type === "web_search") {
      const id = s(item.id)

      return [
        { kind: "call", id, tool: s(item.type), input: redact(JSON.stringify({ ...item, id: undefined, type: undefined })), word: false },
        { kind: "result", id, text: s(item.status) },
      ]
    }
  }

  return []
}

/** A turn's end in `codex exec --json`: its tokens, those read from the cache apart; undefined for any other line. */
export function codexTurn(line: Json, ms: number, calls: number): HarnessEvent | undefined {
  const e = o(line)
  const u = o(e.usage)
  const cached = n(u.cached_input_tokens)

  if (e.type === "turn.completed")
    return {
      kind: "turn",
      ok: true,
      text: "",
      tokens: { input: n(u.input_tokens) - cached, cache_write: n(u.cache_write_input_tokens), cache_read: cached, output: n(u.output_tokens) },
      total: 0,
      ms,
      calls,
    }
  if (e.type === "turn.failed" || e.type === "error") return { kind: "turn", ok: false, text: redact(s(o(e.error).message) || s(e.message) || s(e.type)), tokens: NONE, total: 0, ms, calls }

  return undefined
}

/**
 * What hooks added to the context, in lines of a session's file under CODEX_HOME/sessions. Codex's stream does not say
 * when a hook ran; its session file keeps what one added, as a developer message within a turn, where Codex writes its own
 * before the first. Which hook added it is told by where it stands: before the turn's message, the session's start;
 * after it, the message's own; after a tool's output, the tool's. A hook that added nothing leaves no trace here. The
 * file's format is not documented: it is read as codex-cli 0.169.0 writes it.
 */
export function codexInjected(lines: Json[]): HarnessEvent[] {
  const found: HarnessEvent[] = []
  let at: "out" | "start" | "message" | "tool" = "out"

  for (const line of lines) {
    const e = o(line)
    const p = o(e.payload)

    if (e.type === "turn_context") at = "start"
    else if (e.type === "event_msg" && p.type === "task_complete") at = "out"
    else if (at === "out" || e.type !== "response_item") continue
    else if (p.type === "message" && p.role === "user") at = "message"
    else if (p.type === "custom_tool_call_output" || p.type === "function_call_output") at = "tool"
    else if (p.type === "message" && p.role === "developer") {
      const text = (Array.isArray(p.content) ? p.content : []).map((c) => s(o(c).text)).join("\n")
      const event = at === "start" ? "SessionStart" : at === "message" ? "UserPromptSubmit" : "PostToolUse"

      if (text) found.push({ kind: "injected", event, text: redact(text) })
    }
  }

  return found
}

/** The session file of `thread` under `codexHome`, where Codex has written one. */
function sessionFile(codexHome: string, thread: string): string | undefined {
  const dir = join(codexHome, "sessions")

  if (!existsSync(dir)) return undefined

  const found = readdirSync(dir, { recursive: true, encoding: "utf8" }).find((path) => path.endsWith(`-${thread}.jsonl`))

  return found && join(dir, found)
}

const jsonLines = (text: string): Json[] =>
  text.split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line) as Json] : []
    } catch {
      return []
    }
  })

/** JSON lines from a byte stream, each as it comes; a line that is not JSON is passed over. */
async function* streamed(stream: ReadableStream<Uint8Array>): AsyncIterable<Json> {
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })

    const lines = buffer.split("\n")

    buffer = lines.pop() ?? ""
    yield* jsonLines(lines.join("\n"))
  }
  yield* jsonLines(buffer)
}

/**
 * Codex, with the person's home `own`: the one its login file is read from, by a link. Codex names its thread itself, so
 * a session's `session` is not its id: its hooks speak for the thread, whose id `started` reports.
 */
export function codexCli(own: string = homedir()): Harness {
  return {
    name: "codex",
    home(home) {
      const codexHome = join(home, ".codex")
      const from = join(own, ".codex/auth.json")
      const to = join(codexHome, "auth.json")

      mkdirSync(codexHome, { recursive: true })
      if (existsSync(from)) {
        // Codex writes its login through the link when it refreshes it, so the person's stays the one in use.
        if (!lstatSync(to, { throwIfNoEntry: false })) symlinkSync(realpathSync(from), to)

        return "the person's Codex login file, linked"
      }

      return cleanEnv().CODEX_API_KEY ? "CODEX_API_KEY, from the environment" : "none found: the session is not logged in"
    },
    release(home) {
      const codexHome = join(home, ".codex")

      // Only the link is taken back, never what it points at; the rest is Codex's state of the run and of the account, but its transcripts.
      if (!existsSync(codexHome)) return
      for (const entry of readdirSync(codexHome)) if (entry !== "sessions") rmSync(join(codexHome, entry), { recursive: true, force: true })
    },
    start: (options) => spawnCodex(options),
  }
}

function spawnCodex(options: Start): Session {
  const codexHome = join(options.home, ".codex")
  const env = { ...cleanEnv(), HOME: options.home, CODEX_HOME: codexHome }
  const queue: (HarnessEvent | undefined)[] = []
  const waiting: string[] = []
  let wake: (() => void) | undefined
  let thread: string | undefined
  let child: Bun.Subprocess<"pipe", "pipe", "pipe"> | undefined
  let read = 0
  let ended = false
  const push = (event: HarnessEvent | undefined) => {
    queue.push(event)
    wake?.()
  }

  /** One turn: a process of its own, its stream read as the framework's events, then what hooks added, from the session file. */
  async function turn(text: string) {
    const began = Date.now()
    let calls = 0
    let last: HarnessEvent | undefined

    const proc = Bun.spawn(codexArgs(options, thread), { cwd: options.project, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" })

    child = proc
    proc.stdin.write(text)
    proc.stdin.end()

    const stderr = new Response(proc.stderr).text()

    push({ kind: "message", text })
    for await (const line of streamed(proc.stdout)) {
      const e = o(line)

      if (e.type === "thread.started" && !thread) {
        thread = s(e.thread_id)
        push({ kind: "started", session: thread, loaded: { model: options.model, cwd: options.project, tools: [], skills: [], plugins: [], mcp: [], commands: [] } })
      }
      for (const event of codexEvents(line)) {
        if (event.kind === "call") calls++
        push(event)
      }
      last = codexTurn(line, Date.now() - began, calls) ?? last
    }

    const code = await proc.exited
    const file = thread && sessionFile(codexHome, thread)

    if (file) {
      const lines = jsonLines(readFileSync(file, "utf8"))

      codexInjected(lines.slice(read)).forEach(push)
      read = lines.length
    }
    child = undefined
    push(last ?? { kind: "turn", ok: false, text: redact((await stderr).trim().split("\n").at(-1) ?? `exit code ${code}`), tokens: NONE, total: 0, ms: Date.now() - began, calls })
  }

  async function next() {
    while (waiting.length && !ended) await turn(waiting.shift()!)
  }

  return {
    events: (async function* () {
      for (;;) {
        if (!queue.length) await new Promise<void>((done) => (wake = done))

        const event = queue.shift()

        if (event === undefined) return
        yield event
      }
    })(),
    // A message to a turn that runs waits for it, and starts the next.
    say(text) {
      waiting.push(text)
      if (waiting.length === 1 && !child) void next()
    },
    stop: () => void child?.kill("SIGINT"),
    async end() {
      if (ended) return
      ended = true
      waiting.length = 0
      child?.kill()
      await child?.exited
      push({ kind: "ended", code: 143, stderr: "" })
      push(undefined)
    },
  }
}

export const codex: Adapter<CodexOptions> = {
  name: "codex",
  title: "Codex",
  skill: METHOD.skill,
  defaults: { events: [...CODEX_EVENTS], network: false },
  events: CODEX_EVENTS,
  installed: (project, events) => installedHooks(join(project, METHOD.hooks), METHOD.name, events),
  provision(project, options): SetUp {
    const set = install(project, METHOD)
    const paths = [...set.paths]
    const said = set.said ? [set.said] : []

    if (paths.includes(METHOD.hooks)) said.push(
      "Codex asks you to review these hooks once: run `bun run baba start --setup` in .baba/ for the Settings link, or open /hooks in Codex.",
    )
    if (options.network) {
      const file = join(project, CONFIG)
      const now = opened(existsSync(file) ? readFileSync(file, "utf8") : "")
      const done = configured(project, now.text)

      paths.push(...done.paths)
      said.push(...(now.said ? [now.said] : []), ...done.said)
    } else {
      const done = closeNetwork(project)

      paths.push(...done.paths)
      said.push(...done.said)
    }

    return { paths, ...(said.length && { said: said.join("\n") }) }
  },
  withdraw(project, keep): SetUp {
    const set = uninstall(project, METHOD, keep)
    const done = closeNetwork(project)
    const said = [...(set.said ? [set.said] : []), ...done.said]

    return { paths: [...set.paths, ...done.paths], ...(said.length && { said: said.join("\n") }) }
  },
  hookEvent(input): HookEvent | undefined {
    const i = obj(input as Json)
    const event = typeof i.hook_event_name === "string" ? i.hook_event_name : ""
    const moment = (event === "Interrupt" ? "Stop" : (CODEX_EVENTS as readonly string[]).includes(event) ? event : undefined) as Moment | undefined
    const session = typeof i.session_id === "string" && i.session_id ? i.session_id : undefined

    return moment && { session, event, moment, ...sourceOf(event, i.source) }
  },
  // As Claude Code's: plain text adds context at a session's start and with a prompt, and after a tool call only JSON does.
  hookOutput: postToolUse,
  run: () => codexCli(),
}
