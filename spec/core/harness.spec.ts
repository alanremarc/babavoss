// The harness layer: Claude Code's stream lines, as recorded from a real session and trimmed, read as the framework's
// events; a session's home given the person's login by a link, and the link taken back, and the project trusted there;
// the plugin the package carries for Claude Code; each adapter's hook face; the fake that stories drive.
import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ADAPTERS, blocked, claude, CLAUDE_EVENTS, claudeCode, claudeEvents, cleanEnv, codex, fakeHarness, managedAt, PLUGIN, PLUGIN_ID, trust, type HarnessEvent } from "../../framework/core/harness/index.ts"
import { VERSION } from "../../framework/core/update.ts"
import type { Json } from "../../framework/core/index.ts"

const SESSION = "11111111-2222-4333-8444-555555555555"
const USAGE = { input_tokens: 2, cache_creation_input_tokens: 12386, cache_read_input_tokens: 11370, output_tokens: 8, service_tier: "standard" }
const assistant = (content: Json[], parent: string | null = null) => ({
  type: "assistant",
  message: { model: "claude-haiku-5-5", id: "msg_011Ch4xQ", type: "message", role: "assistant", content, usage: USAGE },
  parent_tool_use_id: parent,
  session_id: SESSION,
})
const RECORDED: Json[] = [
  { type: "system", subtype: "hook_started", hook_id: "3f50", hook_name: "SessionStart:startup", hook_event: "SessionStart", session_id: SESSION },
  {
    type: "system",
    subtype: "hook_response",
    hook_name: "SessionStart:startup",
    hook_event: "SessionStart",
    output: "This project has surfaces.",
    stdout: "This project has surfaces.",
    stderr: "",
    exit_code: 0,
    outcome: "success",
  },
  { type: "system", subtype: "hook_response", hook_name: "UserPromptSubmit", hook_event: "UserPromptSubmit", output: "", stdout: "", stderr: "", exit_code: 0 },
  {
    type: "system",
    subtype: "init",
    cwd: "/runs/r1/project",
    session_id: SESSION,
    tools: ["Task", "Bash", "Read"],
    mcp_servers: [],
    model: "claude-haiku-5-5",
    slash_commands: ["baba", "clear"],
    skills: ["baba", "dataviz"],
    plugins: [{ name: "cc-plugin-agents-md", path: "builtin", source: "cc-plugin-agents-md@builtin" }],
  },
  { type: "system", subtype: "thinking_tokens", estimated_tokens: 50, session_id: SESSION },
  { type: "user", message: { role: "user", content: "What surfaces are there?" }, parent_tool_use_id: null, session_id: SESSION, isReplay: true },
  assistant([{ type: "thinking", thinking: "", signature: "CAQS" }]),
  assistant([{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: ".babavoss/bin/baba /", description: "Read the root" } }]),
  { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: 'title: "baba"' }] }, parent_tool_use_id: null },
  {
    type: "system",
    subtype: "hook_response",
    hook_event: "PostToolUse",
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "What changed: tabs.1" } }),
    exit_code: 0,
  },
  assistant([{ type: "tool_use", id: "toolu_2", name: "Read", input: { file_path: "README.md" } }], "toolu_9"),
  assistant([{ type: "text", text: "Two surfaces: lab and queue." }]),
  { type: "rate_limit_event", rate_limit_info: { status: "allowed" }, session_id: SESSION },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1716,
    num_turns: 2,
    result: "Two surfaces: lab and queue.",
    total_cost_usd: 0.0026821,
    usage: { input_tokens: 2, cache_creation_input_tokens: 12386, cache_read_input_tokens: 11370, output_tokens: 182 },
    credential_expires_at: "2026-12-01T10:42:19.332Z",
  },
  { type: "result", subtype: "error_max_budget_usd", is_error: true, duration_ms: 10, num_turns: 1, total_cost_usd: 0.5, usage: {} },
]

