// The shell's surface: the project's surfaces listed at / and opened as tabs, what each tab says carried to /, and what a
// surface throws kept to its tab.
import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, it } from "bun:test"
import { action, run, story, surface, view, type Ports, type Saved, type Update } from "../../framework/core/index.ts"
import { addressed, EMPTY, MISSING, PATHS, shell, whole, within } from "../../framework/shell/src/surface.ts"
import { RESERVED } from "../../framework/core/provision.ts"
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
        surfaces: [
          { name: "counter", description: "counts things", open: expect.objectContaining({ name: "open", args: { surface: "counter" } }) },
          { name: "settings", description: expect.stringContaining("Use when"), open: expect.objectContaining({ name: "open", args: { surface: "settings" } }) },
        ],
        tabs: [],
        activity: { at: "/activity" },
      })
      expect(await r.call("/", "open", { surface: "nope" }, "agent")).toMatchObject({ outcome: "refused" })

      const opened = await r.call("/", "open", { surface: "counter" }, "agent")

      expect(opened).toMatchObject({ outcome: "written", view: { tabs: [{ at: "/counter", n: 1, surface: "counter", title: "Counter" }] } })
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
      expect(await r.call("/tabs/1", "bump", { by: 1 }, "agent")).toEqual({
        outcome: "refused",
        reason: "/tabs/1, the counter tab 1, was closed by the agent: open one with open surface=counter at /, and it is at /counter",
      })
    } finally {
      await r.stop()
    }
  })

  it("is an empty desktop with no surfaces, which says how one is made, and says where there is no .baba/", () => {
    const own = [{ name: "settings", description: expect.any(String), open: expect.objectContaining({ name: "open" }) }]

    expect(story(shell({}, BABA)).agent.sees("/")).toEqual({ title: "baba", empty: EMPTY, surfaces: own, tabs: [], activity: { at: "/activity" } })
    expect(EMPTY).toContain("bun run baba new NAME")
    expect(story(shell({})).agent.sees("/")).toEqual({ title: "baba", missing: MISSING, surfaces: own, tabs: [], activity: { at: "/activity" } })
    // The root is named by its title, the configuration's or the project directory's, to the agent and the person alike.
    const titled = story(shell({}, BABA, {}, undefined, "Billing desk"))

    expect([titled.agent.sees("/")!.title, titled.person.sees("/")!.title]).toEqual(["Billing desk", "Billing desk"])
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
      expect.objectContaining({ at: "/counter", n: 2, surface: "counter", title: "Counter", facts: expect.objectContaining({ n: 4 }) }),
    ])
  })

  it("tells the agent at / what changes in a tab: each tab carries its surface's facts, without its handles, and its actions by name", async () => {
    const { agent, person, world } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    await world.settle({ kind: "tab", n: 1, event: { kind: "bumped" } })
    expect(agent.sees("/")!.tabs).toMatchObject([{ at: "/counter", surface: "counter", title: "Counter", facts: { n: 1, detail: { at: "/counter/n" } } }])
    expect(JSON.stringify((agent.sees("/")!.tabs as { facts: unknown }[])[0]!.facts)).not.toContain("bump")
    expect(agent.sees("/")!.tabs).toMatchObject([{ actions: ["bump", "later"] }])
    agent.told()
    await person.call("/tabs/1", "bump", { by: 2 })
    expect(agent.told()).toEqual(['/counter "Counter" (tab 1)', "n: 1 → 3"])
  })

  it("gives the paths a surface names under at whole, and a tab's page its own back", async () => {
    const { agent } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    expect(agent.sees("/tabs/1")).toMatchObject({ detail: { at: "/counter/n" } })
    expect(agent.sees("/tabs/1/n")).toMatchObject({ at: "/counter/n" })
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
          at: "/counter",
          surface: "counter",
          broken: expect.stringMatching(
            /^tab 1 is broken: its counter surface fails on the state the tab keeps \(.*m\.issues\.filter.*\) but not on a fresh one; .*close the tab/
          ),
          close: { name: "close", args: { n: 1 } },
        },
        { at: "/queue", surface: "queue", title: "Queue", facts: { open: 0 } },
      ])
      expect(second.read("/tabs/1")).toMatchObject({ at: "/counter", broken: expect.stringContaining("tab 1 is broken") })
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
          at: "/queue",
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
        at: "/counter",
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
    expect(agent.sees("/")!.tabs).toMatchObject([{ at: "/counter", title: "Counter", facts: { n: 0 } }])
    expect(agent.sees("/")!.tabs).not.toMatchObject([{ broken: expect.anything() }])
    expect(agent.sees("/tabs/1/n")).toEqual({
      at: "/counter/n",
      broken: "/counter/n cannot be shown: its counter surface fails there (n is not shown yet), while tab 1 works at /: fix the surface's code for this path",
    })
    expect(await agent.call("/tabs/1/n", "bump", { by: 1 })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("/counter/n cannot be shown") })
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
    expect(await agent.call("/", "open", { surface: "counter" })).toMatchObject({ outcome: "written", view: { tabs: [{ at: "/counter" }] } })
  })

  it("lets the agent point the person to a place in a tab: shown at / to both, and refused with why where there is none", async () => {
    const { agent, person, world } = story(shell({ counter }, BABA))

    expect(agent.offered("/")).not.toContain("show")
    await agent.call("/", "open", { surface: "counter" })
    await world.settle({ kind: "tab", n: 1, event: { kind: "bumped" } })
    expect(agent.offered("/")).toContain("show")
    // The person is not offered it: home's menu, drawn from the view at /, has no way to point them at themselves.
    expect(person.offered("/")).not.toContain("show")
    expect(await agent.call("/", "show", { at: "/tabs/1/n/" })).toMatchObject({ outcome: "written" })
    // Pointed by number or by name, it is said by the tab's address.
    expect(person.sees("/")!.pointed).toEqual({ at: "/counter/n", n: 1 })
    expect(agent.sees("/")!.pointed).toEqual({ at: "/counter/n", n: 1 })
    await agent.call("/", "show", { at: "/counter/n" })
    expect(person.sees("/")!.pointed).toEqual({ at: "/counter/n", n: 2 })
    expect(await agent.call("/", "show", { at: "/counter/nope" })).toEqual({ outcome: "refused", reason: "nothing at /counter/nope: the counter surface has no such path" })
    expect(await agent.call("/", "show", { at: "/tabs/7" })).toEqual({ outcome: "refused", reason: "nothing at /tabs/7" })
    expect(await agent.call("/", "show", { at: "/settings" })).toEqual({
      outcome: "refused",
      reason: "no settings tab is open: open one with open surface=settings at /, and it is at /settings",
    })
    expect(await agent.call("/", "show", { at: "/activity" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("not in a tab") })
    expect(person.sees("/")!.pointed).toEqual({ at: "/counter/n", n: 2 })
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
    expect(agent.sees()).toMatchObject({ needs: [{ at: "/asker", surface: "asker", who: "person", why: "to decide" }] })
    expect((agent.sees()!.tabs as { facts: object }[])[1]!.facts).toEqual({})
    // The tab's own path still says it.
    expect(agent.sees("/tabs/2")).toMatchObject({ attention: { who: "person", why: "to decide" } })
    await agent.call("/tabs/2", "ask", { who: "both" })
    expect(agent.sees()!.needs).toEqual([
      { at: "/asker", surface: "asker", who: "person", why: "to decide" },
      { at: "/asker", surface: "asker", who: "agent", why: "to draft" },
    ])
    // What is not attention is not gathered, and stays a fact of its tab.
    await agent.call("/tabs/2", "ask", { who: "bad" })
    expect(agent.sees()).not.toHaveProperty("needs")
    expect((agent.sees()!.tabs as { facts: object }[])[1]!.facts).toEqual({ attention: "someone" })
    await agent.call("/tabs/2", "ask", { who: "" })
    agent.told()
    await agent.call("/tabs/2", "ask", { who: "person" })
    // A need is told as an event on it: who is needed, where and why, one line each.
    expect(agent.told()).toEqual(["+ need: the person, at /asker, to decide"])
    await agent.call("/tabs/2", "ask", { who: "both" })
    expect(agent.told()).toEqual(["+ need: you, at /asker, to draft"])
    await agent.call("/tabs/2", "ask", { who: "" })
    expect(agent.told()).toEqual(["- need: the person, at /asker, to decide", "- need: you, at /asker, to draft"])
  })

  it("counts to the person at / the asks each tab offers anywhere in its tree, so a tab not shown is dotted; the agent is told none", async () => {
    type Deep = { open: number[] }
    const answer = action({
      name: "answer",
      description: "answer",
      subject: { n: "number" },
      inputs: {},
      ask: true,
      update: (m: Deep, { n }): Update<Deep, never> => ({ model: { open: m.open.filter((o) => o !== n) } }),
    })
    const pose = action({
      name: "pose",
      description: "pose",
      subject: {},
      inputs: { n: "number" },
      update: (m: Deep, { n }): Update<Deep, never> => ({ model: { open: [...m.open, n] } }),
    })
    // An ask two places below /, where the tab's first screen does not offer it, and listed again in its group.
    const deep = view([answer, pose], {
      "/": () => ({ title: "Deep", groups: [{ at: "/group" }], pose: pose.bind({}) }),
      "/group": (m) => ({ items: m.open.map((n) => ({ at: `/group/${n}`, answer: answer.bind({ n }) })) }),
      "/group/:n": (m, { n }) => ({ at: `/group/${n}`, ...(m.open.includes(Number(n)) && { answer: answer.bind({ n: Number(n) }) }) }),
    })
    const asker = surface<Deep, { kind: "none" }, never>({
      description: "asks deep",
      init: () => ({ open: [] }),
      update: (m, msg) => (msg.kind === "call" ? deep.update(m, msg) : { model: m }),
      view: deep.view,
      run: async () => {},
      failed: () => ({ kind: "none" }),
    })
    const { agent, person } = story(shell({ asker, counter }, BABA))
    const counted = () => (person.sees()!.tabs as { at: string; asks?: number }[]).map((t) => [t.at, t.asks])

    await agent.call("/", "open", { surface: "counter" })
    await agent.call("/", "open", { surface: "asker" })
    expect(counted()).toEqual([["/counter", undefined], ["/asker", undefined]])
    await agent.call("/asker", "pose", { n: 1 })
    await agent.call("/asker", "pose", { n: 2 })
    expect(counted()).toEqual([["/counter", undefined], ["/asker", 2]])
    expect((agent.sees()!.tabs as object[])[1]).not.toHaveProperty("asks")
    await person.call("/asker/group/1", "answer", { n: 1 })
    expect(counted()).toEqual([["/counter", undefined], ["/asker", 1]])
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
      { text: "said once", at: "/sayer", from: "sayer" },
      { text: "said there", at: "/sayer/things/1", from: "sayer" },
    ])
    await r.stop()
  })

  it("lets a closed tab's entries go across a restart, and those of a tab closed in state kept before entries went with their tab", async () => {
    const s = story(shell({ counter }, BABA))

    await s.agent.call("/", "open", { surface: "counter" })
    await s.agent.call("/counter", "bump", { by: 1 })
    await s.person.call("/", "close", { n: 1 })
    await s.restart()
    expect((s.agent.sees("/activity")!.entries as { what: string }[]).map((r) => r.what)).toEqual(["closed", "opened"])

    const old = { n: 1, when: 0, who: "agent", surface: "counter", at: "/tabs/4", what: "bump by=1" }
    const kept = shell({ counter }, BABA).restore!({ tabs: [], next: 5, activity: [old, { ...old, n: 2, what: "closed", own: true }] })

    expect(kept.activity!.map((e) => e.what)).toEqual(["closed"])
  })

  it("names tabs and paths, and refuses bad surface names", () => {
    expect(within("/tabs/3")).toEqual({ n: 3, path: "/" })
    expect(within("/tabs/3/notes/2/")).toEqual({ n: 3, path: "/notes/2" })
    expect(within("/notes")).toBeUndefined()
    expect(() => shell({ "Bad Name": counter })).toThrow("kebab-case")
  })
})

