// Claude Code as a harness: one long-lived headless process per session, spoken to and read as JSON lines, in a home of
// its own, so its transcripts, settings and caches land there and the person's own are neither read nor written. Its
// login is the person's: on macOS the login keychain, linked into the home; elsewhere the credentials file, linked; or a
// token or key the environment already carries. `claudeEvents` reads one line of its stream, a pure function, and hands on
// nothing of the account's: no account, organisation or user id, and no address, whatever field or text carries one.
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Json } from "../surface/view.ts"
import type { Harness, HarnessEvent, Loaded, Request, Session, Start, Tokens } from "./harness.ts"

/** A Bash command that is the root's word: the command a project's root names for itself, or `bun run baba`. */
export const WORD = /(^|[\s;&|(/])(\.babavoss\/bin\/(baba|bv)|bv)(\s|$)|\bbun run baba\b/

type O = { [key: string]: Json | undefined }
const obj = (value: Json | undefined): O => (value && typeof value === "object" && !Array.isArray(value) ? value : {})
const str = (value: Json | undefined): string => (typeof value === "string" ? value : "")
const num = (value: Json | undefined): number => (typeof value === "number" ? value : 0)
const list = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : [])
const names = (value: Json | undefined): string[] => list(value).map((v) => str(v) || str(obj(v).name)).filter(Boolean)

/** What a tool result or message carries, as text. */
const flat = (content: Json | undefined): string =>
  typeof content === "string" ? content : list(content).map((c) => (obj(c).type === "text" ? str(obj(c).text) : JSON.stringify(c))).join("\n")
/** What a hook added to the context: plain text, or the `additionalContext` of the JSON it printed. */
const injected = (stdout: string): string => {
  const text = stdout.trim()

  try {
    return str(obj(obj(JSON.parse(text) as Json).hookSpecificOutput).additionalContext) || text
  } catch {
    return text
  }
}
export const tokensOf = (usage: Json | undefined): Tokens => {
  const u = obj(usage)

  return {
    input: num(u.input_tokens),
    cache_write: num(u.cache_creation_input_tokens),
    cache_read: num(u.cache_read_input_tokens),
    output: num(u.output_tokens),
  }
}

/** A field that names who the session's account is: an account, organisation or user, by id, name or address. */
const WHOSE = /account|organi[sz]ation|email|^(org|user)([_-]?(id|uuid|name))?$|^user[_-]?(id|uuid|name)$|^userID$/i
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
/** An id said in text after what it is of: `organization 1234…`, `account_uuid: "…"`, `org_id=…`. */
const NAMED = new RegExp(`\\b(account|organi[sz]ation|org|user)([ _-]?(id|uuid))?(["']?\\s*[:=]?\\s*["']?)(${UUID}|[0-9a-f]{16,}|[\\w-]*\\d[\\w-]{11,})`, "gi")
export const REDACTED = "<redacted>"

/** Text with no address and no account's id in it. */
export const redact = (text: string): string => text.replace(EMAIL, REDACTED).replace(NAMED, `$1$2$4${REDACTED}`)
/** A line of the stream with no field that names the account, and no address or account's id in any text. */
const scrub = (value: Json): Json => {
  if (typeof value === "string") return redact(value)
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(Object.entries(value).flatMap(([key, v]) => (WHOSE.test(key) || v === undefined ? [] : [[key, scrub(v)]])))
}

/** The framework's events in one line of Claude Code's stream; a line of no meaning to it, or a subagent's, has none. */
export function claudeEvents(line: Json): HarnessEvent[] {
  const e = obj(scrub(line))
  const type = str(e.type)
  const subtype = str(e.subtype)

  if (type === "system" && subtype === "init") {
    const loaded: Loaded = {
      model: str(e.model),
      cwd: str(e.cwd),
      tools: names(e.tools),
      skills: names(e.skills),
      plugins: names(e.plugins),
      mcp: names(e.mcp_servers),
      commands: names(e.slash_commands),
    }

    return [{ kind: "started", session: str(e.session_id), loaded }]
  }
  if (type === "system" && subtype === "hook_response") {
    const text = injected(str(e.stdout))

    return text ? [{ kind: "injected", event: str(e.hook_event) || str(e.hook_name), text, ...(num(e.exit_code) !== 0 && { error: true }) }] : []
  }
  if (type === "user" && e.parent_tool_use_id == null) {
    const message = obj(e.message)
    const blocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : list(message.content)

    return blocks.flatMap((block): HarnessEvent[] => {
      const b = obj(block)

      if (b.type === "text") return [{ kind: "message", text: str(b.text) }]
      if (b.type === "tool_result") return [{ kind: "result", id: str(b.tool_use_id), text: flat(b.content), ...(b.is_error === true && { error: true }) }]

      return []
    })
  }
  if (type === "assistant" && e.parent_tool_use_id == null) {
    const message = obj(e.message)
    const u = tokensOf(message.usage)
    const request: Request | undefined = str(message.id) ? { id: str(message.id), context: u.input + u.cache_write + u.cache_read } : undefined
    const at = request ? { request } : {}

    return list(message.content).flatMap((block): HarnessEvent[] => {
      const b = obj(block)

      if (b.type === "text" && str(b.text)) return [{ kind: "reply", text: str(b.text), ...at }]
      if (b.type === "thinking" && str(b.thinking)) return [{ kind: "thinking", text: str(b.thinking), ...at }]
      if (b.type === "tool_use") {
        const tool = str(b.name)
        const input = tool === "Bash" ? str(obj(b.input).command) : JSON.stringify(b.input ?? {})

        return [{ kind: "call", id: str(b.id), tool, input, word: tool === "Bash" && WORD.test(input), ...at }]
      }

      return []
    })
  }
  if (type === "result") {
    const ok = subtype === "success" && e.is_error !== true

    // The result repeats the last reply, which came before it: a turn's text is only what went wrong.
    return [
      {
        kind: "turn",
        ok,
        text: ok ? "" : [subtype, str(e.result)].filter(Boolean).join(": "),
        tokens: tokensOf(e.usage),
        total: num(e.total_cost_usd),
        ms: num(e.duration_ms),
        calls: num(e.num_turns),
      },
    ]
  }

  return []
}

