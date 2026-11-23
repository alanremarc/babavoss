// Antigravity's adapter. Set up: baba's skill in .agents/skills/baba (shared with Codex) and baba's hooks under the named
// entry "babavoss" in .agents/hooks.json, among the person's own named hooks, through setup.ts's backup and atomic write
// checks. Hooks: Antigravity's camelCase JSON input and JSON output (`injectSteps` with `systemMessage`, or `{}` when
// nothing is added). Because Antigravity's PostToolUse returns `{}` and cannot inject context, PreInvocation carries both
// turn-start updates (invocationNum === 0) and mid-turn notices (invocationNum > 0). Run: one long-lived headless `agy`
// process per session (`--input-format stream-json --output-format stream-json`), in a home of its own, its login reached
// from the person's by a link (macOS keychain, Linux keyring, ADC) or GEMINI_API_KEY, and nothing of the account's handed on.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Json } from "../surface/view.ts"
import { cleanEnv, jsonLines, redact, scrub, sessionEnv, WORD } from "./claude.ts"
import { NONE, type Adapter, type Harness, type HarnessEvent, type HookEvent, type Keep, type Loaded, type Moment, type Session, type SetUp, type Start, type Tokens } from "./harness.ts"
import {
  backedUp,
  BIN,
  hookCommand,
  installSkill,
  isObject,
  isOurs,
  readJson,
  replace,
  same,
  uninstallSkill,
  Unsafe,
  writeJson,
  type Replaced,
} from "./setup.ts"

/** Antigravity's hook events the framework is told at: PreInvocation carries both a message's start and mid-turn notices. */
export const ANTIGRAVITY_EVENTS = ["SessionStart", "PreInvocation", "Stop"] as const
export type AntigravityOptions = { events: (typeof ANTIGRAVITY_EVENTS)[number][] }

const SKILL = ".agents/skills/baba"
const HOOKS_FILE = ".agents/hooks.json"
const HOOK_NAME = "babavoss"
const SKILL_METHOD = { skill: SKILL }

type O = { [key: string]: Json | undefined }
const obj = (value: Json | undefined): O => (value && typeof value === "object" && !Array.isArray(value) ? value : {})
const str = (value: Json | undefined): string => (typeof value === "string" ? value : "")
const num = (value: Json | undefined): number => (typeof value === "number" ? value : 0)
const list = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : [])
const names = (value: Json | undefined): string[] => list(value).map((v) => str(v) || str(obj(v).name)).filter(Boolean)

type Handler = { type?: string; command?: string; timeout?: number } & Record<string, unknown>

/** Strips baba's handlers from one Antigravity hook event's list, flat (SessionStart/PreInvocation/Stop) or grouped (PreToolUse/PostToolUse). */
function stripEvent(entries: unknown[]): { left: unknown[]; had: boolean } {
  let had = false
  const left = entries.flatMap((entry) => {
    if (isOurs(entry)) {
      had = true

      return []
    }
    if (isObject(entry) && Array.isArray(entry.hooks) && entry.hooks.some(isOurs)) {
      had = true

      const hooks = entry.hooks.filter((handler) => !isOurs(handler))

      return hooks.length ? [{ ...entry, hooks }] : []
    }

    return [entry]
  })

  return { left, had }
}

/** An Antigravity hooks.json object without baba's handlers; a named hook holding nothing else goes with them. */
export function withoutAntigravity(value: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}

  for (const [name, def] of Object.entries(value)) {
    if (!isObject(def)) {
      kept[name] = def
      continue
    }

    let had = false
    const next: Record<string, unknown> = {}

    for (const [key, entries] of Object.entries(def)) {
      if (!Array.isArray(entries)) {
        next[key] = entries
        continue
      }

      const stripped = stripEvent(entries)

      if (stripped.had) had = true
      if (stripped.left.length) next[key] = stripped.left
    }

    const eventsLeft = Object.keys(next).some((key) => key !== "enabled")

    if (!had) kept[name] = def
    else if (eventsLeft) kept[name] = next
  }

  return kept
}

/**
 * Sets baba's hooks under `"babavoss"` in Antigravity's `.agents/hooks.json`, or removes them where `ours` is undefined.
 * Leaves every other named hook and handler untouched, proves it before writing, and writes atomically with a backup.
 */
