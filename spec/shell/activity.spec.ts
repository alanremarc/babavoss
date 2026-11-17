// The shell's activity: entries from notices, marked so, and from calls that gave none, the shell's own open, close and
// show, the bound, what is kept from before, /activity and /activity/notices and their pages, what the agent is told of it,
// what the person has seen of the notices, one by one or up to a mark, by the page's quiet actions; a closed tab's entries going with it.
import { describe, expect, it } from "bun:test"
import { action, story, surface, view, type Call, type Update } from "../../framework/core/index.ts"
import { KEPT, PAGE, linesOf, lookAt, record, restored, said, seenFrom, seeUpto, unseenIn, unseenOf, type Entry, type Line } from "../../framework/shell/src/activity.ts"
import { shell, type ShellModel } from "../../framework/shell/src/surface.ts"
import type { Row } from "../../framework/shell/ui/thread.ts"

type Model = { n: number }
type Event = { kind: "rang" }
type Command = { kind: "ring" }

const bump = action({
  name: "bump",
  description: "add one",
  subject: {},
  inputs: { by: "number", why: "string" },
  update: (m: Model, { by }): Update<Model, Command> => ({ model: { n: m.n + by } }),
})
const approve = action({
  name: "approve",
  description: "approve one",
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Update<Model, Command> => ({ model: m, notices: [{ text: `Approved #${n}`, at: `/things/${n}` }] }),
})
const ring = action({
  name: "ring",
  description: "ring later",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: m, commands: [{ kind: "ring" }] }),
})
const pages = view([bump, approve, ring], {
  "/": (m) => ({ n: m.n, bump: bump.bind({}), approve: approve.bind({ n: 12 }), ring: ring.bind({}) }),
  "/things/:n": (_m, { n }) => ({ n: Number(n), approve: approve.bind({ n: Number(n) }) }),
})
const things = surface<Model, Event, Command>({
  description: "things",
  init: () => ({ n: 0 }),
  update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : { model: m, notices: ["Rang"] }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "rang" }),
})
const T = Date.UTC(2026, 10, 15, 16, 0, 0)
const held = { tabs: [{ n: 2, surface: "queue" }], next: 3 }
const call = (path: string, handle: string, args: Call["args"], actor = "agent:s"): Call => ({ kind: "call", path, handle, args, actor, t: T })

