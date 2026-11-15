// The queue's rules, as stories: an issue goes from the backlog to a lane to done, and a lane delivers one at a time.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import queue from "../src/surface.ts"

type Row = { n: number; status: string; lane?: number; note?: string }
const rows = (sees: unknown) => (sees as { issues: Row[] }).issues.map(({ n, status, lane }) => [n, status, lane])

test("an issue goes from the backlog to a lane to done, and the stack shows lanes, then backlog, then done", async () => {
  const { agent } = story(queue)

  await agent.call("/", "add", { title: "Show the present", about: "Why" })
  await agent.call("/", "add", { title: "Rename the picker", about: "Why" })
  await agent.call("/", "add", { title: "Close a tab", about: "Why" })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined], [2, "backlog", undefined], [3, "backlog", undefined]])

  await agent.call("/issues/2", "start", { n: 2, lane: 1 })
  await agent.call("/issues/3", "start", { n: 3, lane: 2 })
  await agent.call("/issues/3", "done", { n: 3 })
  expect(rows(agent.sees())).toEqual([[2, "lane", 1], [1, "backlog", undefined], [3, "done", undefined]])
  expect(agent.sees()).toMatchObject({ free: [2, 3, 4, 5] })
})

test("a lane delivers one issue at a time, and there are five", async () => {
  const { agent } = story(queue)

  await agent.call("/", "add", { title: "One", about: "Why" })
  await agent.call("/", "add", { title: "Two", about: "Why" })
  await agent.call("/issues/1", "start", { n: 1, lane: 1 })
  expect(await agent.call("/issues/2", "start", { n: 2, lane: 1 })).toEqual({ outcome: "refused", reason: "Lane 1 is delivering issue 1" })
  expect(await agent.call("/issues/2", "start", { n: 2, lane: 6 })).toEqual({ outcome: "refused", reason: "There are lanes 1 to 5" })
})

test("a note says where an issue stands, an issue can go back, and a dropped one is gone", async () => {
  const { agent } = story(queue)

  await agent.call("/", "add", { title: "One", about: "Why" })
  await agent.call("/issues/1", "start", { n: 1, lane: 3 })
  await agent.call("/issues/1", "note", { n: 1, text: "specs pass, merging" })
  expect((agent.sees() as { issues: Row[] }).issues[0]).toMatchObject({ lane: 3, note: "specs pass, merging" })
  expect(agent.sees("/issues/1")).toMatchObject({ about: "Why" })
  expect(agent.sees()).not.toHaveProperty("issues.0.about")

  await agent.call("/issues/1", "back", { n: 1 })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined]])
  await agent.call("/issues/1", "drop", { n: 1 })
  expect(rows(agent.sees())).toEqual([])
  expect(await agent.call("/", "add", { title: " ", about: "Why" })).toEqual({ outcome: "refused", reason: "An issue needs a title and a line about it" })
})

test("what the agent suggests is a draft, which only the person approves into the backlog", async () => {
  const { agent, person } = story(queue)

  await agent.call("/", "draft", { title: "Rename the picker", about: "It reads as a list" })
  expect(rows(agent.sees())).toEqual([[1, "draft", undefined]])
  expect(agent.sees()).toMatchObject({ attention: { who: "person", why: "to approve or drop 1 draft" } })
  expect(agent.sees("/issues/1")).toMatchObject({ attention: { who: "person" } })
  expect(await agent.call("/issues/1", "approve", { n: 1 })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/issues/1", "start", { n: 1, lane: 1 })).toMatchObject({ outcome: "refused" })

  agent.told()
  await person.call("/issues/1", "approve", { n: 1 })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined]])
  expect(agent.told()).toContain('issues.0.status: "draft" → "backlog"')
  expect(agent.sees()).not.toHaveProperty("attention")
  expect(agent.noticed()).toEqual(["Draft 1, Rename the picker, approved: it joins the backlog"])
})

test("what happens to an issue is noticed: started, done, dropped; the agent is not told back what its own calls did", async () => {
  const { agent, person } = story(queue)

  await agent.call("/", "add", { title: "One", about: "Why" })
  await agent.call("/issues/1", "start", { n: 1, lane: 2 })
  await agent.call("/issues/1", "done", { n: 1 })
  await person.call("/issues/1", "drop", { n: 1 })
  expect(person.noticed()).toEqual(["Issue 1, One, started in lane 2", "Issue 1, One, is done", "Issue 1, One, dropped"])
  expect(agent.noticed()).toEqual(["Issue 1, One, dropped"])
})
