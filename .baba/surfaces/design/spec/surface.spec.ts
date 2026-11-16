// The design document's rules, as stories. The scenarios are played once for real, on the demo project through the
// framework's hook, word and runtime, and the demo's shape read from its surfaces, both settled as the play command's
// event: what is shown is what that code gave, and nothing told is written here.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, expect, test } from "bun:test"
import { story, whole, type Json } from "babavoss/core/index.ts"
import { TELLS } from "babavoss/core/hook.ts"
import { QUIET_LINE } from "babavoss/core/runtime/turn.ts"
import design, { type Model } from "../src/surface.ts"
import { play, PLAYS, SESSION, swept, WORD, type Page, type Play } from "../src/play.ts"
import { SCENARIOS } from "../src/scenarios.ts"
import { shape, type Shape } from "../src/shape.ts"
import tasks from "../demo/surfaces/tasks/src/surface.ts"
import { lineDiff } from "../src/measure.ts"
import { parts } from "../ui/told.ts"

type Row = { at: string; name: string; about: string; steps: number; lines: number; chars: number; tokens: number; delta?: string }
type Telling = { carrier: string; lines: number; chars: number; tokens: number; delta?: string; text: string; pinned?: string }
type Step = { at: string; n: number; who: string; did: string; changed: string[] | string; tellings: Telling[] }

let plays: Play[] = []
let demo: Shape[] = []

beforeAll(async () => {
  ;[plays, demo] = await Promise.all([Promise.all(SCENARIOS.map((s) => play(s))), shape()])
}, 60_000)

/** The design document with the plays settled, as when its watch starts it and the play ends. */
async function played(model?: Model) {
  const told = story(design, model ? { model } : {})

  await told.world.settle((c) => c.kind === "watch", { kind: "changed" })
  await told.world.settle((c) => c.kind === "play", { kind: "played", plays, shape: demo })

  return told
}
const stepOf = (name: string, did: string) => {
  const p = plays.find((p) => p.name === name)!
  const n = p.steps.findIndex((s) => s.did === did)

  return { n: n + 1, step: p.steps[n]! }
}

test("every scenario plays to its end, each step told by who moved and what the agent was given", () => {
  expect(plays.map((p) => [p.name, p.error, p.steps.length])).toEqual(SCENARIOS.map((s) => [s.name, undefined, s.steps.length]))
  for (const p of plays) expect(p.steps.flatMap((s) => s.tellings).some((t) => t.text)).toBe(true)
})

test("/ lists the scenarios with what each is about, their sizes and an at each, and a session start is played as its hook gives it", async () => {
  const { agent } = await played()
  const rows = (agent.sees() as { scenarios: Row[] }).scenarios

  expect(agent.sees()).toMatchObject({ title: "Design Document" })
  expect(rows.map((r) => [r.at, r.name, r.about])).toEqual(SCENARIOS.map((s) => [`/scenarios/${s.name}`, s.name, s.about]))
  for (const r of rows) {
    expect(r.tokens).toBeGreaterThan(0)
    expect(r.tokens).toBeGreaterThanOrEqual(r.chars / 4)
    expect(r).not.toHaveProperty("delta")
  }
  expect(agent.offered()).toEqual(["play", "pin"])

  // The SessionStart hook gives baba's words, then the shell's answer to its opening, which names the framework's version.
  const framework = new URL("./", import.meta.resolve("babavoss/package.json"))
  const skill = readFileSync(new URL("skill/SKILL.md", framework), "utf8").replace(/^---\n[\s\S]*?\n---\n+/, "").trim()
  const { version } = JSON.parse(readFileSync(new URL("package.json", framework), "utf8")) as { version: string }
  const start = (agent.sees("/scenarios/start/1") as { tellings: Telling[] }).tellings[0]!

  expect(start.carrier).toBe("SessionStart hook")
  expect(start.text.startsWith(skill)).toBe(true)
  expect(start.text.split("\n")).toContain(`baba ${version}`)
})

