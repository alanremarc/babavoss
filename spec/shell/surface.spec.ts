import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, it } from "bun:test"
import { action, run, story, surface, view, type Ports, type Saved, type Update } from "../../framework/core/index.ts"
import { shell, util, whole, within } from "../../framework/shell/src/surface.ts"
import { own } from "../../framework/shell/ui/tab.tsx"

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
/** A counter that fails on a negative count, everywhere it is asked. */
const fragile = util("counter", "counts things", {
  ...counter.surface,
  start: (m: Model) => {
    if (m.n < 0) throw new Error("negative")

    return [{ kind: "later" }]
  },
  working: (m: Model) => {
    if (m.n < 0) throw new Error("negative")

    return true
  },
  update: (m: Model, msg) => {
    if (m.n < 0) throw new Error("negative")

    return counter.surface.update(m, msg)
  },
  view: (m: Model, path, actor) => {
    if (m.n < 0) throw new Error("negative")

    return pages.view(m, path, actor)
  },
})
/** Saved shell state with one counter tab the fragile counter fails on. */
const negative = { tabs: [{ n: 1, util: "counter", model: { title: "Counter", n: -1 } }], next: 2 }
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

  it("keeps a tab whose util fails on what it keeps to that tab: home lists it as broken, with why, and it can be closed", async () => {
    const issues = view([], { "/": (m: { issues: string[] }) => ({ title: "Queue", open: m.issues.filter(Boolean).length }) })
    const queue = (restore?: (saved: unknown) => { issues: string[] }) =>
      util(
        "queue",
        "keeps issues",
        surface<{ issues: string[] }, { kind: "none" }, never>({
          description: "issues",
          init: () => ({ issues: [] }),
          ...(restore && { restore }),
          update: (m) => ({ model: m }),
          view: issues.view,
          run: async () => {},
          failed: () => ({ kind: "none" }),
        })
      )
    const ports = memory<unknown>()
    const first = run(shell({ title: "Test", utils: [counter] }), ports)

    await first.call("/", "open", { util: "counter" }, "agent")
    await settled(first)
    await first.stop()

    // The surface named counter was rewritten: what tab 1 keeps is no longer understood by its code.
    const rewritten = util("counter", "counts things", queue().surface)
    const second = run(shell({ title: "Test", utils: [rewritten, queue()] }), ports)

    try {
      await second.call("/", "open", { util: "queue" }, "agent")

      const home = second.read("/", "agent")!

      expect(home.tabs).toMatchObject([
        {
          at: "/tabs/1",
          util: "counter",
          broken: expect.stringMatching(
            /^tab 1 is broken: its counter surface fails on the state the tab keeps \(.*m\.issues\.filter.*\) but not on a fresh one; .*close the tab/
          ),
          close: { name: "close", args: { n: 1 } },
        },
        { at: "/tabs/2", util: "queue", title: "Queue", facts: { open: 0 } },
      ])
      expect(second.read("/tabs/1")).toMatchObject({ at: "/tabs/1", broken: expect.stringContaining("tab 1 is broken") })
      expect(await second.call("/", "open", { util: "queue" }, "agent")).toMatchObject({ outcome: "written" })
      expect(second.failure()).toBeUndefined()
      expect(await second.call("/", "close", { n: 1 }, "agent")).toMatchObject({ outcome: "written", view: { tabs: [{ util: "queue" }, { util: "queue" }] } })
      expect(second.read("/tabs/2")).toMatchObject({ open: 0 })
    } finally {
      await second.stop()
    }

    // A util whose restore throws breaks its tab, not the shell's restore.
    const unrestorable = queue(() => {
      throw new Error("saved issues are not a list")
    })
    const third = run(shell({ title: "Test", utils: [unrestorable] }), ports)

    try {
      expect(third.failure()).toBeUndefined()
      expect(third.read("/")!.tabs).toMatchObject([
        {
          at: "/tabs/2",
          broken: "tab 2 is broken: its queue surface cannot restore the state the tab keeps (saved issues are not a list); " +
            "the state is likely from earlier code of the surface: close the tab to drop it, or fix the surface's restore to read it",
          close: { name: "close" },
        },
        { at: "/tabs/3", broken: expect.stringContaining("tab 3 is broken") },
      ])
    } finally {
      await third.stop()
    }
  })

  it("refuses a call into a broken tab with why, and lets its events land nowhere", () => {
    const program = shell({ title: "Test", utils: [fragile] })
    const model = { tabs: [{ n: 1, util: "counter", model: { title: "Counter", n: -1 } }], next: 2 }

    expect(program.update(model, { kind: "call", path: "/tabs/1", handle: "bump", args: { by: 1 }, actor: "agent" })).toEqual({
      refused: expect.stringContaining("tab 1 is broken: its counter surface fails on the state the tab keeps (negative)"),
    })
    expect(program.update(model, { kind: "tab", n: 1, event: { kind: "bumped" } })).toEqual({ model })
    expect(program.working?.(model)).toBe(false)
    expect(program.start?.(model)).toEqual([])
  })

  it("says why a call into a broken tab is refused, in the refusal itself", async () => {
    const { agent } = story(shell({ title: "Test", utils: [fragile] }), { model: negative })

    expect(await agent.call("/tabs/1", "bump", { by: 1 })).toEqual({
      outcome: "refused",
      reason:
        'bump {"by":1} is not offered at /tabs/1; offered: nothing; tab 1 is broken: its counter surface fails on the state the tab keeps (negative) ' +
        "but not on a fresh one; the state is likely from earlier code of the surface: close the tab to drop it, or fix the surface's code to read it",
    })
  })

  it("puts a tab's fault on the surface's code when it fails on a fresh state too, where closing will not help", async () => {
    const unwritten = util("counter", "counts things", {
      ...counter.surface,
      view: () => {
        throw new Error("view is not written yet")
      },
    })
    const kept = { model: { tabs: [{ n: 1, util: "counter", model: { title: "Counter", n: 3 } }], next: 2 } }
    const { agent } = story(shell({ title: "Test", utils: [unwritten] }), kept)

    expect(agent.sees("/")!.tabs).toMatchObject([
      {
        at: "/tabs/1",
        broken:
          "tab 1 is broken: its counter surface fails in its own code (view is not written yet), on a fresh state as on the one the tab keeps: " +
          "fix the surface's code; closing the tab will not help",
        close: { name: "close" },
      },
    ])

    const always = util("counter", "counts things", fragile.surface, { open: "always" })
    const pinned = story(shell({ title: "Test", utils: [always] }), { model: negative })

    expect(pinned.agent.sees("/")!.tabs).toMatchObject([
      { at: "/tabs/1", broken: expect.stringMatching(/but not on a fresh one; .*: fix the surface's code to read it$/) },
    ])
  })

  it("keeps a path its util cannot show to that path: the read says what failed there, and the rest of the tab works", async () => {
    const split = util("counter", "counts things", {
      ...counter.surface,
      start: undefined,
      view: (m: Model, path, actor) => {
        if (path === "/n") throw new Error("n is not shown yet")

        return pages.view(m, path, actor)
      },
    })
    const { agent } = story(shell({ title: "Test", utils: [split] }))

    await agent.call("/", "open", { util: "counter" })
    expect(agent.sees("/")!.tabs).toMatchObject([{ at: "/tabs/1", title: "Counter", facts: { n: 0 } }])
    expect(agent.sees("/")!.tabs).not.toMatchObject([{ broken: expect.anything() }])
    expect(agent.sees("/tabs/1/n")).toEqual({
      at: "/tabs/1/n",
      broken: "/tabs/1/n cannot be shown: its counter surface fails there (n is not shown yet), while tab 1 works at /: fix the surface's code for this path",
    })
    expect(await agent.call("/tabs/1/n", "bump", { by: 1 })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("/tabs/1/n cannot be shown") })
    expect(await agent.call("/tabs/1", "bump", { by: 2 })).toMatchObject({ outcome: "written", view: { n: 2 } })
  })

  it("refuses to open a tab whose surface fails as it opens, and makes none", async () => {
    const failing = (part: "init" | "start" | "view") =>
      util(`fails-in-${part}`, "fails", {
        ...counter.surface,
        [part]: () => {
          throw new Error(`${part} fails`)
        },
      })
    const { agent } = story(shell({ title: "Test", utils: [failing("init"), failing("start"), failing("view"), counter] }))

    for (const part of ["init", "start", "view"])
      expect(await agent.call("/", "open", { util: `fails-in-${part}` })).toEqual({
        outcome: "refused",
        reason: `no fails-in-${part} tab is opened: its surface fails as it opens (${part} fails); fix the surface's code`,
      })
    expect(agent.sees("/")!.tabs).toEqual([])
    expect(await agent.call("/", "open", { util: "counter" })).toMatchObject({ outcome: "written", view: { tabs: [{ at: "/tabs/1" }] } })
  })

  it("lists an always-open util that cannot make its tab as broken, without taking the root down, and makes it again once it can", async () => {
    const ports = memory<unknown>()
    const unmade = util("counter", "counts things", { ...counter.surface, init: (): Model => { throw new Error("no counter yet") } }, { open: "always" })
    const first = run(shell({ title: "Test", utils: [unmade] }), ports)

    try {
      expect(first.failure()).toBeUndefined()
      expect(first.read("/")).toMatchObject({
        tabs: [{ at: "/tabs/1", util: "counter", broken: "tab 1 is broken: its counter surface fails as it opens (no counter yet); fix the surface's code" }],
      })
      expect(first.read("/")!.tabs).not.toMatchObject([{ close: expect.anything() }])
      expect(await first.call("/tabs/1", "bump", { by: 1 }, "agent")).toMatchObject({ reason: expect.stringContaining("fails as it opens (no counter yet)") })
    } finally {
      await first.stop()
    }

    const fixed = run(shell({ title: "Test", utils: [util("counter", "counts things", counter.surface, { open: "always" })] }), ports)

    try {
      expect(fixed.read("/")).toMatchObject({ tabs: [{ at: "/tabs/2", util: "counter", facts: { n: 0 } }] })
      await settled(fixed)
    } finally {
      await fixed.stop()
    }
  })

  it("names tabs and paths, and refuses bad util names", () => {
    expect(within("/tabs/3")).toEqual({ n: 3, path: "/" })
    expect(within("/tabs/3/notes/2/")).toEqual({ n: 3, path: "/notes/2" })
    expect(within("/notes")).toBeUndefined()
    expect(() => util("Bad Name", "x", counter.surface)).toThrow("kebab-case")
    expect(() => shell({ title: "t", utils: [counter, counter] })).toThrow("unique")
  })
})
