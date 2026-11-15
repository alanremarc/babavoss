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
  expect(readFileSync(join(baba, "roles/month-close/src/role.ts"), "utf8")).toContain('name: "month-close"')
  for (const folder of FOLDERS) {
    const text = readFileSync(skill(folder, "month-close"), "utf8")

    expect(text).toStartWith("---\nname: month-close\ndescription: Do WHAT for WHO. Use when TASK is needed.\ncompatibility: Requires Bun 1.4 or later\n---\n")
    expect(text).toContain("Run `bun <the directory this file is in>/../../../.baba/roles/month-close/scripts/open.ts` from the project's directory.")
    expect(text).toContain(OPERATING)
    expect(text).toEndWith("## The work\n\nWHAT the agent does here, in order; what the person decides on the page; when not to act.\n")
    // The door the skill names is the role's.
    expect(existsSync(join(project, folder, "month-close", "../../../.baba/roles/month-close/scripts/open.ts"))).toBe(true)
  }
  expect(run(["new", "month-close"])).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })

  const spec = spawnSync(process.execPath, ["test", "roles/month-close"], { cwd: baba, encoding: "utf8" })

  expect(spec.status, spec.stderr).toBe(0)
  expect(spec.stderr).toContain("5 pass")
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

test("the hook tells the agent what changed in an open role since the session last read it, and says nothing when nothing did", () => {
  expect(run(["new", "desk"]).status).toBe(0)

  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "hooked", CODEX_THREAD_ID: "", BABAVOSS_BIN: join(project, "bin") }
  const door = (...args: string[]) => spawnSync(process.execPath, [join(baba, "roles/desk/scripts/open.ts"), ...args], { cwd: project, encoding: "utf8", env })
  const hook = (event: string) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], {
      cwd: project,
      encoding: "utf8",
      env,
      input: JSON.stringify({ session_id: "hooked", hook_event_name: event }),
    })

  const root = (...args: string[]) => spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", ...args], { cwd: baba, encoding: "utf8", env })
  // A session's start starts the root, roles open or none: its version, its page's address and how to show it, the roles.
  const started = hook("SessionStart")

  expect(started.status).toBe(0)
  expect(started.stdout).toContain(`baba ${VERSION}\n`)
  expect(started.stdout).toMatch(/page: http:\/\/127\.0\.0\.1:\d+  a new address: open it in the harness's browser if it has one, and otherwise give it to the person\n/)
  expect(started.stdout).toContain('"desk"')
  expect(started.stdout).not.toContain("is open in this session")
  // By hand it is the same runtime, at the same address, wherever in the project it is started from.
  expect(root().stdout).toContain(/page: http:\/\/127\.0\.0\.1:\d+/.exec(started.stdout)![0])
  expect(existsSync(join(baba, ".babavoss"))).toBe(false)
  expect(door().status).toBe(0)
  try {
    expect(hook("SessionStart").stdout).toContain("The role desk is open in this session. Its current state is read with `")
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })

    // The person proposes on the page: a call the agent did not make.
    const endpoint = JSON.parse(readFileSync(join(project, ".babavoss/sessions/hooked/desk/service.json"), "utf8")) as { port: number; token: string }
    const person = spawnSync("curl", [
      "-s", "-X", "POST", `http://127.0.0.1:${endpoint.port}/tabs/1`,
      "-H", "accept: application/json", "-H", "content-type: application/json", "-H", `babavoss-service: ${endpoint.token}`, "-H", "babavoss-actor: person",
      "-d", JSON.stringify({ handle: "propose", args: { text: "good morning" } }),
    ])

    expect(person.status).toBe(0)

    const told = hook("UserPromptSubmit").stdout

    expect(told).toStartWith("The role desk changed since this session last read it; the person may have acted on its page:\n")
    expect(told).toContain("good morning")
    // Told once: the session has now been answered.
    expect(hook("UserPromptSubmit").stdout).toBe("")
    // After a tool call the context is named as such, which is how the harness takes it there.
    expect(hook("PostToolUse").stdout).toBe("")
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
  } finally {
    door("close")
    root("close")
  }
  expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], { cwd: project, encoding: "utf8", env, input: "not json" })).toMatchObject({ status: 0, stdout: "" })
})