export function editAntigravityHooks(project: string, file: string, ours: Record<string, Handler[]> | undefined, now?: Date): Replaced {
  const there = existsSync(file)

  if (!there && !ours) return { changed: false }

  const text = there ? readFileSync(file, "utf8") : ""

  if (!ours && !text.includes(BIN)) return { changed: false }

  const { value, ...form } = readJson(file, text)
  const wrong = (what: string): never => {
    throw new Unsafe(`${file} ${what}: correct it and provision again; nothing was changed`)
  }

  if (value[HOOK_NAME] !== undefined) {
    if (!isObject(value[HOOK_NAME])) wrong(`has "${HOOK_NAME}" that is not an object`)
    for (const [event, entries] of Object.entries(value[HOOK_NAME] as Record<string, unknown>))
      if (event !== "enabled" && !Array.isArray(entries)) wrong(`has "${HOOK_NAME}.${event}" that is not a list`)
  }

  const next = withoutAntigravity(value)

  if (ours) {
    const existing = isObject(next[HOOK_NAME]) ? { ...(next[HOOK_NAME] as Record<string, unknown>) } : {}

    for (const [event, handlers] of Object.entries(ours)) existing[event] = [...(Array.isArray(existing[event]) ? existing[event] : []), ...handlers]
    next[HOOK_NAME] = existing
  }

  if (!same(withoutAntigravity(next), withoutAntigravity(value))) throw new Error(`${file}: the change would touch what is not baba's; nothing was changed`)
  if (there && same(next, value)) return { changed: false }

  const check = (landed: string) => {
    if (!same(readJson(file, landed).value, next)) throw new Error(`${file}: what was written does not read back as it was meant`)
  }

  return replace(project, file, !ours && !Object.keys(next).length ? undefined : writeJson(form, next), check, now)
}

/** Cumulative counters from `agy --output-format stream-json`, so each turn's `result` diffs against the last. */
export type StreamState = {
  model: string
  buffers: Map<number, string>
  seenTools: Set<string>
  turnCalls: number
  prevTokens: Tokens
  prevMs: number
}

export const streamState = (model = ""): StreamState => ({
  model,
  buffers: new Map(),
  seenTools: new Set(),
  turnCalls: 0,
  prevTokens: { ...NONE },
  prevMs: 0,
})

const usageOf = (value: Json | undefined): Tokens => {
  const u = obj(value)

  return {
    input: num(u.input_tokens),
    cache_write: num(u.cache_write_tokens),
    cache_read: num(u.cache_read_tokens),
    output: num(u.output_tokens),
  }
}

/**
 * The framework's events in one line of `agy --output-format stream-json`, with `state` holding the streaming reply
 * buffers and cumulative turn counters. Account identifiers and addresses are scrubbed before anything is returned.
 */
export function antigravityEvents(line: Json, state: StreamState = streamState()): HarnessEvent[] {
  const e = obj(scrub(line))
  const event = str(e.event)

  if (event === "init") {
    const init = obj(e.init)
    const loaded: Loaded = {
      model: str(init.model) || state.model,
      cwd: str(init.cwd),
      tools: names(init.tools),
      skills: [],
      plugins: [],
      mcp: [],
      commands: [],
    }

    return [{ kind: "started", session: str(e.conversation_id), loaded }]
  }
  if (event === "step_update") {
    const u = obj(e.step_update)
    const index = num(u.step_index)
    const step = str(u.step_type)
    const status = str(u.state)

    if (step === "agent_response") {
      const text = (state.buffers.get(index) ?? "") + str(u.text_delta)

      if (status !== "DONE") {
        state.buffers.set(index, text)

        return []
      }
      state.buffers.delete(index)

      return text ? [{ kind: "reply", text }] : []
    }
    if (step === "tool") {
      const info = obj(u.tool_info)
      const tool = str(info.name) || str(u.tool_name)
      const id = `step-${index}`
      const found: HarnessEvent[] = []

      if (tool && !state.seenTools.has(id)) {
        const params = obj(info.parameters)
        const input = tool === "run_command" ? str(params.CommandLine) : JSON.stringify(params)

        state.seenTools.add(id)
        state.turnCalls++
        found.push({ kind: "call", id, tool, input, word: tool === "run_command" && WORD.test(input) })
      }
      if (status === "DONE") {
        const err = obj(info.error)
        const failed = !!(str(err.type) || str(err.message))
        const text = failed ? [str(err.type), str(err.message)].filter(Boolean).join(": ") : str(info.output)

        found.push({ kind: "result", id, text, ...(failed && { error: true }) })
      }

      return found
    }

    return []
  }
  if (event === "result") {
    const r = obj(e.result)
    const status = str(r.status)
    const ok = status === "SUCCESS"
    const totalUsage = usageOf(r.usage)
    const totalMs = Math.round(num(r.duration_seconds) * 1000)
    const tokens: Tokens = {
      input: Math.max(0, totalUsage.input - state.prevTokens.input),
      cache_write: Math.max(0, totalUsage.cache_write - state.prevTokens.cache_write),
      cache_read: Math.max(0, totalUsage.cache_read - state.prevTokens.cache_read),
      output: Math.max(0, totalUsage.output - state.prevTokens.output),
    }
    const ms = Math.max(0, totalMs - state.prevMs)
    const calls = state.turnCalls

    state.prevTokens = totalUsage
    state.prevMs = totalMs
    state.turnCalls = 0
    state.buffers.clear()

    return [
      {
        kind: "turn",
        ok,
        text: ok ? "" : [status, str(r.error)].filter(Boolean).join(": "),
        tokens,
        total: 0,
        ms,
        calls,
      },
    ]
  }

  return []
}

