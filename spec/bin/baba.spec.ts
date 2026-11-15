// The package's command, as a project uses it: init makes .baba/ and provisions, new makes a surface from the template,
// provision writes the skill baba and the hook beside .baba/ and generates the root, and the hook makes a session aware.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
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
afterAll(() => rmSync(project, { recursive: true, force: true }))

test("init makes .baba/ as a package that names the framework and provisions when installed, and baba is a skill beside it", () => {
  const pack = JSON.parse(readFileSync(join(baba, "package.json"), "utf8")) as { scripts: Record<string, string>; dependencies: Record<string, string> }

  expect(pack.dependencies).toEqual({ babavoss: `file:${checkout}` })
  expect(pack.scripts.postinstall).toBe("baba provision")
  expect(existsSync(join(baba, "node_modules/babavoss/package.json"))).toBe(true)
  for (const folder of FOLDERS) expect(readFileSync(skill(folder, "baba"), "utf8")).toBe(readFileSync(join(checkout, "skill/SKILL.md"), "utf8"))
  expect(run(["init"], project)).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })
})

test("new makes a surface from the template, with a passing spec, and the root is generated with it; a surface gets no skill and no file of instructions", () => {
  expect(run(["new", "Month Close"])).toMatchObject({ status: 2, err: expect.stringContaining("kebab-case") })
  expect(run(["new", "baba"])).toMatchObject({ status: 2, err: expect.stringContaining("not baba") })

  const made = run(["new", "month-close"])

  expect(made.status, made.err).toBe(0)
  expect(readdirSync(join(baba, "surfaces/month-close")).sort()).toEqual(["spec", "src", "ui"])
  // The root is generated from the surfaces: each by name, and the page with each one's component.
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).toContain('import s0 from "../surfaces/month-close/src/surface.ts"')
  expect(readFileSync(join(baba, ".root/main.tsx"), "utf8")).toContain('import * as p0 from "../surfaces/month-close/ui/index.tsx"')
  for (const folder of FOLDERS) expect(existsSync(join(project, folder, "month-close"))).toBe(false)
  expect(run(["new", "month-close"])).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })

  const spec = spawnSync(process.execPath, ["test", "surfaces/month-close"], { cwd: baba, encoding: "utf8" })

  expect(spec.status, spec.stderr).toBe(0)
  expect(spec.stderr).toContain("3 pass")
})

test("provision generates the root from the surfaces that are there, from anywhere in the project", () => {
  expect(run(["new", "reel-maker"]).status).toBe(0)
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).toContain('"reel-maker": s')
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

test("provision writes the framework's hook into Claude Code's settings for each event, once, and leaves the person's settings and hooks as they are", () => {
  const file = join(project, ".claude/settings.json")
  const ours = { hooks: [{ type: "command", command: 'bun "${CLAUDE_PROJECT_DIR}/.baba/node_modules/babavoss/bin/baba.ts" hook 2>/dev/null || true' }] }
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }

  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    hooks: { SessionStart: [ours], UserPromptSubmit: [ours], PostToolUse: [ours], Stop: [ours], StopFailure: [ours], SessionEnd: [ours] },
  })
  writeFileSync(file, JSON.stringify({ attribution: { commit: "" }, hooks: { PostToolUse: [theirs, ours], Stop: [theirs] } }))
  expect(run(["provision"]).status).toBe(0)
  expect(run(["provision"]).status).toBe(0)
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    attribution: { commit: "" },
    hooks: { PostToolUse: [theirs, ours], Stop: [theirs, ours], SessionStart: [ours], UserPromptSubmit: [ours], StopFailure: [ours], SessionEnd: [ours] },
  })
  writeFileSync(file, "{ not json")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining("is not JSON") })
  writeFileSync(file, "{}")
  expect(run(["provision"]).status).toBe(0)
})

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
    expect(started.stdout).toStartWith(`${body}\n\nThe root of .baba/ was started for this session, and answered:\n`)
    expect(started.stdout).toContain(`baba ${VERSION}\n`)
    expect(started.stdout).toMatch(/page: http:\/\/127\.0\.0\.1:\d+  a new address: open it in the harness's browser if it has one, and otherwise give it to the person\n/)

    // By hand it is the same runtime, at the same address, wherever in the project it is started from.
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(started.stdout)![0]

    expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env }).stdout).toContain(`page: ${address}\n`)
    expect(existsSync(join(baba, ".babavoss"))).toBe(false)

    // The shell lists the surface at / with what it says it is for, and offers to open it, to the agent and to the person.
    const word = join(project, ".babavoss/bin/baba")
    const call = (...args: string[]) => spawnSync(word, args, { cwd: project, encoding: "utf8", env })

    expect(started.stdout).toContain('"desk"\t"Keep a greeting the person has agreed to. Use when the greeting is to be changed."')
    expect(started.stdout).toContain('.babavoss/bin/baba / open surface="desk"')

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

    expect(opened).toStartWith("What changed in the root of .baba/ at / since this session was last answered, by who changed it:\nchanged by the person:\n")
    expect(opened).toContain('+ tabs.0.surface: "desk"')
    expect(opened).toContain('+ tabs.0.facts.how: "Propose a greeting when the person asks for another.')
    expect(opened).toContain('+ tabs.0.facts.greeting: "hello"')

    const tab = /\+ tabs\.0\.at: "(\/tabs\/\d+)"/.exec(opened)![1]!

    // The tab's own path offers its actions, as the exact commands.
    expect(call(tab).stdout).toContain(`.babavoss/bin/baba ${tab} propose text=string`)

    // The page holds the surface's component in its tab.
    const html = await (await fetch(address, { headers: { accept: "text/html" } })).text()
    const script = /\/_\/[^"]*\.js/.exec(html)![0]

    expect(await (await fetch(address + script)).text()).toContain("The agent proposes")
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })

    // The person proposes there: a call the agent did not make.
    expect((await person(tab, "propose", { text: "good morning" })).status).toBe(200)

    const told = hook("UserPromptSubmit").stdout

    expect(told).toStartWith("What changed in the root of .baba/ at / since this session was last answered, by who changed it:\nchanged by the person:\n")
    expect(told).toContain("good morning")
    // Told once: the session has now been answered.
    expect(hook("UserPromptSubmit").stdout).toBe("")
    expect(hook("PostToolUse").stdout).toBe("")
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
    expect(hook("StopFailure", { error: "rate_limit" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle", waiting: 0 })
    expect(hook("SessionEnd", { reason: "other" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "unknown" })

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
