// The update note: said when a later release is out than the one the surfaces run on, with how to take it.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

  expect(note).toStartWith(`babavoss 99.0.0 is out; these surfaces run on ${VERSION}.`)
  expect(note).toContain("`bun add babavoss@github:alanremarc/babavoss#v99.0.0` in /project/.baba")
  expect(note).toContain("CHANGELOG.md")
  expect(await told(VERSION)).toBeUndefined()
  expect(await told("0.0.1")).toBeUndefined()
  expect(await told("")).toBeUndefined()
})

test("a release is later than the version running, read as it is compared: a package taken while a process runs is not told again", async () => {
  // The module as a package of its own, whose version is changed under the process that loaded it.
  const pack = mkdtempSync(join(tmpdir(), "update-"))
  const core = new URL("../../framework/core/", import.meta.url).pathname

  try {
    mkdirSync(join(pack, "framework/core/state"), { recursive: true })
    cpSync(join(core, "update.ts"), join(pack, "framework/core/update.ts"))
    cpSync(join(core, "state/json-file.ts"), join(pack, "framework/core/state/json-file.ts"))
    writeFileSync(join(pack, "package.json"), JSON.stringify({ version: "1.0.0" }))

    const loaded = (await import(join(pack, "framework/core/update.ts"))) as typeof import("../../framework/core/update.ts")

    process.env.BABAVOSS_LATEST = "1.1.0"
    expect(await loaded.updateNote("/nowhere", "/project/.baba")).toStartWith("babavoss 1.1.0 is out; these surfaces run on 1.0.0.")
    writeFileSync(join(pack, "package.json"), JSON.stringify({ version: "1.1.0" }))
    expect(loaded.VERSION).toBe("1.0.0")
    expect(await loaded.updateNote("/nowhere", "/project/.baba")).toBeUndefined()
  } finally {
    process.env.BABAVOSS_LATEST = ""
    rmSync(pack, { recursive: true, force: true })
  }
})
