// The shell's activity, a log of actions: one entry per call, by who made it, where, with its inputs and what came of it,
// done or refused and why, and the surface's lines about it; the world's events, named by what heard them, folded in a
// row; a caller's follow-up only where its surface said a line; inputs cut past BOUND and credentials never kept; the
// shell's own open and close, and the agent's highlight in the tab it marks; the bound; what is kept from before, in this
// shape or the one before; /activity and /activity/highlights and their pages; what the agent is told of it; which
// highlights the person opened, by the page's quiet mark of a drawer opened; a closed tab's entries going with it.
import { describe, expect, it } from "bun:test"
import { action, story, surface, view, type Call, type Update } from "../../framework/core/index.ts"
import { BOUND, HIDDEN, KEPT, PAGE, didLine, entryOf, inputsOf, openedFrom, openUpto, record, refusalOf, restored, unopenedIn, type Entry, type Line } from "../../framework/shell/src/activity.ts"
import { shell, type ShellCommand, type ShellModel } from "../../framework/shell/src/surface.ts"
import type { Row } from "../../framework/shell/ui/thread.ts"

type Model = { n: number }
type Event = { kind: "rang" } | { kind: "changed"; loud?: boolean } | { kind: "echoed" }
type Command = { kind: "ring" } | { kind: "watch" }

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
  update: (m: Model, { n }): Update<Model, Command> => (n === 13 ? { refused: "13 is not approved" } : { model: m, notices: [{ text: `Approved #${n}`, at: `/things/${n}` }] }),
})
const flag = action({
  name: "flag",
  description: "flag one for the person",
  subject: {},
  inputs: { n: "number" },
  update: (m: Model, { n }): Update<Model, Command> => ({ model: m, notices: [{ text: `#${n} needs a look`, at: `/things/${n}`, highlight: true }] }),
})
const ring = action({
  name: "ring",
  description: "ring later",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: m, commands: [{ kind: "ring" }] }),
})
const pages = view([bump, approve, flag, ring], {
  "/": (m) => ({ n: m.n, bump: bump.bind({}), approve: approve.bind({ n: 12 }), flag: flag.bind({}), ring: ring.bind({}) }),
  "/things/:n": (_m, { n }) => ({ n: Number(n), approve: approve.bind({ n: Number(n) }) }),
})
const things = surface<Model, Event, Command>({
  description: "things",
  init: () => ({ n: 0 }),
  start: () => [{ kind: "watch" }],
  session: (c) => c.kind === "watch",
  update: (m, msg) =>
    msg.kind === "call" ? pages.update(m, msg) : msg.kind === "rang" ? { model: m, notices: ["Rang"] } : msg.kind === "echoed" ? { model: { ...m } } : { model: { n: m.n + 1 }, ...(msg.loud && { notices: ["Changed outside"] }) },
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "rang" }),
})
const T = Date.UTC(2026, 10, 15, 16, 0, 0)
const held = { tabs: [{ n: 2, surface: "queue" }], next: 3 }
const call = (path: string, handle: string, args: Call["args"], actor = "agent:s"): Call => ({ kind: "call", path, handle, args, actor, t: T })
const rows = (view: unknown) => ((view as { entries: Row[] }).entries).map(({ when: _, ...row }) => row)

