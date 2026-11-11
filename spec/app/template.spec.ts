// The template as a new app gets it: copied beside a copy of the framework, as the start reference says, its first spec passes.
// The template's own spec cannot run inside this repository, where it has no framework of its own.
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, test } from "bun:test"

const product = fileURLToPath(new URL("../../skills/babavoss/", import.meta.url))
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test("a new app, made from the template and the framework, starts with a passing story", () => {
  const app = mkdtempSync(join(tmpdir(), "new-app-"))

  dirs.push(app)
  cpSync(join(product, "assets/template"), app, { recursive: true })
  cpSync(join(product, "framework"), join(app, "framework"), { recursive: true })

  const result = spawnSync(process.execPath, ["test", "spec"], { cwd: app, encoding: "utf8" })

  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toContain("5 pass")
})

test("the template is a shell app: it carries the packages the shell's page is built with", () => {
  const packages = JSON.parse(readFileSync(join(product, "framework/shell/packages.json"), "utf8")) as Record<string, string>
  const template = JSON.parse(readFileSync(join(product, "assets/template/package.json"), "utf8")) as { devDependencies: Record<string, string> }

  expect(template.devDependencies).toMatchObject(packages)
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
