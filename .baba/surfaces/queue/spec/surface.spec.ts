// The queue's rules, as stories: an issue goes from the backlog to a lane to done, and a lane delivers one at a time.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import queue from "../src/surface.ts"

type Row = { n: number; status: string; lane?: number; note?: string }
const rows = (sees: unknown) => (sees as { issues: Row[] }).issues.map(({ n, status, lane }) => [n, status, lane])

test("an issue goes from the backlog to a lane to done, and the stack shows lanes, then backlog, then done", async () => {
  const { agent } = story(queue)

  await agent.call("/", "add", { title: "Show the present" })
  await agent.call("/", "add", { title: "Rename the picker" })
  await agent.call("/", "add", { title: "Close a tab" })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined], [2, "backlog", undefined], [3, "backlog", undefined]])

  await agent.call("/", "start", { n: 2, lane: 1 })
  await agent.call("/", "start", { n: 3, lane: 2 })
  await agent.call("/", "done", { n: 3 })
  expect(rows(agent.sees())).toEqual([[2, "lane", 1], [1, "backlog", undefined], [3, "done", undefined]])
  expect(agent.sees()).toMatchObject({ free: [2, 3, 4, 5] })
})

test("a lane delivers one issue at a time, and there are five", async () => {
  const { agent } = story(queue)

  await agent.call("/", "add", { title: "One" })
  await agent.call("/", "add", { title: "Two" })
  await agent.call("/", "start", { n: 1, lane: 1 })
  expect(await agent.call("/", "start", { n: 2, lane: 1 })).toEqual({ outcome: "refused", reason: "Lane 1 is delivering issue 1" })
  expect(await agent.call("/", "start", { n: 2, lane: 6 })).toEqual({ outcome: "refused", reason: "There are lanes 1 to 5" })
})

test("a note says where an issue stands, an issue can go back, and a dropped one is gone", async () => {
  const { agent } = story(queue)

  await agent.call("/", "add", { title: "One" })
  await agent.call("/", "start", { n: 1, lane: 3 })
  await agent.call("/", "note", { n: 1, text: "specs pass, merging" })
  expect((agent.sees() as { issues: Row[] }).issues[0]).toMatchObject({ lane: 3, note: "specs pass, merging" })

  await agent.call("/", "back", { n: 1 })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined]])
  await agent.call("/", "drop", { n: 1 })
  expect(rows(agent.sees())).toEqual([])
  expect(await agent.call("/", "add", { title: " " })).toEqual({ outcome: "refused", reason: "An issue needs a title" })
})
