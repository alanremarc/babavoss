// Specify an app's behavior entirely through its actors and outside world.
import { expect, test } from "bun:test"
import { action, view } from "../../skills/babavoss/framework/core/surface/authoring.ts"
import { story } from "../../skills/babavoss/framework/core/surface/story.ts"
import { surface } from "../../skills/babavoss/framework/core/surface/surface.ts"
import { handle } from "../../skills/babavoss/framework/core/surface/view.ts"

type Model = { items: string[]; error?: string }
type Event = { kind: "added"; text: string } | { kind: "failed"; error: string }
type Command = { text: string }

const list = surface<Model, Event, Command>({
  description: "A list",
  init: () => ({ items: [] }),
  restore: (saved) => saved as Model,
  view: (m, path, actor) =>
    path === "/"
      ? {
          items: m.items,
          error: m.error,
          add: handle("add", "Add an item", {}, { text: "string" }),
          ...(actor === "person" && { clear: handle("clear", "Clear the list") }),
          fetch: handle("fetch", "Fetch an item", {}, { text: "string" }),
        }
      : undefined,
  update: (m, msg) => {
    if (msg.kind === "added") return { model: { ...m, items: [...m.items, msg.text] } }
    if (msg.kind === "failed") return { model: { ...m, error: msg.error } }
    if (msg.handle === "clear") return { model: { items: [] } }

    const text = msg.args.text as string

    if (!text.trim()) return { refused: "An item needs text" }

    return msg.handle === "fetch" ? { model: m, commands: [{ text }] } : { model: { ...m, items: [...m.items, text] } }
  },
  run: async (command, send) => {
    send({ kind: "added", text: command.text })
  },
  failed: (command, error) => ({ kind: "failed", error: `${command.text}: ${error}` }),
})

test("an actor sees a view and its offered handles", () => {
  const { agent, person } = story(list)

  expect(agent.sees()).toMatchObject({ items: [] })
  expect(agent.offered()).toEqual(["add", "fetch"])
  expect(person.offered()).toEqual(["add", "clear", "fetch"])
  expect(agent.sees("/missing")).toBeUndefined()
  expect(agent.offered("/missing")).toEqual([])
})

test("a person-only handle is hidden from and refused to the agent", async () => {
  const { agent, person } = story(list)

  expect(agent.offered()).not.toContain("clear")
  expect(await agent.call("/", "clear")).toMatchObject({ outcome: "refused", reason: expect.stringContaining("not offered") })
  expect(await person.call("/", "clear")).toMatchObject({ outcome: "written" })
})

test("a refused call carries its reason", async () => {
  const { agent } = story(list)

  expect(await agent.call("/", "add", { text: " " })).toEqual({ outcome: "refused", reason: "An item needs text" })
  expect(agent.sees()).toMatchObject({ items: [] })
})

test("told gives the whole view, then only changes, then nothing", async () => {
  const { agent } = story(list)

  expect(agent.told()).toEqual(["items: []", "add: add + text:string", "fetch: fetch + text:string"])
  await agent.call("/", "add", { text: "One" })
  expect(agent.told()).toEqual(['+ items.0: "One"', "- items"])
  expect(agent.told()).toEqual([])
})

test("one actor is told what the other did", async () => {
  const { agent, person } = story(list)

  agent.told()
  person.told()
  await person.call("/", "add", { text: "One" })
  expect(agent.told()).toEqual(['+ items.0: "One"', "- items"])
  await agent.call("/", "add", { text: "Two" })
  expect(person.told()).toEqual(['+ items.0: "One"', '+ items.1: "Two"', "- items"])
})

test("a held command can report an event that changes the view", async () => {
  const { agent, world } = story(list)

  await agent.call("/", "fetch", { text: "One" })
  expect(agent.sees()).toMatchObject({ items: [] })
  expect(world.commands()).toEqual([{ text: "One" }])
  await world.settle(world.commands()[0]!, { kind: "added", text: "Fetched" })
  expect(world.commands()).toEqual([])
  expect(agent.sees()).toMatchObject({ items: ["Fetched"] })
})

