// The reference books surface's rules, as stories.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import books from "../src/surface.ts"

test("a book added is to read, and its status is set at its own place", async () => {
  const { agent, person } = story(books)

  expect(await agent.call("/", "add", { title: "Dune" })).toMatchObject({ outcome: "written" })
  expect(person.sees()).toMatchObject({ "to-read": [{ id: 1, title: "Dune", status: "to-read" }] })
  expect(await person.call("/books/1", "mark", { id: 1, status: "reading" })).toMatchObject({ outcome: "written" })
  expect(agent.sees()).toMatchObject({ "to-read": [], reading: [{ id: 1, title: "Dune" }] })
  expect(agent.noticed()).toEqual([])
})

test("a book without a title, or a status that is none of the three, is refused", async () => {
  const { agent } = story(books)

  expect(await agent.call("/", "add", { title: " " })).toEqual({ outcome: "refused", reason: "A book needs a title" })
  await agent.call("/", "add", { title: "Dune" })
  expect(await agent.call("/books/1", "mark", { id: 1, status: "done" })).toMatchObject({ outcome: "refused" })
})