describe("an entry", () => {
  it("is a call: who, where, the handle and its inputs, and the surface's lines about it, each with its place where it is not the call's", () => {
    expect(entryOf(held, call("/tabs/2", "approve", { n: 12 }, "person"), T, [{ text: "Approved #12", at: "/tabs/2/issues/12", from: "queue" }])).toEqual({
      when: T,
      who: "person",
      surface: "queue",
      at: "/tabs/2",
      did: "approve",
      args: { n: 12 },
      said: [{ text: "Approved #12", at: "/tabs/2/issues/12" }],
    })
    expect(entryOf(held, call("/tabs/2/issues/3/", "draft", { n: 3, title: "Fix the door" }), T)).toEqual({
      when: T,
      who: "agent",
      surface: "queue",
      at: "/tabs/2/issues/3",
      did: "draft",
      args: { n: 3, title: "Fix the door" },
    })
  })

  it("is a refusal, with why", () => {
    expect(refusalOf(held, call("/tabs/2", "approve", { n: 13 }), T, "13 is not approved")).toEqual({
      when: T,
      who: "agent",
      surface: "queue",
      at: "/tabs/2",
      did: "approve",
      args: { n: 13 },
      refused: "13 is not approved",
    })
    expect(refusalOf(held, call("/", "open", { surface: "nope" }), T, "no surface nope")).toMatchObject({ surface: "baba", at: "/", refused: "no surface nope" })
    expect(refusalOf(held, call("/tabs/9", "bump", {}), T, "nothing at /tabs/9")).toMatchObject({ surface: "baba", at: "/tabs/9", own: true })
    expect(refusalOf(held, call("/activity/highlights", "opened", { n: 1 }), T, "an ask")).toBeUndefined()
  })

  it("is an event of the world, named by what heard it, silent or with the surface's lines", () => {
    expect(entryOf(held, { kind: "tab", n: 2, event: { kind: "changed" }, heard: "watch" }, T)).toEqual({ when: T, who: "world", by: "watch", surface: "queue", at: "/tabs/2", did: "changed" })
    expect(entryOf(held, { kind: "tab", n: 2, event: { kind: "changed" } }, T, ["Changed outside"])).toEqual({
      when: T,
      who: "world",
      surface: "queue",
      at: "/tabs/2",
      did: "changed",
      said: [{ text: "Changed outside" }],
    })
  })

  it("is a caller's follow-up only where its surface said a line about it, as the caller's", () => {
    expect(entryOf(held, { kind: "tab", n: 2, event: { kind: "rang" }, actor: "person" }, T)).toBeUndefined()
    expect(entryOf(held, { kind: "tab", n: 2, event: { kind: "rang" }, actor: "person" }, T, ["Rang"])).toMatchObject({ who: "person", did: "rang", said: [{ text: "Rang" }] })
    expect(entryOf(held, { kind: "tab", n: 7, event: { kind: "rang" } }, T, ["Rang"])).toBeUndefined()
  })

  it("keeps an input whole up to BOUND, and cuts a longer one, saying how long it was", () => {
    const long = "x".repeat(BOUND + 50)

    expect(inputsOf({ text: "x".repeat(BOUND) })).toEqual({ args: { text: "x".repeat(BOUND) } })
    expect(inputsOf({ text: long, n: 1 })).toEqual({ args: { text: "x".repeat(BOUND), n: 1 }, cut: { text: BOUND + 50 } })
    expect(inputsOf({ list: Array(100).fill("abc") })).toMatchObject({ cut: { list: JSON.stringify(Array(100).fill("abc")).length } })
    expect(inputsOf({})).toEqual({})
    expect(didLine({ did: "add", ...inputsOf({ text: long, n: 1 }) })).toBe(`add text=${JSON.stringify(`${"x".repeat(BOUND)}…`)}(${BOUND + 50} chars) n=1`)
  })

  it("never keeps a credential: an input named for one, or a value shaped as a key or a token, in it or within it", () => {
    const token = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dcAbCdEf"].join("_")

    expect(inputsOf({ api_key: "abc", apiKey: "abc", password: "hunter2", keys: "ctrl+p" })).toEqual({ args: { api_key: HIDDEN, apiKey: HIDDEN, password: HIDDEN, keys: "ctrl+p" } })
    expect(inputsOf({ text: `use ${token} now`, args: JSON.stringify({ n: 1 }) })).toEqual({ args: { text: `use ${HIDDEN} now`, args: '{"n":1}' } })
    expect(inputsOf({ headers: { authorization: "x", token: "y", accept: "json" } })).toEqual({ args: { headers: { authorization: "x", token: HIDDEN, accept: "json" } } })
    expect(inputsOf({ path: "/Users/me/projects/babavoss-ticket-242e0c15-5640197a2c", title: "Fix the door" }).args).toEqual({
      path: "/Users/me/projects/babavoss-ticket-242e0c15-5640197a2c",
      title: "Fix the door",
    })
  })

  it("keeps the name its caller gave the call, where it gave one", () => {
    expect(entryOf(held, { ...call("/tabs/2", "approve", { n: 12 }, "person"), id: "lab:act-3" }, T)).toHaveProperty("id", "lab:act-3")
    expect(entryOf(held, call("/tabs/2", "approve", { n: 12 }, "person"), T)).not.toHaveProperty("id")
  })

  it("is the shell's own open and close, its call kept; the agent's highlight is in the tab it marks", () => {
    expect(entryOf(held, call("/", "open", { surface: "lab" }, "person"), T)).toEqual({ when: T, who: "person", surface: "lab", at: "/tabs/3", did: "open", args: { surface: "lab" }, own: true })
    expect(entryOf(held, call("/", "close", { n: 2 }), T)).toMatchObject({ surface: "queue", at: "/tabs/2", did: "close", own: true })
    const marked = entryOf(held, call("/", "highlight", { at: "/tabs/2/issues/4", why: "look", front: false }), T, [{ text: "look", at: "/tabs/2/issues/4", highlight: true }])

    expect(marked).toMatchObject({ surface: "queue", at: "/tabs/2/issues/4", did: "highlight", said: [{ text: "look", highlight: true }] })
    expect(marked).not.toHaveProperty("own")
  })

  it("is none for the person opening a drawer", () => {
    expect(entryOf(held, call("/activity/highlights", "opened", { n: 4 }, "person"), T)).toBeUndefined()
  })
})