test("a failed command reports what failed made of the error", async () => {
  const { agent, world } = story(list)

  await agent.call("/", "fetch", { text: "One" })
  await world.fail(world.commands()[0]!, "offline")
  expect(world.commands()).toEqual([])
  expect(agent.sees()).toMatchObject({ error: "One: offline" })
  await agent.call("/", "fetch", { text: "Two" })
  await world.fail((c) => c.text === "Two", "missing")
  expect(agent.sees()).toMatchObject({ error: "Two: missing" })
  await agent.call("/", "fetch", { text: "Three" })
  await world.fail("gone")
  expect(agent.sees()).toMatchObject({ error: "Three: gone" })
})

test("settle selects a predicate or the only pending command", async () => {
  const { agent, world } = story(list)

  await agent.call("/", "fetch", { text: "One" })
  await agent.call("/", "fetch", { text: "Two" })
  expect(world.settle({ kind: "added", text: "Ambiguous" })).rejects.toThrow("found 2")
  await world.settle((c) => c.text === "Two", { kind: "added", text: "Two" })
  await world.settle({ kind: "added", text: "One" })
  expect(agent.sees()).toMatchObject({ items: ["Two", "One"] })
})

test("real effects can be awaited with idle", async () => {
  const { agent, world } = story(list, { effects: "real" })

  await agent.call("/", "fetch", { text: "One" })
  await world.idle()
  expect(agent.sees()).toMatchObject({ items: ["One"] })
})

test("restart keeps saved state and each actor's told record", async () => {
  const { agent, person, world, restart } = story(list)

  agent.told()
  person.told()
  await person.call("/", "add", { text: "One" })
  person.told()
  await agent.call("/", "fetch", { text: "Aborted" })
  await restart()
  expect(world.commands()).toEqual([])
  expect(agent.sees()).toMatchObject({ items: ["One"] })
  expect(person.told()).toEqual([])
  expect(agent.told()).toEqual(['+ items.0: "One"', "- items"])
  await agent.call("/", "add", { text: "Two" })
  expect(person.sees()).toMatchObject({ items: ["One", "Two"] })
})

test("a story can start from a saved model through restore", () => {
  const { agent } = story({ ...list, restore: (saved) => ({ items: (saved as Model).items.map((s) => s.toUpperCase()) }) }, { model: { items: ["One"] } })

  expect(agent.sees()).toMatchObject({ items: ["ONE"] })
})

test("an action declared an ask is offered to the person only, wherever it is bound, and the facts are the same for both", async () => {
  type Draft = { text: string; approved: boolean }

  const write = action({
    name: "write",
    description: "Write the text",
    subject: {},
    inputs: { text: "string" },
    update: (m: Draft, { text }) => ({ model: { ...m, text } }),
  })
  const approve = action({
    name: "approve",
    description: "Approve the text",
    subject: {},
    inputs: {},
    ask: true,
    update: (m: Draft) => ({ model: { ...m, approved: true } }),
  })
  const pages = view([write, approve], {
    "/": (m) => ({ text: m.text, approved: m.approved, write: write.bind({}), review: { waiting: !m.approved, approve: approve.bind({}) } }),
  })
  const { agent, person } = story(
    surface<Draft, { kind: "none" }, never>({
      description: "A draft",
      init: () => ({ text: "", approved: false }),
      view: pages.view,
      update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : { model: m }),
      run: async () => {},
      failed: () => ({ kind: "none" }),
    })
  )

  expect(agent.offered()).toEqual(["write"])
  expect(person.offered()).toEqual(["write", "approve"])
  expect(agent.sees()).toMatchObject({ review: { waiting: true } })
  expect(await agent.call("/", "approve", {})).toMatchObject({ outcome: "refused" })
  agent.told()
  expect(await person.call("/", "approve", {})).toMatchObject({ outcome: "written" })
  expect(agent.told()).toEqual(["approved: false → true", "review.waiting: true → false"])
})
