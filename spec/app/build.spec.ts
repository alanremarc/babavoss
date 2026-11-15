// The build util's rules as stories: the agent sees the project's apps and makes one from the template. The world outside,
// the project's files, is settled by hand, except where the files themselves are the rule.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import { buildPorts, buildSurface, type BuildPorts } from "../../skills/baba/src/utils/build/index.ts"

const dirs: string[] = []
const ports: BuildPorts = { project: "/project", load: async () => [], create: async (name) => `skills/${name}` }
const made = { name: "month-close", dir: "skills/month-close", description: "Close the month" }

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test("create is offered once the project is read, takes a kebab-case name, and the app is listed with the command that opens it", async () => {
  const { agent, world } = story(buildSurface(ports))

  expect(agent.offered()).toEqual([])
  await world.settle({ kind: "loaded", apps: [] })
  expect(agent.sees()).toMatchObject({ project: "/project", apps: [] })
  expect(await agent.call("/", "create", { name: "Month Close" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("kebab-case") })
  expect(await agent.call("/", "create", { name: "month-close" })).toMatchObject({ outcome: "written" })
  // While it is being made, another is not offered.
  expect(agent.sees()).toMatchObject({ making: "month-close" })
  expect(agent.offered()).toEqual([])
  await world.settle({ kind: "loaded", apps: [made] })
  expect(agent.sees()).toMatchObject({ apps: [{ ...made, open: "bun skills/month-close/scripts/open.ts" }] })
  expect(agent.sees()!.making).toBeUndefined()
  expect(await agent.call("/", "create", { name: "month-close" })).toMatchObject({ outcome: "refused", reason: "month-close is made already" })
})

test("a failure to make the app is said, and create is offered again", async () => {
  const { agent, world } = story(buildSurface(ports))

  await world.settle({ kind: "loaded", apps: [] })
  await agent.call("/", "create", { name: "month-close" })
  await world.settle({ kind: "failed", error: "skills/month-close exists already" })
  expect(agent.sees()).toMatchObject({ error: "skills/month-close exists already" })
  expect(agent.offered()).toEqual(["create"])
})

test("the app is made in skills/NAME as real files, and installed in the project by links from the harness's skill folders", async () => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "build-")))

  dirs.push(project)

  const files = buildPorts(project)

  expect(await files.load()).toEqual([])
  expect(await files.create("month-close")).toBe("skills/month-close")

  const app = join(project, "skills/month-close")

  // Installed where it was made: each harness folder holds a link to it, relative, so the project can be moved or cloned.
  for (const folder of [".claude/skills", ".agents/skills"]) {
    expect(readlinkSync(join(project, folder, "month-close"))).toBe("../../skills/month-close")
    expect(readFileSync(join(project, folder, "month-close/SKILL.md"), "utf8")).toContain("name: month-close")
  }

  // It holds no copy of the framework and names none: it runs on baba's.
  expect(existsSync(join(app, "framework"))).toBe(false)
  expect(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).dependencies).toBeUndefined()
  expect(readFileSync(join(app, "src/app.ts"), "utf8")).toContain('name: "month-close"')
  expect(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).name).toBe("month-close")
  for (const file of ["SKILL.md", "README.md", "package.json", "src/app.ts", "ui/index.html"])
    expect(readFileSync(join(app, file), "utf8"), file).not.toMatch(/\bNAME\b|my-app/)
  expect(await files.load()).toEqual([{ name: "month-close", dir: "skills/month-close", description: expect.any(String) }])
  expect(files.create("month-close")).rejects.toThrow("skills/month-close exists already")
})

test("an app is not made over a skill of its name that is installed in the project already, and nothing is left behind", async () => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "build-")))

  dirs.push(project)
  mkdirSync(join(project, ".agents/skills/month-close"), { recursive: true })
  writeFileSync(join(project, ".agents/skills/month-close/SKILL.md"), "---\nname: month-close\n---\n")

  expect(buildPorts(project).create("month-close")).rejects.toThrow(".agents/skills/month-close exists already")
  expect(existsSync(join(project, "skills"))).toBe(false)
  expect(existsSync(join(project, ".claude"))).toBe(false)
})
