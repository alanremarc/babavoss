// The queue's rules, as stories: an issue goes from the backlog to a lane to done, a lane delivers one at a time, the issues
// form a graph without cycles on narratives, each keeps the reasoning of its passes, and the work is the session's, which
// every tab shares. The work is kept in memory here, the store's own, and its commands are run for real: a tab is idle once
// what the store told it has landed, though it follows the store while it is open.
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import { FILE, store, type Store } from "../src/store.ts"
import type { Work } from "../src/work.ts"
import { queue } from "../src/surface.ts"

type Row = { n: number; status: string; lane?: number; note?: string; narrative: string; from?: number[] }
const rows = (sees: unknown) => (sees as { issues: Row[] }).issues.map(({ n, status, lane }) => [n, status, lane])

/** A queue tab over the session's work, kept in memory: a second tab of the same session is given the same store. */
async function tab(work: Store = store()) {
  const s = story(queue(work), { effects: "real" })

  await s.world.idle()

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
  expect(agent.sees("/narratives/shell")).toMatchObject({ title: "The shell as a desktop", outline: [{ n: 2 }, { n: 3 }, { n: 4, status: "draft" }] })
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

test("the archive's places are the list's below /archive, and the same actions are offered and called there", async () => {
  const { agent, person } = await tab()

  await agent.call("/", "draft", { title: "One", about: "Why" })
  expect(person.sees("/archive/issues/1")).toEqual(person.sees("/issues/1"))
  expect(person.sees("/archive")).toEqual(person.sees("/"))
  expect(person.offered("/archive")).toContain("narrate")
  expect(person.sees("/archived")).toBeUndefined()
  await person.call("/archive/issues/1", "approve", { n: 1 })
  expect(rows(agent.sees())).toEqual([[1, "backlog", undefined]])
  await person.call("/archive/issues/1", "drop", { n: 1 })
  expect(rows(agent.sees())).toEqual([])
})

test("the map is gone: a path into it says where the narratives are", async () => {
  const { agent } = await tab()

  await agent.call("/", "add", { title: "One", about: "Why" })
  expect(agent.sees("/map")).toBeUndefined()
  expect(agent.sees("/map/issues/1")).toBeUndefined()
  expect(await agent.call("/map/issues/1", "start", { n: 1, lane: 1 })).toEqual({
    outcome: "refused",
    reason: "the map is gone: the narratives are at /narratives, each an outline of its issues at /narratives/ID",
  })
})

/** A narrative's outline as the agent reads it: each issue's number, depth and links, without its status and title. */
type Placed = { n: number; depth: number; also?: number[]; from?: Record<string, number[]>; to?: Record<string, number[]> }
const outlined = (sees: unknown) => (sees as { outline: Placed[] }).outline.map(({ n, depth, also, from, to }) => ({ n, depth, ...(also && { also }), ...(from && { from }), ...(to && { to }) }))

/** Work on two narratives: on shell, 1 with 2 and 4 out of it, 3 out of 2, 5 out of 2 and 4; on told, 6, and 7 out of 6 and 3. */
async function branching() {
  const s = await tab()
  const { agent } = s

  await agent.call("/", "narrate", { id: "shell", title: "The shell", about: "What the root offers" })
  await agent.call("/", "narrate", { id: "told", title: "What the agent is told", about: "Its words" })
  await agent.call("/", "add_from", { title: "A strip", about: "Why", from: "", narrative: "shell" })
  await agent.call("/", "add_from", { title: "A menu", about: "Why", from: "1", narrative: "" })
  await agent.call("/", "add_from", { title: "A palette", about: "Why", from: "2", narrative: "" })
  await agent.call("/", "add_from", { title: "A dock", about: "Why", from: "1", narrative: "" })
  await agent.call("/", "add_from", { title: "A drawer", about: "Why", from: "2, 4", narrative: "" })
  await agent.call("/", "add_from", { title: "The words", about: "Why", from: "", narrative: "told" })
  await agent.call("/", "add_from", { title: "The palette's words", about: "Why", from: "6, 3", narrative: "" })

  return s
}

test("a narrative's issues are an outline: its roots in the order added, and under each what came out of it, in that order", async () => {
  const { agent } = await branching()

  await agent.call("/", "add_from", { title: "Another strip", about: "Why", from: "", narrative: "shell" })
  expect(agent.sees("/narratives/shell")).toMatchObject({ title: "The shell", about: "What the root offers", issues: 6, open: 6, open_only: "/narratives/shell/open" })
  expect(outlined(agent.sees("/narratives/shell")).map(({ n, depth }) => [n, depth])).toEqual([
    [1, 0],
    [2, 1],
    [3, 2],
    [5, 2],
    [4, 1],
    [8, 0],
  ])
  expect((agent.sees("/narratives/shell") as { outline: unknown[] }).outline[0]).toEqual({ at: "/issues/1", n: 1, title: "A strip", status: "backlog", depth: 0 })
})

test("an issue with several parents on its narrative stands once, under the first, and names the others", async () => {
  const { agent } = await branching()

  expect(outlined(agent.sees("/narratives/shell")).filter((place) => place.n === 5)).toEqual([{ n: 5, depth: 2, also: [4] }])
})

test("links across narratives are said on the issues they touch, by narrative, and a root here may come out of an issue elsewhere", async () => {
  const { agent } = await branching()

  expect(outlined(agent.sees("/narratives/told"))).toEqual([
    { n: 6, depth: 0 },
    { n: 7, depth: 1, from: { shell: [3] } },
  ])
  expect(outlined(agent.sees("/narratives/shell")).find((place) => place.n === 3)).toEqual({ n: 3, depth: 2, to: { told: [7] } })
  await agent.call("/issues/6", "move", { n: 6, narrative: "shell" })
  expect(outlined(agent.sees("/narratives/told"))).toEqual([{ n: 7, depth: 0, from: { shell: [6, 3] } }])
})

test("open only keeps the open issues and the path to each, and says where the whole outline is", async () => {
  const { agent } = await branching()

  for (const n of [1, 2, 3, 4]) {
    await agent.call(`/issues/${n}`, "start", { n, lane: 1 })
    await agent.call(`/issues/${n}`, "done", { n })
  }
  expect(agent.sees("/narratives/shell")).toMatchObject({ issues: 5, open: 1 })
  expect(agent.sees("/narratives/shell/open")).toMatchObject({ only: "open", all: "/narratives/shell" })
  expect(outlined(agent.sees("/narratives/shell/open")).map(({ n, depth }) => [n, depth])).toEqual([
    [1, 0],
    [2, 1],
    [5, 2],
  ])
  await agent.call("/issues/5", "start", { n: 5, lane: 1 })
  await agent.call("/issues/5", "done", { n: 5 })
  expect(outlined(agent.sees("/narratives/shell/open"))).toEqual([])
  expect(agent.sees("/narratives/moon/open")).toBeUndefined()
})

test("the narratives are listed with what each is about and how many issues are open, those with open issues first", async () => {
  const { agent } = await branching()

  await agent.call("/", "narrate", { id: "quiet", title: "Nothing yet", about: "Waits" })
  for (const n of [6, 7]) await agent.call(`/issues/${n}`, "drop", { n })
  expect(agent.sees("/narratives")).toEqual({
    title: "Narratives",
    narratives: [
      { at: "/narratives/shell", id: "shell", title: "The shell", about: "What the root offers", issues: 5, open: 5 },
      { at: "/narratives/told", id: "told", title: "What the agent is told", about: "Its words", issues: 0, open: 0 },
      { at: "/narratives/quiet", id: "quiet", title: "Nothing yet", about: "Waits", issues: 0, open: 0 },
    ],
  })
  expect(agent.sees("/narratives/quiet")).toMatchObject({ issues: 0, outline: [] })
  expect(agent.sees()).not.toHaveProperty("narratives.0.about")
})

test("the work is the session's: a second tab shows it and follows changes, and a tab opened after one closed finds it", async () => {
  const work = store()
  const first = await tab(work)
  const second = await tab(work)

  await first.agent.call("/", "add", { title: "One", about: "Why" })
  await second.world.idle()
  expect(rows(second.agent.sees())).toEqual([[1, "backlog", undefined]])

  await second.agent.call("/issues/1", "start", { n: 1, lane: 1 })
  await first.world.idle()
  expect(rows(first.agent.sees())).toEqual([[1, "lane", 1]])
  const later = await tab(work)

  expect(rows(later.agent.sees())).toEqual([[1, "lane", 1]])
  expect(await later.agent.call("/issues/1", "start", { n: 1, lane: 2 })).toMatchObject({ outcome: "refused" })
})

test("a new tab says it is reading until it hears the session's work, so its page never shows none for an instant", async () => {
  const work = store()
  const first = await tab(work)

  await first.agent.call("/", "add", { title: "One", about: "Why" })

  const fresh = story(queue(work), { effects: "real" })

  expect(fresh.person.sees()).toMatchObject({ reading: true, issues: [] })
  await fresh.world.idle()
  expect(fresh.person.sees()).not.toHaveProperty("reading")
  expect(rows(fresh.person.sees())).toEqual([[1, "backlog", undefined]])

  const kept: Work = { issues: [], narratives: [], next: 1, clock: 0 }

  expect(story(queue(store()), { model: { work: kept } }).person.sees()).not.toHaveProperty("reading")
})

test("removing the session's file begins its work again, in every tab that is open", async () => {
  const dir = mkdtempSync(join(tmpdir(), "queue-"))
  const file = join(dir, FILE)
  const work = store(() => file)
  const first = await tab(work)
  const second = await tab(work)

  try {
    await first.agent.call("/", "add", { title: "One", about: "Why" })
    rmSync(file)
    // The file's watcher hears it removed when the system tells it, which is no set time.
    for (let waited = 0; rows(second.person.sees()).length && waited < 3000; waited += 20) await new Promise((done) => setTimeout(done, 20))
    await first.world.idle()
    expect(rows(first.person.sees())).toEqual([])
    expect(rows(second.person.sees())).toEqual([])
    await second.agent.call("/", "add", { title: "Again", about: "Why" })
    expect(second.agent.sees()).toMatchObject({ issues: [{ n: 1, title: "Again" }] })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
