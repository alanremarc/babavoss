// The map's rules, as stories: the issues form a graph without cycles, and each issue keeps the reasoning of its iterations.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import map from "../src/surface.ts"

type Row = { n: number; from: number[]; at: string }
type Root = { narratives: { id: string; at: string; issues: number }[] }

/** Every issue the agent can reach from / by the narratives' paths. */
const issues = (sees: (path?: string) => unknown): Row[] => (sees() as Root).narratives.flatMap((x) => (sees(x.at) as { issues: Row[] }).issues)

test("the seed is a graph without cycles, and every issue it came out of is on the map", () => {
  const { agent } = story(map)
  const all = issues(agent.sees)
  const by = new Map(all.map((row) => [row.n, row]))
  const state = new Map<number, "walking" | "done">()
  const acyclic = (n: number): boolean => {
    if (state.get(n) === "done") return true
    if (state.get(n) === "walking") return false
    state.set(n, "walking")

    const ok = by.get(n)!.from.every((p) => by.has(p) && acyclic(p))

    state.set(n, "done")

    return ok
  }

  expect(all.length).toBeGreaterThan(20)
  expect(all.every((row) => acyclic(row.n))).toBe(true)
  expect(agent.sees("/issues/29")).toMatchObject({ from: [{ n: 10 }, { n: 27 }, { n: 28 }, { n: 15 }], to: [] })
  expect(agent.sees("/issues/9")).toMatchObject({ to: [{ n: 11 }, { n: 14 }, { n: 16 }, { n: 34 }] })
})

test("a link that would close a cycle is refused, as is one to an issue not on the map", async () => {
  const { agent } = story(map)

  expect(await agent.call("/issues/9", "link", { n: 9, from: 34 })).toEqual({
    outcome: "refused",
    reason: "Issue 34 came out of 9, so 9 cannot come out of it",
  })
  expect(await agent.call("/issues/9", "link", { n: 9, from: 9 })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/issues/9", "link", { n: 9, from: 99 })).toEqual({ outcome: "refused", reason: "There is no issue 99" })
  expect(await agent.call("/issues/25", "link", { n: 25, from: 13 })).toMatchObject({ outcome: "written" })
  expect(agent.sees("/issues/13")).toMatchObject({ to: [{ n: 25 }] })
  await agent.call("/issues/25", "unlink", { n: 25, from: 13 })
  expect(agent.sees("/issues/13")).toMatchObject({ to: [] })
})

test("another pass on an issue is an iteration, and its reasoning is seen at the issue's path", async () => {
  const { agent, person } = story(map)

  await agent.call("/issues/25", "iterate", { n: 25, title: "Ask each harness", why: "Codex and Claude Code provision differently." })
  await agent.call("/issues/25", "decide", { n: 25, text: "One adapter per harness." })
  await agent.call("/issues/25", "conclude", { n: 25, text: "Two adapters drafted." })
  expect(agent.sees("/issues/25")).toMatchObject({
    iterations: [
      {
        n: 1,
        title: "Ask each harness",
        why: "Codex and Claude Code provision differently.",
        decided: "One adapter per harness.",
        outcome: "Two adapters drafted.",
      },
    ],
  })
  expect(person.noticed()).toEqual(["Issue 25 begins iteration 1: Ask each harness"])
})

test("an issue added on a narrative is listed there with what it came out of", async () => {
  const { agent } = story(map)

  expect(await agent.call("/", "add", { title: "Draw the map", narrative: "queue", from: "34, 9" })).toMatchObject({ outcome: "written" })
  expect((agent.sees("/narratives/queue") as { issues: Row[] }).issues.at(-1)).toMatchObject({ n: 35, title: "Draw the map", status: "backlog", from: [34, 9] })
  expect(agent.sees()).toMatchObject({ narratives: expect.arrayContaining([expect.objectContaining({ id: "queue", issues: 3 })]) })
  expect(await agent.call("/", "add", { title: "Nowhere", narrative: "moon", from: "" })).toEqual({ outcome: "refused", reason: "There is no narrative moon" })
  expect(await agent.call("/", "add", { title: "Orphan", narrative: "queue", from: "77" })).toEqual({ outcome: "refused", reason: "There is no issue 77" })
})
