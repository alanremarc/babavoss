// Claude Code's adapter. Set up: a project-level plugin, the package's plugin/claude/, which is the skill baba and the
// framework's hook for each event; the project gets one link to it, .claude/skills/baba, which Claude Code loads in place
// in a trusted folder, and older provisioning's hooks are taken out of .claude/settings.json; an organisation's managed
// settings that keep the plugin or its hook from running are read, where they can be, and said. Hooks: Claude Code's input
// and output, whose names the framework's moments are. Run: one long-lived headless process per session, spoken to and
// read as JSON lines, in a home of its own, so its transcripts, settings and caches land there and the person's own are
// neither read nor written. A plugin in .claude/skills loads only in a folder trusted in that home, which `-p` does not
// count; so the run loads the project's plugin by --plugin-dir, for that session only, whatever the trust says, and the
// project is trusted in the home besides, so its own settings apply as in the person's session. Its login is the person's:
// on macOS the login keychain, linked into the home; elsewhere the credentials file, linked; or a token or key the
// environment already carries. `claudeEvents` reads one line of its stream, a pure function, and hands on nothing of the
// account's: no account, organisation or user id, and no address, whatever field or text carries one.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import type { Json } from "../surface/view.ts"
import { sourceOf, type Adapter, type Harness, type HarnessEvent, type HookEvent, type Loaded, type Moment, type Request, type Session, type SetUp, type Start, type Tokens } from "./harness.ts"
import { editJson, pruned, withHooks, without, type Hooks } from "./setup.ts"

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

    const event = str(e.hook_event) || str(e.hook_name)

    // A hook that ran and added nothing is heard all the same.
    return [text ? { kind: "injected", event, text, ...(num(e.exit_code) !== 0 && { error: true }) } : { kind: "hook", event }]
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

/**
 * Marks `project` trusted in the session's `home`, as the person's own session of it is, so the project's own settings
 * apply as there. Claude Code asks it of a git worktree's main checkout, so that is marked too.
 */
export function trust(home: string, project: string) {
  const file = join(home, ".claude.json")
  let state: { projects?: Record<string, Record<string, unknown>> } & Record<string, unknown> = {}

  try {
    state = JSON.parse(readFileSync(file, "utf8")) as typeof state
  } catch {}

  const git = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: project, stdout: "pipe", stderr: "ignore" })
  const common = git.exitCode === 0 ? git.stdout.toString().trim() : ""
  const main = basename(common) === ".git" ? [realpathSync(dirname(common))] : []

  for (const at of new Set([realpathSync(project), ...main])) state.projects = { ...state.projects, [at]: { ...state.projects?.[at], hasTrustDialogAccepted: true } }
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * What a session is started with. Its hooks run however the project is trusted: the project's plugin, its link at
 * .claude/skills/baba, is loaded for the session only with --plugin-dir, which goes before a plugin of the same name in
 * .claude/skills; the stream carries each hook's run. The home is the session's own, and the person's user layer of
 * settings and MCP servers is kept out even where it is not.
 */
export const claudeArgs = ({ project, session, model, budget = 0.5 }: Start): string[] => [
  "claude",
  "-p",
  ...["--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-hook-events", "--replay-user-messages"],
  ...["--session-id", session, "--model", model, "--permission-mode", "bypassPermissions", "--max-budget-usd", String(budget)],
  ...["--plugin-dir", join(project, PLUGIN_LINK)],
  ...["--setting-sources", "project,local", "--strict-mcp-config"],
]

function spawnClaude(options: Start): Session {
  const { project, home, session } = options

  trust(home, project)

  const child = Bun.spawn(claudeArgs(options), { cwd: project, env: sessionEnv(home), stdin: "pipe", stdout: "pipe", stderr: "pipe" })
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

/** Claude Code's hook events the framework is told at; an API error ends a turn as a stop does. */
export const CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "StopFailure", "SessionEnd"] as const
export type ClaudeOptions = { events: (typeof CLAUDE_EVENTS)[number][] }

/** The plugin the package carries, and where a project links it. */
export const PLUGIN = fileURLToPath(new URL("../../../plugin/claude", import.meta.url))
export const PLUGIN_LINK = ".claude/skills/baba"
/** Claude Code's settings beside .baba/: the person's, where older provisioning wrote the framework's hooks. */
const SETTINGS = ".claude/settings.json"
const PLUGIN_FILES = ["SKILL.md", "reminder.md", ".claude-plugin", "hooks"]

/** Whether the skill folder at `link` is baba's: a link to a babavoss plugin, or a folder of baba's files alone whose skill is baba. */
function ours(link: string): boolean {
  const stat = lstatSync(link, { throwIfNoEntry: false })

  if (!stat) return false
  if (stat.isSymbolicLink()) return /babavoss[/\\]plugin[/\\]claude$/.test(readlinkSync(link))
  if (!stat.isDirectory() || readdirSync(link).some((entry) => !PLUGIN_FILES.includes(entry))) return false
  try {
    return /^---\n[\s\S]*?^name: baba$/m.test(readFileSync(join(link, "SKILL.md"), "utf8"))
  } catch {
    return false
  }
}