/** The environment of a session: none of the caller's own harness identity, or the child takes it for its own. */
const OWN = /^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_AGENT_SDK|CLAUDE_EFFORT|CLAUDE_CONFIG_DIR|AI_AGENT|BABAVOSS_|CODEX_)/
/** What of it stays: a token the person set up for headless use. */
const KEPT = ["CLAUDE_CODE_OAUTH_TOKEN"]
const kept = (entry: [string, string | undefined]): entry is [string, string] => entry[1] !== undefined && (KEPT.includes(entry[0]) || !OWN.test(entry[0]))
export const cleanEnv = (env: NodeJS.ProcessEnv = process.env): Record<string, string> => Object.fromEntries(Object.entries(env).filter(kept))
/** The environment of a session in `home`. */
export const sessionEnv = (home: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> => ({ ...cleanEnv(env), HOME: home })

/**
 * What Claude Code keeps in a home beside the transcripts, of no use once the session has ended: its live processes, keys
 * among them, and its state with the account's profile, and that state's backups.
 */
const KEPT_BY_IT = [".claude/sessions", ".claude.json", ".claude/backups"]
/** Where the login is in the person's home, and where its link goes in a session's: macOS keeps it in the login keychain. */
const LOGINS = [
  { path: "Library/Keychains", how: "the person's login keychain, linked", darwin: true },
  { path: ".claude/.credentials.json", how: "the person's credentials file, linked", darwin: false },
]

/** Claude Code, with the person's home `own`: the one the login is read from. */
export function claudeCode(own: string = homedir(), platform: NodeJS.Platform = process.platform): Harness {
  const linkable = LOGINS.filter((login) => login.darwin === (platform === "darwin"))

  return {
    name: "claude",
    home(home) {
      mkdirSync(home, { recursive: true })
      if (cleanEnv().CLAUDE_CODE_OAUTH_TOKEN) return "CLAUDE_CODE_OAUTH_TOKEN, from the environment"
      for (const login of linkable) {
        const from = join(own, login.path)
        const to = join(home, login.path)

        if (!existsSync(from)) continue
        mkdirSync(dirname(to), { recursive: true })
        if (!existsSync(to)) symlinkSync(realpathSync(from), to)

        return login.how
      }

      return process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY, from the environment" : "none found: the session is not logged in"
    },
    release(home) {
      for (const path of KEPT_BY_IT) rmSync(join(home, path), { recursive: true, force: true })
      for (const login of LOGINS) {
        const link = join(home, login.path)

        // Only a link is taken back, never what it points at.
        if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(link)
      }
    },
    start: (options) => spawnClaude(options),
  }
}

/** JSON lines from a byte stream; a line that is not JSON is passed over. */
async function* jsonLines(stream: ReadableStream<Uint8Array>): AsyncIterable<Json> {
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })

    let nl: number

    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()

      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        yield JSON.parse(line) as Json
      } catch {}
    }
  }
}

function spawnClaude({ project, home, session, model, budget = 0.5 }: Start): Session {
  const child = Bun.spawn(
    [
      "claude",
      "-p",
      ...["--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-hook-events", "--replay-user-messages"],
      ...["--session-id", session, "--model", model, "--permission-mode", "bypassPermissions", "--max-budget-usd", String(budget)],
      // The home is the session's own; these keep the person's user layer out even where it is not.
      ...["--setting-sources", "project,local", "--strict-mcp-config"],
    ],
    { cwd: project, env: sessionEnv(home), stdin: "pipe", stdout: "pipe", stderr: "pipe" }
  )
  const stderr = new Response(child.stderr).text()
  const write = (line: Json) => {
    child.stdin.write(`${JSON.stringify(line)}\n`)
    child.stdin.flush()
  }

  return {
    events: (async function* () {
      for await (const line of jsonLines(child.stdout)) yield* claudeEvents(line)

      yield { kind: "ended", code: await child.exited, stderr: redact((await stderr).trim()) } satisfies HarnessEvent
    })(),
    say: (text) => write({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, session_id: session }),
    stop: () => write({ type: "control_request", request_id: `stop-${Date.now()}`, request: { subtype: "interrupt" } }),
    async end() {
      child.kill()
      await child.exited
    },
  }
}