test("a read's answer is the door's text of the view, and what is heard after a tool call is the hook's", async () => {
  const { agent } = await played()
  const { n } = stepOf("work", `${WORD} /tabs/1/tasks/1`)
  const step = agent.sees(`/scenarios/work/${n}`) as Step
  // The same view, made by the tasks surface on its own and given as the door gives a read.
  const own = story(tasks)

  await own.agent.call("/", "add", { title: "Write the notes" })
  await own.agent.call("/", "add", { title: "Tag the release" })
  expect(step.tellings.map((t) => t.carrier)).toEqual([`answer to ${WORD} /tabs/1/tasks/1`, "PostToolUse hook"])
  expect(step.tellings[0]!.text).toBe(whole(own.agent.sees("/tasks/1") as Json, { command: WORD, path: "/tabs/1/tasks/1" }).join("\n"))
  expect(step.tellings[1]!.text).toBe("")

  const heard = stepOf("beside", "another tool: edit CHANGELOG.md").step.tellings[0]!

  // Led as the hook leads what was heard, whatever it calls the root.
  const [before, after] = TELLS.PostToolUse!.lead("\0").split("\0")
  const lead = heard.text.split("\n")[0]!

  expect(lead.startsWith(before!) && lead.endsWith(after!)).toBe(true)
  expect(heard.text).toContain("the person acted on /tasks")
})

test("an ask: the wait ends with what the person decided on the page", async () => {
  const { agent } = await played()
  const { n, step } = stepOf("ask", "the wait ends")

  expect(step.tellings[0]!.text).toContain("Task 1, Write the notes, is approved (by the person)")
  expect((agent.sees(`/scenarios/ask/${n}`) as Step).changed).toEqual("nothing")
})

test("a scenario's path lists its steps with sizes and an at each; a step's path has its texts whole", async () => {
  const { agent } = await played()
  const work = agent.sees("/scenarios/work") as { steps: { at: string; n: number; who: string; given: string; tokens: number }[]; tokens: number }

  expect(work.steps.map((s) => s.at)).toEqual(SCENARIOS.find((s) => s.name === "work")!.steps.map((_, i) => `/scenarios/work/${i + 1}`))
  expect(work.steps.reduce((a, s) => a + s.tokens, 0)).toBe(work.tokens)
  expect(work.steps[0]).toMatchObject({ who: "harness", given: "SessionStart hook" })

  const step = agent.sees("/scenarios/work/3") as Step

  expect(step).toMatchObject({ who: "agent", did: `${WORD} / open surface=tasks` })
  expect(step.changed).toContain("activity: agent · tasks /tasks · opened")
  expect(agent.sees("/scenarios/work/99")).toBeUndefined()
  expect(agent.sees("/scenarios/none")).toBeUndefined()
})

test("a step carries what the person's page showed after it: each open tab at /, as the person reads it, and the tab in front", async () => {
  const { agent } = await played()
  const at = (did: string) => agent.sees(`/scenarios/ask/${stepOf("ask", did).n}/page`) as Page
  const task = (page: Page) => (page.tabs.find((t) => t.at === page.shown)!.view as { tasks: Json[] }).tasks[0]
  const done = at(`${WORD} /tabs/1/tasks/1 done`)

  expect(at("says: Write the notes and have me check them.")).toEqual({ tabs: [] })
  expect(at(`${WORD} /tabs/1 add 'title=Write the notes'`)).toMatchObject({ shown: "/tasks", tabs: [{ at: "/tasks", surface: "tasks" }] })
  expect(task(at(`${WORD} /tabs/1 add 'title=Write the notes'`))).toEqual({ at: "/tasks/1", n: 1, title: "Write the notes", status: "todo" })
  // In review, the task carries the person's asks, as their page has them, and the tab says they are waited for.
  expect(task(done)).toMatchObject({ status: "review", approve: { kind: "handle", name: "approve", ask: true }, reopen: { ask: true } })
  expect(done.tabs[0]!.view).toMatchObject({ attention: { who: "person", why: "to review task 1" } })
  expect(task(at("on the page: approve n=1 at /tabs/1/tasks/1"))).toEqual({ at: "/tasks/1", n: 1, title: "Write the notes", status: "done" })

  // The agent is never offered the asks, in no text of any play; the step lists the page in a line.
  const told = plays.flatMap((p) => p.steps.flatMap((s) => s.tellings.map((t) => t.text)))

  expect(told.filter((t) => /baba \S+ (approve|reopen)/.test(t))).toEqual([])
  expect((agent.sees(`/scenarios/ask/${stepOf("ask", `${WORD} /tabs/1/tasks/1 done`).n}`) as { page: Json }).page).toEqual({
    at: `/scenarios/ask/${stepOf("ask", `${WORD} /tabs/1/tasks/1 done`).n}/page`,
    tabs: ["tasks /tasks (in front)"],
  })

  // Where the person acts is in front, and a page that sleeps is as it last was.
  const beside = plays.find((p) => p.name === "beside")!.steps

  expect(beside.map((s) => s.page.shown).filter(Boolean).at(-1)).toBe("/tasks")
  expect(beside[stepOf("beside", "on the page: add title=\"Bump the version\" at /tabs/1").n - 1]!.page.shown).toBe("/tasks")
  expect(plays.find((p) => p.name === "break")!.steps.find((s) => s.who === "root")!.page).toMatchObject({ asleep: true, tabs: [{}, {}] })
})