/** The plugin's id in Claude Code: its manifest's name, loaded from a skills folder. */
export const PLUGIN_ID = "baba@skills-dir"

/**
 * Where Claude Code reads an organisation's managed settings on this machine, as its documents say, highest first: the
 * MDM profile, on macOS, then the system directory's managed-settings.json with managed-settings.d/*.json merged after it.
 * BABAVOSS_MANAGED stands for the system directory, and leaves the profile out, so a spec reads its own and never the machine's.
 */
export function managedAt(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): { profiles: string[]; dir?: string } {
  if (env.BABAVOSS_MANAGED !== undefined) return { profiles: [], dir: env.BABAVOSS_MANAGED || undefined }
  if (platform === "darwin") {
    const domain = "com.anthropic.claudecode.plist"
    const user = env.USER ? [join("/Library/Managed Preferences", env.USER, domain)] : []

    return { profiles: [join("/Library/Managed Preferences", domain), ...user], dir: "/Library/Application Support/ClaudeCode" }
  }

  return { profiles: [], dir: platform === "win32" ? "C:\\Program Files\\ClaudeCode" : platform === "linux" ? "/etc/claude-code" : undefined }
}

/** Two documents merged as Claude Code merges its drop-ins: lists joined, objects key by key, any other value the later's. */
const merged = (a: O, b: O): O =>
  Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => {
      const [x, y] = [a[key], b[key]]

      if (y === undefined) return [key, x]
      if (Array.isArray(x) && Array.isArray(y)) return [key, [...x, ...y]]
      if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) return [key, merged(x, y)]

      return [key, y]
    })
  )
