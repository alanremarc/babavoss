// The shell's activity: entries from notices and from calls that gave none, the shell's own open, close and show, the
// bound, what is kept from before, /activity and its pages, what the agent is told of it, and the page's grouping.
import { describe, expect, it } from "bun:test"
import { action, story, surface, view, type Call, type Update } from "../../framework/core/index.ts"
import { KEPT, PAGE, linesOf, record, restored, said, type Entry, type Line } from "../../framework/shell/src/activity.ts"
import { shell, type ShellModel } from "../../framework/shell/src/surface.ts"
import { filtered, groupOf, groupsOf, unseenOf, type Row } from "../../framework/shell/ui/activity.tsx"

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
      { when: T, who: "person", surface: "queue", at: "/tabs/2/issues/12", what: "Approved #12" },
    ])
  })

  it("takes a call that gave no notice as one mechanical line: its handle and arguments, where it was called", () => {
    expect(linesOf(held, call("/tabs/2/issues/3", "draft", { n: 3, title: "Fix the door" }), T)).toEqual([
      { when: T, who: "agent", surface: "queue", at: "/tabs/2/issues/3", what: 'draft n=3 title="Fix the door"' },
    ])
    expect(said("add", { text: "x".repeat(100) })).toHaveLength("add text=".length + 60)
  })

  it("takes a command's event only by its notices, as the surface's", () => {
    expect(linesOf(held, { kind: "tab", n: 2 }, T, ["Lane 1 finished"])).toEqual([{ when: T, who: "surface", surface: "queue", at: "/tabs/2", what: "Lane 1 finished" }])
    expect(linesOf(held, { kind: "tab", n: 2 }, T)).toEqual([])
  })

  it("takes the shell's own open, close and show", () => {
    expect(linesOf(held, call("/", "open", { surface: "lab" }, "person"), T)).toEqual([{ when: T, who: "person", surface: "lab", at: "/tabs/3", what: "opened" }])
    expect(linesOf(held, call("/", "close", { n: 2 }), T)).toEqual([{ when: T, who: "agent", surface: "queue", at: "/tabs/2", what: "closed" }])
    expect(linesOf(held, call("/", "show", { at: "/tabs/2/issues/4" }), T)).toEqual([
      { when: T, who: "agent", surface: "queue", at: "/tabs/2/issues/4", what: "shown to the person" },
    ])
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
      { n: 3, who: "person", surface: "things", at: "/tabs/1/things/12", what: "Approved #12" },
      { n: 2, who: "agent", surface: "things", at: "/tabs/1", what: 'bump by=2 why="two more"' },
      { n: 1, who: "person", surface: "things", at: "/tabs/1", what: "opened" },
    ])
  })

  it("keeps a command's notices as the surface's, and names no place in a tab once it is closed", async () => {
    const { agent, world } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "ring")
    await world.settle({ kind: "tab", n: 1, event: { kind: "rang" } })
    await agent.call("/", "close", { n: 1 })

    expect((agent.sees("/activity")!.entries as Row[]).map((r) => [r.who, r.at, r.what])).toEqual([
      ["agent", null, "closed"],
      ["surface", null, "Rang"],
      ["agent", null, "ring"],
      ["agent", null, "opened"],
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

describe("the activity panel", () => {
  const now = new Date(2026, 10, 15, 16, 0, 0)
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
  const row = (n: number, when: Date, who: Row["who"] = "agent", surface = "queue"): Row => ({ n, when: when.toISOString(), who, surface, at: "/tabs/1", what: "x" })

  it("groups by how long ago, in runs, newest first", () => {
    expect(groupOf(at(1), now)).toBe("Just now")
    expect(groupOf(at(30), now)).toBe("Last hour")
    expect(groupOf(at(120), now)).toBe("Today")
    expect(groupOf(new Date(2026, 10, 14, 9), now)).toBe("Yesterday")
    expect(groupOf(new Date(2026, 10, 2, 9), now)).toBe("Nov 2")
    expect(groupOf(new Date(2025, 0, 2, 9), now)).toBe("Jan 2, 2025")
    expect(groupsOf([row(4, at(1)), row(3, at(2)), row(2, at(30)), row(1, at(120))], now).map((g) => [g.label, g.rows.map((r) => r.n)])).toEqual([
      ["Just now", [4, 3]],
      ["Last hour", [2]],
      ["Today", [1]],
    ])
  })

  it("counts what others did since the person last looked, and filters by surface and by who", () => {
    const rows = [row(4, at(1), "surface", "lab"), row(3, at(1), "person"), row(2, at(1)), row(1, at(1))]

    expect(unseenOf(rows, 1)).toBe(2)
    expect(filtered(rows, "queue", "all").map((r) => r.n)).toEqual([3, 2, 1])
    expect(filtered(rows, "all", "person").map((r) => r.n)).toEqual([3])
  })
})
