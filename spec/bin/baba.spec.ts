// The package's command, as a project uses it: init makes .baba/ and provisions, new makes a surface from the template,
// provision makes each harness the configuration enables aware, withdraws from the others and generates the root, and the
// hook makes a session aware.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { VERSION } from "../../framework/core/update.ts"
import { poll } from "../support/poll.ts"

const checkout = fileURLToPath(new URL("../..", import.meta.url))
const project = realpathSync(mkdtempSync(join(tmpdir(), "baba-")))
const baba = join(project, ".baba")
const FOLDERS = [".claude/skills", ".agents/skills"]
const LINK = "../../.baba/node_modules/babavoss/plugin/claude"
const run = (args: string[], cwd = baba) => {
  const result = spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), ...args], { cwd, encoding: "utf8" })

  return { status: result.status, out: result.stdout, err: result.stderr }
}
const skill = (folder: string, name: string) => join(project, folder, name, "SKILL.md")

// The framework is this checkout, as files: a release is named the same way, by its tag.
beforeAll(() => {
  const made = run(["init", "--from", `file:${checkout}`], project)

  expect(made.status, made.err).toBe(0)
}, 120_000)
// Removing the project, a whole install, can take longer than a hook's five seconds on a busy machine.
afterAll(() => rmSync(project, { recursive: true, force: true }), 60_000)

test("init makes .baba/ as a package that names the framework and provisions when installed, and baba is a skill beside it", () => {
  const pack = JSON.parse(readFileSync(join(baba, "package.json"), "utf8")) as { scripts: Record<string, string>; dependencies: Record<string, string> }

  expect(pack.dependencies).toEqual({ babavoss: `file:${checkout}` })
  expect(pack.scripts.postinstall).toBe("baba provision")
  expect(existsSync(join(baba, "node_modules/babavoss/package.json"))).toBe(true)
  for (const folder of FOLDERS) expect(readFileSync(skill(folder, "baba"), "utf8")).toBe(readFileSync(join(checkout, "skill/SKILL.md"), "utf8"))
  // Claude Code's is the package's plugin, linked; nothing is written into the person's settings, and no configuration.
  expect(readlinkSync(join(project, ".claude/skills/baba"))).toBe(LINK)
  expect(existsSync(join(project, ".claude/settings.json"))).toBe(false)
  expect(existsSync(join(baba, "baba.config.ts"))).toBe(false)
  expect(run(["init"], project)).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })
})

test("new makes a surface from the template, with a passing spec, and the root is generated with it; a surface gets no skill and no file of instructions", () => {
  expect(run(["new", "Month Close"])).toMatchObject({ status: 2, err: expect.stringContaining("kebab-case") })
  expect(run(["new", "baba"])).toMatchObject({ status: 2, err: expect.stringContaining("not baba") })
  // The shell's own paths are reserved, or a tab's address by its surface's name would stand on them.
  for (const name of ["tabs", "activity"]) expect(run(["new", name])).toMatchObject({ status: 2, err: expect.stringContaining(`or ${name}`) })

  const made = run(["new", "month-close"])

  expect(made.status, made.err).toBe(0)
  expect(readdirSync(join(baba, "surfaces/month-close")).sort()).toEqual(["spec", "src", "ui"])
  // The root is generated from the surfaces: each by name, and the page with each one's component.
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).toContain('"month-close": () => import("../surfaces/month-close/src/surface.ts")')
  expect(readFileSync(join(baba, ".root/main.tsx"), "utf8")).toContain('import * as p0 from "../surfaces/month-close/ui/index.tsx"')
  for (const folder of FOLDERS) expect(existsSync(join(project, folder, "month-close"))).toBe(false)
  expect(run(["new", "month-close"])).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })

  const spec = spawnSync(process.execPath, ["test", "surfaces/month-close"], { cwd: baba, encoding: "utf8" })

  expect(spec.status, spec.stderr).toBe(0)
  expect(spec.stderr).toContain("3 pass")
})

test("provision generates the root from the surfaces that are there, from anywhere in the project", () => {
  expect(run(["new", "reel-maker"]).status).toBe(0)
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).toContain('"reel-maker": () => import(')
  rmSync(join(baba, "surfaces/reel-maker"), { recursive: true })
  expect(run(["provision"], project).status).toBe(0)
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).not.toContain("reel-maker")
  for (const folder of FOLDERS) expect(existsSync(skill(folder, "baba"))).toBe(true)
})

