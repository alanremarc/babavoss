// The template as a new app gets it: copied, with what it depends on installed, its first spec passes. The template's own
// spec cannot run where it lies, inside the skill, where nothing is installed for it.
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, test } from "bun:test"

const product = fileURLToPath(new URL("../../skills/baba/", import.meta.url))
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test("a new app, made from the template with its packages installed, starts with a passing story", () => {
  const app = mkdtempSync(join(tmpdir(), "new-app-"))

  dirs.push(app)
  cpSync(join(product, "assets/template"), app, { recursive: true })
  // Installed as this repository has them: the framework among them, at the version the template names.
  symlinkSync(fileURLToPath(new URL("../../node_modules", import.meta.url)), join(app, "node_modules"))

  const result = spawnSync(process.execPath, ["test", "spec"], { cwd: app, encoding: "utf8" })

  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toContain("5 pass")
})

test("a door whose packages cannot be installed says so once: what to allow, how to install by hand, and why it failed", () => {
  const app = realpathSync(mkdtempSync(join(tmpdir(), "new-app-")))
  const manifest = join(app, "package.json")

  dirs.push(app)
  cpSync(join(product, "assets/template"), app, { recursive: true })
  // A version no registry has, and a registry that is not there: nothing is installed, as under a sandbox without network.
  writeFileSync(manifest, readFileSync(manifest, "utf8").replace(/"babavoss": "[^"]+"/, '"babavoss": "0.0.0-never"'))

  const result = spawnSync(process.execPath, [join(app, "scripts/open.ts"), "--session", "S"], {
    cwd: app,
    encoding: "utf8",
    env: { ...process.env, BUN_CONFIG_REGISTRY: "http://127.0.0.1:9/", BABAVOSS_HOME: join(app, ".home"), BABAVOSS_BIN: join(app, ".home") },
  })

  expect(result.status).toBe(1)
  expect(result.stdout).toBe("")
  expect(result.stderr).toStartWith(
    `cannot install what this app depends on; allow bun to reach the package registry (under a sandbox, in the harness settings), or run: cd '${app}' && bun install\n`
  )
  expect(result.stderr.match(/cannot install/g)).toHaveLength(1)
})

test("one version for all of it: the framework, the skill that depends on it, and the template a new app starts from", () => {
  const read = (file: string) => JSON.parse(readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")) as { version: string; dependencies: Record<string, string> }
  const framework = read("../../packages/babavoss/package.json").version

  expect(read("../../skills/baba/package.json").version).toBe(framework)
  expect(read("../../skills/baba/package.json").dependencies.babavoss).toBe(framework)
  expect(read("../../skills/baba/assets/template/package.json").dependencies.babavoss).toBe(framework)
  expect(read("../../examples/payments/package.json").dependencies.babavoss).toBe(framework)
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