const readObject = (text: string): O | undefined => {
  try {
    const value = JSON.parse(text) as Json

    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}
/** The keys that say how managed sources combine, and set no policy themselves. */
const CONTROL = ["managedSourcesBehavior", "parentSettingsBehavior"]
const policyIn = (value: O | undefined): value is O => !!value && Object.keys(value).some((key) => !CONTROL.includes(key))

/**
 * The managed policy Claude Code applies on this machine, as far as it can be read without changing anything, and where
 * it was read: the first source that sets a policy, or each, merged, where the first says "merge". The settings an
 * organisation's console delivers are read by Claude Code from its servers, and the registry on Windows, are not read here.
 */
export function managedPolicy(at = managedAt()): { from: string; policy: O } | undefined {
  const sources: { from: string; policy: O }[] = []

  for (const profile of at.profiles) {
    if (!existsSync(profile)) continue

    const read = Bun.spawnSync(["plutil", "-convert", "json", "-o", "-", profile], { stdout: "pipe", stderr: "ignore" })
    const policy = read.exitCode === 0 ? readObject(read.stdout.toString()) : undefined

    if (policyIn(policy)) sources.push({ from: profile, policy })
  }
  if (at.dir) {
    const drops = join(at.dir, "managed-settings.d")
    const files = [
      join(at.dir, "managed-settings.json"),
      ...(existsSync(drops) ? readdirSync(drops).filter((name) => name.endsWith(".json") && !name.startsWith(".")) : []).sort().map((name) => join(drops, name)),
    ]
    const read = files.flatMap((file) => {
      const policy = existsSync(file) ? readObject(readFileSync(file, "utf8")) : undefined

      return policy ? [{ file, policy }] : []
    })
    const policy = read.reduce<O>((all, { policy }) => merged(all, policy), {})

    if (policyIn(policy)) sources.push({ from: read.length === 1 ? read[0]!.file : at.dir, policy })
  }

  const [first] = sources

  if (!first) return undefined

  if (first.policy.managedSourcesBehavior !== "merge") return first

  return { from: sources.map((s) => s.from).join(" and "), policy: sources.reduce<O>((all, s) => merged(all, s.policy), {}) }
}

const SURFACES = ["skills", "agents", "hooks", "mcp"]
const skillsDir = (sources: Json | undefined) => list(sources).some((source) => obj(source).source === "skills-dir")

/**
 * Why a managed policy keeps the plugin's hook from running, as Claude Code's documents say, with what can be done; undefined
 * where nothing in it does. A skills folder's plugin is skipped whole where customisation is locked to plugins, where the
 * marketplaces allowed leave out skills folders or those blocked name them, or where the plugin is turned off; its hooks
 * alone stop where only managed hooks run, unless the policy turns the plugin on, or where hooks are disabled.
 */
export function blockOf(policy: O): string | undefined {
  const enabled = obj(policy.enabledPlugins)[PLUGIN_ID]
  const locked = policy.strictPluginOnlyCustomization
  const allowed = policy.strictKnownMarketplaces ?? policy.allowedMarketplaces
  const skipped = (why: string) => `${why}, so Claude Code skips the plugin ${PLUGIN_LINK}, and its hook`
  const offer = "ask whoever manages Claude Code here to allow it"
  const flag = policy.disableSideloadFlags === true ? "" : `, or start claude with --plugin-dir ${PLUGIN_LINK}`

  if (enabled === false) return `${skipped(`turn ${PLUGIN_ID} off`)}; ${offer}`
  if (locked === true || (Array.isArray(locked) ? locked.some((s) => SURFACES.includes(str(s))) : locked !== undefined && locked !== false))
    return `${skipped("lock customisation to plugins (strictPluginOnlyCustomization)")}; ${offer}${flag}`
  if (allowed !== undefined && !skillsDir(allowed))
    return `${skipped('allow no skills folder among the marketplaces (strictKnownMarketplaces)')}; ${offer}: { "source": "skills-dir" } among them${flag}`
  if (skillsDir(policy.blockedMarketplaces)) return `${skipped("block skills folders (blockedMarketplaces)")}; ${offer}${flag}`
  if (policy.disableAllHooks === true) return `disable every hook (disableAllHooks), baba's among them; ${offer}`
  if (policy.allowManagedHooksOnly === true && enabled !== true)
    return `run only the organisation's hooks (allowManagedHooksOnly), not baba's; ${offer}: "${PLUGIN_ID}": true in its enabledPlugins`

  return undefined
}

/** What keeps Claude Code from running baba's hook on this machine, said in one line; undefined where nothing read does. */
export function blocked(at = managedAt()): string | undefined {
  const managed = managedPolicy(at)
  const why = managed && blockOf(managed.policy)

  return why && `baba: Claude Code's managed settings (${managed.from}) ${why}. Until then no session here is told of the surfaces.`
}

/** The settings' hooks without the framework's, which the plugin now carries: run from both, each would run twice. */
const stripped = (project: string) => editJson(join(project, SETTINGS), (value) => withHooks(value, without((value.hooks ?? {}) as Hooks)), false)

export const claude: Adapter<ClaudeOptions> = {
  name: "claude",
  defaults: { events: [...CLAUDE_EVENTS] },
  events: CLAUDE_EVENTS,
  provision(project): SetUp {
    const link = join(project, PLUGIN_LINK)
    // The plugin of the package this .baba/ installed, so the project runs the version it names; else this one's.
    const installed = join(project, ".baba/node_modules/babavoss/plugin/claude")
    const plugin = existsSync(installed) ? installed : PLUGIN
    const target = relative(dirname(link), plugin)
    const stat = lstatSync(link, { throwIfNoEntry: false })
    const paths: string[] = []

    if (!stat?.isSymbolicLink() || readlinkSync(link) !== target) {
      if (stat && !ours(link)) throw new Error(`${link} is not baba's: move it, and provision again`)
      rmSync(link, { recursive: true, force: true })
      mkdirSync(dirname(link), { recursive: true })
      try {
        symlinkSync(target, link, "dir")
      } catch {
        // Where no link can be made, a copy, whose hook finds the package from the project, or the home, instead of through the link.
        cpSync(plugin, link, { recursive: true, dereference: true })

        const dir = project === realpathSync(homedir()) ? "$HOME" : "${CLAUDE_PROJECT_DIR}"
        const file = join(link, "hooks/hooks.json")

        writeFileSync(file, readFileSync(file, "utf8").replaceAll('$(cd -P \\"${CLAUDE_PLUGIN_ROOT}/../..\\" && pwd)/bin/baba.ts', `${dir}/.baba/node_modules/babavoss/bin/baba.ts`))
      }
      paths.push(PLUGIN_LINK)
    }
    if (stripped(project)) paths.push(SETTINGS)

    const said = blocked()

    return { paths, ...(said && { said }) }
  },
  blocked: () => blocked(),
  withdraw(project): SetUp {
    const link = join(project, PLUGIN_LINK)
    const paths: string[] = []

    if (ours(link)) {
      rmSync(link, { recursive: true, force: true })
      pruned(dirname(link), project)
      paths.push(PLUGIN_LINK)
    }
    if (stripped(project)) paths.push(SETTINGS)

    return { paths }
  },
  hookEvent(input): HookEvent | undefined {
    const i = obj(input as Json)
    const event = str(i.hook_event_name)
    const moment = (event === "StopFailure" ? "Stop" : (CLAUDE_EVENTS as readonly string[]).includes(event) ? event : undefined) as Moment | undefined

    return moment && { session: str(i.session_id) || undefined, event, moment, ...sourceOf(event, i.source) }
  },
  hookOutput: (event, context) => postToolUse(event, context),
  run: () => claudeCode(),
}

/** A hook's output where its context is plain text, as at a session's start and with a prompt; after a tool call it is named as such. */
export const postToolUse = (event: HookEvent, context: string): string =>
  event.moment === "PostToolUse" ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }) : context
