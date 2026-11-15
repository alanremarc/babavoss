// The queue's rules, as stories: an issue goes from the backlog to a lane to done, a lane delivers one at a time, the issues
// form a graph without cycles on narratives, each keeps the reasoning of its passes, and the work is the session's, which
// every tab shares. The work is kept in memory here, the store's own, and its commands are run for real.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import { store, type Store } from "../src/store.ts"
import { queue } from "../src/surface.ts"

type Row = { n: number; status: string; lane?: number; note?: string; narrative: string; from?: number[] }
const rows = (sees: unknown) => (sees as { issues: Row[] }).issues.map(({ n, status, lane }) => [n, status, lane])

/** What the store told every tab has landed: its events are queued as they are sent. A tab follows the store while it is open, so it is never idle. */
const heard = () => new Promise((done) => setTimeout(done, 1))

/** A queue tab over the session's work, kept in memory: a second tab of the same session is given the same store. */
async function tab(work: Store = store()) {
  const s = story(queue(work), { effects: "real" })

  await heard()

  return s
}

test("an issue goes from the backlog to a lane to done, and the stack shows lanes, then backlog, then done", async () => {
  const { agent } = await tab()

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
  const { agent } = await tab()

  await agent.call("/", "add", { title: "One", about: "Why" })
  await agent.call("/", "add", { title: "Two", about: "Why" })
  await agent.call("/issues/1", "start", { n: 1, lane: 1 })
  expect(await agent.call("/issues/2", "start", { n: 2, lane: 1 })).toEqual({ outcome: "refused", reason: "Lane 1 is delivering issue 1" })
  expect(await agent.call("/issues/2", "start", { n: 2, lane: 6 })).toEqual({ outcome: "refused", reason: "There are lanes 1 to 5" })
})

test("a note says where an issue stands, an issue can go back, and a dropped one is gone", async () => {
  const { agent } = await tab()

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
  const { agent, person } = await tab()

  await agent.call("/", "draft", { title: "Rename the picker", about: "It reads as a list" })
  expect(rows(agent.sees())).toEqual([[1, "draft", undefined]])
  expect(agent.sees()).toMatchObject({ attention: { who: "person", why: "to approve or drop 1 draft" } })
  expect(agent.sees("/issues/1")).toMatchObject({ attention: { who: "person" } })
  expect(await agent.call("/issues/1", "approve", { n: 1 })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/issues/1", "start", { n: 1, lane: 1 })).toMatchObject({ outcome: "refused" })

  agent.told()
  await person.call("/issues/1", "approve", { n: 1 })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined]])
  expect(agent.told()).toContain('/issues/1: status "draft" → "backlog"')
  expect(agent.sees()).not.toHaveProperty("attention")
  expect(agent.noticed()).toEqual(["Draft 1, Rename the picker, approved: it joins the backlog"])
})

test("what happens to an issue is noticed: started, done, dropped; the agent is not told back what its own calls did", async () => {
  const { agent, person } = await tab()

  await agent.call("/", "add", { title: "One", about: "Why" })
  await agent.call("/issues/1", "start", { n: 1, lane: 2 })
  await agent.call("/issues/1", "done", { n: 1 })
  await person.call("/issues/1", "drop", { n: 1 })
  expect(person.noticed()).toEqual(["Issue 1, One, started in lane 2", "Issue 1, One, is done", "Issue 1, One, dropped"])
  expect(agent.noticed()).toEqual(["Issue 1, One, dropped"])
})

test("a lane's worker posts updates to its issue's channel, read at the issue's path and not in the stack", async () => {
  const { agent } = await tab()

  await agent.call("/", "add", { title: "One", about: "Why" })
  expect(await agent.call("/issues/1", "post", { n: 1, text: "early" })).toMatchObject({ outcome: "refused" })
  await agent.call("/issues/1", "start", { n: 1, lane: 1 })
  await agent.call("/issues/1", "post", { n: 1, text: "reproduced the fault" })
  await agent.call("/issues/1", "post", { n: 1, text: " specs pass " })
  expect((agent.sees("/issues/1") as { updates: { text: string }[] }).updates.map((u) => u.text)).toEqual(["reproduced the fault", "specs pass"])
  expect(agent.sees()).not.toHaveProperty("issues.0.updates")
  expect(await agent.call("/issues/1", "post", { n: 1, text: " " })).toEqual({ outcome: "refused", reason: "Say what happened" })
  await agent.call("/issues/1", "done", { n: 1 })
  expect(agent.sees("/issues/1")).toMatchObject({ updates: [{ text: "reproduced the fault" }, { text: "specs pass" }] })
})