describe("the activity log", () => {
  it("takes a call's notices as its entries, by who called, where each is about", () => {
    expect(linesOf(held, call("/tabs/2", "approve", { n: 12 }, "person"), T, [{ text: "Approved #12", at: "/tabs/2/issues/12", from: "queue" }])).toEqual([
      { when: T, who: "person", surface: "queue", at: "/tabs/2/issues/12", what: "Approved #12", notice: true },
    ])
  })

  it("takes a call that gave no notice as one mechanical line: its handle and arguments, where it was called", () => {
    expect(linesOf(held, call("/tabs/2/issues/3", "draft", { n: 3, title: "Fix the door" }), T)).toEqual([
      { when: T, who: "agent", surface: "queue", at: "/tabs/2/issues/3", what: 'draft n=3 title="Fix the door"' },
    ])
    expect(said("add", { text: "x".repeat(100) })).toHaveLength("add text=".length + 60)
  })

  it("takes a command's event only by its notices, as the surface's", () => {
    expect(linesOf(held, { kind: "tab", n: 2 }, T, ["Lane 1 finished"])).toEqual([{ when: T, who: "surface", surface: "queue", at: "/tabs/2", what: "Lane 1 finished", notice: true }])
    expect(linesOf(held, { kind: "tab", n: 2 }, T)).toEqual([])
  })

  it("takes the shell's own open, close and show", () => {
    expect(linesOf(held, call("/", "open", { surface: "lab" }, "person"), T)).toEqual([{ when: T, who: "person", surface: "lab", at: "/tabs/3", what: "opened", own: true }])
    expect(linesOf(held, call("/", "close", { n: 2 }), T)).toEqual([{ when: T, who: "agent", surface: "queue", at: "/tabs/2", what: "closed", own: true }])
    expect(linesOf(held, call("/", "show", { at: "/tabs/2/issues/4" }), T)).toEqual([
      { when: T, who: "agent", surface: "queue", at: "/tabs/2/issues/4", what: "shown to the person", own: true },
    ])
    expect(restored([{ n: 1, when: T, who: "agent", surface: "queue", at: "/tabs/2", what: "closed", own: true }])[0]).toHaveProperty("own", true)
  })

  it("numbers entries on from the last and keeps the newest KEPT", () => {
    const line: Line = { when: T, who: "agent", surface: "queue", at: "/tabs/2", what: "bump" }
    let kept: Entry[] = []

    for (let i = 0; i < KEPT + 5; i++) kept = record(kept, [line])
    expect(kept).toHaveLength(KEPT)
    expect([kept[0]!.n, kept.at(-1)!.n]).toEqual([6, KEPT + 5])
  })

  it("restores none from state kept before it, and only what reads as an entry", () => {
    expect(restored(undefined)).toEqual([])

    const entry: Entry = { n: 1, when: T, who: "person", surface: "queue", at: "/", what: "bump" }

    expect(restored([entry, { n: 2, what: "half" }, null])).toEqual([entry])

    const program = shell({ things })

    expect(program.restore!({ tabs: [{ n: 1, surface: "things", model: { n: 0 } }], next: 2 }).activity).toEqual([])
    expect(program.restore!({ tabs: [], next: 2, activity: [entry] }).activity).toEqual([entry])
  })

  it("reads an entry kept before entries were marked as a notice where a surface did it, and as a call's line otherwise", () => {
    const old = (n: number, who: Entry["who"]) => ({ n, when: T, who, surface: "queue", at: "/tabs/2", what: "x" })

    expect(restored([old(1, "surface"), old(2, "agent"), old(3, "person"), { ...old(4, "agent"), notice: true }]).map((e) => e.notice ?? false)).toEqual([
      true,
      false,
      false,
      true,
    ])
  })

  it("keeps on each line of a call the name its caller gave it, where it gave one", () => {
    const named = { ...call("/tabs/2", "approve", { n: 12 }, "person"), id: "lab:act-3" }

    expect(linesOf(held, named, T, ["Approved #12", "Queue empty"]).map((l) => l.id)).toEqual(["lab:act-3", "lab:act-3"])
    expect(linesOf(held, named, T)).toEqual([{ when: T, who: "person", surface: "queue", at: "/tabs/2", what: "approve n=12", id: "lab:act-3" }])
    expect(linesOf(held, call("/tabs/2", "approve", { n: 12 }, "person"), T)[0]).not.toHaveProperty("id")
  })

  it("gives no line for the person marking what they have seen", () => {
    expect(linesOf(held, call("/activity/notices", "seen", { n: 4 }, "person"), T)).toEqual([])
  })
})

