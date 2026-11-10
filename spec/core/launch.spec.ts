// Agents started without a terminal, against shims that speak each harness's stream: prompts in, events out.
import { poll } from "../support/poll.ts"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { LOGIN_KEYCHAIN, startAgent, type AgentEvent } from "../../skills/babavoss/framework/core/launch/agent.ts"
import * as claudeCode from "../../skills/babavoss/framework/core/harness-adapters/claude-code/index.ts"

const dirs: string[] = []
const shim = (name: string, script: string) => {
  const dir = mkdtempSync(join(tmpdir(), "launch-"))

  dirs.push(dir)
  writeFileSync(join(dir, name), `#!/usr/bin/env bun\n${script}`)
  chmodSync(join(dir, name), 0o755)

  return join(dir, name)
}
const collect = () => {
  const events: AgentEvent[] = []
  const until = (kind: AgentEvent["kind"]) => poll(() => events.some((e) => e.kind === kind), { timeout: 5000 }).toBe(true)

  return { events, until, on: (e: AgentEvent) => void events.push(e) }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it("drives a Claude Code session over stdin: init, what each call read, thinking, tools, a skill's body and text per turn, the window, exit when stopped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "launch-cwd-"))

  dirs.push(dir)

  const bin = shim(
    "claude",
    `const args = process.argv.slice(2)
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
out({ type: "system", subtype: "init", session_id: "sid", cwd: ${JSON.stringify(dir)}, model: "m", plugin: args.join(" ").includes("--plugin-dir /p") })
const rl = require("node:readline").createInterface({ input: process.stdin })
rl.on("line", (line) => {
  const text = JSON.parse(line).message.content
  const usage = { input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 7, output_tokens: 1 }
  out({ type: "assistant", thinking_duration_ms: 42, message: { id: "m1", usage, content: [{ type: "thinking" }] } })
  out({ type: "assistant", message: { id: "m1", usage, content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } })
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "a.txt" }] }] } })
  out({ type: "assistant", message: { id: "m1", usage, content: [{ type: "tool_use", id: "t2", name: "Skill", input: { skill: "demo" } }] } })
  out({ type: "user", tool_use_result: { commandName: "demo" }, message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "Launching skill: demo" }] } })
  out({ type: "user", isSynthetic: true, message: { content: [{ type: "text", text: "# demo" }] } })
  out({ type: "assistant", message: { id: "m2", usage: { ...usage, input_tokens: 93 }, content: [{ type: "text", text: "echo: " + text }] } })
  out({ type: "result", duration_ms: 7, total_cost_usd: 0.01, modelUsage: { m: { contextWindow: 1000000 }, small: { contextWindow: 200000 } } })
})
rl.on("close", () => process.exit(0))`
  )
  const seen = collect()
  const agent = startAgent({ harness: "claude-code", cwd: dir, sessionId: "u", bin, env: { ...process.env, CLAUDE_CONFIG_DIR: dir } }, seen.on)

  await seen.until("started")
  agent.send("one")
  await seen.until("turn-done")
  agent.stop()
  await agent.done
  expect(seen.events).toEqual([
    { kind: "started", session: "sid", model: "m" },
    // What each call read, cache reads and writes included; of it, what came from the cache.
    { kind: "context", tokens: 110, cached: 100 },
    { kind: "thinking", durationMs: 42 },
    { kind: "tool", id: "t1", name: "Bash", input: { command: "ls" } },
    { kind: "result", id: "t1", output: "a.txt" },
    { kind: "tool", id: "t2", name: "Skill", input: { skill: "demo" } },
    { kind: "result", id: "t2", output: "Launching skill: demo" },
    { kind: "skill", title: "demo", text: "# demo", tool: "t2" },
    { kind: "context", tokens: 200, cached: 100 },
    { kind: "text", text: "echo: one" },
    { kind: "turn-done", durationMs: 7, costUsd: 0.01, window: 1000000 },
    { kind: "exited", code: 0, error: undefined },
  ])
})

