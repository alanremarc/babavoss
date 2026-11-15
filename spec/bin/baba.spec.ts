// The package's command, as a project uses it: init makes .baba/ and provisions baba, new makes a role from the template,
// provision writes one skill per role beside .baba/ and removes the skills no role stands behind.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { OPERATING } from "../../framework/core/provision.ts"

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
  expect(readFileSync(join(baba, "roles/month-close/src/app.ts"), "utf8")).toContain('name: "month-close"')
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
  expect(run(["new", "video-editor"])).toMatchObject({ status: 1, err: expect.stringContaining("was not provisioned from here") })
  expect(readFileSync(join(project, ".claude/skills/video-editor/SKILL.md"), "utf8")).toBe("the person's own\n")
  expect(existsSync(join(project, ".agents/skills/video-editor"))).toBe(false)
})

test("outside any .baba/, the command says to make one", () => {
  expect(run(["provision"], tmpdir())).toMatchObject({ status: 2, err: expect.stringContaining("baba init") })
  expect(run([])).toMatchObject({ status: 2, err: expect.stringContaining("baba new NAME") })
})
