// The app's first spec, as stories: actors see views, call what those views offer and are told what changed.
// Nothing here reads the model. Write one test per rule of the app, in the words the person would use for it.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import app from "../src/app.ts"
import { greeting } from "../src/surface.ts"

test("the agent proposes a greeting, and only the person is offered the decision", async () => {
  const { agent, person } = story(greeting)

  // Given what both are shown at the start
  expect(agent.sees()).toMatchObject({ greeting: "hello" })
  expect(agent.offered()).toEqual(["propose"])

  // When the agent proposes
  expect(await agent.call("/", "propose", { text: "good morning" })).toMatchObject({ outcome: "written" })

  // Then both see the proposal and what is waited for, and the person alone may decide
  expect(agent.sees()).toMatchObject({ greeting: "hello", proposed: "good morning", waiting: expect.stringContaining("the person") })
  expect(agent.offered()).toEqual(["propose"])
  expect(person.offered()).toEqual(["accept", "decline", "propose"])
  expect(await agent.call("/", "accept", {})).toMatchObject({ outcome: "refused" })
})

test("the agent is told what the person decided", async () => {
  const { agent, person } = story(greeting)

  await agent.call("/", "propose", { text: "good morning" })
  agent.told()
  await person.call("/", "accept", {})
  expect(agent.told()).toEqual(['greeting: "hello" → "good morning"', "- proposed", "- waiting"])

  await agent.call("/", "propose", { text: "hi" })
  agent.told()
  await person.call("/", "decline", {})
  expect(agent.sees()).toMatchObject({ greeting: "good morning" })
  expect(agent.told()).toEqual(["- proposed", "- waiting"])
})

test("a greeting without text is refused, and nothing changes", async () => {
  const { agent } = story(greeting)

  expect(await agent.call("/", "propose", { text: " " })).toEqual({ outcome: "refused", reason: "A greeting needs text" })
  expect(agent.sees()).not.toHaveProperty("proposed")
})

test("the app opens on its one tab, and the agent is told at / what changes in it", async () => {
  const { agent, person } = story(app.surface)

  expect(agent.sees()).toMatchObject({ tabs: [{ at: "/tabs/1", util: "greeting", facts: { greeting: "hello" } }] })
  await agent.call("/tabs/1", "propose", { text: "good morning" })
  agent.told()
  await person.call("/tabs/1", "accept", {})
  expect(agent.told()).toContain('tabs.0.facts.greeting: "hello" → "good morning"')
})