it("drives Codex one exec per turn, resuming the thread, queueing a prompt sent mid-turn; resumes a recorded thread from the first turn", async () => {
  const bin = shim(
    "codex",
    `const args = process.argv.slice(2)
const resumed = args.includes("resume") ? args[args.indexOf("resume") + 1] : undefined
const prompt = args.at(-1)
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
out({ type: "thread.started", thread_id: resumed ?? "t1" })
out({ type: "item.started", item: { id: "c1", type: "command_execution", command: "pwd" } })
out({ type: "item.completed", item: { id: "c1", type: "command_execution", command: "pwd", aggregated_output: "/w", exit_code: 0 } })
out({ type: "item.completed", item: { id: "m1", type: "agent_message", text: (resumed ? "again: " : "first: ") + prompt } })
setTimeout(() => { out({ type: "turn.completed" }); process.exit(0) }, 50)`
  )
  const seen = collect()
  const agent = startAgent({ harness: "codex", cwd: tmpdir(), bin }, seen.on)

  agent.send("alpha")
  agent.send("beta")
  await poll(() => seen.events.filter((e) => e.kind === "turn-done").length, { timeout: 5000 }).toBe(2)
  agent.stop()
  await agent.done
  expect(seen.events.map((e) => (e.kind === "text" ? e.text : e.kind === "result" ? `result ${e.output}` : e.kind))).toEqual([
    "started",
    "tool",
    "result /w",
    "first: alpha",
    "turn-done",
    "tool",
    "result /w",
    "again: beta",
    "turn-done",
    "exited",
  ])

  const later = collect()
  const resumed = startAgent({ harness: "codex", cwd: tmpdir(), bin, resume: "t0" }, later.on)

  resumed.send("gamma")
  await later.until("turn-done")
  resumed.stop()
  await resumed.done
  expect(later.events.filter((e) => e.kind === "started" || e.kind === "text")).toEqual([
    { kind: "started", session: "t0" },
    { kind: "text", text: "again: gamma" },
  ])
})

it("tunes a running agent: Claude Code over its control channel, Codex with its next turn", async () => {
  const claude = shim(
    "claude",
    `const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
out({ type: "system", subtype: "init", session_id: "sid", cwd: process.cwd() })
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  const e = JSON.parse(line)
  out(e.type === "control_request" ? { type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(e.request) }] } } : { type: "result" })
})
process.stdin.on("end", () => process.exit(0))`
  )
  const said = collect()
  const agent = startAgent({ harness: "claude-code", cwd: tmpdir(), bin: claude }, said.on)

  await said.until("started")
  agent.tune({ model: "haiku", effort: "high" })
  await poll(() => said.events.filter((e) => e.kind === "text").length, { timeout: 5000 }).toBe(2)
  agent.stop()
  await agent.done
  expect(said.events.filter((e) => e.kind === "text").map((e) => e.kind === "text" && JSON.parse(e.text))).toEqual([
    { subtype: "set_model", model: "haiku" },
    { subtype: "apply_flag_settings", settings: { effortLevel: "high" } },
  ])

  const codex = shim(
    "codex",
    `const args = process.argv.slice(2)
process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "m", type: "agent_message", text: args.includes("--model") ? args[args.indexOf("--model") + 1] : "default" } }) + "\\n")
process.stdout.write(JSON.stringify({ type: "turn.completed" }) + "\\n")`
  )
  const seen = collect()
  const turns = startAgent({ harness: "codex", cwd: tmpdir(), bin: codex }, seen.on)

  turns.send("one")
  await seen.until("turn-done")
  turns.tune({ model: "gpt-x" })
  turns.send("two")
  await poll(() => seen.events.filter((e) => e.kind === "turn-done").length, { timeout: 5000 }).toBe(2)
  turns.stop()
  await turns.done
  expect(seen.events.filter((e) => e.kind === "text").map((e) => e.kind === "text" && e.text)).toEqual(["default", "gpt-x"])
})

it("reports a harness that is missing or fails as exited with the reason", async () => {
  const seen = collect()
  const agent = startAgent({ harness: "claude-code", cwd: tmpdir(), bin: "/nonexistent/claude" }, seen.on)

  await agent.done
  expect(seen.events).toEqual([{ kind: "exited", code: null, error: expect.stringContaining("ENOENT") }])
})