describe("the shell's activity", () => {
  it("keeps every committed call, by who made it, at its time; a refusal is not kept", async () => {
    const { agent, person } = story(shell({ things }))
    const before = Date.now()

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "bump", { by: 2, why: "two more" })
    await person.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "approve", { n: 99 })

    const rows = (agent.sees("/activity")!.entries as { when: string }[]).map(({ when, ...row }) => {
      expect(Date.parse(when)).toBeGreaterThanOrEqual(before - 1000)

      return row
    })

    expect(rows).toEqual([
      { n: 3, who: "person", kind: "notice", surface: "things", at: "/things/things/12", tab: "/things", what: "Approved #12" },
      { n: 2, who: "agent", kind: "call", surface: "things", at: "/things", tab: "/things", what: 'bump by=2 why="two more"' },
      { n: 1, who: "person", kind: "call", surface: "things", at: "/things", what: "opened" },
    ])
  })

  it("keeps a command's notices as the surface's, and lets a tab's entries go with it when it closes, the shell's own lines staying", async () => {
    const { agent, world } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await agent.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "ring")
    await world.settle({ kind: "tab", n: 1, event: { kind: "rang" } })
    await agent.call("/tabs/2", "bump", { by: 1, why: "x" })

    expect((agent.sees("/activity")!.entries as Row[]).map((r) => [r.n, r.who, r.tab, r.what])).toEqual([
      [5, "agent", "/tabs/2", 'bump by=1 why=x'],
      [4, "surface", "/things", "Rang"],
      [3, "agent", "/things", "ring"],
      [2, "agent", undefined, "opened"],
      [1, "agent", undefined, "opened"],
    ])
    await agent.call("/", "close", { n: 1 })
    expect((agent.sees("/activity")!.entries as Row[]).map((r) => [r.n, r.at, r.tab, r.what])).toEqual([
      [6, null, undefined, "closed"],
      [5, "/tabs/2", "/tabs/2", 'bump by=1 why=x'],
      [2, "/tabs/2", undefined, "opened"],
      [1, null, undefined, "opened"],
    ])
    expect(agent.sees("/activity/notices")).toMatchObject({ kept: 0 })
    await agent.call("/tabs/2", "bump", { by: 1, why: "y" })
    expect((agent.sees("/activity")!.entries as Row[])[0]!.n).toBe(7)
  })

  it("shows PAGE at a time, newest first, and names the page before", async () => {
    const { agent } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    for (let i = 0; i < PAGE + 9; i++) await agent.call("/tabs/1", "bump", { by: 1, why: "more" })

    const first = agent.sees("/activity")!
    const second = agent.sees(String((first.earlier as { at: string }).at))!

    expect([first.kept, (first.entries as Row[]).length, (first.entries as Row[])[0]!.n]).toEqual([PAGE + 10, PAGE, PAGE + 10])
    expect(first.earlier).toEqual({ at: "/activity/10" })
    expect((second.entries as Row[]).map((r) => r.n)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(second).not.toHaveProperty("earlier")
    expect(agent.sees("/activity/0")).toBeUndefined()
    expect(story(shell({ things })).agent.sees("/activity")).toMatchObject({ kept: 0, entries: "none yet" })
  })

  it("is named at / by one fact that never changes, so the agent is told nothing of it entry by entry", async () => {
    const { agent, person } = story(shell({ things }))

    expect(agent.told()).toContain('activity.at: "/activity"')
    await agent.call("/", "open", { surface: "things" })
    agent.told()
    await person.call("/tabs/1", "approve", { n: 12 })
    await person.call("/tabs/1", "bump", { by: 1, why: "x" })

    expect(agent.told().filter((line) => line.startsWith("activity"))).toEqual([])
    expect(agent.noticed()).toEqual(["Approved #12"])
  })

  it("gives the notices alone at /activity/notices, newest first, with their pages", async () => {
    const { agent, person } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await person.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "bump", { by: 1, why: "x" })
    await agent.call("/tabs/1", "approve", { n: 12 })

    expect(agent.sees("/activity")!.notices).toEqual({ at: "/activity/notices" })

    const notices = agent.sees("/activity/notices")!

    expect(notices).toMatchObject({ at: "/activity/notices", kept: 2 })
    expect((notices.entries as Row[]).map((r) => [r.n, r.who, r.what])).toEqual([
      [4, "agent", "Approved #12"],
      [2, "person", "Approved #12"],
    ])
    expect((notices.entries as Row[])[0]).not.toHaveProperty("kind")
    expect((agent.sees("/activity/notices/3")!.entries as Row[]).map((r) => r.n)).toEqual([2])
  })

  it("keeps its entries across a restart", async () => {
    const s = story(shell({ things }))

    await s.agent.call("/", "open", { surface: "things" })
    await s.restart()

    expect(s.agent.sees("/activity")).toMatchObject({ kept: 1 })
  })

  it("is kept in the model beside the tabs, and a broken tab's event leaves it as it was", () => {
    const program = shell({ things })
    const model: ShellModel = { tabs: [], next: 1 }

    expect(program.update(model, call("/", "open", { surface: "things" }))).toMatchObject({ model: { activity: [{ n: 1, when: T, what: "opened" }] } })
    expect(program.update(model, { kind: "tab", n: 4, event: { kind: "rang" } })).toEqual({ model })
  })
})