/**
 * What a headless session is started with: persistent NDJSON stdin/stdout, permissions bypassed, and session-only settings
 * trusting the project and keeping the terminal sandbox off so baba's command reaches its loopback runtime.
 */
export const antigravityArgs = ({ project, model }: Pick<Start, "project" | "model">, settings: Record<string, unknown> = {}): string[] => [
  "agy",
  ...["--input-format", "stream-json", "--output-format", "stream-json"],
  ...(model ? ["--model", model] : []),
  "--dangerously-skip-permissions",
  ...["--settings", JSON.stringify({ trustedWorkspaces: [project], enableTerminalSandbox: false, toolPermission: "always-proceed", ...settings })],
]

/** Where the login is in the person's home, and where its link goes in a session's: macOS uses the login keychain, Linux the keyring. */
const LOGINS = [
  { path: "Library/Keychains", how: "the person's login keychain, linked", platform: "darwin" as const },
  { path: ".local/share/keyrings", how: "the person's keyring, linked", platform: "linux" as const },
]
const ADC = ".config/gcloud/application_default_credentials.json"

const link = (from: string, to: string) => {
  mkdirSync(dirname(to), { recursive: true })
  if (!lstatSync(to, { throwIfNoEntry: false })) symlinkSync(realpathSync(from), to)
}