describe("a tab's address", () => {
  it("is its surface's name: a read, a call and show at /NAME go to the tab, and / says it first, with the tab's number", async () => {
    const { agent, person } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    agent.told()
    expect(agent.sees("/")!.tabs).toMatchObject([{ at: "/counter", n: 1, facts: { detail: { at: "/counter/n" } }, actions: ["bump", "later"] }])
    expect(agent.sees("/counter")).toMatchObject({ title: "Counter", detail: { at: "/counter/n" } })
    expect(agent.sees("/counter/n")).toEqual({ at: "/counter/n", n: 0 })
    expect(await agent.call("/counter", "bump", { by: 2 })).toMatchObject({ outcome: "written", view: { n: 2 } })
    // The number still reaches it, and what it names is said by the address.
    expect(agent.sees("/tabs/1")).toMatchObject({ n: 2, detail: { at: "/counter/n" } })
    expect(await agent.call("/", "show", { at: "/counter/n" })).toMatchObject({ outcome: "written" })
    expect(person.sees("/")!.pointed).toEqual({ at: "/counter/n", n: 1 })
    agent.told()
    await person.call("/counter", "bump", { by: 1 })
    expect(agent.told()).toEqual(['/counter "Counter" (tab 1)', "n: 2 → 3"])
  })

  it("stays the surface's when the person closes its tab and opens it again: the old number says where it went", async () => {
    const { agent, person } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    await agent.call("/counter", "bump", { by: 2 })
    agent.told()
    await person.call("/", "close", { n: 1 })
    // Closed: the name and the number say what happened, and how to open it again, in place of nothing.
    const closed = "/tabs/1, the counter tab 1, was closed by the person: open one with open surface=counter at /, and it is at /counter"

    expect(await agent.call("/tabs/1", "bump", { by: 1 })).toEqual({ outcome: "refused", reason: closed })
    expect(await agent.call("/counter", "bump", { by: 1 })).toEqual({
      outcome: "refused",
      reason: "/counter, the counter tab 1, was closed by the person: open one with open surface=counter at /, and it is at /counter",
    })
    await person.call("/", "open", { surface: "counter" })
    // Opened again, it is at the name, under another number: what was written down with the name works on.
    expect(await agent.call("/counter", "bump", { by: 1 })).toMatchObject({ outcome: "written", view: { n: 1 } })
    expect(await agent.call("/tabs/1", "bump", { by: 1 })).toEqual({
      outcome: "refused",
      reason: "/tabs/1, the counter tab 1, was closed by the person; counter is now at /counter (tab 2)",
    })
    // With the person's next message, the tab closed and the tab opened, each once by its number.
    expect(agent.told()[0]).toBe('- /counter "Counter" (tab 1) closed')
    expect(agent.told()).toEqual([])
  })

  it("is the name for the tab that took it, and the number for a second tab of the surface, whose heading names the surface", async () => {
    const { agent, person } = story(shell({ counter }, BABA))

    await agent.call("/", "open", { surface: "counter" })
    await agent.call("/", "open", { surface: "counter" })
    expect((agent.sees("/")!.tabs as { at: string }[]).map((t) => t.at)).toEqual(["/counter", "/tabs/2"])
    await agent.call("/tabs/2", "bump", { by: 5 })
    expect(agent.sees("/counter")).toMatchObject({ n: 0 })
    expect(agent.sees("/tabs/2")).toMatchObject({ n: 5, detail: { at: "/tabs/2/n" } })
    agent.told()
    await person.call("/tabs/2", "bump", { by: 1 })
    expect(agent.told()).toEqual(['/tabs/2 counter "Counter"', "n: 5 → 6"])
    // The name is never passed to the other open tab: a path written down for the first does not land in the second.
    await person.call("/", "close", { n: 1 })
    expect(await agent.call("/counter", "bump", { by: 1 })).toEqual({
      outcome: "refused",
      reason: "/counter, the counter tab 1, was closed by the person; the counter tab open is /tabs/2, and open surface=counter at / opens one at /counter",
    })
    expect(agent.sees("/tabs/2")).toMatchObject({ n: 6 })
    await agent.call("/", "open", { surface: "counter" })
    expect((agent.sees("/")!.tabs as { at: string }[]).map((t) => t.at)).toEqual(["/tabs/2", "/counter"])
  })

  it("says, where the surface has no tab open, that none is and how to open one", async () => {
    const { agent } = story(shell({ counter }, BABA, { queue: "Unexpected end of file" }))
    const none = "no counter tab is open: open one with open surface=counter at /, and it is at /counter"

    expect(agent.sees("/counter")).toBeUndefined()
    expect(await agent.call("/counter/n", "bump", { by: 1 })).toEqual({ outcome: "refused", reason: none })
    expect(await agent.call("/queue", "add", {})).toMatchObject({ outcome: "refused", reason: expect.stringContaining("no queue tab is open; the queue surface does not load") })
    expect(await agent.call("/nothing", "bump", {})).toEqual({ outcome: "refused", reason: "nothing at /nothing" })
  })

  it("never stands on the shell's own paths: their names are reserved, and a surface given one is left out", () => {
    expect(PATHS.every((name) => RESERVED.includes(name))).toBe(true)
    expect(addressed("/activity/notices")).toBeUndefined()
    expect(addressed("/tabs")).toBeUndefined()
    expect(addressed("/queue/issues/42/")).toEqual({ name: "queue", path: "/issues/42" })
    expect(addressed("/tabs/3/issues")).toEqual({ n: 3, path: "/issues" })

    const listed = story(shell({ tabs: counter, activity: counter, counter }, BABA)).agent.sees("/")!.surfaces as { name: string }[]

    expect(listed.map((s) => s.name)).toEqual(["counter", "settings"])
  })

  it("is given, in state kept before tabs held names, to each surface's oldest tab", () => {
    const kept = { tabs: [3, 5, 4].map((n) => ({ n, surface: "counter", model: { title: "Counter", n } })), next: 6 }
    const model = shell({ counter }, BABA).restore!(kept)

    expect(model.tabs.map((t) => t.named ?? false)).toEqual([true, false, false])
  })
})