const reportingClaude = () =>
  shim(
    "claude",
    `const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
const e = process.env
require("node:fs").writeFileSync(e.HOME + "/argv.json", JSON.stringify({ bvHome: e.BABAVOSS_HOME, bvBin: e.BABAVOSS_BIN, path: e.PATH, argv: process.argv.slice(2), session: e.CLAUDE_CODE_SESSION_ID ?? null, config: e.CLAUDE_CONFIG_DIR ?? null, ssh: e.SSH_AUTH_SOCK ?? null, xdg: e.XDG_CONFIG_HOME ?? null, token: e.CLAUDE_CODE_OAUTH_TOKEN ?? null }))
out({ type: "system", subtype: "init", session_id: "sid", cwd: process.cwd() })
out({ type: "result", duration_ms: 1, total_cost_usd: 0.02, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 } })
process.stdin.on("end", () => process.exit(0)); process.stdin.resume()`
  )
const launched = async (options: Omit<Parameters<typeof startAgent>[0], "harness" | "cwd">) => {
  const seen = collect()
  const agent = startAgent({ harness: "claude-code", cwd: tmpdir(), ...options }, (e) => e.kind !== "raw" && seen.on(e))

  await seen.until("turn-done")
  agent.stop()
  await agent.done

  return {
    seen,
    given: JSON.parse(readFileSync(join(options.home!, "argv.json"), "utf8")) as {
      bvHome: string
      bvBin: string
      path: string
      argv: string[]
      session: string | null
      config: string | null
      ssh: string | null
      xdg: string | null
      token: string | null
    },
  }
}

it("maps a setup to Claude Code's flags in a home of its own: HOME moved, only the home's own settings so its skills are listed, no claude.ai connectors, the sandbox, model and effort; drops what the parent harness told this process and what points into the person's home", async () => {
  const person = mkdtempSync(join(tmpdir(), "launch-person-"))
  const home = join(mkdtempSync(join(tmpdir(), "launch-home-")), "home")

  dirs.push(person, dirname(home))
  mkdirSync(join(person, "Library", "Keychains"), { recursive: true })
  writeFileSync(join(person, LOGIN_KEYCHAIN), "keychain")

  const { seen, given } = await launched({
    bin: reportingClaude(),
    sandbox: true,
    model: "sonnet",
    effort: "low",
    home,
    env: {
      ...process.env,
      HOME: person,
      CLAUDE_CODE_SESSION_ID: "parent",
      CLAUDE_CONFIG_DIR: join(person, ".claude"),
      SSH_AUTH_SOCK: join(person, "agent.sock"),
      XDG_CONFIG_HOME: join(person, ".config"),
      ANTHROPIC_API_KEY: "",
      CLAUDE_CODE_OAUTH_TOKEN: "",
    },
  })

  expect(seen.events.find((e) => e.kind === "started")).toEqual({ kind: "started", session: "sid" })
  expect(given).toMatchObject({ session: null, config: null, ssh: null, xdg: null })
  expect(given.argv.join(" ")).toBe(
    `--setting-sources user --settings ${JSON.stringify({ ...JSON.parse(claudeCode.sandboxSettings([join(home, ".babavoss"), join(home, "bin")])), disableClaudeAiConnectors: true })} --permission-mode bypassPermissions --model sonnet --effort low --thinking-display summarized -p --output-format stream-json --input-format stream-json --verbose`
  )
  expect(seen.events.find((e) => e.kind === "turn-done")).toEqual({
    kind: "turn-done",
    durationMs: 1,
    costUsd: 0.02,
    tokens: { input: 111, output: 5, cached: 100, written: 1 },
  })
  // On macOS the harness finds its credentials item through a link to the person's login keychain; nothing is copied.
  if (process.platform === "darwin") expect(readlinkSync(join(home, LOGIN_KEYCHAIN))).toBe(join(person, LOGIN_KEYCHAIN))
  else expect(existsSync(join(home, LOGIN_KEYCHAIN))).toBe(false)
})