/** Antigravity CLI (`agy`), with the person's home `own`: the one its login is reached from, by a link and never a copy. */
export function antigravityCli(own: string = homedir(), platform: NodeJS.Platform = process.platform): Harness {
  const linkable = LOGINS.filter((login) => login.platform === platform)

  return {
    name: "antigravity",
    home(home) {
      const cli = join(home, ".gemini/antigravity-cli")

      mkdirSync(cli, { recursive: true })
      if (cleanEnv().AGY_ADC_AUTH === "true") {
        const from = join(own, ADC)

        if (existsSync(from)) link(from, join(home, ADC))

        return "AGY_ADC_AUTH, from the environment"
      }
      for (const login of linkable) {
        const from = join(own, login.path)

        if (!existsSync(from)) continue
        link(from, join(home, login.path))

        return login.how
      }
      if (cleanEnv().GEMINI_API_KEY) {
        writeFileSync(join(cli, "settings.json"), `${JSON.stringify({ modelProvider: "gemini" }, null, 2)}\n`)

        return "GEMINI_API_KEY, from the environment"
      }

      return "none found: the session is not logged in"
    },
    release(home) {
      for (const path of [...LOGINS.map((l) => l.path), ADC]) {
        const at = join(home, path)

        // Only a link is taken back, never what it points at.
        if (lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(at)
      }

      const cli = join(home, ".gemini/antigravity-cli")

      // Keep brain/ transcripts; take back caches, settings and account state.
      if (!existsSync(cli)) return
      for (const entry of readdirSync(cli)) if (entry !== "brain") rmSync(join(cli, entry), { recursive: true, force: true })
    },
    start: (options) => spawnAntigravity(options),
  }
}

function spawnAntigravity(options: Start): Session {
  const project = existsSync(options.project) ? realpathSync(options.project) : options.project
  const settingsFile = join(options.home, ".gemini/antigravity-cli/settings.json")
  let extra: Record<string, unknown> = {}

  try {
    if (existsSync(settingsFile)) extra = JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>
  } catch {}

  const env = { ...sessionEnv(options.home), GEMINI_HOME: join(options.home, ".gemini") }
  const child = Bun.spawn(antigravityArgs({ project, model: options.model }, extra), {
    cwd: options.project,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stderr = new Response(child.stderr).text()
  const state = streamState(options.model)
  const queue: (HarnessEvent | undefined)[] = []
  let wake: (() => void) | undefined
  const push = (event: HarnessEvent | undefined) => {
    queue.push(event)
    wake?.()
  }

  void (async () => {
    for await (const line of jsonLines(child.stdout)) for (const event of antigravityEvents(line, state)) push(event)
    push({ kind: "ended", code: await child.exited, stderr: redact((await stderr).trim()) })
    push(undefined)
  })()

  return {
    events: (async function* () {
      for (;;) {
        if (!queue.length) await new Promise<void>((done) => (wake = done))

        const event = queue.shift()

        if (event === undefined) return
        yield event
      }
    })(),
    say(text) {
      push({ kind: "message", text })
      child.stdin.write(`${JSON.stringify({ event: "user", message: { content: text } })}\n`)
      child.stdin.flush()
    },
    stop: () => void child.kill("SIGINT"),
    async end() {
      try {
        child.stdin.end()
      } catch {}
      child.kill()
      await child.exited
    },
  }
}

/** Infers the Antigravity hook event name from the payload when `hookEventName` is absent. */
function inferEvent(i: O): string {
  const named = str(i.hookEventName)

  if (named) return named
  if (typeof i.executionNum === "number" || typeof i.terminationReason === "string") return "Stop"
  if (typeof i.invocationNum === "number") return "PreInvocation"
  if (i.toolCall !== undefined) return "PostToolUse"
  if (str(i.conversationId)) return "SessionStart"

  return ""
}

export const antigravity: Adapter<AntigravityOptions> = {
  name: "antigravity",
  title: "Antigravity",
  skill: SKILL,
  defaults: { events: [...ANTIGRAVITY_EVENTS] },
  events: ANTIGRAVITY_EVENTS,
  provision(project): SetUp {
    const paths = installSkill(project, SKILL_METHOD)
    const command = hookCommand("antigravity")
    const ours = Object.fromEntries(ANTIGRAVITY_EVENTS.map((event) => [event, [{ type: "command", command }]]))
    const done = editAntigravityHooks(project, join(project, HOOKS_FILE), ours)

    if (done.changed) paths.push(HOOKS_FILE)

    const said = backedUp(HOOKS_FILE, done)

    return { paths, ...(said.length && { said: said.join("\n") }) }
  },
  withdraw(project, keep?: Keep): SetUp {
    const paths = uninstallSkill(project, SKILL_METHOD, keep)
    const done = editAntigravityHooks(project, join(project, HOOKS_FILE), undefined)

    if (done.changed) paths.push(HOOKS_FILE)

    const said = backedUp(HOOKS_FILE, done)

    return { paths, ...(said.length && { said: said.join("\n") }) }
  },
  hookEvent(input): HookEvent | undefined {
    const i = obj(input as Json)
    const event = inferEvent(i)

    if (!(ANTIGRAVITY_EVENTS as readonly string[]).includes(event)) return undefined

    const moment: Moment = event === "PreInvocation" ? (num(i.invocationNum) === 0 ? "UserPromptSubmit" : "PostToolUse") : (event as Moment)
    const session = str(i.conversationId) || undefined
    const cwd = str(i.cwd) || (Array.isArray(i.workspacePaths) ? str(i.workspacePaths[0]) : "") || undefined

    return { session, event, moment, ...(cwd && { cwd }) }
  },
  hookOutput: (_event, context) => JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: context } }] }),
  hookEmpty: "{}",
  run: () => antigravityCli(),
}