test("a surface's own stylesheet joins the root's page after the shell's, scoped to its tabs, and one whose braces do not balance is left out", () => {
  expect(run(["new", "lane-board"]).status).toBe(0)
  expect(run(["new", "ledger"]).status).toBe(0)

  const styles = () => readFileSync(join(baba, ".root/styles.css"), "utf8")

  expect(styles()).not.toContain("@scope")
  writeFileSync(join(baba, "surfaces/lane-board/ui/styles.css"), ':scope {\n  --lane-idle: var(--border);\n}\n.lane { content: "}"; }\n')
  writeFileSync(join(baba, "surfaces/ledger/ui/styles.css"), ".row { color: red; } } body { color: red; }\n")
  expect(run(["provision"]).status).toBe(0)

  const css = styles()

  expect(css.indexOf('@import "babavoss/shell/ui/styles.css"')).toBeLessThan(css.indexOf("@scope"))
  expect(css).toContain('@scope ([data-surface="lane-board"]) {\n:scope {\n  --lane-idle: var(--border);\n}\n.lane { content: "}"; }\n}\n')
  expect(css).toContain("surfaces/ledger/ui/styles.css is left out")
  expect(css).not.toContain("body { color: red; }")
  for (const name of ["lane-board", "ledger"]) rmSync(join(baba, "surfaces", name), { recursive: true })
  expect(run(["provision"]).status).toBe(0)
  expect(styles()).not.toContain("@scope")
})

test("outside any .baba/, the command says to make one", () => {
  expect(run(["provision"], tmpdir())).toMatchObject({ status: 2, err: expect.stringContaining("baba init") })
  expect(run([])).toMatchObject({ status: 2, err: expect.stringContaining("baba new NAME") })
})

const OURS = 'bun "${CLAUDE_PROJECT_DIR}/.baba/node_modules/babavoss/bin/baba.ts" hook 2>/dev/null || true'
const config = (text: string) => writeFileSync(join(baba, "baba.config.ts"), `import { config } from "babavoss/core/config.ts"\n\nexport default config(${text})\n`)

test("provision replaces an older skill folder with the link, and takes the framework's hooks out of Claude Code's settings, the person's left as they are", () => {
  const link = join(project, ".claude/skills/baba")
  const file = join(project, ".claude/settings.json")
  const ours = { hooks: [{ type: "command", command: OURS }] }
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }
  const both = { hooks: [{ type: "command", command: "echo also" }, { type: "command", command: OURS }] }

  // As an older release left a project: the skill as a folder, the hooks in the settings among the person's.
  rmSync(link)
  mkdirSync(link)
  writeFileSync(join(link, "SKILL.md"), "---\nname: baba\ndescription: older words\n---\n\nOlder.\n")
  writeFileSync(file, JSON.stringify({ attribution: { commit: "" }, hooks: { PostToolUse: [theirs, ours], Stop: [both], SessionEnd: [ours] }, model: "haiku" }))
  expect(run(["provision"]).out).toContain("provisioned .claude/skills/baba\nprovisioned .claude/settings.json\n")
  expect(readlinkSync(link)).toBe(LINK)
  expect(readFileSync(file, "utf8")).toBe(
    `${JSON.stringify({ attribution: { commit: "" }, hooks: { PostToolUse: [theirs], Stop: [{ hooks: [{ type: "command", command: "echo also" }] }] }, model: "haiku" }, null, 2)}\n`
  )

  // Once there is nothing of baba's in it, the file is not written again, however it is laid out; an emptied hooks key goes.
  const kept = '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo mine"}]}]}}'

  writeFileSync(file, kept)
  expect(run(["provision"]).out).not.toContain(".claude/")
  expect(readFileSync(file, "utf8")).toBe(kept)
  writeFileSync(file, JSON.stringify({ attribution: { commit: "" }, hooks: { Stop: [ours] } }))
  expect(run(["provision"]).status).toBe(0)
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ attribution: { commit: "" } })

  // Not JSON: left alone where baba has nothing in it, and an error where it has.
  writeFileSync(file, "{ not json")
  expect(run(["provision"]).status).toBe(0)
  writeFileSync(file, `{ not json ${OURS}`)
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining("is not JSON") })
  rmSync(file)

  // A skill of the person's under the name is not taken.
  rmSync(link)
  mkdirSync(link)
  writeFileSync(join(link, "notes.md"), "mine\n")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining("is not baba's") })
  rmSync(link, { recursive: true })
  expect(run(["provision"]).status).toBe(0)
  expect(lstatSync(link).isSymbolicLink()).toBe(true)
})