test("Claude Code's stream reads as the framework's events: hooks' injections, messages, calls with the word told apart, turns", () => {
  const events = RECORDED.flatMap(claudeEvents)
  const request = { id: "msg_011Ch4xQ", context: 23_758 }

  expect(events).toEqual<HarnessEvent[]>([
    { kind: "injected", event: "SessionStart", text: "This project has surfaces." },
    {
      kind: "started",
      session: SESSION,
      loaded: {
        model: "claude-haiku-5-5",
        cwd: "/runs/r1/project",
        tools: ["Task", "Bash", "Read"],
        skills: ["baba", "dataviz"],
        plugins: ["cc-plugin-agents-md"],
        mcp: [],
        commands: ["baba", "clear"],
      },
    },
    { kind: "message", text: "What surfaces are there?" },
    { kind: "call", id: "toolu_1", tool: "Bash", input: ".babavoss/bin/baba /", word: true, request },
    { kind: "result", id: "toolu_1", text: 'title: "baba"' },
    { kind: "injected", event: "PostToolUse", text: "What changed: tabs.1" },
    { kind: "reply", text: "Two surfaces: lab and queue.", request },
    { kind: "turn", ok: true, text: "", tokens: { input: 2, cache_write: 12386, cache_read: 11370, output: 182 }, total: 0.0026821, ms: 1716, calls: 2 },
    { kind: "turn", ok: false, text: "error_max_budget_usd", tokens: { input: 0, cache_write: 0, cache_read: 0, output: 0 }, total: 0.5, ms: 10, calls: 1 },
  ])
  expect(JSON.stringify(events)).not.toContain("credential")
})

test("nothing of the account's is handed on: no account, organisation or user id, and no address, in a field or in text", () => {
  const ORG = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
  const ACCOUNT = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a"
  const lines: Json[] = [
    {
      type: "system",
      subtype: "init",
      cwd: "/runs/r1/project",
      session_id: SESSION,
      model: "claude-haiku-5-5",
      tools: ["Bash"],
      account: { email: "someone@example.invalid", uuid: ACCOUNT },
      organization_uuid: ORG,
      user_id: "user_01HZXKQ4ACCOUNTID",
    },
    {
      type: "system",
      subtype: "hook_response",
      hook_event: "SessionStart",
      stdout: `Logged in as someone@example.invalid, organization ${ORG}`,
      exit_code: 0,
    },
    assistant([{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "a.json", email: "someone@example.invalid", accountUuid: ACCOUNT } }]),
    {
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: `{"account_uuid": "${ACCOUNT}", "org_id": "${ORG}"}` }] },
      parent_tool_use_id: null,
    },
    { type: "result", subtype: "error_during_execution", is_error: true, result: `account ${ACCOUNT} has no access`, usage: {}, organization: ORG },
  ]
  const told = JSON.stringify(lines.flatMap(claudeEvents))

  expect(told).not.toMatch(/example\.invalid|ACCOUNTID/)
  expect(told).not.toContain(ORG)
  expect(told).not.toContain(ACCOUNT)
  expect(lines.flatMap(claudeEvents)).toMatchObject([
    { kind: "started", session: SESSION, loaded: { model: "claude-haiku-5-5", cwd: "/runs/r1/project" } },
    { kind: "injected", text: "Logged in as <redacted>, organization <redacted>" },
    { kind: "call", tool: "Write", input: '{"file_path":"a.json"}' },
    { kind: "result", text: '{"account_uuid": "<redacted>", "org_id": "<redacted>"}' },
    { kind: "turn", ok: false, text: "error_during_execution: account <redacted> has no access" },
  ])
})

test("a call is the word when it runs the root's command, and only then", () => {
  const word = (command: string) => (claudeEvents(assistant([{ type: "tool_use", id: "t", name: "Bash", input: { command } }]))[0] as { word: boolean }).word

  expect([".babavoss/bin/baba /tabs/1", "cd .baba && bun run baba start", "bv wait 60"].map(word)).toEqual([true, true, true])
  expect(["ls .babavoss/bin", "cat baba.md", "bvx"].map(word)).toEqual([false, false, false])
})

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), "harness-spec-")))