test("the demo's shape is read from its surfaces: places by pattern, their facts, the ask and the notice, what changes by itself", async () => {
  const { agent } = await played()
  const surfaces = (agent.sees("/demo") as { surfaces: Shape[] }).surfaces
  const tasks = surfaces.find((s) => s.name === "tasks")!
  const build = surfaces.find((s) => s.name === "build")!
  const own = (await import("../demo/surfaces/build/src/surface.ts")).default

  expect(surfaces.map((s) => s.name)).toEqual(["build", "tasks"])
  expect(tasks.description).toBe((await import("../demo/surfaces/tasks/src/surface.ts")).default.description)
  expect(tasks.views.map((v) => v.path)).toEqual(["/", "/tasks/:n"])
  expect(tasks.views[0]).toMatchObject({ facts: expect.arrayContaining(["title", "tasks: at n title status note", "attention"]), actions: [{ name: "add", inputs: ["title"] }] })
  expect(tasks.views[0]!.actions[0]).not.toHaveProperty("notice")
  expect(tasks.views[1]!.actions.map((a) => [a.name, a.ask ?? false, a.notice ?? false])).toEqual([
    ["annotate", false, false],
    ["done", false, true],
    ["approve", true, true],
    ["reopen", true, true],
  ])
  // An action's description is said of any task, not of the one the exploration reached.
  expect(tasks.views[1]!.actions.map((a) => a.description)).toEqual([
    "Note on task N what was done or found: a line",
    "Mark task N done; the person reviews it",
    "Approve task N",
    "Reopen task N: it is not done",
  ])
  // What the build's own command brings is in its facts too, as the plays saw it.
  expect(build).toMatchObject({ description: own.description, itself: ["watch"], views: [{ path: "/", actions: [{ name: "rerun", inputs: [] }] }] })
  expect(build.views[0]!.facts).toEqual(expect.arrayContaining(["status", "runs", "why", "attention"]))
})

test("pinned, every telling is the same as the pin; one that changed shows its delta, and its pinned text", async () => {
  const { agent, person } = await played()

  await person.call("/", "pin", {})
  expect((agent.sees() as { scenarios: Row[] }).scenarios.map((r) => r.delta)).toEqual(SCENARIOS.map(() => "same"))
  expect(agent.offered()).toEqual(["play", "pin", "unpin"])

  // A pin whose session start was one line shorter: the telling now differs from it, by that line.
  const texts = Object.fromEntries(plays.map((p) => [p.name, p.steps.map((s) => s.tellings.map((t) => t.text))]))
  const start = texts.start![0]![0]!
  const pinned = start.split("\n").slice(0, -1).join("\n")

  texts.start![0]![0] = pinned

  const altered = await played({ plays: [], playing: false, pin: { t: 0, texts } })
  const row = (altered.agent.sees() as { scenarios: Row[] }).scenarios.find((r) => r.name === "start")!
  const telling = (altered.agent.sees("/scenarios/start/1") as Step).tellings[0]!

  expect(row.delta).toMatch(/^\+\d+ tokens, \+1 lines; text differs$/)
  expect(telling).toMatchObject({ delta: expect.stringMatching(/\+1 lines; text differs$/), pinned })
  expect(lineDiff(telling.pinned!, telling.text).filter((d) => d.op !== " ")).toEqual([{ op: "+", line: start.split("\n").at(-1)! }])
  expect((altered.agent.sees() as { scenarios: Row[] }).scenarios.filter((r) => r.name !== "start").map((r) => r.delta)).toEqual(SCENARIOS.slice(1).map(() => "same"))

  await altered.agent.call("/", "unpin", {})
  expect(altered.agent.sees()).not.toHaveProperty("pinned")
  expect((altered.agent.sees() as { scenarios: Row[] }).scenarios.every((r) => r.delta === undefined)).toBe(true)
})