describe("the log", () => {
  it("numbers entries on from the last and keeps the newest KEPT", () => {
    const line: Line = { when: T, who: "agent", surface: "queue", at: "/tabs/2", did: "bump" }
    let kept: Entry[] = []

    for (let i = 0; i < KEPT + 5; i++) kept = record(kept, line)
    expect(kept).toHaveLength(KEPT)
    expect([kept[0]!.n, kept.at(-1)!.n]).toEqual([6, KEPT + 5])
    expect(record(kept, undefined)).toBe(kept)
  })

  it("folds the world's silent events in a row from one hearer in one tab into the last, counted, its number kept", () => {
    const heard = (by: string, at = "/tabs/2", did = "changed"): Line => ({ when: T, who: "world", by, surface: "queue", at, did })
    let kept = record([], heard("watch"))

    kept = record(kept, { ...heard("watch"), when: T + 1 })
    kept = record(kept, heard("watch", "/tabs/3"))
    kept = record(kept, heard("watch"))
    expect(kept.map((e) => [e.n, e.at, e.times ?? 1])).toEqual([
      [1, "/tabs/2", 3],
      [2, "/tabs/3", 1],
    ])
    expect(kept[0]!.when).toBe(T)
    kept = record(kept, heard("poll"))
    kept = record(kept, heard("poll", "/tabs/2", "gone"))
    kept = record(kept, { ...heard("poll", "/tabs/2", "gone"), said: [{ text: "Gone" }] })
    kept = record(kept, heard("poll", "/tabs/2", "gone"))
    expect(kept.map((e) => [e.n, e.by, e.did, e.times ?? 1])).toEqual([
      [1, "watch", "changed", 3],
      [2, "watch", "changed", 1],
      [3, "poll", "changed", 1],
      [4, "poll", "gone", 1],
      [5, "poll", "gone", 2],
    ])
  })

  it("restores none from state kept before it, and only what reads as an entry", () => {
    expect(restored(undefined)).toEqual([])

    const entry: Entry = { n: 1, when: T, who: "person", surface: "queue", at: "/", did: "bump" }

    expect(restored([entry, { n: 2, did: "half" }, null])).toEqual([entry])

    const program = shell({ things })

    expect(program.restore!({ tabs: [{ n: 1, surface: "things", model: { n: 0 } }], next: 2 }).activity).toEqual([])
    expect(program.restore!({ tabs: [], next: 2, activity: [entry] }).activity).toEqual([entry])
  })

  it("reads an entry kept in the shape before: a notice as the surface's line, a call's line as what was done, the surface's as the world's", () => {
    const old = (n: number, who: string, extra = {}) => ({ n, when: T, who, surface: "queue", at: "/tabs/2", what: "x", ...extra })

    expect(restored([old(1, "surface"), old(2, "agent"), old(3, "person", { notice: true }), old(4, "agent", { what: "closed", own: true })])).toEqual([
      { n: 1, when: T, who: "world", surface: "queue", at: "/tabs/2", did: "", said: [{ text: "x" }] },
      { n: 2, when: T, who: "agent", surface: "queue", at: "/tabs/2", did: "x" },
      { n: 3, when: T, who: "person", surface: "queue", at: "/tabs/2", did: "", said: [{ text: "x" }] },
      { n: 4, when: T, who: "agent", surface: "queue", at: "/tabs/2", did: "close", own: true },
    ])
  })
})

