// The build util's rules as stories: the agent writes an app's brief, the person approves it, the app is made from the
// template, and the steps of building it are followed. The world outside, the project's files, is settled by hand, except
// where the files themselves are the rule.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import { story } from "#babavoss/core/index.ts"
import { BRIEF_FILE, buildPorts, buildSurface, type Brief, type BuildPorts } from "../../skills/babavoss/src/utils/build/index.ts"

const dirs: string[] = []
const ports: BuildPorts = { project: "/project", load: async () => [], save: async () => {}, create: async (brief) => brief.name }
const at = "/briefs/month-close"
const blank: Brief = { name: "", job: "", agent: [], sees: [], decides: [], needs: [], questions: [], steps: [], approved: false, next: 1 }
/** The fixed argument of every handle of that brief, which a call repeats. */
const it = { name: "month-close" }
/** A story with the project read and a brief started. */
async function started() {
  const s = story(buildSurface(ports))

  await s.world.settle({ kind: "loaded", briefs: [] })
  await s.agent.call("/", "start", { name: "month-close", job: "Match each month's payments to our invoices" })

  return s
}
/** The same, with both parts written, so nothing but the person's word is missing. */
async function written() {
  const s = await started()

  await s.agent.call(at, "add", { ...it, part: "agent", text: "imports the month and matches what is certain" })
  await s.agent.call(at, "add", { ...it, part: "decides", text: "which invoice an unsure payment belongs to" })

  return s
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test("an empty project tells the agent to write a brief before any code, and a brief starts with a name and a job", async () => {
  const { agent, world } = story(buildSurface(ports))

  expect(agent.offered()).toEqual([])
  await world.settle({ kind: "loaded", briefs: [] })
  expect(agent.sees()).toMatchObject({ next: expect.stringContaining("before any code"), briefs: [] })
  expect(await agent.call("/", "start", { name: "Month Close", job: "x" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("kebab-case") })
  expect(await agent.call("/", "start", { name: "month-close", job: " " })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "start", { name: "month-close", job: "Match each month's payments to our invoices" })).toMatchObject({ outcome: "written" })
  expect(agent.sees()).toMatchObject({ briefs: [{ at, name: "month-close", state: "draft", next: expect.stringContaining("write the agent's part") }] })
  expect(agent.sees()).not.toHaveProperty("next")
  expect(await agent.call("/", "start", { name: "month-close", job: "again" })).toMatchObject({ outcome: "refused" })
})

test("what the agent cannot decide is a question, and the brief waits for its answer before it can be approved", async () => {
  const { agent, person } = await written()

  await agent.call(at, "ask", { ...it, text: "Which bank export do you use?" })
  expect(agent.sees(at)).toMatchObject({
    unanswered: 1,
    next: expect.stringContaining("ask the person the open question"),
    questions: [{ n: 1, text: "Which bank export do you use?" }],
  })
  expect(person.offered(at)).not.toContain("approve")
  await agent.call(at, "answer", { ...it, n: 1, text: "CSV from the business account" })
  expect(agent.sees(at)).toMatchObject({
    questions: [{ n: 1, answer: "CSV from the business account" }],
    next: expect.stringContaining("approving the brief is theirs"),
  })
  expect(agent.sees(at)).not.toHaveProperty("unanswered")
  expect(person.offered(at)).toContain("approve")
})

test("approving the brief is the person's alone, and the agent is told of it", async () => {
  const { agent, person } = await written()

  expect(agent.offered(at)).not.toContain("approve")
  expect(agent.offered(at)).not.toContain("create")
  expect(await agent.call(at, "approve", { ...it, ...it })).toMatchObject({ outcome: "refused" })
  agent.told()
  expect(await person.call(at, "approve", { ...it, ...it })).toMatchObject({ outcome: "written" })
  expect(agent.told()).toEqual([
    'briefs.0.state: "draft" → "approved"',
    'briefs.0.next: "give the person the page and wait: approving the brief is theirs" → "create the app"',
  ])
  expect(agent.offered(at)).toContain("create")
})

test("an approved brief becomes an app: made from the template, its directory named, and the page handed over before any step", async () => {
  const { agent, person, world } = await written()

  await person.call(at, "approve", { ...it, ...it })
  expect(await agent.call(at, "create", { ...it, ...it })).toMatchObject({ outcome: "written", view: { next: expect.stringContaining("being made") } })
  expect(world.commands()).toMatchObject([{ kind: "create", brief: { name: "month-close", approved: true } }])
  expect(agent.offered(at)).not.toContain("create")
  await world.settle({ kind: "created", name: "month-close", dir: "month-close" })
  expect(agent.sees(at)).toMatchObject({ dir: "month-close", state: "being built", next: expect.stringContaining("bun month-close/scripts/open.ts") })
  expect(agent.offered(at)).not.toContain("discard")
})

test("a directory that cannot be made is said, and the brief can be created again", async () => {
  const { agent, person, world } = await written()

  await person.call(at, "approve", { ...it, ...it })
  await agent.call(at, "create", { ...it, ...it })
  await world.fail("month-close exists already")
  expect(agent.sees(at)).toMatchObject({ error: expect.stringContaining("exists already") })
  expect(agent.offered(at)).toContain("create")
})

test("a change to what was approved is approved again, and is written to the app's directory once there is one", async () => {
  const { agent, person, world } = await written()

  await person.call(at, "approve", { ...it, ...it })
  await agent.call(at, "create", { ...it, ...it })
  await world.settle({ kind: "created", name: "month-close", dir: "month-close" })
  await agent.call(at, "add", { ...it, part: "sees", text: "the month's progress as one bar" })
  expect(agent.sees(at)).toMatchObject({ approved: false, state: "changed, to approve again", sees: ["the month's progress as one bar"] })
  expect(world.commands()).toMatchObject([{ kind: "save", dir: "month-close", brief: { sees: ["the month's progress as one bar"], approved: false } }])
  expect(JSON.stringify(world.commands())).not.toContain('"dir":"month-close","brief":{"dir"')
  await world.settle({ kind: "saved" })
  await person.call(at, "approve", { ...it, ...it })
  expect(agent.sees(at)).toMatchObject({ approved: true, state: "being built" })
  await agent.call(at, "remove", { ...it, part: "sees", n: 1 })
  expect(agent.sees(at)).toMatchObject({ approved: false, sees: [] })
  expect(await agent.call(at, "remove", { ...it, part: "sees", n: 1 })).toMatchObject({ outcome: "refused" })
  expect(await agent.call(at, "add", { ...it, part: "page", text: "x" })).toMatchObject({
    outcome: "refused",
    reason: expect.stringContaining("agent, sees, decides, needs"),
  })
})

test("the steps of building it say what is next, one at a time, and noting them needs no new approval", async () => {
  const { agent, person, world } = await written()

  await person.call(at, "approve", { ...it, ...it })
  await agent.call(at, "create", { ...it, ...it })
  await world.settle({ kind: "created", name: "month-close", dir: "month-close" })
  await agent.call(at, "step", { ...it, text: "the month's payments shown on the page" })
  await world.settle({ kind: "saved" })
  await agent.call(at, "step", { ...it, text: "certain payments matched" })
  await world.settle({ kind: "saved" })
  expect(agent.sees(at)).toMatchObject({ approved: true, steps: [{ n: 1, status: "todo" }, { n: 2, status: "todo" }] })
  expect(agent.sees("/")).toMatchObject({ briefs: [{ steps: "0/2" }] })
  expect(agent.sees(at)!.next).toBe("start step 1: the month's payments shown on the page")
  await agent.call(at, "mark", { ...it, n: 1, status: "doing" })
  await world.settle({ kind: "saved" })
  expect(agent.sees(at)!.next).toContain("step 1 is under way")
  await agent.call(at, "mark", { ...it, n: 1, status: "done" })
  await world.settle({ kind: "saved" })
  expect(agent.sees("/")).toMatchObject({ briefs: [{ steps: "1/2", next: "start step 2: certain payments matched" }] })
  expect(await agent.call(at, "mark", { ...it, n: 2, status: "finished" })).toMatchObject({
    outcome: "refused",
    reason: expect.stringContaining("todo, doing, done"),
  })
  await agent.call(at, "mark", { ...it, n: 2, status: "done" })
  expect(agent.sees(at)!.next).toContain("playground")
})

test("a brief not yet an app is kept by the session, one that is an app is read from its directory again, and a draft can be dropped", async () => {
  const s = await written()

  await s.agent.call("/", "start", { name: "other", job: "Another job" })
  await s.restart()
  expect(s.agent.sees()).toMatchObject({ reading: true })

  const made: Brief = { ...blank, name: "made", job: "A made app", agent: ["works"], sees: ["it"], approved: true }

  await s.world.settle({ kind: "loaded", briefs: [{ ...made, dir: "apps/made" }] })
  expect(s.agent.sees()).toMatchObject({ briefs: [{ name: "made", state: "being built" }, { name: "month-close", state: "draft" }, { name: "other" }] })
  expect(await s.agent.call("/briefs/other", "discard", { name: "other" })).toMatchObject({ outcome: "written" })
  expect(s.agent.sees("/briefs/other")).toBeUndefined()
  expect(s.agent.offered("/briefs/made")).not.toContain("discard")
})

test("the app is made in skills/NAME as real files, with its brief, and installed in the project by links from the harness's skill folders", async () => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "build-")))

  dirs.push(project)

  const files = buildPorts(project)
  const brief: Brief = { ...blank, name: "month-close", job: "Match payments", agent: ["matches"], sees: ["the month"], approved: true }

  expect(await files.create(brief)).toBe("skills/month-close")

  const app = join(project, "skills/month-close")

  // Installed where it was made: each harness folder holds a link to it, relative, so the project can be moved or cloned.
  for (const folder of [".claude/skills", ".agents/skills"]) {
    expect(readlinkSync(join(project, folder, "month-close"))).toBe("../../skills/month-close")
    expect(readFileSync(join(project, folder, "month-close/SKILL.md"), "utf8")).toContain("name: month-close")
  }

  expect(existsSync(join(app, "framework/core/index.ts"))).toBe(true)
  expect(readFileSync(join(app, "SKILL.md"), "utf8")).toContain("name: month-close")
  expect(readFileSync(join(app, "src/app.ts"), "utf8")).toContain('name: "month-close"')
  expect(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).name).toBe("month-close")
  for (const file of ["SKILL.md", "README.md", "CHANGELOG.md", "package.json", "src/app.ts", "ui/index.html"])
    expect(readFileSync(join(app, file), "utf8"), file).not.toMatch(/\bNAME\b|my-app/)
  expect(JSON.parse(readFileSync(join(app, BRIEF_FILE), "utf8"))).toEqual(brief)
  expect(await files.load()).toEqual([{ ...brief, dir: "skills/month-close" }])
  expect(files.create(brief)).rejects.toThrow("skills/month-close exists already")

  await Promise.all([files.save("skills/month-close", { ...brief, job: "first" }), files.save("skills/month-close", { ...brief, job: "second" })])
  expect((await files.load())[0]!.job).toBe("second")
})

test("an app is not made over a skill of its name that is installed in the project already, and nothing is left behind", async () => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "build-")))

  dirs.push(project)
  mkdirSync(join(project, ".agents/skills/month-close"), { recursive: true })
  writeFileSync(join(project, ".agents/skills/month-close/SKILL.md"), "---\nname: month-close\n---\n")

  const brief: Brief = { ...blank, name: "month-close", job: "Match payments", approved: true }

  expect(buildPorts(project).create(brief)).rejects.toThrow(".agents/skills/month-close exists already")
  expect(existsSync(join(project, "skills"))).toBe(false)
  expect(existsSync(join(project, ".claude"))).toBe(false)
})
