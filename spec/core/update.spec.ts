// The update note: said when a later release is out than the one the roles run on, with how to take it.
import { expect, test } from "bun:test"
import { later, updateNote, VERSION } from "../../framework/core/update.ts"

const told = async (latest: string) => {
  process.env.BABAVOSS_LATEST = latest
  try {
    return await updateNote("/nowhere", "/project/.baba")
  } finally {
    process.env.BABAVOSS_LATEST = ""
  }
}

test("a release is later by its numbers", () => {
  expect(later("0.10.0", "0.9.9")).toBe(true)
  expect(later("1.0.0", "0.99.0")).toBe(true)
  expect(later("0.9.0", "0.9.0")).toBe(false)
  expect(later("0.9.0", "0.10.0")).toBe(false)
})

test("a later release is told with the command that takes it and what to do after; the same or an earlier one, or none, is silence", async () => {
  const note = await told("99.0.0")

  expect(note).toStartWith(`babavoss 99.0.0 is out; these roles run on ${VERSION}.`)
  expect(note).toContain("`bun add babavoss@github:alanremarc/babavoss#v99.0.0` in /project/.baba")
  expect(note).toContain("CHANGELOG.md")
  expect(await told(VERSION)).toBeUndefined()
  expect(await told("0.0.1")).toBeUndefined()
  expect(await told("")).toBeUndefined()
})
