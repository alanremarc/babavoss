// The package's command, as a project uses it: init makes .baba/ and provisions, new makes a role from the template,
// provision writes the skill baba and the hook beside .baba/ and generates the root, and the hook makes a session aware.
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test } from "bun:test"
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

test("new makes a role from the template, with a passing spec, and the root is generated with it; a role gets no skill of its own", () => {
  expect(run(["new", "Month Close"])).toMatchObject({ status: 2, err: expect.stringContaining("kebab-case") })
  expect(run(["new", "roles"])).toMatchObject({ status: 2, err: expect.stringContaining("not baba or roles") })

  const made = run(["new", "month-close"])

  expect(made.status, made.err).toBe(0)
  // The root is generated from the roles: their surfaces by name, what their ROLE.md tells, and the page with each one's component.
  expect(readFileSync(join(baba, ".root/roles.ts"), "utf8")).toContain('import r0 from "../roles/month-close/src/role.ts"')
  expect(readFileSync(join(baba, ".root/roles.ts"), "utf8")).toContain('"description": "Do WHAT for WHO. Use when TASK is needed."')
  expect(readFileSync(join(baba, ".root/main.tsx"), "utf8")).toContain('import * as p0 from "../roles/month-close/ui/index.tsx"')
  for (const folder of FOLDERS) expect(existsSync(join(project, folder, "month-close"))).toBe(false)
  expect(run(["new", "month-close"])).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })

  const spec = spawnSync(process.execPath, ["test", "roles/month-close"], { cwd: baba, encoding: "utf8" })

  expect(spec.status, spec.stderr).toBe(0)
  expect(spec.stderr).toContain("3 pass")
})

test("provision follows the roles: what a ROLE.md tells is generated again, and a role that is gone is gone from the root", () => {
  expect(run(["new", "reel-maker"]).status).toBe(0)

  const role = join(baba, "roles/reel-maker/ROLE.md")
  const generated = () => readFileSync(join(baba, ".root/roles.ts"), "utf8")

  writeFileSync(role, "---\ndescription: Cut reels from footage. Use when a reel is asked for.\n---\n\nAsk before publishing.\n")
  // From anywhere in the project: the nearest .baba/ above.
  expect(run(["provision"], project).status).toBe(0)
  expect(generated()).toContain('"description": "Cut reels from footage. Use when a reel is asked for."')
  expect(generated()).toContain('"knowhow": "Ask before publishing."')
  rmSync(join(baba, "roles/reel-maker"), { recursive: true })
  expect(run(["provision"]).status).toBe(0)
  expect(generated()).not.toContain("reel-maker")
  for (const folder of FOLDERS) expect(existsSync(skill(folder, "baba"))).toBe(true)
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

test("a session's start gives what the skill baba gives and starts the root; an open role teaches by its tab; the hook tells what changed there", async () => {
  expect(run(["new", "desk"]).status).toBe(0)
  writeFileSync(join(baba, "roles/desk/ROLE.md"), "---\ndescription: Keep a greeting. Use when one is asked for.\n---\n\nPropose, then wait for the person.\n")
  expect(run(["provision"]).status).toBe(0)

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

    // By hand it is the same runtime, at the same address, wherever in the project it is started from.
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(started.stdout)![0]

    expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env }).stdout).toContain(`page: ${address}\n`)
    expect(existsSync(join(baba, ".babavoss"))).toBe(false)

    // The root lists the role with what its ROLE.md says of it, and offers to open it, to the agent and to the person.
    const word = join(project, ".babavoss/bin/baba")
    const call = (...args: string[]) => spawnSync(word, args, { cwd: project, encoding: "utf8", env })

    expect(started.stdout).toContain('"desk"\t"Keep a greeting. Use when one is asked for."')
    expect(started.stdout).toContain('.babavoss/bin/baba / open util="desk"')

    // The person opens it on the page: the agent is told with their next message, the role's know-how with it.
    const endpoint = JSON.parse(readFileSync(join(project, ".babavoss/sessions/hooked/baba/service.json"), "utf8")) as { port: number; token: string }
    const person = (path: string, handle: string, args: Record<string, string>) =>
      fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "babavoss-service": endpoint.token, "babavoss-actor": "person" },
        body: JSON.stringify({ handle, args }),
      })

    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })
    expect((await person("/", "open", { util: "desk" })).status).toBe(200)

    const opened = hook("UserPromptSubmit").stdout

    expect(opened).toStartWith("The root of .baba/ changed since this session last read it; the person may have acted on the page:\n")
    expect(opened).toContain('+ tabs.1.util: "desk"')
    expect(opened).toContain('+ tabs.1.facts.knowhow: "Propose, then wait for the person."')
    expect(opened).toContain('+ tabs.1.facts.greeting: "hello"')

    const tab = /\+ tabs\.1\.at: "(\/tabs\/\d+)"/.exec(opened)![1]!

    // The tab's own path offers its actions, as the exact commands.
    expect(call(tab).stdout).toContain(`.babavoss/bin/baba ${tab} propose text=string`)

    // The page holds the role's component beside the root's.
    const html = await (await fetch(address, { headers: { accept: "text/html" } })).text()
    const script = /\/_\/[^"]*\.js/.exec(html)![0]

    expect(await (await fetch(address + script)).text()).toContain("The agent proposes")
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })

    // The person proposes there: a call the agent did not make.
    expect((await person(tab, "propose", { text: "good morning" })).status).toBe(200)

    const told = hook("UserPromptSubmit").stdout

    expect(told).toStartWith("The root of .baba/ changed since this session last read it; the person may have acted on the page:\n")
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
