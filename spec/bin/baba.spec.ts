// The package's command, as a project uses it: init makes .baba/ and provisions baba, new makes a role from the template,
// provision writes one skill per role beside .baba/ and removes the skills no role stands behind.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { OPERATING } from "../../framework/core/provision.ts"
import { VERSION } from "../../framework/core/update.ts"

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

test("new makes a role from the template under its name, with a passing spec, and provisions it as a skill that says how to open and operate it", () => {
  expect(run(["new", "Month Close"])).toMatchObject({ status: 2, err: expect.stringContaining("kebab-case") })

  const made = run(["new", "month-close"])

  expect(made.status, made.err).toBe(0)
  // The root is generated from the roles: their surfaces by name, and the page with each one's component.
  expect(readFileSync(join(baba, ".root/roles.ts"), "utf8")).toContain('import r0 from "../roles/month-close/src/role.ts"')
  expect(readFileSync(join(baba, ".root/main.tsx"), "utf8")).toContain('import * as p0 from "../roles/month-close/ui/index.tsx"')
  for (const folder of FOLDERS) {
    const text = readFileSync(skill(folder, "month-close"), "utf8")

    expect(text).toStartWith("---\nname: month-close\ndescription: Do WHAT for WHO. Use when TASK is needed.\ncompatibility: Requires Bun 1.4 or later\n---\n")
    expect(text).toContain("Run `bun <the directory this file is in>/../../../.baba/node_modules/babavoss/bin/baba.ts role month-close` from the project's directory.")
    expect(text).toContain(OPERATING)
    expect(text).toEndWith("## The work\n\nWHAT the agent does here, in order; what the person decides on the page; when not to act.\n")
    // The command the skill names is the package's, as installed.
    expect(existsSync(join(project, folder, "month-close", "../../../.baba/node_modules/babavoss/bin/baba.ts"))).toBe(true)
  }
  expect(run(["new", "month-close"])).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })

  const spec = spawnSync(process.execPath, ["test", "roles/month-close"], { cwd: baba, encoding: "utf8" })

  expect(spec.status, spec.stderr).toBe(0)
  expect(spec.stderr).toContain("3 pass")
})

test("provision follows the roles: a changed description is written again, a role that is gone loses its skill, and baba stays", () => {
  expect(run(["new", "reel-maker"]).status).toBe(0)

  const role = join(baba, "roles/reel-maker/ROLE.md")

  writeFileSync(role, "---\ndescription: Cut reels from footage. Use when a reel is asked for.\n---\n")
  // From anywhere in the project: the nearest .baba/ above.
  expect(run(["provision"], project).status).toBe(0)
  expect(readFileSync(skill(FOLDERS[0]!, "reel-maker"), "utf8")).toContain("description: Cut reels from footage. Use when a reel is asked for.\n")
  writeFileSync(role, "No frontmatter.\n")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining("has no description") })
  rmSync(join(baba, "roles/reel-maker"), { recursive: true })

  const again = run(["provision"])

  expect(again.out).toContain("removed .claude/skills/reel-maker\n")
  for (const folder of FOLDERS) {
    expect(existsSync(join(project, folder, "reel-maker"))).toBe(false)
    expect(existsSync(skill(folder, "baba"))).toBe(true)
  }
})

test("provision never writes over a skill it did not make", () => {
  mkdirSync(join(project, ".claude/skills/video-editor"), { recursive: true })
  writeFileSync(join(project, ".claude/skills/video-editor/SKILL.md"), "the person's own\n")
  expect(run(["new", "video-editor"])).toMatchObject({ status: 2, err: expect.stringContaining("was not provisioned from here") })
  // Nothing was made, so provisioning goes on as before.
  expect(existsSync(join(baba, "roles/video-editor"))).toBe(false)
  expect(run(["provision"]).status).toBe(0)
  expect(readFileSync(join(project, ".claude/skills/video-editor/SKILL.md"), "utf8")).toBe("the person's own\n")
  expect(existsSync(join(project, ".agents/skills/video-editor"))).toBe(false)
})

test("outside any .baba/, the command says to make one", () => {
  expect(run(["provision"], tmpdir())).toMatchObject({ status: 2, err: expect.stringContaining("baba init") })
  expect(run([])).toMatchObject({ status: 2, err: expect.stringContaining("baba new NAME") })
})