describe("the shell's activity", () => {
  it("keeps every call, by who made it, at its time: done, with the surface's lines, or refused with why", async () => {
    const { agent, person } = story(shell({ things }))
    const before = Date.now()

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "bump", { by: 2, why: "two more" })
    await person.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1/things/13", "approve", { n: 13 })
    await agent.call("/tabs/1", "nope", {})

    const page = agent.sees("/activity")!

    for (const row of page.entries as Row[]) expect(Date.parse(row.when)).toBeGreaterThanOrEqual(before - 1000)
    expect(rows(page)).toEqual([
      { n: 5, who: "agent", at: "/things", did: "nope", refused: "nope {} is not offered at /tabs/1; offered: bump, approve {\"n\":12}, flag, ring" },
      { n: 4, who: "agent", at: "/things/things/13", did: "approve n=13", refused: "13 is not approved" },
      { n: 3, who: "person", at: "/things", did: "approve n=12", said: ["Approved #12"], saidAt: "/things/things/12" },
      { n: 2, who: "agent", at: "/things", did: 'bump by=2 why="two more"' },
      { n: 1, who: "person", surface: "things", at: "/things", own: true, did: "open surface=things" },
    ])
  })

  it("says an entry's surface only where its place does not name it", async () => {
    const { agent } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await agent.call("/", "open", { surface: "things" })
    await agent.call("/tabs/2", "bump", { by: 1, why: "x" })
    await agent.call("/tabs/1", "bump", { by: 1, why: "x" })
    expect(rows(agent.sees("/activity")).map((r) => [r.at, r.surface])).toEqual([
      ["/things", undefined],
      ["/tabs/2", "things"],
      ["/tabs/2", "things"],
      ["/things", "things"],
    ])
  })

  it("keeps a refusal as bookkeeping: nothing of it is told to the agent, and no one waits for it", async () => {
    const { agent, person } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    agent.told()
    agent.noticed()
    await person.call("/tabs/1/things/13", "approve", { n: 13 })
    expect(agent.told()).toEqual([])
    expect(agent.noticed()).toEqual([])
    expect(agent.sees("/activity")).toMatchObject({ kept: 2 })
  })

  it("names the world's events by what heard them and folds a run of them; a caller's follow-up is theirs, kept where its surface said a line", async () => {
    const { agent, person, world } = story(shell({ things }))
    const watch = (c: ShellCommand) => (c.command as Command).kind === "watch"
    const ringing = (c: ShellCommand) => (c.command as Command).kind === "ring"

    await agent.call("/", "open", { surface: "things" })
    expect(world.commands()).toEqual([{ n: 1, surface: "things", command: { kind: "watch" } }])
    await person.call("/tabs/1", "ring")
    expect(world.commands().find(ringing)).toEqual({ n: 1, surface: "things", command: { kind: "ring" }, actor: "person" })
    await world.send(watch, { kind: "tab", n: 1, event: { kind: "changed" }, heard: "watch" })
    await world.send(watch, { kind: "tab", n: 1, event: { kind: "changed" }, heard: "watch" })
    await world.send(watch, { kind: "tab", n: 1, event: { kind: "changed", loud: true } as Event, heard: "watch" })
    await world.send(watch, { kind: "tab", n: 1, event: { kind: "changed" }, heard: "watch" })
    await world.send(ringing, { kind: "tab", n: 1, event: { kind: "rang" }, actor: "person" })

    expect(rows(agent.sees("/activity")).map((r) => [r.n, r.who, r.by, r.did, r.times, r.said])).toEqual([
      [5, "person", undefined, "rang", undefined, ["Rang"]],
      [4, "world", "watch", "changed", 2, ["Changed outside"]],
      [3, "world", "watch", "changed", 2, undefined],
      [2, "person", undefined, "ring", undefined, undefined],
      [1, "agent", undefined, "open surface=things", undefined, undefined],
    ])
  })

  it("keeps no entry for an event of the world that changed nothing in its tab and said nothing, as a watcher hearing the surface's own write", async () => {
    const { agent, world } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await world.send({ kind: "tab", n: 1, event: { kind: "echoed" }, heard: "watch" })
    expect(agent.sees("/activity")).toMatchObject({ kept: 1 })
  })

  it("gives a tab's events whose they are as its run hears them: the caller's who started the work, the world's for a session command", async () => {
    const sent: unknown[] = []
    const program = shell({ things: { ...things, run: async (_c: Command, send: (e: Event) => void) => send({ kind: "changed" }) } })

    await program.run({ n: 1, surface: "things", command: { kind: "watch" }, actor: "person" }, (e) => void sent.push(e), new AbortController().signal)
    await program.run({ n: 1, surface: "things", command: { kind: "ring" }, actor: "person" }, (e) => void sent.push(e), new AbortController().signal)
    await program.run({ n: 1, surface: "things", command: { kind: "ring" } }, (e) => void sent.push(e), new AbortController().signal)
    expect(sent.map((e): unknown => ({ ...(e as object), t: 0 }))).toEqual([
      { kind: "tab", n: 1, event: { kind: "changed" }, t: 0, heard: "watch" },
      { kind: "tab", n: 1, event: { kind: "changed" }, t: 0, actor: "person" },
      { kind: "tab", n: 1, event: { kind: "changed" }, t: 0, heard: "ring" },
    ])
  })

  it("lets a tab's entries go with it when it closes, the shell's own lines staying", async () => {
    const { agent } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await agent.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "bump", { by: 1, why: "x" })
    await agent.call("/tabs/2", "bump", { by: 1, why: "x" })
    await agent.call("/", "close", { n: 1 })
    expect(rows(agent.sees("/activity")).map((r) => [r.n, r.at, r.own, r.did])).toEqual([
      [5, null, true, "close n=1"],
      [4, "/tabs/2", undefined, "bump by=1 why=x"],
      [2, "/tabs/2", true, "open surface=things"],
      [1, null, true, "open surface=things"],
    ])
    await agent.call("/tabs/2", "bump", { by: 1, why: "y" })
    expect(rows(agent.sees("/activity"))[0]!.n).toBe(6)
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

  it("gives the entries with a highlight alone at /activity/highlights, newest first, with their pages", async () => {
    const { agent, person } = story(shell({ things }))

    await agent.call("/", "open", { surface: "things" })
    await person.call("/tabs/1", "flag", { n: 3 })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "flag", { n: 4 })

    expect(agent.sees("/activity")!.highlights).toEqual({ at: "/activity/highlights" })

    const highlights = agent.sees("/activity/highlights")!

    expect(highlights).toMatchObject({ at: "/activity/highlights", kept: 2 })
    expect(rows(highlights).map((r) => [r.n, r.who, r.said, r.highlight, r.saidAt])).toEqual([
      [4, "agent", ["#4 needs a look"], true, "/things/things/4"],
      [2, "person", ["#3 needs a look"], true, "/things/things/3"],
    ])
    expect(rows(agent.sees("/activity")).find((r) => r.n === 3)).not.toHaveProperty("highlight")
    expect((agent.sees("/activity/highlights/3")!.entries as Row[]).map((r) => r.n)).toEqual([2])
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

    expect(program.update(model, call("/", "open", { surface: "things" }))).toMatchObject({ model: { activity: [{ n: 1, when: T, did: "open" }] } })
    expect(program.update(model, { kind: "tab", n: 4, event: { kind: "rang" } })).toEqual({ model })
    expect(program.refused!(model, call("/", "open", { surface: "nope" }), "no surface nope")).toMatchObject({ activity: [{ n: 1, refused: "no surface nope" }] })
  })
})

