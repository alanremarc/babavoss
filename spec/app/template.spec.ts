// The template as a new app gets it: copied, it holds no packages and runs on baba's, and its first spec passes. The
// template's own spec cannot run where it lies, inside the skill.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, test } from "bun:test"

const product = fileURLToPath(new URL("../../skills/baba/", import.meta.url))
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const made = () => {
  const app = realpathSync(mkdtempSync(join(tmpdir(), "new-app-")))

  dirs.push(app)
  cpSync(join(product, "assets/template"), app, { recursive: true })

  return app
}
/** A machine with no skills of the person's: baba is found only where BABA_SKILL says. */
const machine = (app: string, baba?: string): NodeJS.ProcessEnv => {
  const { BABA_SKILL: _, ...env } = process.env
  const home = join(app, ".home")

  return { ...env, ...(baba && { BABA_SKILL: baba }), HOME: home, CLAUDE_CONFIG_DIR: "", CODEX_HOME: "", BABAVOSS_HOME: home, BABAVOSS_BIN: home }
}

test("a new app holds no packages: its door links it to baba's when it first opens, and its first story passes", () => {
  const app = made()
  const env = machine(app, product)
  const door = (...args: string[]) => spawnSync(process.execPath, [join(app, "scripts/open.ts"), "--session", "S", ...args], { cwd: app, encoding: "utf8", env })
  const opened = door()

  expect(opened.status, opened.stderr).toBe(0)
  expect(opened.stdout).toContain('tabs.0.facts.greeting: "hello"')
  expect(realpathSync(join(app, "node_modules/babavoss"))).toBe(realpathSync(product))
  expect(door("close").status).toBe(0)

  const result = spawnSync(process.execPath, ["test", "spec"], { cwd: app, encoding: "utf8", env })

  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toContain("5 pass")
})

test("a door that finds no baba says so once: what the app runs on and how to install it", () => {
  const app = made()
  const result = spawnSync(process.execPath, [join(app, "scripts/open.ts"), "--session", "S"], { cwd: app, encoding: "utf8", env: machine(app) })

  expect(result.status).toBe(1)
  expect(result.stdout).toBe("")
  expect(result.stderr).toStartWith("this app runs on baba, which is not installed here or is older than 0.21.0.")
  expect(result.stderr).toContain("bunx skills add alanremarc/babavoss -g -y")
  expect(existsSync(join(app, "node_modules"))).toBe(false)
})

test("a door refuses an app that holds packages of its own, and says to remove them", () => {
  const app = made()

  mkdirSync(join(app, "node_modules"))

  const result = spawnSync(process.execPath, [join(app, "scripts/open.ts"), "--session", "S"], { cwd: app, encoding: "utf8", env: machine(app, product) })

  expect(result.status).toBe(1)
  expect(result.stderr).toBe(`${join(app, "node_modules")} holds packages of the app's own; an app runs on baba's: remove that directory and open the app again\n`)
})

test("one version, the skill's, with its section in the changelog; an app names no framework and every door is the template's", () => {
  const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")
  const version = (JSON.parse(read("../../skills/baba/package.json")) as { version: string }).version
  const door = read("../../skills/baba/assets/template/scripts/open.ts")

  expect(read("../../skills/baba/CHANGELOG.md")).toContain(`\n## ${version}\n`)
  for (const app of ["../../skills/baba/assets/template", "../../examples/payments"])
    expect(JSON.parse(read(`${app}/package.json`)) as object).not.toHaveProperty("dependencies")
  for (const app of ["../../examples/payments", "../support/notes"]) expect(read(`${app}/scripts/open.ts`)).toBe(door)
})

test("every app's skill opens the same way and says the same about operating it: the template's words, kept as they are", () => {
  // From after the frontmatter to the end of the "Operating it" section: what is the same in every app.
  const shared = (file: string) => {
    const text = readFileSync(file, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "")
    const from = text.indexOf("## Operating it")
    const next = text.indexOf("\n## ", from + 1)

    expect(from, `${file} has no "Operating it" section`).toBeGreaterThan(0)

    return text.slice(0, next < 0 ? undefined : next).trim()
  }
  const template = shared(join(product, "assets/template/SKILL.md"))

  expect(shared(join(product, "SKILL.md"))).toBe(template)
  expect(shared(fileURLToPath(new URL("../../examples/payments/SKILL.md", import.meta.url)))).toBe(template)
})