test("provision writes the framework's hook into Codex's project hooks for each of its events, once, among the person's, and opens the network only where asked", () => {
  const file = join(project, ".codex/hooks.json")
  const toml = join(project, ".codex/config.toml")
  const hooks = () => (JSON.parse(readFileSync(file, "utf8")) as { hooks: Record<string, { hooks: { command: string; timeout?: number }[] }[]> }).hooks
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }

  expect(Object.keys(hooks())).toEqual(["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "Interrupt", "SessionEnd"])
  for (const [event, groups] of Object.entries(hooks())) {
    expect(groups).toHaveLength(1)
    expect(groups[0]!.hooks[0]!.command).toEndWith('/.baba/node_modules/babavoss/bin/baba.ts" hook codex 2>/dev/null || true')
    expect(groups[0]!.hooks[0]!.timeout).toBe(event === "SessionEnd" ? 3 : undefined)
  }
  writeFileSync(file, JSON.stringify({ hooks: { Stop: [theirs], PreToolUse: [theirs] } }))

  const provisioned = run(["provision"])

  expect(provisioned.out).toContain("provisioned .codex/hooks.json\n")
  expect(provisioned.out).toContain("Codex asks you to review these hooks once")
  expect(run(["provision"]).out).not.toContain(".codex/hooks.json")
  expect(hooks().Stop).toEqual([theirs, expect.objectContaining({ hooks: [expect.objectContaining({ type: "command" })] })])
  expect(hooks().PreToolUse).toEqual([theirs])
  expect(existsSync(toml)).toBe(false)

  // The network, asked for: added where config.toml does not say, left where it does, and taken out again when not asked.
  writeFileSync(toml, 'model = "o3"\n\n[sandbox_workspace_write]\nwritable_roots = ["/tmp"]\n')
  config('{ harnesses: { codex: { enable: true, network: true } } }')
  expect(run(["provision"]).out).toContain(".codex/config.toml: network_access = true added to [sandbox_workspace_write]")
  expect(readFileSync(toml, "utf8")).toStartWith('model = "o3"\n\n[sandbox_workspace_write]\nnetwork_access = true # babavoss:')
  expect(run(["provision"]).out).not.toContain("config.toml")
  config('{ harnesses: { codex: { enable: true } } }')
  expect(run(["provision"]).out).toContain("provisioned .codex/config.toml")
  expect(readFileSync(toml, "utf8")).toBe('model = "o3"\n\n[sandbox_workspace_write]\nwritable_roots = ["/tmp"]\n')
  config('{ harnesses: { codex: { enable: true, network: true } } }')
  writeFileSync(toml, "[sandbox_workspace_write]\nnetwork_access = false\n")
  expect(run(["provision"]).out).toContain("already says whether the sandbox has the network: left as it is")
  expect(readFileSync(toml, "utf8")).toBe("[sandbox_workspace_write]\nnetwork_access = false\n")
  rmSync(toml)
  expect(run(["provision"]).status).toBe(0)
  expect(readFileSync(toml, "utf8")).toContain("[sandbox_workspace_write] # babavoss")
  config('{ harnesses: { codex: { enable: true } } }')
  expect(run(["provision"]).out).toContain("provisioned .codex/config.toml")
  expect(existsSync(toml)).toBe(false)
  rmSync(join(baba, "baba.config.ts"))
})

test("a harness the configuration does not enable is withdrawn, exactly what baba wrote; one that does not load stops provisioning, and changes nothing", () => {
  const settings = join(project, ".claude/settings.json")
  const hooks = join(project, ".codex/hooks.json")
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }
  const before = () => ({ link: readlinkSync(join(project, ".claude/skills/baba")), codex: readFileSync(hooks, "utf8"), skill: existsSync(skill(".agents/skills", "baba")) })

  writeFileSync(settings, '{ "model": "haiku" }\n')
  writeFileSync(hooks, JSON.stringify({ hooks: { Stop: [theirs] } }))
  expect(run(["provision"]).status).toBe(0)

  const was = before()

  for (const broken of ['{ harnesses: { claude: { enable: "yes" } } }', "{ harnesses: { cursor: { enable: true } } }", '{ harnesses: { claude: { enable: true, events: ["Notification"] } } }', "{ harnesses: { codex: { enable: true, colour: 1 } } }"]) {
    config(broken)
    expect(run(["provision"]), broken).toMatchObject({ status: 1, err: expect.stringContaining(".baba/baba.config.ts: ") })
  }
  writeFileSync(join(baba, "baba.config.ts"), "export default {\n")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining(".baba/baba.config.ts does not load") })
  expect(before()).toEqual(was)

  config("{ harnesses: { claude: { enable: false }, codex: { enable: false } } }")

  const withdrawn = run(["provision"])

  expect(withdrawn.out).toContain("withdrew .claude/skills/baba\nwithdrew .agents/skills/baba\nwithdrew .codex/hooks.json\n")
  expect(existsSync(join(project, ".claude/skills"))).toBe(false)
  expect(existsSync(join(project, ".agents"))).toBe(false)
  expect(readFileSync(settings, "utf8")).toBe('{ "model": "haiku" }\n')
  expect(JSON.parse(readFileSync(hooks, "utf8"))).toEqual({ hooks: { Stop: [theirs] } })
  expect(run(["provision"]).out).toBe("provisioned .baba/.root\n")
  rmSync(join(baba, "baba.config.ts"))
  rmSync(settings)
  rmSync(hooks)
  expect(run(["provision"]).out).toContain("provisioned .claude/skills/baba\nprovisioned .agents/skills/baba\nprovisioned .codex/hooks.json\n")
})