test("provision writes the framework's hook into Claude Code's settings for each event, once, and leaves the person's settings and hooks as they are", () => {
  const file = join(project, ".claude/settings.json")
  const ours = { hooks: [{ type: "command", command: 'bun "${CLAUDE_PROJECT_DIR}/.baba/node_modules/babavoss/bin/baba.ts" hook 2>/dev/null || true' }] }
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }

  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ hooks: { SessionStart: [ours], UserPromptSubmit: [ours], PostToolUse: [ours] } })
  writeFileSync(file, JSON.stringify({ attribution: { commit: "" }, hooks: { PostToolUse: [theirs, ours], Stop: [theirs] } }))
  expect(run(["provision"]).status).toBe(0)
  expect(run(["provision"]).status).toBe(0)
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    attribution: { commit: "" },
    hooks: { PostToolUse: [theirs, ours], Stop: [theirs], SessionStart: [ours], UserPromptSubmit: [ours] },
  })
  writeFileSync(file, "{ not json")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining("is not JSON") })
  writeFileSync(file, "{}")
  expect(run(["provision"]).status).toBe(0)
})

test("a session's start gives what the skill baba gives and starts the root; a role opens as a tab of it; the hook tells what changed there", async () => {
  expect(run(["new", "desk"]).status).toBe(0)

  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "hooked", CODEX_THREAD_ID: "" }
  const command = (...args: string[]) => spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), ...args], { cwd: project, encoding: "utf8", env })
  const hook = (event: string) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], {
      cwd: project,
      encoding: "utf8",
      env,
      input: JSON.stringify({ session_id: "hooked", hook_event_name: event }),
    })
  const body = readFileSync(join(checkout, "skill/SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n+/, "").trim()
  const started = hook("SessionStart")

  try {
    // The skill's own words, then the root's answer: its version, its page's address and how to show it, the roles.
    expect(started.status).toBe(0)
    expect(started.stdout).toStartWith(`${body}\n\nThe root of .baba/ was started for this session, and answered:\n`)
    expect(started.stdout).toContain(`baba ${VERSION}\n`)
    expect(started.stdout).toMatch(/page: http:\/\/127\.0\.0\.1:\d+  a new address: open it in the harness's browser if it has one, and otherwise give it to the person\n/)
    expect(started.stdout).toContain('"desk"')

    // By hand it is the same runtime, at the same address, wherever in the project it is started from.
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(started.stdout)![0]

    expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env }).stdout).toContain(`page: ${address}\n`)
    expect(existsSync(join(baba, ".babavoss"))).toBe(false)

    // The role's one command opens it as a tab the first time, and answers with the same tab after.
    const opened = command("role", "desk")

    expect(opened.status, opened.stderr).toBe(0)
    expect(opened.stdout).toContain('greeting: "hello"')

    const tab = /baba (\/tabs\/\d+) propose text=string/.exec(opened.stdout)![1]!

    expect(command("role", "desk").stdout).toContain(`${tab} propose text=string`)
    expect(command("role", "nobody")).toMatchObject({ status: 2, stderr: expect.stringContaining("there is no role nobody") })

    // The page holds the role's component beside the root's.
    const html = await (await fetch(address, { headers: { accept: "text/html" } })).text()
    const script = /\/_\/[^"]*\.js/.exec(html)![0]

    expect(await (await fetch(address + script)).text()).toContain("The agent proposes")
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })

    // The person proposes on the page: a call the agent did not make.
    const endpoint = JSON.parse(readFileSync(join(project, ".babavoss/sessions/hooked/baba/service.json"), "utf8")) as { port: number; token: string }
    const person = await fetch(`http://127.0.0.1:${endpoint.port}${tab}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "babavoss-service": endpoint.token, "babavoss-actor": "person" },
      body: JSON.stringify({ handle: "propose", args: { text: "good morning" } }),
    })

    expect(person.status).toBe(200)

    const told = hook("UserPromptSubmit").stdout

    expect(told).toStartWith("The roles' tabs changed since this session last read them; the person may have acted on the page:\n")
    expect(told).toContain("good morning")
    // Told once: the session has now been answered.
    expect(hook("UserPromptSubmit").stdout).toBe("")
    expect(hook("PostToolUse").stdout).toBe("")
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
  } finally {
    command("start", "close")
  }
  expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], { cwd: project, encoding: "utf8", env, input: "not json" })).toMatchObject({ status: 0, stdout: "" })
}, 60_000)
