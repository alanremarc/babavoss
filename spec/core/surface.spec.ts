// A surface run in this process, as a spec or a tool runs one; a session's runs the same way inside its runtime, and the doors reach it only there.
import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, it } from "bun:test"
import {
  action,
  admit,
  handle,
  handles,
  object,
  route,
  run,
  surface,
  view,
  type Ports,
  type Running,
  type Saved,
  type Update,
} from "../../packages/babavoss/core/surface/index.ts"

type Note = { id: number; title: string; published: boolean; draft: string }
type Model = { notes: Note[]; actor?: string; error?: string; busy?: boolean }
type Command = { kind: "save"; id: number } | { kind: "explode" }
type Event = { kind: "saved"; id: number } | { kind: "failed"; error: string }

const revise = action({
  name: "revise",
  description: ({ id }) => `Revise note ${id}`,
  subject: { id: "number" },
  inputs: { title: "string", published: "boolean" },
  update(model: Model, { id, title, published }, call): Update<Model, Command> {
    if (!title.trim()) return { refused: "A note needs a title" }

    return {
      model: { ...model, notes: model.notes.map((n) => (n.id === id ? { ...n, title, published } : n)), actor: call.actor },
      commands: [{ kind: "save", id }],
    }
  },
})
const explode = action({
  name: "explode",
  description: "a command that throws",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: { ...m, busy: true }, commands: [{ kind: "explode" }] }),
})
const summary = object(
  (n: Note) => ({ id: n.id }),
  (n) => ({ title: n.title })
)
const pages = view([revise, explode], {
  "/": (m) => ({
    notes: m.notes.map((n) => ({ ...summary.view(n), ...(!n.published && { revise: revise.bind(summary.ref(n)) }) })),
    ...(!m.busy && { explode: explode.bind({}) }),
    error: m.error,
  }),
  "/notes/:id": (m, { id }) => {
    const n = m.notes.find((x) => x.id === Number(id))

    return n && summary.view(n)
  },
})
const notes = surface<Model, Event, Command>({
  description: "Notes",
  init: () => ({ notes: [{ id: 1, title: "One", published: false, draft: "secret" }] }),
  update: (m, msg) =>
    msg.kind === "call" ? pages.update(m, msg) : msg.kind === "saved" ? { model: { ...m, busy: false } } : { model: { ...m, busy: false, error: msg.error } },
  view: pages.view,
  async run(c, send) {
    if (c.kind === "explode") throw new Error("boom")
    await sleep(5)
    send({ kind: "saved", id: c.id })
  },
  failed: (_c, error) => ({ kind: "failed", error }),
})
const memory = <M>(): Pick<Ports<M>, "load" | "save"> => {
  let kept: Saved | undefined

  return { load: () => kept, save: (saved) => void (kept = saved) }
}
const settled = (r: Running<Model>) =>
  new Promise<void>((done) => {
    const off = r.subscribe(() => {
      if (!r.busy()) {
        off()
        done()
      }
    })
  })

describe("the view", () => {
  it("finds handles where they stand and admits calls against them", () => {
    const v = { notes: [{ id: 1, remove: handle("remove", "remove 1", { id: 1 }) }], add: handle("add", "add", {}, { text: "string" }) }

    expect(handles(v).map((h) => h.name)).toEqual(["remove", "add"])
    expect(admit(v, "/", "remove", { id: 1 })).toMatchObject({ name: "remove" })
    expect(admit(v, "/", "remove", { id: 2 })).toBe('remove {"id":2} is not offered at /; offered: remove {"id":1}, add')
    expect(admit(v, "/", "add", { text: 5 })).toBe("add: text must be a string")
    expect(admit(v, "/", "add", { text: "x", more: 1 })).toBe("add takes no more")
    expect(admit(v, "/", "add", [] as never)).toBe("args must be a JSON object")
  })

  it("matches routes segment by segment", () => {
    const routes = { "/": () => ({}), "/notes/:id": (_m: unknown, p: Record<string, string>) => ({ id: p.id }) }

    expect(route(routes, "/notes/7/")?.params).toEqual({ id: "7" })
    expect(route(routes, "/notes")).toBeUndefined()
    expect(() => view([revise, revise], { "/": () => ({}) })).toThrow("unique")
    expect(() => view([], { "/": () => ({}), notes: () => ({}) })).toThrow("A route is a path")
  })
})

describe("a running surface", () => {
  it("writes an admitted call, refuses the rest, keeps private state private, and lands command events through the queue", async () => {
    const r = run(notes, memory<Model>())

    try {
      expect(JSON.stringify(r.read("/"))).not.toContain("secret")
      expect(r.read("/notes/1")).toEqual({ id: 1, title: "One" })
      expect(await r.call("/", "revise", { id: 1, title: " ", published: false }, "agent")).toEqual({ outcome: "refused", reason: "A note needs a title" })
      expect(await r.call("/", "revise", { id: 9, title: "x", published: false }, "agent")).toMatchObject({ outcome: "refused" })

      const written = await r.call("/", "revise", { id: 1, title: "Uno", published: true }, "agent")

      expect(written).toMatchObject({ outcome: "written", view: { notes: [{ id: 1, title: "Uno" }] } })
      expect([r.busy(), r.jobs()]).toEqual([1, ["agent"]])
      await settled(r)
      expect(r.model()).toMatchObject({ actor: "agent", busy: false })
      expect(await r.call("/", "revise", { id: 1, title: "x", published: false }, "agent")).toMatchObject({ reason: expect.stringContaining("not offered") })
    } finally {
      await r.stop()
    }
  })

  it("turns a command that throws into the failed event, and restores the kept model", async () => {
    const ports = memory<Model>()
    const r = run(notes, ports)

    await r.call("/", "explode", {}, "agent")
    await settled(r)
    expect(r.model()).toMatchObject({ error: "boom", busy: false })
    await r.stop()
    expect(run(notes, ports).model()).toMatchObject({ error: "boom" })
  })

  it("fails once when persistence breaks, and refuses from then on", async () => {
    const lines: string[] = []
    const r = run(notes, { load: () => undefined, save: () => {}, log: (l) => lines.push(l) })
    let saves = 0

    r.subscribe(() => saves++)

    const broken = run(notes, {
      load: () => undefined,
      save: () => {
        if (saves++ > 0) throw new Error("disk full")
      },
    })

    expect(await broken.call("/", "revise", { id: 1, title: "x", published: false }, "agent")).toEqual({ outcome: "refused", reason: "disk full" })
    expect(broken.failure()).toBe("disk full")
    expect(await broken.call("/", "revise", { id: 1, title: "y", published: false }, "agent")).toEqual({ outcome: "refused", reason: "disk full" })
    await Promise.all([r.stop(), broken.stop()])
  })
})
