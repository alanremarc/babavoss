// The shell's surface: the project's surfaces listed at / and opened as tabs, what each tab says carried to /, and what a
// surface throws kept to its tab.
import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, it } from "bun:test"
import { action, run, story, surface, view, type Ports, type Saved, type Update } from "../../framework/core/index.ts"
import { EMPTY, MISSING, shell, whole, within } from "../../framework/shell/src/surface.ts"
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
const counter = surface<Model, Event, Command>({
  description: "counts things",
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
/** A counter that fails on a negative count, everywhere it is asked. */
const fragile: typeof counter = {
  ...counter,
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

    return counter.update(m, msg)
  },
  view: (m: Model, path, actor) => {
    if (m.n < 0) throw new Error("negative")

    return pages.view(m, path, actor)
  },
}
/** The .baba/ the shell's surfaces are from, in these specs. */
const BABA = "/project/.baba"
/** Saved shell state with one counter tab the fragile counter fails on. */
const negative = { tabs: [{ n: 1, surface: "counter", model: { title: "Counter", n: -1 } }], next: 2 }
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
  it("lists its surfaces with open, opens them as tabs, routes calls and events into the tab, and closes", async () => {
    const r = run(shell({ counter }, BABA), memory())

    try {
      expect(r.read("/")).toEqual({
        title: "baba",
        surfaces: [{ name: "counter", description: "counts things", open: expect.objectContaining({ name: "open", args: { surface: "counter" } }) }],
        tabs: [],
        activity: { at: "/activity" },
      })
      expect(await r.call("/", "open", { surface: "nope" }, "agent")).toMatchObject({ outcome: "refused" })

      const opened = await r.call("/", "open", { surface: "counter" }, "agent")

      expect(opened).toMatchObject({ outcome: "written", view: { tabs: [{ at: "/tabs/1", n: 1, surface: "counter", title: "Counter" }] } })
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

  it("is an empty desktop with no surfaces, which says how one is made, and says where there is no .baba/", () => {
    expect(story(shell({}, BABA)).agent.sees("/")).toEqual({ title: "baba", empty: EMPTY, surfaces: [], tabs: [], activity: { at: "/activity" } })
    expect(EMPTY).toContain("bun run baba new NAME")
    expect(story(shell({})).agent.sees("/")).toEqual({ title: "baba", missing: MISSING, surfaces: [], tabs: [], activity: { at: "/activity" } })
  })

  it("restores its tabs with their surfaces' models and starts their commands again", async () => {
    const ports = memory<unknown>()
    const first = run(shell({ counter }, BABA), ports)

    await first.call("/", "open", { surface: "counter" }, "agent")
    await settled(first)
    await first.call("/tabs/1", "bump", { by: 5 }, "agent")
    await first.stop()

    const second = run(shell({ counter }, BABA), ports)

    expect(second.busy()).toBe(1)
    await settled(second)
    expect(second.read("/tabs/1/n")).toMatchObject({ n: 7 })
    await second.stop()
  })

  it("restores a session's state kept from before: the picker's tab is dropped, and a tab's util is its surface", () => {
    const kept = {
      tabs: [
        { n: 1, util: "surfaces", model: null },
        { n: 2, util: "counter", model: { title: "Counter", n: 4 } },
      ],
      next: 3,
    }
    const { agent } = story(shell({ counter }, BABA), { model: shell({ counter }, BABA).restore!(kept) })

    expect(agent.sees("/")!.tabs).toEqual([
      expect.objectContaining({ at: "/tabs/2", n: 2, surface: "counter", title: "Counter", facts: expect.objectContaining({ n: 4 }) }),
    ])
  })

  it("tells the agent at / what changes in a tab: each tab carries its surface's facts, without its handles, and its actions by name", async () => {
    const { agent, person, world } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    await world.settle({ kind: "tab", n: 1, event: { kind: "bumped" } })
    expect(agent.sees("/")!.tabs).toMatchObject([{ at: "/tabs/1", surface: "counter", title: "Counter", facts: { n: 1, detail: { at: "/tabs/1/n" } } }])
    expect(JSON.stringify((agent.sees("/")!.tabs as { facts: unknown }[])[0]!.facts)).not.toContain("bump")
    expect(agent.sees("/")!.tabs).toMatchObject([{ actions: ["bump", "later"] }])
    agent.told()
    await person.call("/tabs/1", "bump", { by: 2 })
    expect(agent.told()).toEqual(['/tabs/1 counter "Counter"', "n: 1 → 3"])
  })

  it("gives the paths a surface names under at whole, and a tab's page its own back", async () => {
    const { agent } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
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

  it("keeps a tab whose surface fails on what it keeps to that tab: / lists it as broken, with why, and it can be closed", async () => {
    const issues = view([], { "/": (m: { issues: string[] }) => ({ title: "Queue", open: m.issues.filter(Boolean).length }) })
    const queue = (restore?: (saved: unknown) => { issues: string[] }) =>
      surface<{ issues: string[] }, { kind: "none" }, never>({
        description: "keeps issues",
        init: () => ({ issues: [] }),
        ...(restore && { restore }),
        update: (m) => ({ model: m }),
        view: issues.view,
        run: async () => {},
        failed: () => ({ kind: "none" }),
      })
    const ports = memory<unknown>()
    const first = run(shell({ counter }, BABA), ports)

    await first.call("/", "open", { surface: "counter" }, "agent")
    await settled(first)
    await first.stop()

    // The surface named counter was rewritten: what tab 1 keeps is no longer understood by its code.
    const second = run(shell({ counter: queue(), queue: queue() }, BABA), ports)

    try {
      await second.call("/", "open", { surface: "queue" }, "agent")

      const home = second.read("/", "agent")!

      expect(home.tabs).toMatchObject([
        {
          at: "/tabs/1",
          surface: "counter",
          broken: expect.stringMatching(
            /^tab 1 is broken: its counter surface fails on the state the tab keeps \(.*m\.issues\.filter.*\) but not on a fresh one; .*close the tab/
          ),
          close: { name: "close", args: { n: 1 } },
        },
        { at: "/tabs/2", surface: "queue", title: "Queue", facts: { open: 0 } },
      ])
      expect(second.read("/tabs/1")).toMatchObject({ at: "/tabs/1", broken: expect.stringContaining("tab 1 is broken") })
      expect(await second.call("/", "open", { surface: "queue" }, "agent")).toMatchObject({ outcome: "written" })
      expect(second.failure()).toBeUndefined()
      expect(await second.call("/", "close", { n: 1 }, "agent")).toMatchObject({
        outcome: "written",
        view: { tabs: [{ surface: "queue" }, { surface: "queue" }] },
      })
      expect(second.read("/tabs/2")).toMatchObject({ open: 0 })
    } finally {
      await second.stop()
    }

    // A surface whose restore throws breaks its tab, not the shell's restore.
    const unrestorable = queue(() => {
      throw new Error("saved issues are not a list")
    })
    const third = run(shell({ queue: unrestorable }, BABA), ports)

    try {
      expect(third.failure()).toBeUndefined()
      expect(third.read("/")!.tabs).toMatchObject([
        {
          at: "/tabs/2",
          broken:
            "tab 2 is broken: its queue surface cannot restore the state the tab keeps (saved issues are not a list); " +
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
    const program = shell({ counter: fragile }, BABA)
    const model = { tabs: [{ n: 1, surface: "counter", model: { title: "Counter", n: -1 } }], next: 2 }

    expect(program.update(model, { kind: "call", path: "/tabs/1", handle: "bump", args: { by: 1 }, actor: "agent" })).toEqual({
      refused: expect.stringContaining("tab 1 is broken: its counter surface fails on the state the tab keeps (negative)"),
    })
    expect(program.update(model, { kind: "tab", n: 1, event: { kind: "bumped" } })).toEqual({ model })
    expect(program.working?.(model)).toBe(false)
    expect(program.start?.(model)).toEqual([])
  })

  it("says why a call into a broken tab is refused, in the refusal itself", async () => {
    const { agent } = story(shell({ counter: fragile }, BABA), { model: negative })

    expect(await agent.call("/tabs/1", "bump", { by: 1 })).toEqual({
      outcome: "refused",
      reason:
        'bump {"by":1} is not offered at /tabs/1; offered: nothing; tab 1 is broken: its counter surface fails on the state the tab keeps (negative) ' +
        "but not on a fresh one; the state is likely from earlier code of the surface: close the tab to drop it, or fix the surface's code to read it",
    })
  })

  it("puts a tab's fault on the surface's code when it fails on a fresh state too, where closing will not help", () => {
    const unwritten: typeof counter = {
      ...counter,
      view: () => {
        throw new Error("view is not written yet")
      },
    }
    const kept = { model: { tabs: [{ n: 1, surface: "counter", model: { title: "Counter", n: 3 } }], next: 2 } }
    const { agent } = story(shell({ counter: unwritten }, BABA), kept)

    expect(agent.sees("/")!.tabs).toMatchObject([
      {
        at: "/tabs/1",
        broken:
          "tab 1 is broken: its counter surface fails in its own code (view is not written yet), on a fresh state as on the one the tab keeps: " +
          "fix the surface's code; closing the tab will not help",
        close: { name: "close" },
      },
    ])
  })

  it("keeps a path its surface cannot show to that path: the read says what failed there, and the rest of the tab works", async () => {
    const split: typeof counter = {
      ...counter,
      start: undefined,
      view: (m: Model, path, actor) => {
        if (path === "/n") throw new Error("n is not shown yet")

        return pages.view(m, path, actor)
      },
    }
    const { agent } = story(shell({ counter: split }, BABA))

    await agent.call("/", "open", { surface: "counter" })
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
    const failing = (part: "init" | "start" | "view"): typeof counter => ({
      ...counter,
      [part]: () => {
        throw new Error(`${part} fails`)
      },
    })
    const { agent } = story(
      shell({ "fails-in-init": failing("init"), "fails-in-start": failing("start"), "fails-in-view": failing("view"), counter }, BABA)
    )

    for (const part of ["init", "start", "view"])
      expect(await agent.call("/", "open", { surface: `fails-in-${part}` })).toEqual({
        outcome: "refused",
        reason: `no fails-in-${part} tab is opened: its surface fails as it opens (${part} fails); fix the surface's code`,
      })
    expect(agent.sees("/")!.tabs).toEqual([])
    expect(await agent.call("/", "open", { surface: "counter" })).toMatchObject({ outcome: "written", view: { tabs: [{ at: "/tabs/1" }] } })
  })

  it("lets the agent point the person to a place in a tab: shown at / to both, and refused with why where there is none", async () => {
    const { agent, person, world } = story(shell({ counter }, BABA))

    expect(agent.offered("/")).not.toContain("show")
    await agent.call("/", "open", { surface: "counter" })
    await world.settle({ kind: "tab", n: 1, event: { kind: "bumped" } })
    expect(agent.offered("/")).toContain("show")
    expect(await agent.call("/", "show", { at: "/tabs/1/n/" })).toMatchObject({ outcome: "written" })
    expect(person.sees("/")!.pointed).toEqual({ at: "/tabs/1/n", n: 1 })
    expect(agent.sees("/")!.pointed).toEqual({ at: "/tabs/1/n", n: 1 })
    await agent.call("/", "show", { at: "/tabs/1/n" })
    expect(person.sees("/")!.pointed).toEqual({ at: "/tabs/1/n", n: 2 })
    expect(await agent.call("/", "show", { at: "/tabs/1/nope" })).toEqual({ outcome: "refused", reason: "nothing at /tabs/1/nope: the counter surface has no such path" })
    expect(await agent.call("/", "show", { at: "/tabs/7" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("no tab 7") })
    expect(await agent.call("/", "show", { at: "/settings" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("not in a tab") })
    expect(person.sees("/")!.pointed).toEqual({ at: "/tabs/1/n", n: 2 })
  })

  it("drops where it last pointed when it restores, so a page loaded later does not go there again", () => {
    const kept = { tabs: [{ n: 1, surface: "counter", model: { title: "Counter", n: 0 } }], next: 2, pointed: { at: "/tabs/1", n: 3 } }

    expect(shell({ counter }, BABA).restore!(kept).pointed).toBeUndefined()
  })

  it("gathers who each tab needs first at /, as needs, and no longer among the tab's facts", async () => {
    type Ask = { asking?: "person" | "agent" | "both" | "bad" }
    const ask = action({
      name: "ask",
      description: "ask",
      subject: {},
      inputs: { who: "string" },
      update: (_m: Ask, { who }): Update<Ask, never> => ({ model: who ? { asking: who as Ask["asking"] } : {} }),
    })
    const needing = view([ask], {
      "/": (m) => ({
        title: "Asker",
        ...(m.asking === "person" && { attention: { who: "person", why: "to decide" } }),
        ...(m.asking === "both" && { attention: [{ who: "person", why: "to decide" }, { who: "agent", why: "to draft" }] }),
        ...(m.asking === "bad" && { attention: "someone" }),
        ask: ask.bind({}),
      }),
    })
    const asker = surface<Ask, { kind: "none" }, never>({
      description: "asks",
      init: () => ({}),
      update: (m, msg) => (msg.kind === "call" ? needing.update(m, msg) : { model: m }),
      view: needing.view,
      run: async () => {},
      failed: () => ({ kind: "none" }),
    })
    const { agent } = story(shell({ asker, counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    await agent.call("/", "open", { surface: "asker" })
    expect(agent.sees()).not.toHaveProperty("needs")
    await agent.call("/tabs/2", "ask", { who: "person" })
    expect(Object.keys(agent.sees()!)).toEqual(["title", "needs", "surfaces", "tabs", "show", "activity"])
    expect(agent.sees()).toMatchObject({ needs: [{ at: "/tabs/2", surface: "asker", who: "person", why: "to decide" }] })
    expect((agent.sees()!.tabs as { facts: object }[])[1]!.facts).toEqual({})
    // The tab's own path still says it.
    expect(agent.sees("/tabs/2")).toMatchObject({ attention: { who: "person", why: "to decide" } })
    await agent.call("/tabs/2", "ask", { who: "both" })
    expect(agent.sees()!.needs).toEqual([
      { at: "/tabs/2", surface: "asker", who: "person", why: "to decide" },
      { at: "/tabs/2", surface: "asker", who: "agent", why: "to draft" },
    ])
    // What is not attention is not gathered, and stays a fact of its tab.
    await agent.call("/tabs/2", "ask", { who: "bad" })
    expect(agent.sees()).not.toHaveProperty("needs")
    expect((agent.sees()!.tabs as { facts: object }[])[1]!.facts).toEqual({ attention: "someone" })
    await agent.call("/tabs/2", "ask", { who: "" })
    agent.told()
    await agent.call("/tabs/2", "ask", { who: "person" })
    // A need is told as an event on it: who is needed, where and why, one line each.
    expect(agent.told()).toEqual(["+ need: the person, at /tabs/2 asker, to decide"])
    await agent.call("/tabs/2", "ask", { who: "both" })
    expect(agent.told()).toEqual(["+ need: you, at /tabs/2 asker, to draft"])
    await agent.call("/tabs/2", "ask", { who: "" })
    expect(agent.told()).toEqual(["- need: the person, at /tabs/2 asker, to decide", "- need: you, at /tabs/2 asker, to draft"])
  })

  it("gives a tab's notices with the tab's path whole and its surface named", async () => {
    type Said = { n: number }
    const say = action({
      name: "say",
      description: "say",
      subject: {},
      inputs: {},
      update: (m: Said): Update<Said, never> => ({ model: { n: m.n + 1 }, notices: ["said once", { text: "said there", at: "/things/1" }] }),
    })
    const speaking = view([say], { "/": (m) => ({ n: m.n, say: say.bind({}) }) })
    const sayer = surface<Said, { kind: "none" }, never>({
      description: "says",
      init: () => ({ n: 0 }),
      update: (m, msg) => (msg.kind === "call" ? speaking.update(m, msg) : { model: m }),
      view: speaking.view,
      run: async () => {},
      failed: () => ({ kind: "none" }),
    })
    const r = run(shell({ sayer }, BABA), memory())
    const heard: unknown[] = []

    r.notices(({ cause: _cause, ...n }) => heard.push(n))
    await r.call("/", "open", { surface: "sayer" }, "agent")
    await r.call("/tabs/1", "say", {}, "person")
    expect(heard).toEqual([
      { text: "said once", at: "/tabs/1", from: "sayer" },
      { text: "said there", at: "/tabs/1/things/1", from: "sayer" },
    ])
    await r.stop()
  })

  it("names tabs and paths, and refuses bad surface names", () => {
    expect(within("/tabs/3")).toEqual({ n: 3, path: "/" })
    expect(within("/tabs/3/notes/2/")).toEqual({ n: 3, path: "/notes/2" })
    expect(within("/notes")).toBeUndefined()
    expect(() => shell({ "Bad Name": counter })).toThrow("kebab-case")
  })
})