describe("which highlights the person opened", () => {
  const entry = (n: number, who: Entry["who"], at = "/tabs/1", highlight = true): Entry => ({ n, when: T, who, surface: "queue", at, did: "x", said: [{ text: "x", ...(highlight && { highlight: true as const }) }] })
  const entries = [entry(1, "agent"), entry(2, "agent", "/tabs/1", false), entry(3, "person"), entry(4, "world", "/tabs/2"), entry(5, "agent"), entry(6, "world", "/")]

  it("are those others raised, newer than the mark of the drawer they are in, a tab's or home's", () => {
    expect(unopenedIn(entries, {})).toEqual([1, 4, 5, 6])
    expect(unopenedIn(entries, { "1": 1 })).toEqual([4, 5, 6])
    expect(unopenedIn(entries, { "1": 5, "2": 4, home: 6 })).toEqual([])
  })

  it("move a drawer's mark forward only, to the entry it was opened after, and touch no other drawer's", () => {
    expect(openUpto({}, entries, 5)).toEqual({ "1": 5 })
    expect(openUpto({ "1": 5 }, entries, 1)).toEqual({ "1": 5 })
    expect(openUpto({ "1": 5 }, entries, 4)).toEqual({ "1": 5, "2": 4 })
    expect(openUpto({}, entries, 6)).toEqual({ home: 6 })
    expect(openUpto({}, entries, 99)).toEqual({})
  })

  it("are restored as kept, and none where state kept before has no marks", () => {
    expect(openedFrom(undefined)).toEqual({})
    expect(openedFrom({ "1": 3, "2": "x" })).toEqual({ "1": 3 })

    const program = shell({ things })

    expect(program.restore!({ tabs: [], next: 2, activity: entries, opened: { "1": 2 } }).opened).toEqual({ "1": 2 })
  })
})

