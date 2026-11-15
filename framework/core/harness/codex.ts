// Codex's adapter. Set up: the skill baba in .agents/skills/baba, the framework's hook in the project's .codex/hooks.json
// for each of Codex's events that is one of the framework's moments, among the person's own hooks, which are left as they
// are; and, where the option asks, the sandbox's network opened in .codex/config.toml, so the shell's command reaches its
// runtime over loopback. Codex loads project hooks in a trusted project only, once the person has reviewed them. Hooks:
// Codex's input and output, which follow Claude Code's names. There is no run face: the lab does not run Codex yet.
// The hook face and the file's format are from Codex's documentation (developers.openai.com/codex/hooks), not run here.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Json } from "../surface/view.ts"
import { postToolUse } from "./claude.ts"
import { sourceOf, type Adapter, type HookEvent, type Moment, type SetUp } from "./harness.ts"
import { editJson, removed, SKILL, withHooks, without, written, type Group, type Hooks } from "./setup.ts"

/** Codex's hook events the framework is told at: an interrupted turn ends as a stop does. */
export const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "Interrupt", "SessionEnd"] as const
export type CodexOptions = { events: (typeof CODEX_EVENTS)[number][]; network: boolean }

const SKILL_AT = ".agents/skills/baba/SKILL.md"
const HOOKS = ".codex/hooks.json"
const CONFIG = ".codex/config.toml"
/** Codex runs a hook in the session's directory and names no project: the command finds the nearest .baba/ up from it. */
const BIN = "/.baba/node_modules/babavoss/bin/baba.ts"
const COMMAND = `d="$PWD"; until [ -f "$d${BIN}" ] || [ "$d" = / ]; do d="$(dirname "$d")"; done; bun "$d${BIN}" hook codex 2>/dev/null || true`
/** A session's end has a second by default, three at most; the hook tells the shell the turn is unknown. */
const TIMEOUTS: Record<string, number> = { SessionEnd: 3 }
/** The lines baba writes into the person's config.toml end with this, so it can take them out again and nothing else. */
const MARK = "# babavoss: the shell's command reaches its runtime over loopback"
const TABLE = /^\[sandbox_workspace_write\]\s*(#.*)?$/

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

/** The project's hooks with baba's for each of Codex's events, after the person's. */
const hooked = (value: Record<string, unknown>): Record<string, unknown> => {
  const hooks = without(obj(value.hooks) as Hooks)

  for (const event of CODEX_EVENTS) {
    const ours: Group = { hooks: [{ type: "command", command: COMMAND, ...(TIMEOUTS[event] && { timeout: TIMEOUTS[event] }) }] }

    hooks[event] = [...(hooks[event] ?? []), ours]
  }

  return withHooks(value, hooks)
}

/** The project's hooks without baba's; undefined where nothing is left of the file. */
const unhooked = (value: Record<string, unknown>): Record<string, unknown> | undefined => {
  const left = withHooks(value, without(obj(value.hooks) as Hooks))

  return Object.keys(left).length ? left : undefined
}

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

/** Removes from config.toml the lines baba wrote, the file with them where nothing else is left; answers whether it changed. */
function closeNetwork(project: string): boolean {
  const file = join(project, CONFIG)

  if (!existsSync(file)) return false

  const text = readFileSync(file, "utf8")
  const left = closed(text)

  if (left === text) return false

  return left === undefined ? removed(file, project) : written(file, left)
}

export const codex: Adapter<CodexOptions> = {
  name: "codex",
  defaults: { events: [...CODEX_EVENTS], network: false },
  events: CODEX_EVENTS,
  provision(project, options): SetUp {
    const paths: string[] = []
    const said: string[] = []

    if (written(join(project, SKILL_AT), readFileSync(SKILL, "utf8"))) paths.push(dirname(SKILL_AT))
    if (editJson(join(project, HOOKS), hooked, true)) {
      paths.push(HOOKS)
      said.push("Codex asks you to review these hooks once: run /hooks in Codex and trust baba's")
    }
    if (options.network) {
      const file = join(project, CONFIG)
      const now = opened(existsSync(file) ? readFileSync(file, "utf8") : "")

      if (written(file, now.text)) paths.push(CONFIG)
      if (now.said) said.push(now.said)
    } else if (closeNetwork(project)) paths.push(CONFIG)

    return { paths, ...(said.length && { said: said.join("\n") }) }
  },
  withdraw(project): SetUp {
    const paths: string[] = []

    if (removed(join(project, SKILL_AT), project)) paths.push(dirname(SKILL_AT))
    if (editJson(join(project, HOOKS), unhooked, false)) paths.push(HOOKS)
    if (closeNetwork(project)) paths.push(CONFIG)

    return { paths }
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
}