test("the hook reads the configuration as it runs: an event not listed tells nothing, nor a harness not enabled, nor a configuration that does not load, which the shell's answer says", () => {
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "configured", CODEX_THREAD_ID: "" }
  const hook = (harness: string[], input: Record<string, unknown>) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook", ...harness], { cwd: project, encoding: "utf8", env, input: JSON.stringify(input) })
  const start = { session_id: "configured", hook_event_name: "SessionStart", source: "startup" }

  try {
    config('{ harnesses: { claude: { enable: true, events: ["Stop"] }, codex: { enable: false } } }')
    expect(hook([], start)).toMatchObject({ status: 0, stdout: "" })
    expect(hook(["codex"], start)).toMatchObject({ status: 0, stdout: "" })
    expect(hook(["cursor"], start)).toMatchObject({ status: 0, stdout: "" })
    writeFileSync(join(baba, "baba.config.ts"), "export default {\n")
    expect(hook([], start)).toMatchObject({ status: 0, stdout: "" })

    const answer = spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env })

    expect(answer.stdout).toContain(".baba/baba.config.ts does not load")
    expect(answer.stdout).toContain("The harnesses' hooks say nothing until it loads")
  } finally {
    rmSync(join(baba, "baba.config.ts"), { force: true })
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", "close"], { cwd: project, encoding: "utf8", env })
  }
}, 60_000)