it("passes Claude Code a credential from the environment instead of linking the keychain; resumes a recorded session by its id", async () => {
  const person = mkdtempSync(join(tmpdir(), "launch-person-"))
  const home = mkdtempSync(join(tmpdir(), "launch-home-"))

  dirs.push(person, home)
  mkdirSync(join(person, "Library", "Keychains"), { recursive: true })
  writeFileSync(join(person, LOGIN_KEYCHAIN), "keychain")

  const { given } = await launched({
    bin: reportingClaude(),
    home,
    sessionId: "not-this",
    resume: "u-1",
    env: { ...process.env, HOME: person, CLAUDE_CODE_OAUTH_TOKEN: "token" },
  })

  expect(given.bvHome).toBe(join(home, ".babavoss"))
  expect(given.bvBin).toBe(join(home, "bin"))
  expect(given.path.split(":")).toContain(join(home, "bin"))
  expect(existsSync(given.bvBin)).toBe(true)
  expect(given.token).toBe("token")
  expect(existsSync(join(home, LOGIN_KEYCHAIN))).toBe(false)
  expect(given.argv.slice(0, 2)).toEqual(["--resume", "u-1"])
  expect(given.argv).not.toContain("--session-id")
})

it("gives an agent with a home a shell that reads none of the person's startup files, with this bun first on the path", async () => {
  // The person's home: every startup file a shell might read announces itself, as a profile step that fails in the sandbox would.
  const person = mkdtempSync(join(tmpdir(), "launch-person-"))
  const home = mkdtempSync(join(tmpdir(), "launch-home-"))

  dirs.push(person, home)
  for (const file of [".zshenv", ".zprofile", ".zshrc", ".zlogin", ".bashrc", ".bash_profile", ".profile"])
    writeFileSync(join(person, file), `echo "${file} ran" >&2\n`)

  // Run as Claude Code runs its Bash tool: a login zsh when there is one, and a bash -c. A login zsh's system profile may
  // reorder the path; Claude Code's shell snapshot exports the path it was given after it.
  const bin = shim(
    "claude",
    `const { spawnSync } = require("node:child_process")
const run = (shell, args, command) => { const r = spawnSync(shell, [...args, command], { encoding: "utf8" }); return r.error ? null : { out: r.stdout.trim(), err: r.stderr.trim() } }
require("node:fs").writeFileSync(process.env.HOME + "/shell.json", JSON.stringify({ zsh: run("zsh", ["-l", "-c"], "echo $PATH"), bash: run("bash", ["-c"], "command -v bun"), bashEnv: process.env.BASH_ENV ?? null, zdotdir: process.env.ZDOTDIR ?? null }))
process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "sid", cwd: process.cwd() }) + "\\n")
process.stdin.on("end", () => process.exit(0)); process.stdin.resume()`
  )
  const seen = collect()
  const agent = startAgent(
    {
      harness: "claude-code",
      cwd: tmpdir(),
      bin,
      home,
      env: { ...process.env, HOME: person, ZDOTDIR: person, BASH_ENV: join(person, ".bashrc"), PATH: "/usr/bin:/bin" },
    },
    seen.on
  )

  await seen.until("started")
  agent.stop()
  await agent.done

  const shell = JSON.parse(readFileSync(join(home, "shell.json"), "utf8")) as Record<string, { out: string; err: string } | null> & { zdotdir: string | null }
  const node = join(dirname(process.execPath), "bun")

  expect(shell.bashEnv).toBeNull()
  expect(shell.zdotdir).toBeNull()
  expect(shell.bash).toEqual({ out: node, err: "" })
  if (shell.zsh) expect(shell.zsh).toEqual({ out: expect.stringContaining(dirname(node)), err: "" })
})

