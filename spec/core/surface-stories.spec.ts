// The notes app's rules, as stories at the surface's boundary: what each actor sees, is offered and is told.
// The reminder's delay is the world's: the test holds the command and says when it comes due. The command is proven in app-runtime.spec.ts.
import { expect, test } from "bun:test"
import { story } from "#babavoss/core/index.ts"
import app from "../support/notes/src/app.ts"

test("a note the agent keeps is seen by the person, who is told of it once", async () => {
  const { agent, person } = story(app.surface)

  person.told()
  expect(await agent.call("/", "add", { text: "Call the landlord" })).toMatchObject({ outcome: "written" })

  expect(person.sees("/notes/1")).toMatchObject({ n: 1, text: "Call the landlord" })
  expect(person.told()).toEqual(["notes.count: 0 → 1", 'latest: null → "Call the landlord"', "+ clear: clear"])
  expect(person.told()).toEqual([])
})

test("a note without text is refused", async () => {
  const { agent } = story(app.surface)

  expect(await agent.call("/", "add", { text: "  " })).toEqual({ outcome: "refused", reason: "A note needs text" })
  expect(agent.sees()).toMatchObject({ notes: { count: 0 } })
})

test("clearing is offered only once there is a note", async () => {
  const { agent } = story(app.surface)

  expect(agent.offered()).toEqual(["add"])
  await agent.call("/", "add", { text: "Pharmacy" })
  expect(agent.offered()).toEqual(["add", "clear"])
})

test("the agent learns of a note the person removed", async () => {
  const { agent, person } = story(app.surface)

  await agent.call("/", "add", { text: "Pharmacy" })
  agent.told()
  await person.call("/notes/1", "remove", { n: 1 })

  expect(agent.told()).toEqual(["notes.count: 1 → 0", 'latest: "Pharmacy" → null', "- clear"])
  expect(agent.sees("/notes/1")).toBeUndefined()
})

test("a reminder is pending until the world says it is due, and cannot be set twice", async () => {
  const { agent, person, world } = story(app.surface)

  await agent.call("/", "add", { text: "Pharmacy" })
  expect(await agent.call("/notes/1", "remind", { n: 1, seconds: 3600 })).toMatchObject({ outcome: "written" })

  // Given the hour has not passed
  expect(world.commands()).toEqual([{ kind: "remind", n: 1, seconds: 3600 }])
  expect(person.sees("/notes/1")).toMatchObject({ due: "pending" })
  expect(agent.offered("/notes/1")).toEqual(["remove"])

  // When it passes
  agent.told()
  await world.settle({ kind: "due", n: 1 })

  // Then the note is due, and the agent is told
  expect(person.sees()).toMatchObject({ due: 1 })
  expect(agent.told()).toEqual(["due: 0 → 1"])
  expect(world.commands()).toEqual([])
})

test("a reminder needs a positive delay", async () => {
  const { agent } = story(app.surface)

  await agent.call("/", "add", { text: "Pharmacy" })
  expect(await agent.call("/notes/1", "remind", { n: 1, seconds: 0 })).toEqual({ outcome: "refused", reason: "seconds must be positive" })
})
