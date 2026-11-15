// The guide's rules, as stories: it is complete, every component and layout the kit has standing in it, so a new primitive
// cannot be forgotten; and the agent finds any specimen by its path, to show it to the person.
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import guide from "../src/surface.ts"

const FRAMEWORK = dirname(fileURLToPath(import.meta.resolve("babavoss/package.json")))
type Row = { at: string; title: string; states: string[] }

test("every file of the kit's components and layouts has a specimen", () => {
  const { agent } = story(guide)
  const listed = (agent.sees() as { specimens: Row[] }).specimens.flatMap((row) => (agent.sees(row.at) as { files: string[] }).files)
  const kit = ["components", "layouts"].flatMap((dir) => readdirSync(join(FRAMEWORK, "framework/kit", dir)).map((file) => `framework/kit/${dir}/${file}`))

  expect(kit.filter((file) => !listed.includes(file))).toEqual([])
})

test("every file a specimen names is the framework's", () => {
  const { agent } = story(guide)

  for (const row of (agent.sees() as { specimens: Row[] }).specimens) {
    for (const file of (agent.sees(row.at) as { files: string[] }).files) expect(Bun.file(join(FRAMEWORK, file)).size).toBeGreaterThan(0)
  }
})

test("the agent reads the groups at /, a group's specimens below it, and a specimen by its path", () => {
  const { agent } = story(guide)

  expect((agent.sees() as { groups: { at: string }[] }).groups.map((g) => g.at)).toEqual(["/mark", "/foundations", "/primitives", "/layouts", "/shell"])
  expect(agent.sees("/mark")).toMatchObject({ title: "Mark", sections: [{ specimens: [{ at: "/mark/states" }, { at: "/mark/moves" }] }] })
  expect(agent.sees("/shell/activity")).toMatchObject({ title: "Activity", group: { at: "/shell" }, files: expect.arrayContaining(["framework/shell/ui/activity.tsx"]) })
  expect(agent.sees("/primitives/nothing")).toBeUndefined()
  expect(agent.offered()).toEqual([])
})

test("each specimen stands once", () => {
  const { agent } = story(guide)
  const ats = (agent.sees() as { specimens: Row[] }).specimens.map((row) => row.at)

  expect(new Set(ats).size).toBe(ats.length)
})
