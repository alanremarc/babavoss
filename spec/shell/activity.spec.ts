// The shell's activity: entries from notices, marked so, and from calls that gave none, the shell's own open, close and
// show, the bound, what is kept from before, /activity and /activity/notices and their pages, what the agent is told of it,
// what the person has seen of the notices, one by one or up to a mark, and its asks; and the drawer's channels, their order,
// previews and places, what the agent sees next, the levels' keys, grouping, times, what arrived, badge and toasts.
import { describe, expect, it } from "bun:test"
import { action, story, surface, view, type Call, type Update } from "../../framework/core/index.ts"
import { KEPT, PAGE, linesOf, lookAt, record, restored, said, seenFrom, seeUpto, unseenIn, unseenOf, type Entry, type Line } from "../../framework/shell/src/activity.ts"
import { shell, type ShellModel } from "../../framework/shell/src/surface.ts"
import { badgeOf, inView, needsOf, toastsAfter, unseenRows, whoBy, waitingRows } from "../../framework/shell/ui/notifications.tsx"
import {
  agoOf,
  arrived,
  channelOf,
  channelsOf,
  distinct,
  groupOf,
  groupsOf,
  levelKey,
  needLine,
  placeIn,
  previewOf,
  tabIn,
  type Need,
  type Row,
} from "../../framework/shell/ui/channels.ts"

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

    const entry: Entry = { n: 1, when: T, who: "person", surface: "queue", at: "/tabs/2", what: "opened" }

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

  it("keeps a command's notices as the surface's, and names no place in a tab once it is closed, but still the tab it was in", async () => {
    const { agent, world } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "ring")
    await world.settle({ kind: "tab", n: 1, event: { kind: "rang" } })
    await agent.call("/", "close", { n: 1 })

    expect((agent.sees("/activity")!.entries as Row[]).map((r) => [r.who, r.at, r.tab, r.what])).toEqual([
      ["agent", null, undefined, "closed"],
      ["surface", null, "/tabs/1", "Rang"],
      ["agent", null, "/tabs/1", "ring"],
      ["agent", null, undefined, "opened"],
    ])
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
  it("are counted for the person alone, and marked seen by asks offered to the person alone", async () => {
    const { agent, person } = story(shell({ things }))

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await person.call("/tabs/1", "approve", { n: 12 })

    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 2, fresh: [2, 3] })
    expect(person.offered("/activity/notices")).toEqual(["seen", "looked"])
    expect(agent.sees("/activity/notices")).not.toHaveProperty("unseen")
    expect(agent.sees("/activity/notices")).not.toHaveProperty("fresh")
    expect(agent.offered("/activity/notices")).toEqual([])
    expect(await agent.call("/activity/notices", "seen", { n: 4 })).toMatchObject({ outcome: "refused" })

    await person.call("/activity/notices", "looked", { n: 3 })
    expect(person.sees("/activity/notices")).toMatchObject({ unseen: 1, fresh: [2] })
    await person.call("/activity/notices", "seen", { n: 4 })
    expect(person.sees("/activity/notices")!.unseen).toBe(0)
  })

  it("see exactly the one looked at alone, by its toast, once however often, and the rest stay unseen until a mark passes them", async () => {
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

describe("the activity drawer", () => {
  const now = new Date(2026, 10, 15, 16, 0, 0)
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
  const row = (n: number, when: Date, who: Row["who"] = "agent", surface = "queue"): Row => ({ n, when: when.toISOString(), who, surface, at: "/tabs/1", tab: "/tabs/1", what: "x" })

  it("groups by when, in runs, newest first", () => {
    expect(groupOf(at(1), now)).toBe("Now")
    expect(groupOf(at(59), now)).toBe("Now")
    expect(groupOf(at(120), now)).toBe("Earlier today")
    expect(groupOf(new Date(2026, 10, 14, 9), now)).toBe("Yesterday")
    expect(groupOf(new Date(2026, 10, 2, 9), now)).toBe("Nov 2")
    expect(groupOf(new Date(2025, 0, 2, 9), now)).toBe("Jan 2, 2025")
    expect(groupsOf([row(4, at(1)), row(3, at(2)), row(2, at(90)), row(1, at(60 * 24))], now).map((g) => [g.label, g.rows.map((r) => r.n)])).toEqual([
      ["Now", [4, 3]],
      ["Earlier today", [2]],
      ["Yesterday", [1]],
    ])
  })

  it("says how long ago as now, minutes and hours, then the clock time", () => {
    expect(agoOf(new Date(now.getTime() - 20_000), now)).toBe("now")
    expect(agoOf(at(2), now)).toBe("2m")
    expect(agoOf(at(59), now)).toBe("59m")
    expect(agoOf(at(60), now)).toBe("1h")
    expect(agoOf(at(5 * 60 + 59), now)).toBe("5h")
    expect(agoOf(at(7 * 60), now)).toBe(at(7 * 60).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))
  })

  it("lists the notices, or all activity", () => {
    const rows = [row(4, at(1), "surface", "lab"), { ...row(3, at(1), "person"), kind: "call" as const }, { ...row(2, at(1)), kind: "notice" as const }, row(1, at(1))]

    expect(inView(rows, "notices").map((r) => r.n)).toEqual([4, 2, 1])
    expect(inView(rows, "all").map((r) => r.n)).toEqual([4, 3, 2, 1])
  })

  describe("its channels", () => {
    const tabs = [
      { at: "/tabs/1", surface: "queue", label: "Queue" },
      { at: "/tabs/3", surface: "queue", label: "Releases" },
      { at: "/tabs/4", surface: "design", label: "design 4" },
    ]
    const r = (n: number, tab: string | undefined, who: Row["who"] = "agent", surface = "queue"): Row => ({
      n,
      when: at(10 - n).toISOString(),
      who,
      surface,
      at: tab ? `${tab}/issues/${n}` : "/tabs/9",
      ...(tab && { tab }),
      what: `said ${n}`,
    })
    const need: Need = { at: "/tabs/4", surface: "design", who: "person", why: "to pick a scenario" }

    it("are a tab each, two tabs of one surface two, the shell's own one more, named by the tab, newest first", () => {
      const rows = [r(6, "/tabs/3"), r(5, undefined, "person", "lab"), r(4, "/tabs/1"), r(3, "/tabs/3"), r(2, "/tabs/2", "surface", "lab")]
      const channels = channelsOf(rows, tabs, [], new Set(), "babavoss")

      expect(channels.map((c) => [c.key, c.name, c.surface, c.closed, c.rows.map((x) => x.n)])).toEqual([
        ["/tabs/3", "Releases", "queue", false, [6, 3]],
        ["/", "babavoss", undefined, false, [5]],
        ["/tabs/1", "Queue", "queue", false, [4]],
        ["/tabs/2", "lab", "lab", true, [2]],
      ])
      expect(channelOf(r(5, undefined))).toBe("/")
      expect(channelsOf([{ ...r(2, "/tabs/2"), title: "Lab" }], tabs, [], new Set(), "babavoss")[0]).toMatchObject({ name: "Lab", closed: true })
    })

    it("name each so it points at one tab: where two share a title, each says its tab's address", () => {
      const rows = [{ ...r(3, "/tabs/2"), title: "Releases" }, r(2, "/tabs/3"), r(1, "/tabs/1")]

      expect(channelsOf(rows, tabs, [], new Set(), "babavoss").map((c) => c.name)).toEqual(["Releases · /tabs/2", "Releases · /tabs/3", "Queue"])
      expect(distinct([{ key: "/", name: "Queue" }, { key: "/queue", name: "Queue" }]).map((c) => c.name)).toEqual(["Queue", "Queue · /queue"])
    })

    it("count what the person has not seen in each, and pin a tab that needs them, with its need, messages or not", () => {
      const rows = [r(6, "/tabs/3"), r(5, "/tabs/1"), r(4, "/tabs/1")]
      const channels = channelsOf(rows, tabs, [need], new Set([4, 5]), "babavoss")

      expect(channels.map((c) => [c.key, c.unseen, c.need?.why])).toEqual([
        ["/tabs/4", 0, "to pick a scenario"],
        ["/tabs/3", 0, undefined],
        ["/tabs/1", 2, undefined],
      ])
      expect(channels[0]).toMatchObject({ name: "design 4", surface: "design", rows: [] })
    })

    it("preview their latest message, saying who where it was the person or the agent", () => {
      expect(previewOf({ ...r(1, "/tabs/1"), who: "person" })).toEqual({ by: "You", text: "said 1" })
      expect(previewOf(r(1, "/tabs/1"))).toEqual({ by: "Agent", text: "said 1" })
      expect(previewOf({ ...r(1, "/tabs/1"), who: "surface" })).toEqual({ text: "said 1" })
      expect(previewOf({ ...r(1, undefined), at: null, what: "closed" })).toEqual({ by: "Agent", text: "closed · queue" })
      expect(previewOf({ ...r(1, undefined), at: "/", surface: "baba", what: "open surface=x" }).text).toBe("open surface=x")
    })

    it("name an entry's place where it is more specific than the tab", () => {
      expect(placeIn(r(12, "/tabs/1"), "/tabs/1")).toBe("issues/12")
      expect(placeIn({ ...r(1, "/tabs/1"), at: "/tabs/1" }, "/tabs/1")).toBeUndefined()
      expect(placeIn({ ...r(1, "/tabs/1"), at: null }, "/tabs/1")).toBeUndefined()
      expect(placeIn({ ...r(1, "/tabs/12"), at: "/tabs/12/x" }, "/tabs/1")).toBeUndefined()
      expect(placeIn({ ...r(1, undefined), at: "/tabs/4" }, "/")).toBe("queue")
    })

    it("are opened from a toast by the tab its place is in, or on the shell's own", () => {
      expect(tabIn("/tabs/2/issues/12")).toBe("/tabs/2")
      expect(tabIn("/tabs/2")).toBe("/tabs/2")
      expect(tabIn("/queue/issues/12")).toBe("/queue")
      expect(tabIn("/settings")).toBe("/settings")
      expect(tabIn("/activity/notices")).toBe("/")
      expect(tabIn(undefined)).toBe("/")
    })
  })

  it("lights what arrived since, a notice by someone else", () => {
    expect(arrived(row(6, at(0)), 5)).toBe(true)
    expect(arrived(row(5, at(0)), 5)).toBe(false)
    expect(arrived(row(7, at(0), "person"), 5)).toBe(false)
    expect(arrived({ ...row(8, at(0)), kind: "call" }, 5)).toBe(false)
  })

  it("goes back from a channel by Escape, Backspace or the left arrow, and leaves the list's keys to it", () => {
    expect(["Escape", "Backspace", "ArrowLeft", "ArrowRight", "Enter"].map((k) => levelKey(k, "channel"))).toEqual(["back", "back", "back", undefined, undefined])
    expect(levelKey("Escape", "list")).toBeUndefined()
    expect(levelKey("ArrowLeft", "list")).toBeUndefined()
  })

  it("marks what needs the person, not the agent, by a line", () => {
    const needs = [
      { at: "/tabs/1", surface: "queue", who: "person" as const, why: "to approve or drop 1 draft" },
      { at: "/tabs/2", surface: "lab", who: "agent" as const, why: "to answer" },
    ]

    expect(needsOf(needs).map((n) => n.at)).toEqual(["/tabs/1"])
    expect(needLine("to approve or drop 1 draft")).toBe("Approve or drop 1 draft")
    expect(needLine("review the plan")).toBe("Review the plan")
  })

  it("takes as unseen the notices the shell names", () => {
    const rows = [row(5, at(1), "person"), row(4, at(1), "surface"), row(3, at(1)), row(2, at(1))]

    expect(unseenRows(rows, [2, 4]).map((r) => r.n)).toEqual([4, 2])
    expect(unseenRows(rows, [])).toEqual([])
  })

  it("shows no toast while the drawer is open, and the newest few while it is closed", () => {
    expect(toastsAfter([1, 2], 3, true)).toEqual([1, 2])
    expect(toastsAfter([1, 2], 3, false)).toEqual([1, 2, 3])
    expect(toastsAfter([1, 2, 3, 4], 5, false)).toEqual([2, 3, 4, 5])
  })

  it("counts a toast on the button once it has gone into it, and nothing while the drawer is open", () => {
    expect(badgeOf(3, 1, false)).toBe(2)
    expect(badgeOf(0, 2, false)).toBe(0)
    expect(badgeOf(3, 0, true)).toBe(0)
  })

  it("names who caused a notice heard", () => {
    expect(whoBy(undefined)).toBe("person")
    expect(whoBy("the surface")).toBe("surface")
    expect(whoBy("the agent")).toBe("agent")
  })
})

it("what the agent sees next is the person's latest calls, a notice where one gave it, as many as wait for its turn", () => {
  const row = (n: number, who: Row["who"], kind: Row["kind"]): Row => ({ n, when: "2026-01-01T00:00:00Z", who, kind, surface: "queue", at: "/tabs/1", what: `call ${n}` })
  const rows = [row(6, "agent", "call"), row(5, "person", "call"), row(4, "person", "notice"), row(3, "person", "call"), row(2, "person", "call")]

  expect(waitingRows(rows, 2).map((r) => r.n)).toEqual([5, 4])
  expect(waitingRows([{ ...rows[1]!, kind: undefined }], 1)).toEqual([])
  expect(waitingRows(rows, 0)).toEqual([])
})
