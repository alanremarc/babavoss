// What a harness offers to run under, asked of the harness itself: its models, each with the efforts it takes. Nothing
// is run and nothing is spent: Claude Code answers a control request before any prompt, Codex's app server a list call.
// The shapes are each adapter's; this is the thin common one a picker shows.
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { createInterface } from "node:readline"
import * as claudeCode from "../harness-adapters/claude-code/index.ts"
import * as codex from "../harness-adapters/codex/index.ts"
import { PARENT_VARS, type Harness } from "./agent.ts"

/** A model to run under: `id` is what the harness takes; `efforts` what it takes with this model, `effort` the one it uses unasked. */
export type HarnessModel = { id: string; name: string; description?: string; efforts: string[]; effort?: string; default?: boolean }

export type ModelsOptions = { env?: NodeJS.ProcessEnv; bin?: string; timeoutMs?: number }

const fromClaude = (models: claudeCode.ModelInfo[]): HarnessModel[] => {
  // `default` is not a model: it names the one the harness uses unasked.
  const unasked = models.find((m) => m.value === "default")?.resolvedModel
  const named = models.filter((m) => m.value !== "default")
  const first = named.find((m) => m.resolvedModel !== undefined && m.resolvedModel === unasked)

  return named.map((m) => ({
    id: m.value,
    name: m.displayName ?? m.value,
    ...(m.description && { description: m.description }),
    efforts: m.supportsEffort ? (m.supportedEffortLevels ?? []) : [],
    ...(m === first && { default: true }),
  }))
}

const fromCodex = (models: codex.ModelInfo[]): HarnessModel[] =>
  models
    .filter((m) => !m.hidden)
    .map((m) => ({
      id: m.model,
      name: m.displayName ?? m.model,
      ...(m.description && { description: m.description }),
      efforts: (m.supportedReasoningEfforts ?? []).map((e) => e.reasoningEffort),
      ...(m.defaultReasoningEffort && { effort: m.defaultReasoningEffort }),
      ...(m.isDefault && { default: true }),
    }))

/** The models the installed harness offers this account, as it says; rejects when it is not installed, not logged in, or silent past `timeoutMs`. */
export function harnessModels(harness: Harness, options: ModelsOptions = {}): Promise<HarnessModel[]> {
  const env = { ...(options.env ?? process.env) }

  for (const key of PARENT_VARS) delete env[key]

  return new Promise((resolve, reject) => {
    const claude = harness === "claude-code"
    const child = spawn(options.bin ?? (claude ? "claude" : "codex"), claude ? claudeCode.offers.argv() : codex.offers.argv(), {
      cwd: tmpdir(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stderr = ""
    let settled = false
    const settle = (outcome: HarnessModel[] | Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill("SIGTERM")
      if (outcome instanceof Error) reject(outcome)
      else resolve(outcome)
    }
    const timer = setTimeout(
      () => settle(new Error(`${harness} did not list its models in ${(options.timeoutMs ?? 20_000) / 1000}s`)),
      options.timeoutMs ?? 20_000
    )
    const say = (line: string) => child.stdin.write(`${line}\n`)

    child.stdin.on("error", () => {})
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr = (stderr + d).slice(-2000)))
    child.on("error", (e) => settle(new Error(`${harness} did not start: ${e.message}`)))
    child.on("close", (code) =>
      settle(new Error(`${harness} exited ${code} before listing its models${stderr.trim() ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`))
    )
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (claude) {
        const models = claudeCode.offers.models(line, "models")

        if (models) settle(fromClaude(models))

        return
      }
      if (codex.offers.answers(line) === 1) return codex.offers.list(2).forEach(say)

      const models = codex.offers.models(line, 2)

      if (models) settle(fromCodex(models))
      else if (codex.offers.answers(line) === 2) settle(new Error("codex refused to list its models"))
    })
    say(claude ? claudeCode.offers.request("models") : codex.offers.initialize(1))
  })
}