describe("the person's highlights", () => {
  it("are the same for every reader, and opened by the page's quiet mark of a drawer, which tells the agent nothing", async () => {
    const { agent, person } = story(shell({ things }))

    await person.call("/", "open", { surface: "things" })
    await agent.call("/tabs/1", "flag", { n: 1 })
    await agent.call("/tabs/1", "approve", { n: 12 })
    await agent.call("/tabs/1", "flag", { n: 2 })
    await person.call("/tabs/1", "flag", { n: 3 })

    expect(person.sees("/activity/highlights")).toMatchObject({ unopened: [2, 4] })
    expect(person.offered("/activity/highlights")).toEqual(["opened"])
    expect(agent.sees("/activity/highlights")).toEqual(person.sees("/activity/highlights"))
    agent.told()
    agent.noticed()

    const kept = agent.sees("/activity")!.kept

    await person.call("/activity/highlights", "opened", { n: 4 })
    expect(person.sees("/activity/highlights")).toMatchObject({ unopened: [] })
    expect(agent.sees("/activity")!.kept).toBe(kept)
    expect(agent.told()).toEqual([])
    expect(agent.noticed()).toEqual([])
    expect(agent.sees("/")).not.toHaveProperty("opened")
  })

  it("count from the log after a restart, as for a page opened later", async () => {
    const s = story(shell({ things }))

    await s.person.call("/", "open", { surface: "things" })
    await s.agent.call("/tabs/1", "flag", { n: 1 })
    await s.person.call("/activity/highlights", "opened", { n: 2 })
    await s.agent.call("/tabs/1", "flag", { n: 2 })
    await s.restart()

    expect(s.person.sees("/activity/highlights")!.unopened).toEqual([3])
  })
})