it("maps a setup to Codex: HOME moved, its Codex home inside with the person's auth copied in, the app linked as a skill, the account's apps and remote plugins off, effort and the sandbox with loopback", async () => {
  const own = mkdtempSync(join(tmpdir(), "launch-own-"))
  const home = join(mkdtempSync(join(tmpdir(), "launch-fresh-")), "home")
  const app = mkdtempSync(join(tmpdir(), "launch-app-"))

  dirs.push(own, home, app)
  writeFileSync(join(own, "auth.json"), "{}")
  writeFileSync(join(app, "SKILL.md"), "---\nname: demo\ndescription: Try demo\n---\nOpen demo")

  const log = join(own, "calls.txt")
  const bin = shim(
    "codex",
    `const fs = require("node:fs")
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, process.env.HOME + " " + process.env.CODEX_HOME + " " + args.join(" ") + "\\n")
if (args[0] === "plugin") process.exit(0)
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
const id = "01a1c1a8-181b-7742-9eb0-dc0e691f4cda"
const day = process.env.CODEX_HOME + "/sessions/2026/11/09"
const count = (input, window) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: input, cached_input_tokens: input - 100, output_tokens: 1 }, model_context_window: window } } }) + "\\n"
fs.mkdirSync(day, { recursive: true })
fs.appendFileSync(day + "/rollout-2026-11-09T19-53-01-" + id + ".jsonl", JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: null } }) + "\\n" + count(900, 272000) + count(1200, 272000))
out({ type: "thread.started", thread_id: id })
out({ type: "item.completed", item: { id: "m1", type: "agent_message", text: "ok" } })
out({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 2 } })`
  )
  const seen = collect()
  const agent = startAgent(
    { harness: "codex", cwd: tmpdir(), bin, home, sandbox: true, effort: "high", skillDirs: [app], env: { ...process.env, CODEX_HOME: own } },
    seen.on
  )

  agent.send("go")
  await seen.until("turn-done")
  agent.stop()
  await agent.done

  const calls = readFileSync(log, "utf8").trim().split("\n")
  const codexHome = join(home, ".codex")

  expect(existsSync(join(codexHome, "auth.json"))).toBe(true)
  expect(require("node:fs").readlinkSync(join(codexHome, "skills", "demo"))).toBe(app)
  expect(calls).toHaveLength(1)
  expect(calls[0]).toContain(`${home} ${codexHome} exec -C`)
  expect(calls[0]).toContain(
    `--disable apps --disable remote_plugin -c model_reasoning_effort="high" --sandbox workspace-write -c sandbox_workspace_write.network_access=true --add-dir ${join(home, ".babavoss")} --add-dir ${join(home, "bin")} --json --skip-git-repo-check go`
  )
  // What each call read comes from the rollout, read through before the turn is said to be done.
  expect(seen.events.filter((e) => e.kind === "context" || e.kind === "turn-done")).toEqual([
    // Codex's input holds what was cached, so it is not added again.
    { kind: "context", tokens: 900, cached: 800, window: 272000 },
    { kind: "context", tokens: 1200, cached: 1100, window: 272000 },
    { kind: "turn-done", tokens: { input: 10, output: 2, cached: 5 }, window: 272000 },
  ])
})

it("links a skill into the Claude Code workspace home without plugin arguments", async () => {
  const home = mkdtempSync(join(tmpdir(), "launch-skill-home-"))
  const app = mkdtempSync(join(tmpdir(), "launch-skill-app-"))

  dirs.push(home, app)
  writeFileSync(join(app, "SKILL.md"), "---\nname: demo\ndescription: Demo\n---\nOpen demo")

  const bin = shim(
    "claude",
    `
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
out({ type: "system", subtype: "init", session_id: "sid" })
out({ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(process.argv.slice(2)) }] } })
require("node:readline").createInterface({ input: process.stdin }).on("close", () => process.exit(0))`
  )
  const seen = collect()
  const agent = startAgent({ harness: "claude-code", cwd: home, home, skillDirs: [app], bin }, seen.on)

  await seen.until("text")
  expect(require("node:fs").readlinkSync(join(home, ".claude", "skills", "demo"))).toBe(app)
  expect(seen.events.find((e) => e.kind === "text")).not.toEqual(expect.objectContaining({ text: expect.stringContaining("--plugin-dir") }))
  agent.stop()
  await agent.done
})

it("refuses skills without an isolated home", () => {
  expect(() => startAgent({ harness: "codex", cwd: tmpdir(), skillDirs: ["/p"] }, () => {})).toThrow("home")
})
