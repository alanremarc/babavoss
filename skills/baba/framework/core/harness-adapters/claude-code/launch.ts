// The command line: argument lists for launching the harness with a controlled configuration, for tooling.
import { spawnSync } from "node:child_process"

export type SettingSource = "user" | "project" | "local"

export type Launch = {
  /** A UUID the session is given, so it is known before it starts. */
  sessionId?: string
  /** A session id or name to continue; `fork` gives the continuation a new id. */
  resume?: string
  fork?: boolean
  /** Which settings files load; omitted means all, empty means none: none of the person's settings. */
  settingSources?: SettingSource[]
  /**
   * A settings file path or inline JSON overriding the files for this session. Verified honoured from here with no
   * settings files loaded: `sandbox`, `disableClaudeAiConnectors` (no claude.ai servers in init's mcp_servers) and
   * `autoMemoryEnabled: false` (no memory section in the system prompt).
   */
  settings?: string
  /** `--help` lists `manual` where the docs say `default`; both are accepted. */
  permissionMode?: "default" | "manual" | "acceptEdits" | "plan" | "auto" | "dontAsk" | "bypassPermissions"
  model?: string
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
  /**
   * What a thinking block carries: `summarized` asks the API for a summary of the thinking, which then arrives as the
   * block's text; unasked, the text is empty. Verified in print mode with stream-json; the `showThinkingSummaries`
   * setting is not honoured there, only this flag.
   */
  thinkingDisplay?: "summarized" | "omitted"
  addDirs?: string[]
  /** No skills, MCP servers or CLAUDE.md. */
  bare?: boolean
  /** Non-interactive: answer `print` and exit, in `outputFormat`. With `inputFormat` stream-json, `print` may be empty and prompts arrive on stdin as `{ type: "user", message: { role: "user", content } }` lines. */
  print?: string
  outputFormat?: "text" | "json" | "stream-json"
  inputFormat?: "text" | "stream-json"
  /** Required by stream-json output in print mode. */
  verbose?: boolean
  /** The opening prompt of an interactive session. */
  prompt?: string
}

/** Arguments after `claude`. */
export const launch = (o: Launch = {}): string[] => [
  ...(o.sessionId ? ["--session-id", o.sessionId] : []),
  ...(o.resume ? ["--resume", o.resume] : []),
  ...(o.fork ? ["--fork-session"] : []),
  ...(o.settingSources ? ["--setting-sources", o.settingSources.join(",")] : []),
  ...(o.settings ? ["--settings", o.settings] : []),
  ...(o.permissionMode ? ["--permission-mode", o.permissionMode] : []),
  ...(o.model ? ["--model", o.model] : []),
  ...(o.effort ? ["--effort", o.effort] : []),
  ...(o.thinkingDisplay ? ["--thinking-display", o.thinkingDisplay] : []),
  ...(o.addDirs ?? []).flatMap((dir) => ["--add-dir", dir]),
  ...(o.bare ? ["--bare"] : []),
  ...(o.print !== undefined ? (o.print ? ["-p", o.print] : ["-p"]) : []),
  ...(o.outputFormat ? ["--output-format", o.outputFormat] : []),
  ...(o.inputFormat ? ["--input-format", o.inputFormat] : []),
  ...(o.verbose ? ["--verbose"] : []),
  ...(o.prompt !== undefined && o.print === undefined ? [o.prompt] : []),
]

/** A model as the harness lists it: `value` is what `--model` takes; `default` is an entry of its own, resolved to the model it means. */
export type ModelInfo = {
  value: string
  resolvedModel?: string
  displayName?: string
  description?: string
  supportsEffort?: boolean
  supportedEffortLevels?: string[]
}

/**
 * What this installation offers, asked before any prompt and at no cost. With stream-json input, a control request
 * `initialize` on stdin is answered on stdout by a `control_response` whose response carries `models`, each with the
 * effort levels it takes, and `commands`. Verified.
 */
export const offers = {
  argv: (): string[] => launch({ print: "", inputFormat: "stream-json", outputFormat: "stream-json", verbose: true, settingSources: [] }),
  request: (id: string): string => JSON.stringify({ type: "control_request", request_id: id, request: { subtype: "initialize" } }),
  /** The models in a line of the stream, when the line answers the request under `id`. */
  models: (line: string, id: string): ModelInfo[] | undefined => {
    try {
      const e = JSON.parse(line) as { type?: string; response?: { request_id?: string; response?: { models?: unknown } } }
      const models = e.type === "control_response" && e.response?.request_id === id ? e.response.response?.models : undefined

      return Array.isArray(models) ? (models as ModelInfo[]).filter((m) => typeof m?.value === "string") : undefined
    } catch {
      return undefined
    }
  },
}

/**
 * What a running session's next call runs under, told over stdin with stream-json input: `set_model` takes a model as
 * `--model` does, `apply_flag_settings` an `effortLevel` as `--effort` does. Each is answered by a `control_response`.
 * Verified: the next call's request carries them.
 */
export const control = {
  model: (id: string, model: string): string => JSON.stringify({ type: "control_request", request_id: id, request: { subtype: "set_model", model } }),
  effort: (id: string, effort: string): string =>
    JSON.stringify({ type: "control_request", request_id: id, request: { subtype: "apply_flag_settings", settings: { effortLevel: effort } } }),
}

/** Settings that confine the agent's shell commands: writes inside the working directory, no network but loopback, so an app's runtime is reachable; refuse to run when the sandbox cannot start. For `settings`. Verified on macOS. */
/** The sandbox on, loopback open, and writes allowed in `allowWrite` as well as the working directory. */
export const sandboxSettings = (allowWrite: string[] = []): string =>
  JSON.stringify({ sandbox: { enabled: true, failIfUnavailable: true, network: { allowLocalBinding: true }, ...(allowWrite.length && { filesystem: { allowWrite } }) } })

/** The installed harness's version, or undefined when `claude` is not on the path. */
export const installedVersion = (): string | undefined => {
  const result = spawnSync("claude", ["--version"], { encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim().split(/\s+/)[0] : undefined
}
