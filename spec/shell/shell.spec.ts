import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, it } from "bun:test"
import { action, run, surface, view, type Ports, type Saved, type Update } from "../../skills/babavoss/framework/core/index.ts"
import { shell, util, within } from "../../skills/babavoss/framework/shell/shell.ts"

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
  "/": (m) => ({ title: m.title, n: m.n, bump: bump.bind({}), ...(!m.busy && { later: later.bind({}) }) }),
  "/n": (m) => ({ n: m.n }),
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
      expect(r.read("/tabs/1/n")).toEqual({ n: 1 })
      expect(r.read("/tabs/2")).toBeUndefined()
      expect(await r.call("/tabs/1", "bump", { by: 2 }, "agent")).toMatchObject({ outcome: "written", view: { n: 3 } })
      expect(await r.call("/tabs/1", "later", {}, "agent")).toMatchObject({ outcome: "written" })
      expect(r.jobs()).toEqual(["agent"])
      await settled(r)
      expect(r.read("/tabs/1/n")).toEqual({ n: 4 })
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
    expect(second.read("/tabs/1/n")).toEqual({ n: 7 })
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
