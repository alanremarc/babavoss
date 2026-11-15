// The design document's rules, as stories. The scenarios are played once for real, on the demo project through the
// framework's hook, word and runtime, and settled as the play command's event: what is shown is what that code gave.
import { readFileSync } from "node:fs"
import { beforeAll, expect, test } from "bun:test"
import { story, whole, type Json } from "babavoss/core/index.ts"
import { TELLS } from "babavoss/core/hook.ts"
import design, { type Model } from "../src/surface.ts"
import { play, WORD, type Play } from "../src/play.ts"
import { SCENARIOS } from "../src/scenarios.ts"
import tasks from "../demo/surfaces/tasks/src/surface.ts"
import { lineDiff } from "../src/measure.ts"

type Row = { at: string; name: string; steps: number; lines: number; chars: number; tokens: number; delta?: string }
type Telling = { carrier: string; lines: number; chars: number; tokens: number; delta?: string; text: string; pinned?: string }
type Step = { at: string; n: number; who: string; did: string; changed: string[] | string; tellings: Telling[] }

let plays: Play[] = []

beforeAll(async () => {
  plays = await Promise.all(SCENARIOS.map((s) => play(s)))
}, 60_000)

/** The design document with the plays settled, as when its watch starts it and the play ends. */
async function played(model?: Model) {
  const told = story(design, model ? { model } : {})

  await told.world.settle((c) => c.kind === "watch", { kind: "changed" })
  await told.world.settle((c) => c.kind === "play", { kind: "played", plays })

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

test("/ lists the scenarios with their sizes and an at each, and a session start is played as its hook gives it", async () => {
  const { agent } = await played()
  const rows = (agent.sees() as { scenarios: Row[] }).scenarios

  expect(agent.sees()).toMatchObject({ title: "Design Document" })
  expect(rows.map((r) => [r.at, r.name])).toEqual(SCENARIOS.map((s) => [`/scenarios/${s.name}`, s.name]))
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
  expect(heard.text).toContain("the person acted on tasks /tabs/1")
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
  expect(step.changed).toContain("activity: agent · tasks /tabs/1 · opened")
  expect(agent.sees("/scenarios/work/99")).toBeUndefined()
  expect(agent.sees("/scenarios/none")).toBeUndefined()
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