test("a session's start gives what the skill baba gives and starts the root; a surface teaches by itself alone; the hook tells what changed there", async () => {
  expect(run(["new", "desk"]).status).toBe(0)

  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "hooked", CODEX_THREAD_ID: "" }
  const command = (...args: string[]) => spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), ...args], { cwd: project, encoding: "utf8", env })
  const hook = (event: string, more: Record<string, unknown> = {}) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], {
      cwd: project,
      encoding: "utf8",
      env,
      input: JSON.stringify({ session_id: "hooked", hook_event_name: event, ...more }),
    })
  const body = readFileSync(join(checkout, "skill/SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n+/, "").trim()
  const started = hook("SessionStart", { source: "startup" })

  try {
    // The skill's own words, then the root's answer: its version, its page's address and how to show it, the surfaces.
    expect(started.status).toBe(0)
    expect(started.stdout).toStartWith(`${body}\n\nThe shell of .baba/ was started for this session, and answered:\n`)
    expect(started.stdout).toContain(`baba ${VERSION}\n`)
    expect(started.stdout).toMatch(/answered:\npage: http:\/\/127\.0\.0\.1:\d+  a new address\ncommand: \.babavoss\/bin\/baba, from the project's directory; /)
    // Where the command was put is no part of it: the answer names the command.
    expect(started.stdout).not.toContain("is now a command")

    // By hand it is the same runtime, at the same address, wherever in the project it is started from.
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(started.stdout)![0]

    expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env }).stdout).toContain(`page: ${address}\n`)
    expect(existsSync(join(baba, ".babavoss"))).toBe(false)

    // The shell lists the surface at / with what it says it is for, and offers to open it, to the agent and to the person.
    const word = join(project, ".babavoss/bin/baba")
    const call = (...args: string[]) => spawnSync(word, args, { cwd: project, encoding: "utf8", env })

    expect(started.stdout).toContain('"desk"\t"Keep a greeting the person has agreed to. Use when the greeting is to be changed."')
    // Two surfaces, one open action: its argument is the table's name column.
    expect(started.stdout).toContain(".babavoss/bin/baba / open surface=NAME   open a NAME tab")

    // The person opens it on the page: the agent is told with their next message, and how the surface is worked with it.
    const endpoint = JSON.parse(readFileSync(join(project, ".babavoss/sessions/hooked/baba/service.json"), "utf8")) as { port: number; token: string }
    const person = (path: string, handle: string, args: Record<string, string>) =>
      fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "babavoss-service": endpoint.token, "babavoss-actor": "person" },
        body: JSON.stringify({ handle, args }),
      })

    // Whose move it is, as the page is told it: the hooks say it, a stop adds nothing for the agent and tells nothing away.
    const turn = async () => {
      const ctrl = new AbortController()
      const stream = await fetch(`http://127.0.0.1:${endpoint.port}/`, { headers: { accept: "text/event-stream", "babavoss-service": endpoint.token }, signal: ctrl.signal })
      const reader = stream.body!.getReader()
      let text = ""

      while (!/event: turn\ndata: .*\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
      ctrl.abort()

      return JSON.parse(/event: turn\ndata: (.*)\n/.exec(text)![1]!) as { agent: string; waiting: number }
    }

    expect(await turn()).toMatchObject({ agent: "idle", waiting: 0 })
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "working" })
    expect(hook("Stop", { stop_hook_active: false, last_assistant_message: "done" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle" })
    expect((await person("/", "open", { surface: "desk" })).status).toBe(200)
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle", waiting: 1 })

    const opened = hook("UserPromptSubmit").stdout

    // A tab the person opened is told in one line, its heading, its actions by name and where to read it, which the agent does.
    expect(opened).toMatch(
      /^In the shell of .baba\/: what was heard, then what changed at \/ since you were last told it, by who changed it:\nnotices:\nthe person opened \/desk\nchanged by the person:\n\+ \/desk "Greeting" \(tab \d+\), actions: propose; read \/desk\n?$/
    )

    const tab = /\+ (\/desk) "Greeting"/.exec(opened)![1]!

    expect(call(tab).stdout).toContain('how: "Propose a greeting when the person asks for another.')
    expect(call(tab).stdout).toContain('greeting: "hello"')

    // The tab's own path offers its actions, as the exact commands.
    expect(call(tab).stdout).toContain(`.babavoss/bin/baba ${tab} propose text=string`)

    // The page holds the surface's component in its tab.
    const html = await (await fetch(address, { headers: { accept: "text/html" } })).text()
    const script = /\/_\/[^"]*\.js/.exec(html)![0]

    expect(await (await fetch(address + script)).text()).toContain("The agent proposes")
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })

    // The person proposes there: a call the agent did not make.
    expect((await person(tab, "propose", { text: "good morning" })).status).toBe(200)

    // After a tool call, what was heard alone, one line; what it changed comes with the person's next message.
    expect(JSON.parse(hook("PostToolUse").stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Heard in the shell of .baba/ while you worked:\nnotices:\nthe person acted on ${tab}`,
      },
    })

    const told = hook("UserPromptSubmit").stdout

    expect(told).toStartWith("In the shell of .baba/: what was heard, then what changed at / since you were last told it, by who changed it:\nchanged by the person:\n")
    expect(told).toContain(`+ need: the person, at ${tab}, to accept or decline the proposed greeting`)
    // The agent has not worked in the tab this turn or the last: it is told in one line, who changed it, and to read it.
    expect(told).toMatch(new RegExp(`\\n\\${tab} "Greeting" \\(tab \\d+\\): changed by the person; read it`))
    expect(call(tab).stdout).toContain("good morning")
    // Told once: the session has now been answered.
    expect(hook("UserPromptSubmit").stdout).toBe("")
    expect(hook("PostToolUse").stdout).toBe("")
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
    expect(hook("StopFailure", { error: "rate_limit" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle", waiting: 0 })
    expect(hook("SessionEnd", { reason: "other" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "unknown" })

    // A session resumed or compacted had the words: it is given their reminder, then the present whole.
    const reminder = readFileSync(join(checkout, "skill/reminder.md"), "utf8").trim()

    for (const source of ["resume", "compact"]) {
      const again = hook("SessionStart", { source }).stdout

      expect(again).toStartWith(`${reminder}\n\nThe shell of .baba/ was started for this session, and answered:\npage: `)
      expect(again).toContain(`${tab} "Greeting" (tab `)
    }
    expect(hook("SessionStart", { source: "clear" }).stdout).toStartWith(body)

    // The agent's own calls, through a program, are not told back to it: the program's answers told it.
    expect(call("-e", `console.log(await root.call(${JSON.stringify(tab)}, "propose", { text: "good evening" }))`).status).toBe(0)
    expect(hook("PostToolUse").stdout).toBe("")

    // Fully from the surface: what its code says it is for is what the shell lists, as soon as the code says it; and a
    // surface made by hand is in the root as soon as it is on disk. Nothing is provisioned for either.
    const code = join(baba, "surfaces/desk/src/surface.ts")

    writeFileSync(code, readFileSync(code, "utf8").replace("Keep a greeting the person has agreed to.", "Keep the house greeting."))
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain("Keep the house greeting.")
    cpSync(join(baba, "surfaces/desk"), join(baba, "surfaces/by-hand"), { recursive: true })
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain('"by-hand"')

    // surfaces/ made anew, as a checkout may leave it: the root follows the new one, and its next answer is of the code there.
    cpSync(join(baba, "surfaces"), join(baba, "surfaces.new"), { recursive: true })
    rmSync(join(baba, "surfaces"), { recursive: true })
    renameSync(join(baba, "surfaces.new"), join(baba, "surfaces"))
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain('"by-hand"')
    cpSync(join(baba, "surfaces/desk"), join(baba, "surfaces/after-checkout"), { recursive: true })
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain('"after-checkout"')
  } finally {
    command("start", "close")
  }
  expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], { cwd: project, encoding: "utf8", env, input: "not json" })).toMatchObject({ status: 0, stdout: "" })
}, 60_000)

test("the root starts with the surfaces that load, lists one that does not as broken, and keeps its tabs until its code loads again", async () => {
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "broken", CODEX_THREAD_ID: "" }
  const word = join(project, ".babavoss/bin/baba")
  const call = (...args: string[]) => spawnSync(word, args, { cwd: project, encoding: "utf8", env })
  const code = join(baba, "surfaces/by-hand/src/surface.ts")
  const mended = readFileSync(code, "utf8")

  writeFileSync(code, `${mended}\nthrow new Error("not configured")\n`)
  try {
    const started = spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env })

    expect(started.status, started.stderr).toBe(0)
    expect(started.stdout).toContain('"by-hand"\t\t"the by-hand surface does not load (not configured, at .baba/surfaces/by-hand/src/surface.ts:')
    expect(started.stdout).toContain('"desk"\t"Keep the house greeting.')
    expect(call("/", "open", "surface=desk").stdout).toMatch(/\+ \/desk "Greeting" \(tab 1\)/)

    // Mended, it is opened; broken again while its tab is open, the tab says why and keeps what it holds.
    writeFileSync(code, mended)
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain('"by-hand"\t"Keep the house greeting.')
    expect(call("/", "open", "surface=by-hand").status).toBe(0)
    expect(call("/tabs/2", "propose", "text=kept").status).toBe(0)
    writeFileSync(code, `${mended}\nexport const broken = (\n`)
    await poll(() => call("/tabs/2").stdout, { timeout: 20_000 }).toContain("tab 2 is broken: the by-hand surface does not load (Unexpected end of file")
    expect(call("/tabs/1").stdout).toContain('greeting: "hello"')
    writeFileSync(code, mended)
    await poll(() => call("/tabs/2").stdout, { timeout: 20_000 }).toContain('proposed: "kept"')
  } finally {
    writeFileSync(code, mended)
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", "close"], { cwd: project, encoding: "utf8", env })
  }
}, 60_000)
