import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, it } from "bun:test"
import { action, run, story, surface, view, type Ports, type Saved, type Update } from "../../skills/babavoss/framework/core/index.ts"
import { shell, util, whole, within } from "../../skills/babavoss/framework/shell/shell.ts"
import { own } from "../../skills/babavoss/framework/shell/ui/tab.tsx"

type Model = { title: string; n: number; busy?: boolean }
type Event = { kind: "bumped" } | { kind: "failed"; error: string }
type Command = { kind: "later" }

const bump = action({
  name: "bump",
  description: "add",
  subject: {},
  inputs: { by: "number" },
  update: (m: Model, { by }): Update<Model, Command> => ({ model: { ...m, n: m.n + by } }),
})
const later = action({
  name: "later",
  description: "bump soon",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: { ...m, busy: true }, commands: [{ kind: "later" }] }),
})
const pages = view([bump, later], {
  "/": (m) => ({ title: m.title, n: m.n, detail: { at: "/n" }, bump: bump.bind({}), ...(!m.busy && { later: later.bind({}) }) }),
  "/n": (m) => ({ at: "/n", n: m.n }),
})
const counter = util(
  "counter",
  "counts things",
  surface<Model, Event, Command>({
    description: "counts",
    init: () => ({ title: "Counter", n: 0 }),
    start: () => [{ kind: "later" }],
    update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : msg.kind === "bumped" ? { model: { ...m, n: m.n + 1, busy: false } } : { model: m }),
    view: pages.view,
    async run(_c, send) {
      await sleep(5)
      send({ kind: "bumped" })
    },
    failed: (_c, error) => ({ kind: "failed", error }),
  })
)
const memory = <M>(): Pick<Ports<M>, "load" | "save"> => {
  let kept: Saved | undefined

  return { load: () => kept, save: (saved) => void (kept = saved) }
}
const settled = (r: { subscribe(fn: () => void): () => void; busy(): number }) =>
  new Promise<void>((done) => {
    const off = r.subscribe(() => {
      if (!r.busy()) {
        off()
        done()
      }
    })
  })