test("a session's home reaches the person's login by a link, never a copy; release takes it back, and the account's profile", () => {
  const own = temp()
  const home = join(temp(), "home")

  mkdirSync(join(own, "Library/Keychains"), { recursive: true })
  writeFileSync(join(own, "Library/Keychains/login.keychain-db"), "secret")

  const harness = claudeCode(own, "darwin")
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN

  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  try {
    expect(harness.home(home)).toBe("the person's login keychain, linked")
  } finally {
    if (token !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = token
  }
  expect(lstatSync(join(home, "Library/Keychains")).isSymbolicLink()).toBe(true)
  expect(readlinkSync(join(home, "Library/Keychains"))).toBe(join(own, "Library/Keychains"))
  mkdirSync(join(home, ".claude/sessions"), { recursive: true })
  writeFileSync(join(home, ".claude/sessions/1.key"), "a live process's")
  writeFileSync(join(home, ".claude.json"), '{ "oauthAccount": {} }')
  writeFileSync(join(home, ".claude/transcript.jsonl"), "kept")
  harness.release(home)
  expect(existsSync(join(home, "Library/Keychains"))).toBe(false)
  expect(existsSync(join(home, ".claude/sessions"))).toBe(false)
  expect(existsSync(join(home, ".claude.json"))).toBe(false)
  expect(existsSync(join(home, ".claude/transcript.jsonl"))).toBe(true)
  expect(existsSync(join(own, "Library/Keychains/login.keychain-db"))).toBe(true)
  rmSync(own, { recursive: true, force: true })
})

test("elsewhere the credentials file is linked; where there is no login the home says so", () => {
  const own = temp()
  const home = join(temp(), "home")
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN
  const key = process.env.ANTHROPIC_API_KEY

  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY
  try {
    expect(claudeCode(own, "linux").home(home)).toBe("none found: the session is not logged in")
    mkdirSync(join(own, ".claude"))
    writeFileSync(join(own, ".claude/.credentials.json"), "{}", { mode: 0o600 })
    expect(claudeCode(own, "linux").home(home)).toBe("the person's credentials file, linked")
    expect(lstatSync(join(home, ".claude/.credentials.json")).isSymbolicLink()).toBe(true)
  } finally {
    if (token !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = token
    if (key !== undefined) process.env.ANTHROPIC_API_KEY = key
  }
})

test("a session's environment carries none of the caller's harness identity, but a token set up for it", () => {
  const own = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s", CLAUDE_CONFIG_DIR: "/x", BABAVOSS_HOME: "/y" }
  const env = cleanEnv({ PATH: "/bin", ...own, CLAUDE_CODE_OAUTH_TOKEN: "t" })

  expect(env).toEqual({ PATH: "/bin", CLAUDE_CODE_OAUTH_TOKEN: "t" })
})

test("the fake harness is driven by the story: its stream is what is emitted, and what it was told is kept", async () => {
  const fake = fakeHarness()
  const session = fake.harness.start({ project: "/p", home: "/h", session: "s", model: "haiku" })
  const seen: HarnessEvent[] = []
  const reading = (async () => {
    for await (const event of session.events) seen.push(event)
  })()

  session.say("hi")
  fake.emit({ kind: "message", text: "hi" })
  await session.end()
  await reading
  expect(fake.told).toEqual(["hi", "end"])
  expect(seen).toEqual([
    { kind: "message", text: "hi" },
    { kind: "ended", code: 143, stderr: "" },
  ])
})

test("the plugin the package carries is of its version, has the skill baba's own words and their reminder, and the framework's hook for each of Claude Code's events", () => {
  const read = (path: string) => readFileSync(join(PLUGIN, path), "utf8")
  const manifest = JSON.parse(read(".claude-plugin/plugin.json")) as { name: string; version: string }
  const hooks = (JSON.parse(read("hooks/hooks.json")) as { hooks: Record<string, { hooks: { type: string; command: string }[] }[]> }).hooks
  const command = 'bun "$(cd -P "${CLAUDE_PLUGIN_ROOT}/../.." && pwd)/bin/baba.ts" hook claude 2>/dev/null || true'

  // A release raises the version in package.json by hand; this is raised with it.
  expect(manifest).toMatchObject({ name: "baba", version: VERSION })
  expect(read("SKILL.md")).toBe(readFileSync(new URL("../../skill/SKILL.md", import.meta.url), "utf8"))
  expect(read("reminder.md")).toBe(readFileSync(new URL("../../skill/reminder.md", import.meta.url), "utf8"))
  expect(Object.keys(hooks)).toEqual([...CLAUDE_EVENTS])
  for (const groups of Object.values(hooks)) expect(groups).toEqual([{ hooks: [{ type: "command", command }] }])

  // Claude Code names the plugin by the link it found it through: the package is found through the link, not beside it.
  const project = temp()

  mkdirSync(join(project, ".claude/skills"), { recursive: true })
  symlinkSync(PLUGIN, join(project, ".claude/skills/baba"))

  const found = spawnSync("sh", ["-c", 'cd -P "${CLAUDE_PLUGIN_ROOT}/../.." && pwd'], { encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: join(project, ".claude/skills/baba") } })

  expect(found.stdout.trim()).toBe(realpathSync(new URL("../..", import.meta.url).pathname))
  rmSync(project, { recursive: true, force: true })
})

test("each adapter reads its harness's hook input as the framework's moment, and names what it tells as its harness takes it", () => {
  const input = (event: string, more: Record<string, unknown> = {}) => ({ session_id: "s1", hook_event_name: event, cwd: "/p", ...more })

  expect(claude.hookEvent(input("SessionStart", { source: "compact" }))).toEqual({ session: "s1", event: "SessionStart", moment: "SessionStart", source: "compact" })
  // A source the framework does not know is none: the start is given the whole words.
  expect(claude.hookEvent(input("SessionStart", { source: "later" }))).toEqual({ session: "s1", event: "SessionStart", moment: "SessionStart" })
  expect(codex.hookEvent(input("SessionStart", { source: "resume" }))).toEqual({ session: "s1", event: "SessionStart", moment: "SessionStart", source: "resume" })
  expect(claude.hookEvent(input("Stop", { source: "resume" }))).toEqual({ session: "s1", event: "Stop", moment: "Stop" })
  expect(claude.hookEvent(input("StopFailure"))).toEqual({ session: "s1", event: "StopFailure", moment: "Stop" })
  expect(claude.hookEvent(input("Notification"))).toBeUndefined()
  expect(claude.hookEvent("not an object")).toBeUndefined()
  expect(codex.hookEvent(input("Interrupt"))).toEqual({ session: "s1", event: "Interrupt", moment: "Stop" })
  expect(codex.hookEvent(input("UserPromptSubmit", { prompt: "hi" }))).toEqual({ session: "s1", event: "UserPromptSubmit", moment: "UserPromptSubmit" })
  expect(codex.hookEvent(input("PreModelRequest"))).toBeUndefined()
  for (const adapter of ADAPTERS) {
    const tool = adapter.hookEvent(input("PostToolUse"))!

    expect(adapter.hookOutput(adapter.hookEvent(input("UserPromptSubmit"))!, "told")).toBe("told")
    expect(JSON.parse(adapter.hookOutput(tool, "told"))).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "told" } })
    expect(adapter.defaults.events).toEqual([...adapter.events])
  }
  expect(codex.run).toBeUndefined()
})

