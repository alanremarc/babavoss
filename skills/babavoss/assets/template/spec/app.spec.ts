// The app's first spec, a story: actors see views, call what those views offer and are told what changed.
// Nothing here reads the model. Write one test per rule of the app, in the words the person would use for it.
import { expect, test } from "bun:test"
import { story } from "#babavoss/core/index.ts"
import app from "../src/app.ts"

test("the agent sets the greeting, and the person is told", async () => {
  const { agent, person } = story(app.surface)

  // Given what both are shown at the start
  expect(agent.sees()).toMatchObject({ greeting: "hello" })
  expect(agent.offered()).toEqual(["greet"])
  person.told()

  // When the agent sets it
  expect(await agent.call("/", "greet", { text: "good morning" })).toMatchObject({ outcome: "written" })

  // Then the person sees it, and is told of it once
  expect(person.sees()).toMatchObject({ greeting: "good morning" })
  expect(person.told()).toEqual(['greeting: "hello" → "good morning"'])
  expect(person.told()).toEqual([])
})

test("a greeting without text is refused, and nothing changes", async () => {
  const { agent } = story(app.surface)

  expect(await agent.call("/", "greet", { text: " " })).toEqual({ outcome: "refused", reason: "A greeting needs text" })
  expect(agent.sees()).toMatchObject({ greeting: "hello" })
})