describe("a surface whose code does not load", () => {
  const why = "Unexpected end of file, at /project/.baba/surfaces/queue/src/surface.ts:3:1"

  it("is listed at / as broken, with why, and cannot be opened; the others are opened as ever", async () => {
    const { agent } = story(shell({ counter }, BABA, { queue: why }))
    const home = agent.sees("/")!

    expect(home.surfaces).toEqual([
      { name: "counter", description: "counts things", open: expect.objectContaining({ name: "open" }) },
      { name: "settings", description: expect.any(String), open: expect.objectContaining({ name: "open" }) },
      { name: "queue", broken: `the queue surface does not load (${why}); fix its code, and it is loaded again` },
    ])
    expect(home).not.toHaveProperty("empty")
    expect(await agent.call("/", "open", { surface: "queue" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("not offered") })
    expect(shell({ counter }, BABA, { queue: why }).update({ tabs: [], next: 1 }, { kind: "call", path: "/", handle: "open", args: { surface: "queue" }, actor: "agent" })).toEqual({
      refused: `no queue tab is opened: the queue surface does not load (${why}); fix its code, and it is loaded again`,
    })
    expect(await agent.call("/", "open", { surface: "counter" })).toMatchObject({ outcome: "written" })
  })

  it("keeps its open tabs with what they hold, broken with why, and gives them back when its code loads again", async () => {
    const ports = memory<unknown>()
    const first = run(shell({ counter }, BABA), ports)

    await first.call("/", "open", { surface: "counter" }, "agent")
    await settled(first)
    await first.call("/tabs/1", "bump", { by: 5 }, "agent")
    await first.stop()

    // The counter's code is broken: the shell is made again without it, and saves what it holds as it was.
    const broken = run(shell({}, BABA, { counter: why }), ports)

    try {
      expect(broken.failure()).toBeUndefined()
      expect(broken.read("/")!.tabs).toMatchObject([
        {
          at: "/counter",
          surface: "counter",
          broken: `tab 1 is broken: the counter surface does not load (${why}); fix its code, and it is loaded again, with the state the tab keeps`,
          close: { name: "close" },
        },
      ])
      expect(await broken.call("/tabs/1", "bump", { by: 1 }, "agent")).toMatchObject({ outcome: "refused", reason: expect.stringContaining("does not load") })
      // A commit while it is broken saves the tab as it was kept.
      expect(await broken.call("/activity/notices", "seen", { n: 0 }, "person")).toMatchObject({ outcome: "written" })
    } finally {
      await broken.stop()
    }

    const mended = run(shell({ counter }, BABA), ports)

    try {
      await settled(mended)
      expect(mended.read("/tabs/1/n")).toMatchObject({ n: 7 })
    } finally {
      await mended.stop()
    }
  })
})