test("a scenario pinned before it was there is new, and pinning again takes it in", async () => {
  const texts = Object.fromEntries(plays.filter((p) => p.name !== "quiet").map((p) => [p.name, p.steps.map((s) => s.tellings.map((t) => t.text))]))
  const { agent, person } = await played({ plays: [], playing: false, pin: { t: 0, texts } })
  const rows = () => (agent.sees() as { scenarios: Row[] }).scenarios

  expect(rows().find((r) => r.name === "quiet")!.delta).toBe("new")
  expect((agent.sees("/scenarios/quiet/1") as Step).tellings[0]!.delta).toBe("new")
  expect(rows().filter((r) => r.name !== "quiet").every((r) => r.delta === "same")).toBe(true)
  await person.call("/", "pin", {})
  expect(rows().every((r) => r.delta === "same")).toBe(true)
})

test("the scenarios are grouped, canonical first, and each noise scenario plays the moves it is about", () => {
  const groups = SCENARIOS.map((s) => s.group)
  const steps = (name: string) => plays.find((p) => p.name === name)!.steps

  expect(groups.indexOf("noise")).toBeGreaterThan(0)
  expect(groups.slice(groups.indexOf("noise")).every((g) => g === "noise")).toBe(true)
  expect(SCENARIOS.filter((s) => s.group === "noise").map((s) => s.name)).toEqual(["housekeeping", "explained", "elsewhere", "long", "moved", "reload", "quiet"])

  // The person's housekeeping happens on the page and is never a call of the agent's.
  expect(steps("housekeeping").filter((s) => s.who === "person").map((s) => s.tellings.length)).toEqual(steps("housekeeping").filter((s) => s.who === "person").map((s) => (s.did.startsWith("says") ? 1 : 0)))
  expect(steps("housekeeping").some((s) => s.page.tabs.some((t) => t.surface === "settings"))).toBe(true)
  // Twelve tasks are listed, and the approval moves the approved one.
  const explained = steps("explained").at(-2)!.page.tabs[0]!.view as { tasks: { n: number; status: string }[] }

  expect(explained.tasks).toHaveLength(12)
  expect(explained.tasks.at(-1)).toMatchObject({ n: 3, status: "done" })
  // Forty tasks, thirty of them done with a note.
  const long = (steps("long").at(-1)!.page.tabs[0]!.view as { tasks: { status: string; note?: string }[] }).tasks

  expect([long.length, long.filter((t) => t.status === "done" && t.note).length]).toEqual([40, 30])
  // The tasks tab is closed and opened again: one tab of tasks is open in the end, and the agent's old path is refused.
  expect(steps("moved").at(-1)!.page.tabs.map((t) => t.surface)).toEqual(["tasks"])
  expect(steps("moved").find((s) => s.did.includes("/tabs/1 add") && s.page.tabs.length === 1 && s.tellings[0]!.text.startsWith("refused"))).toBeDefined()
  // The step under the reload is marked as timing-dependent, and the root is seen to load the change.
  expect(steps("reload").filter((s) => s.timing).length).toBeGreaterThan(0)
  expect(steps("reload").find((s) => s.who === "root")!.did).toBe("the root has loaded the changed code")
  // With the hooks stopped, the agent's calls give their answers alone, and the rest nothing.
  const off = steps("quiet").filter((s) => s.unhooked)

  expect(off.length).toBeGreaterThan(3)
  expect(off.flatMap((s) => s.tellings.map((t) => t.carrier)).every((c) => c.startsWith("answer to"))).toBe(true)
  // The break is compacted and resumed as separate steps, each its own SessionStart.
  expect(steps("break").filter((s) => s.who === "harness" && s.tellings[0]?.carrier === "SessionStart hook").map((s) => s.did)).toEqual([
    "the session starts",
    "the session starts again after a compaction",
    "the session resumes",
  ])
})

test("the page reads every told text without changing a character of it; a session's start is prose, then the shell's answer", () => {
  const texts = plays.flatMap((p) => p.steps.flatMap((s) => s.tellings.map((t) => t.text)))

  for (const text of texts) {
    const read = parts(text)

    expect(read.map((p) => p.text).join("\n")).toBe(text)
    for (const p of read) if (p.kind === "shaped") expect(p.lines.map((l) => l.spans.map((s) => s.text).join("")).join("\n")).toBe(p.text)
  }

  const start = parts(plays.find((p) => p.name === "start")!.steps[0]!.tellings[0]!.text)

  expect(start.map((p) => p.kind)).toEqual(["prose", "shaped"])
  expect(start[1]!.text.split("\n")[0]).toMatch(/^The shell of .* answered:$/)
})

