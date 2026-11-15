// The command line: argument lists for launching the harness with a controlled configuration, for tooling.
import { spawnSync } from "node:child_process"

export type Launch = {
  /** The agent's working root. */
  cwd?: string
  /** `<home>/<profile>.config.toml` layered over the base config. */
  profile?: string
  /** `-c key=value` overrides; values are TOML, so quote strings: `'"x"'`. */
  config?: Record<string, string>
  enable?: string[]
  disable?: string[]
  model?: string
  /** `low`, `medium`, `high`, `xhigh` or what the model lists; set as `model_reasoning_effort`. */
  effort?: string
  sandbox?: "read-only" | "workspace-write" | "danger-full-access"
  /** With `workspace-write`: let sandboxed commands use the network, loopback included, so an app's runtime is reachable. Verified. */
  sandboxNetwork?: boolean
  /** Skip `$CODEX_HOME/config.toml`; auth still comes from the home. */
  ignoreUserConfig?: boolean
  /** Keep no session files. */
  ephemeral?: boolean
  approval?: "on-request" | "never"
  addDirs?: string[]
  prompt?: string
}

const common = (o: Launch) => [
  ...(o.cwd ? ["-C", o.cwd] : []),
  ...(o.profile ? ["--profile", o.profile] : []),
  ...Object.entries(o.config ?? {}).flatMap(([key, value]) => ["-c", `${key}=${value}`]),
  ...(o.enable ?? []).flatMap((feature) => ["--enable", feature]),
  ...(o.disable ?? []).flatMap((feature) => ["--disable", feature]),
  ...(o.model ? ["--model", o.model] : []),
  ...(o.effort ? ["-c", `model_reasoning_effort="${o.effort}"`] : []),
  ...(o.sandbox ? ["--sandbox", o.sandbox] : []),
  ...(o.sandboxNetwork ? ["-c", "sandbox_workspace_write.network_access=true"] : []),
  ...(o.ignoreUserConfig ? ["--ignore-user-config"] : []),
  ...(o.ephemeral ? ["--ephemeral"] : []),
  ...(o.approval ? ["--ask-for-approval", o.approval] : []),
  ...(o.addDirs ?? []).flatMap((dir) => ["--add-dir", dir]),
]

/** A model as the app server lists it: `model` is what `--model` takes; each reasoning effort it takes, and the one it defaults to. */
export type ModelInfo = {
  model: string
  displayName?: string
  description?: string
  hidden?: boolean
  isDefault?: boolean
  defaultReasoningEffort?: string
  supportedReasoningEfforts?: { reasoningEffort: string; description?: string }[]
}

/**
 * What this installation offers, asked without a session and at no cost: `codex app-server` speaks JSON-RPC over stdio,
 * a line each; after `initialize` is answered and `initialized` sent, `model/list` is answered with `data`, the models
 * with their reasoning efforts. Verified.
 */
export const offers = {
  argv: (): string[] => ["app-server"],
  initialize: (id: number): string => JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params: { clientInfo: { name: "babavoss", version: "0" } } }),
  /** What to send once `initialize` is answered: the acknowledgement, then the question under `id`. */
  list: (id: number): string[] => [
    JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} }),
    JSON.stringify({ jsonrpc: "2.0", id, method: "model/list", params: {} }),
  ],
  /** The id a line answers, a result or an error. */
  answers: (line: string): number | undefined => {
    try {
      const e = JSON.parse(line) as { id?: unknown; result?: unknown; error?: unknown }

      return typeof e.id === "number" && (e.result !== undefined || e.error !== undefined) ? e.id : undefined
    } catch {
      return undefined
    }
  },
  /** The models in a line, when it answers `model/list` under `id`. */
  models: (line: string, id: number): ModelInfo[] | undefined => {
    try {
      const e = JSON.parse(line) as { id?: unknown; result?: { data?: unknown } }

      return e.id === id && Array.isArray(e.result?.data) ? (e.result.data as ModelInfo[]).filter((m) => typeof m?.model === "string") : undefined
    } catch {
      return undefined
    }
  },
}

/** Arguments after `codex` for an interactive session. */
export const launch = (o: Launch = {}): string[] => [...common(o), ...(o.prompt !== undefined ? [o.prompt] : [])]

/** Arguments after `codex` to continue a session by id or name, or the most recent one. */
export const resume = (session: string | { last: true }, o: Launch = {}): string[] => [
  "resume",
  ...(typeof session === "string" ? [session] : ["--last"]),
  ...common(o),
  ...(o.prompt !== undefined ? [o.prompt] : []),
]

/**
 * Arguments after `codex` for a non-interactive run, or its continuation with `resume`, a thread id. Close or supply stdin
 * when spawning: exec reads it as further input and waits.
 * `exec resume` takes no -C or --sandbox of its own, so the launch options go before it, to exec. Verified.
 */
export const exec = (
  prompt: string,
  o: Launch & { resume?: string; json?: boolean; outputLastMessage?: string; skipGitRepoCheck?: boolean } = {}
): string[] => [
  "exec",
  ...common(o),
  ...(o.resume ? ["resume", o.resume] : []),
  ...(o.json ? ["--json"] : []),
  ...(o.outputLastMessage ? ["-o", o.outputLastMessage] : []),
  ...(o.skipGitRepoCheck ? ["--skip-git-repo-check"] : []),
  prompt,
]

/** The installed harness's version, or undefined when `codex` is not on the path. */
export const installedVersion = (): string | undefined => {
  const result = spawnSync("codex", ["--version"], { encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim().split(/\s+/).at(-1) : undefined
}