test("an issue comes out of others on a narrative: its own, its first parent's, or the default one", async () => {
  const { agent } = await tab()

  await agent.call("/", "narrate", { id: "shell", title: "The shell as a desktop", about: "What the root offers" })
  await agent.call("/", "add", { title: "A strip", about: "Why" })
  await agent.call("/", "add_from", { title: "A menu", about: "Why", from: "", narrative: "shell" })
  await agent.call("/", "add_from", { title: "A palette", about: "Why", from: "2, 1", narrative: "" })
  await agent.call("/", "draft_from", { title: "A dock", about: "Why", from: "3", narrative: "" })
  expect((agent.sees() as { issues: Row[] }).issues.map(({ n, narrative, from }) => [n, narrative, from])).toEqual([
    [1, "work", undefined],
    [2, "shell", undefined],
    [3, "shell", [2, 1]],
    [4, "shell", [3]],
  ])
  expect(agent.sees()).toMatchObject({
    narratives: [
      { at: "/narratives/shell", id: "shell", issues: 3, open: 3 },
      { at: "/narratives/work", id: "work", issues: 1, open: 1 },
    ],
  })
  expect(agent.sees("/narratives/shell")).toMatchObject({ title: "The shell as a desktop", issues: [{ n: 2 }, { n: 3 }, { n: 4, status: "draft" }] })
  expect(agent.sees("/issues/3")).toMatchObject({ narrative: { id: "shell" }, from: [{ n: 2 }, { n: 1 }], to: [{ n: 4 }] })
  expect(await agent.call("/", "add_from", { title: "Nowhere", about: "Why", from: "", narrative: "moon" })).toEqual({ outcome: "refused", reason: "There is no narrative moon" })
  expect(await agent.call("/", "add_from", { title: "Orphan", about: "Why", from: "77", narrative: "" })).toEqual({ outcome: "refused", reason: "There is no issue 77" })
  await agent.call("/issues/1", "move", { n: 1, narrative: "shell" })
  expect(agent.sees("/issues/1")).toMatchObject({ narrative: { id: "shell" } })
})

test("the issues are a graph without cycles: a link that would close one is refused, as are itself and a missing issue", async () => {
  const { agent } = await tab()

  await agent.call("/", "add", { title: "One", about: "Why" })
  await agent.call("/", "add_from", { title: "Two", about: "Why", from: "1", narrative: "" })
  await agent.call("/", "add_from", { title: "Three", about: "Why", from: "2", narrative: "" })
  expect(await agent.call("/issues/1", "link", { n: 1, from: 3 })).toEqual({ outcome: "refused", reason: "Issue 3 came out of 1, so 1 cannot come out of it" })
  expect(await agent.call("/issues/1", "link", { n: 1, from: 1 })).toEqual({ outcome: "refused", reason: "An issue cannot come out of itself" })
  expect(await agent.call("/issues/1", "link", { n: 1, from: 99 })).toEqual({ outcome: "refused", reason: "There is no issue 99" })
  expect(await agent.call("/issues/3", "link", { n: 3, from: 1 })).toMatchObject({ outcome: "written" })
  expect(agent.sees("/issues/1")).toMatchObject({ to: [{ n: 2 }, { n: 3 }] })
  await agent.call("/issues/3", "unlink", { n: 3, from: 1 })
  expect(agent.sees("/issues/1")).toMatchObject({ to: [{ n: 2 }] })
  await agent.call("/issues/2", "drop", { n: 2 })
  expect(agent.sees("/issues/3")).toMatchObject({ from: [] })
})

test("another pass at an issue is an iteration: why, what was decided and what came of it are seen at the issue's path", async () => {
  const { agent, person } = await tab()

  await agent.call("/", "add", { title: "Provision each harness", about: "Why" })
  expect(agent.offered("/issues/1")).not.toContain("decide")
  await agent.call("/issues/1", "iterate", { n: 1, title: "Ask each harness", why: "Codex and Claude Code provision differently." })
  await agent.call("/issues/1", "decide", { n: 1, text: "One adapter per harness." })
  await agent.call("/issues/1", "conclude", { n: 1, text: "Two adapters drafted." })
  expect(agent.sees("/issues/1")).toMatchObject({
    iterations: [{ n: 1, title: "Ask each harness", why: "Codex and Claude Code provision differently.", decided: "One adapter per harness.", outcome: "Two adapters drafted." }],
    menu: [{ label: "Move" }, { label: "Edit" }, { label: "Reasoning", actions: ["iterate", "decide", "conclude"] }],
  })
  expect(person.noticed()).toEqual(["Issue 1 begins iteration 1: Ask each harness"])
})

test("the map's places are the list's below /map, and the same actions are offered and called there", async () => {
  const { agent, person } = await tab()

  await agent.call("/", "draft", { title: "One", about: "Why" })
  expect(person.sees("/map/issues/1")).toEqual(person.sees("/issues/1"))
  expect(person.offered("/map")).toContain("narrate")
  await person.call("/map/issues/1", "approve", { n: 1 })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined]])
})

test("the work is the session's: a second tab shows it and follows changes, and a tab opened after one closed finds it", async () => {
  const work = store()
  const first = await tab(work)
  const second = await tab(work)

  await first.agent.call("/", "add", { title: "One", about: "Why" })
  await heard()
  expect(rows(second.agent.sees())).toEqual([[1, "backlog", undefined]])

  await second.agent.call("/issues/1", "start", { n: 1, lane: 1 })
  await heard()
  expect(rows(first.agent.sees())).toEqual([[1, "lane", 1]])
  const later = await tab(work)

  expect(rows(later.agent.sees())).toEqual([[1, "lane", 1]])
  expect(await later.agent.call("/issues/1", "start", { n: 1, lane: 2 })).toMatchObject({ outcome: "refused" })
})