test("a pause passes at once on the demo's clock, and the framework finds it passed: the call after it is told the hooks are quiet", async () => {
  const began = Date.now()
  const quiet = await play(SCENARIOS.find((s) => s.name === "quiet")!)
  const after = quiet.steps.findIndex((s) => s.did.includes("seconds pass")) + 1

  expect(Date.now() - began).toBeLessThan(8000)
  expect(quiet.steps[after]!.tellings[0]!.text.split("\n")[0]).toBe(QUIET_LINE)
})

test("the code changing plays again, and what then tells the agent otherwise is noticed", async () => {
  const { agent, world } = story(design)

  await world.settle((c) => c.kind === "watch", { kind: "changed" })
  expect(agent.sees()).toMatchObject({ playing: true })
  expect(agent.offered()).toEqual(["play"])
  await world.settle((c) => c.kind === "play", { kind: "played", plays })
  expect(agent.noticed()).toEqual([])

  await agent.call("/", "play", {})

  const shorter = plays.map((p) => (p.name === "work" ? { ...p, steps: p.steps.slice(0, -2) } : p))

  await world.settle((c) => c.kind === "play", { kind: "played", plays: shorter })
  expect(agent.noticed()).toEqual(["Played again: what work tells the agent changed"])
  expect(agent.sees()).not.toHaveProperty("playing")
})

test("a play always ends: stopped, it stops the step under way and its processes; failed, or restored after a restart, it is not playing", async () => {
  const stop = new AbortController()
  const began = Date.now()
  const waiting = play({ name: "waits", group: "noise", title: "", about: "", steps: [{ kind: "start", source: "startup" }, { kind: "wait", seconds: 30 }, { kind: "waited" }] }, stop.signal)

  setTimeout(() => stop.abort(), 2000)
  expect(await waiting).toMatchObject({ error: "stopped" })
  expect(Date.now() - began).toBeLessThan(10_000)

  const { agent, world } = story(design)

  await world.settle((c) => c.kind === "watch", { kind: "changed" })
  await world.settle((c) => c.kind === "play", { kind: "unplayed", error: "the play did not end within 120s, and was stopped" })
  expect(agent.sees()).not.toHaveProperty("playing")
  expect(agent.sees()).toMatchObject({ failure: "the play did not end within 120s, and was stopped" })
  expect(design.restore!({ plays, playing: true, again: true })).toMatchObject({ playing: false })
}, 20_000)

test("a play leaves nothing behind; what a play whose process was killed left, its demo's runtime too, the next play's sweep removes", async () => {
  const mine = () => readdirSync(PLAYS).filter((name) => name.startsWith(`${process.pid}-`))
  const runs = (pid: number) => {
    try {
      return process.kill(pid, 0)
    } catch {
      return false
    }
  }

  await play(SCENARIOS.find((s) => s.name === "start")!)
  expect(mine()).toEqual([])

  // A root killed mid-play: its process ends with the demo's runtime up and the wait under way.
  const script = `import { play } from ${JSON.stringify(new URL("../src/play.ts", import.meta.url).pathname)}
await play({ name: "killed", group: "noise", title: "", about: "", steps: [{ kind: "start", source: "startup" }, { kind: "wait", seconds: 30 }, { kind: "waited" }] })`
  const killed = Bun.spawn([process.execPath, "-e", script], { stdout: "ignore", stderr: "ignore" })
  const left = join(PLAYS, `${killed.pid}-`)
  const service = () => readdirSync(PLAYS).map((name) => join(PLAYS, name, ".babavoss/sessions", SESSION, "baba/service.json")).find((file) => file.startsWith(left) && existsSync(file))
  let file: string | undefined

  for (let i = 0; i < 200 && !(file = service()); i++) await Bun.sleep(50)
  expect(file).toBeDefined()

  const { pid } = JSON.parse(readFileSync(file!, "utf8")) as { pid: number }

  killed.kill("SIGKILL")
  await killed.exited
  expect(runs(pid)).toBe(true)
  await swept()
  expect(readdirSync(PLAYS).filter((name) => join(PLAYS, name).startsWith(left))).toEqual([])
  expect(runs(pid)).toBe(false)
}, 30_000)