describe("the shell surface", () => {
  it("offers its utils, opens them as tabs, routes calls and events into the tab, and closes", async () => {
    const r = run(shell({ title: "Test", utils: [counter] }), memory())

    try {
      expect(r.read("/")).toMatchObject({ title: "Test", utils: [{ name: "counter", open: { name: "open", args: { util: "counter" } } }], tabs: [] })
      expect(await r.call("/", "open", { util: "nope" }, "agent")).toMatchObject({ outcome: "refused" })

      const opened = await r.call("/", "open", { util: "counter" }, "agent")

      expect(opened).toMatchObject({ outcome: "written", view: { tabs: [{ at: "/tabs/1", n: 1, util: "counter", title: "Counter" }] } })
      await settled(r)
      expect(r.read("/tabs/1")).toMatchObject({ n: 1 })
      expect(r.read("/tabs/1/n")).toMatchObject({ n: 1 })
      expect(r.read("/tabs/2")).toBeUndefined()
      expect(await r.call("/tabs/1", "bump", { by: 2 }, "agent")).toMatchObject({ outcome: "written", view: { n: 3 } })
      expect(await r.call("/tabs/1", "later", {}, "agent")).toMatchObject({ outcome: "written" })
      expect(r.jobs()).toEqual(["agent"])
      await settled(r)
      expect(r.read("/tabs/1/n")).toMatchObject({ n: 4 })
      expect(await r.call("/", "close", { n: 1 }, "agent")).toMatchObject({ outcome: "written", view: { tabs: [] } })
      expect(r.read("/tabs/1")).toBeUndefined()
      expect(await r.call("/tabs/1", "bump", { by: 1 }, "agent")).toEqual({ outcome: "refused", reason: "nothing at /tabs/1" })
    } finally {
      await r.stop()
    }
  })

  it("restores its tabs with their utils' models and starts their commands again", async () => {
    const ports = memory<unknown>()
    const first = run(shell({ title: "Test", utils: [counter] }), ports)

    await first.call("/", "open", { util: "counter" }, "agent")
    await settled(first)
    await first.call("/tabs/1", "bump", { by: 5 }, "agent")
    await first.stop()

    const second = run(shell({ title: "Test", utils: [counter] }), ports)

    expect(second.busy()).toBe(1)
    await settled(second)
    expect(second.read("/tabs/1/n")).toMatchObject({ n: 7 })
    await second.stop()
  })

  it("tells the agent at home what changes in a tab: each tab carries its util's facts, without its handles", async () => {
    const { agent, person, world } = story(shell({ title: "Test", utils: [counter] }))

    await agent.call("/", "open", { util: "counter" })
    await world.settle({ kind: "tab", n: 1, event: { kind: "bumped" } })
    expect(agent.sees("/")!.tabs).toMatchObject([{ at: "/tabs/1", util: "counter", title: "Counter", facts: { n: 1, detail: { at: "/tabs/1/n" } } }])
    expect(JSON.stringify(agent.sees("/")!.tabs)).not.toContain("bump")
    agent.told()
    await person.call("/tabs/1", "bump", { by: 2 })
    expect(agent.told()).toEqual(["tabs.0.facts.n: 1 → 3"])
  })

  it("gives the paths a util names under at whole, and a tab's page its own back", async () => {
    const { agent } = story(shell({ title: "Test", utils: [counter] }))

    await agent.call("/", "open", { util: "counter" })
    expect(agent.sees("/tabs/1")).toMatchObject({ detail: { at: "/tabs/1/n" } })
    expect(agent.sees("/tabs/1/n")).toMatchObject({ at: "/tabs/1/n" })
    expect(agent.sees(String((agent.sees("/tabs/1")!.detail as { at: string }).at))).toMatchObject({ n: 0 })
    expect(whole({ at: "/", list: [{ at: "/a/b", when: { at: 5 } }], file: "/etc" }, "/tabs/2")).toEqual({
      at: "/tabs/2",
      list: [{ at: "/tabs/2/a/b", when: { at: 5 } }],
      file: "/etc",
    })
    expect(own({ at: "/tabs/2", list: [{ at: "/tabs/2/a/b" }, { at: "/tabs/21/c" }] }, "/tabs/2")).toEqual({
      at: "/",
      list: [{ at: "/a/b" }, { at: "/tabs/21/c" }],
    })
  })

  it("a util that is always open has one tab from the start, started, which is neither opened again nor closed", async () => {
    const always = util("counter", "counts things", counter.surface, { open: "always" })
    const { agent, person, world } = story(shell({ title: "Test", utils: [always] }))

    expect(agent.sees("/")).toMatchObject({ tabs: [{ at: "/tabs/1", util: "counter", facts: { n: 0 } }] })
    expect(world.commands()).toEqual([{ n: 1, util: "counter", command: { kind: "later" } }])
    expect(agent.offered("/")).toEqual([])
    expect(person.offered("/")).toEqual([])
    expect(await agent.call("/", "open", { util: "counter" })).toMatchObject({ outcome: "refused" })
    expect(await person.call("/", "close", { n: 1 })).toMatchObject({ outcome: "refused" })
  })

  it("gives an always-open util its tab when saved state predates it, beside the tabs that were open", async () => {
    const ports = memory<unknown>()
    const first = run(shell({ title: "Test", utils: [counter] }), ports)

    await first.call("/", "open", { util: "counter" }, "agent")
    await first.stop()

    const notes = util("notes", "keeps notes", { ...counter.surface, init: () => ({ title: "Notes", n: 100 }), start: undefined }, { open: "always" })
    const second = run(shell({ title: "Test", utils: [counter, notes] }), ports)

    expect(second.read("/")).toMatchObject({ tabs: [{ at: "/tabs/1", util: "counter" }, { at: "/tabs/2", util: "notes", facts: { n: 100 } }] })
    await settled(second)
    await second.stop()
  })

  it("names tabs and paths, and refuses bad util names", () => {
    expect(within("/tabs/3")).toEqual({ n: 3, path: "/" })
    expect(within("/tabs/3/notes/2/")).toEqual({ n: 3, path: "/notes/2" })
    expect(within("/notes")).toBeUndefined()
    expect(() => util("Bad Name", "x", counter.surface)).toThrow("kebab-case")
    expect(() => shell({ title: "t", utils: [counter, counter] })).toThrow("unique")
  })
})