describe("what the person has seen", () => {
  const entry = (n: number, who: Entry["who"], notice = true): Entry => ({ n, when: T, who, surface: "queue", at: "/tabs/1", what: "x", ...(notice && { notice: true as const }) })
  const entries = [entry(1, "agent"), entry(2, "agent", false), entry(3, "person"), entry(4, "surface"), entry(5, "agent")]

  it("counts the notices others caused, newer than the mark and not looked at one by one, and names them", () => {
    expect(unseenIn(entries, { upto: 0, looked: [] })).toEqual([1, 4, 5])
    expect(unseenIn(entries, { upto: 1, looked: [5] })).toEqual([4])
    expect(unseenOf(entries, { upto: 0, looked: [] })).toBe(3)
    expect(unseenOf(entries, { upto: 1, looked: [] })).toBe(2)
    expect(unseenOf(entries, { upto: 1, looked: [5] })).toBe(1)
    expect(unseenOf(entries, { upto: 0, looked: [] }, "agent")).toBe(2)
  })

  it("moves the mark forward only, and drops what it passes from what was looked at", () => {
    expect(seeUpto({ upto: 3, looked: [5, 7] }, 5)).toEqual({ upto: 5, looked: [7] })
    expect(seeUpto({ upto: 6, looked: [] }, 2)).toEqual({ upto: 6, looked: [] })
    expect(lookAt({ upto: 3, looked: [] }, 5)).toEqual({ upto: 3, looked: [5] })
    expect(lookAt({ upto: 3, looked: [5] }, 5)).toEqual({ upto: 3, looked: [5] })
    expect(lookAt({ upto: 3, looked: [] }, 2)).toEqual({ upto: 3, looked: [] })
  })

  it("restores the mark, and where state kept before it has none, counts everything kept so far as seen", () => {
    expect(seenFrom(undefined, entries)).toEqual({ upto: 5, looked: [] })
    expect(seenFrom(undefined, [])).toEqual({ upto: 0, looked: [] })
    expect(seenFrom({ upto: 2, looked: [1, 4, "x"] }, entries)).toEqual({ upto: 2, looked: [4] })

    const program = shell({ things })

    expect(program.restore!({ tabs: [], next: 2, activity: entries }).seen).toEqual({ upto: 5, looked: [] })
  })
})

describe("the person's notifications", () => {
  it("are counted of the person, the same for every reader, and marked seen by the page's quiet actions, which tell the agent nothing", async () => {
    const { agent, person } = story(shell({ things }))

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await person.call("/tabs/1", "approve", { n: 12 })

    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 2, fresh: [2, 3] })
    expect(person.offered("/activity/notices")).toEqual(["seen", "looked"])
    expect(agent.sees("/activity/notices")).toEqual(person.sees("/activity/notices"))
    agent.told()
    agent.noticed()

    await person.call("/activity/notices", "looked", { n: 3 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 1, fresh: [2] })
    await person.call("/activity/notices", "seen", { n: 4 })
    expect(person.sees("/activity/notices")!.unseen).toBe(0)
    expect(agent.told()).toEqual([])
    expect(agent.noticed()).toEqual([])
  })

  it("see exactly the one looked at alone, by opening its tab's drawer, once however often, and the rest stay unseen until a mark passes them", async () => {
    const { agent, person } = story(shell({ things }))

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "approve", { n: 12 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 3, fresh: [2, 3, 4] })

    await person.call("/activity/notices", "looked", { n: 3 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 2, fresh: [2, 4] })
    await person.call("/activity/notices", "looked", { n: 3 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 2, fresh: [2, 4] })
    // The newest looked at alone leaves the older unseen: no mark moves past it.
    await person.call("/activity/notices", "looked", { n: 4 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 1, fresh: [2] })
    await person.call("/activity/notices", "seen", { n: 2 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 0, fresh: [] })
  })

  it("are marked seen without an entry, and nothing of it is told to the agent", async () => {
    const { agent, person } = story(shell({ things }))

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "approve", { n: 12 })
    agent.told()
    agent.noticed()

    const kept = agent.sees("/activity")!.kept

    await person.call("/activity/notices", "seen", { n: 2 })
    await person.call("/activity/notices", "looked", { n: 2 })

    expect(agent.sees("/activity")!.kept).toBe(kept)
    expect(agent.told()).toEqual([])
    expect(agent.noticed()).toEqual([])
    expect(agent.sees("/")).not.toHaveProperty("seen")
  })

  it("count from the log after a restart, as for a page opened later", async () => {
    const s = story(shell({ things }))

    await s.person.call("/", "open", { surface: "things" })
    await s.agent.call("/tabs/1", "approve", { n: 12 })
    await s.restart()

    expect(s.person.sees("/activity/notices")!.unseen).toBe(1)
  })
})