test("a session's project is trusted in its own home, so the project's plugin loads, and whatever else the home's state holds is kept", () => {
  const home = temp()
  const project = temp()

  writeFileSync(join(home, ".claude.json"), JSON.stringify({ theme: "dark", projects: { "/elsewhere": { hasTrustDialogAccepted: false } } }))
  trust(home, project)
  expect(JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"))).toEqual({
    theme: "dark",
    projects: { "/elsewhere": { hasTrustDialogAccepted: false }, [project]: { hasTrustDialogAccepted: true } },
  })
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

test("an organisation's managed settings that skip the plugin or stop its hook are read where Claude Code reads them, and said in one line with what to do", () => {
  const dir = mkdtempSync(join(tmpdir(), "managed-"))
  const file = join(dir, "managed-settings.json")
  const at = { profiles: [], dir }
  const policy = (value: object) => writeFileSync(file, JSON.stringify(value))

  try {
    // Where Claude Code reads them on each system; the specs' own folder in their place, and no profile, so none reads the machine's.
    expect(managedAt("linux", {})).toEqual({ profiles: [], dir: "/etc/claude-code" })
    expect(managedAt("win32", {})).toEqual({ profiles: [], dir: "C:\\Program Files\\ClaudeCode" })
    expect(managedAt("darwin", { USER: "me" })).toEqual({
      profiles: ["/Library/Managed Preferences/com.anthropic.claudecode.plist", "/Library/Managed Preferences/me/com.anthropic.claudecode.plist"],
      dir: "/Library/Application Support/ClaudeCode",
    })
    expect(managedAt("darwin", { BABAVOSS_MANAGED: dir })).toEqual(at)
    expect(blocked(at)).toBeUndefined()

    // A policy that touches none of it says nothing; nor one that allows skills folders, or turns the plugin on beside managed hooks only.
    policy({ permissions: { deny: ["Read(./.env)"] }, strictKnownMarketplaces: [{ source: "skills-dir" }], strictPluginOnlyCustomization: ["nothing-known"] })
    expect(blocked(at)).toBeUndefined()
    policy({ allowManagedHooksOnly: true, enabledPlugins: { [PLUGIN_ID]: true } })
    expect(blocked(at)).toBeUndefined()

    const said = (value: object) => (policy(value), blocked(at))

    expect(said({ strictPluginOnlyCustomization: ["mcp"] })).toBe(
      `baba: Claude Code's managed settings (${file}) lock customisation to plugins (strictPluginOnlyCustomization), so Claude Code skips the plugin .claude/skills/baba, and its hook; ask whoever manages Claude Code here to allow it, or start claude with --plugin-dir .claude/skills/baba. Until then no session here is told of the surfaces.`
    )
    expect(said({ strictPluginOnlyCustomization: true, disableSideloadFlags: true })).not.toContain("--plugin-dir")
    expect(said({ strictKnownMarketplaces: [{ source: "github", repo: "acme/plugins" }] })).toContain('allow no skills folder among the marketplaces (strictKnownMarketplaces), so Claude Code skips')
    expect(said({ allowedMarketplaces: [] })).toContain('{ "source": "skills-dir" } among them')
    expect(said({ blockedMarketplaces: [{ source: "skills-dir" }] })).toContain("block skills folders (blockedMarketplaces)")
    expect(said({ enabledPlugins: { [PLUGIN_ID]: false } })).toContain(`turn ${PLUGIN_ID} off`)
    expect(said({ disableAllHooks: true })).toContain("disable every hook (disableAllHooks), baba's among them")
    expect(said({ allowManagedHooksOnly: true })).toContain(`run only the organisation's hooks (allowManagedHooksOnly), not baba's; ask whoever manages Claude Code here to allow it: "${PLUGIN_ID}": true in its enabledPlugins`)

    // The drop-ins merge after the file, lists joined: one that allows skills folders among another's marketplaces lifts the block.
    policy({ strictKnownMarketplaces: [{ source: "github", repo: "acme/plugins" }] })
    mkdirSync(join(dir, "managed-settings.d"))
    writeFileSync(join(dir, "managed-settings.d/20-skills.json"), JSON.stringify({ strictKnownMarketplaces: [{ source: "skills-dir" }] }))
    expect(blocked(at)).toBeUndefined()
    writeFileSync(join(dir, "managed-settings.d/30-hooks.json"), JSON.stringify({ disableAllHooks: true }))
    expect(blocked(at)).toContain(`managed settings (${dir}) disable every hook`)
    // A file that does not read as JSON sets nothing here; Claude Code refuses to start on it, and says so itself.
    writeFileSync(join(dir, "managed-settings.d/30-hooks.json"), "{")
    expect(blocked(at)).toBeUndefined()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test.if(process.platform === "darwin")("on macOS the MDM profile comes first: a file below it is not read unless the profile says merge", () => {
  const dir = mkdtempSync(join(tmpdir(), "managed-"))
  const profile = join(dir, "com.anthropic.claudecode.plist")
  const write = (value: object) => {
    writeFileSync(join(dir, "profile.json"), JSON.stringify(value))
    spawnSync("plutil", ["-convert", "xml1", "-o", profile, join(dir, "profile.json")])
  }
  const at = { profiles: [profile], dir: join(dir, "system") }

  try {
    mkdirSync(at.dir)
    writeFileSync(join(at.dir, "managed-settings.json"), JSON.stringify({ disableAllHooks: true }))
    write({ permissions: { deny: ["Read(./.env)"] } })
    expect(blocked(at)).toBeUndefined()
    write({ permissions: { deny: ["Read(./.env)"] }, managedSourcesBehavior: "merge" })
    expect(blocked(at)).toContain(`managed settings (${profile} and ${join(at.dir, "managed-settings.json")}) disable every hook`)
    write({ blockedMarketplaces: [{ source: "skills-dir" }] })
    expect(blocked(at)).toContain(`managed settings (${profile}) block skills folders`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
