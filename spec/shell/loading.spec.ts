// The surfaces the shell is made from, each loaded on its own: one whose code does not load is named with why and where,
// and leaves the others.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, it } from "bun:test"
import { loadSurfaces } from "../../framework/shell/src/loading.ts"

const project = realpathSync(mkdtempSync(join(tmpdir(), "loading-")))
const GOOD = `import { surface } from "${join(import.meta.dir, "../../framework/core/index.ts")}"
export default surface({ description: "works", init: () => ({}), update: (m) => ({ model: m }), view: () => ({}), run: async () => {}, failed: () => ({ kind: "none" }) })
`
const code = (name: string, text: string) => {
  const file = join(project, ".baba/surfaces", name, "src/surface.ts")

  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, text)

  return () => import(file)
}

afterAll(() => rmSync(project, { recursive: true, force: true }))

it("loads each surface on its own, and names each that does not load with why and where, from the project", async () => {
  const { surfaces, broken } = await loadSurfaces(
    {
      desk: code("desk", GOOD),
      thrown: code("thrown", `${GOOD}throw new Error("not configured")\n`),
      unparsed: code("unparsed", `${GOOD}export const broken = (\n`),
      unresolved: code("unresolved", `import { gone } from "./gone.ts"\nconsole.log(gone)\n${GOOD}`),
      empty: code("empty", "export const nothing = 1\n"),
    },
    project
  )

  expect(Object.keys(surfaces)).toEqual(["desk"])
  expect(surfaces.desk!.description).toBe("works")
  expect(broken.thrown).toBe("not configured, at .baba/surfaces/thrown/src/surface.ts:3:11")
  expect(broken.unparsed).toMatch(/^Unexpected end of file, at \.baba\/surfaces\/unparsed\/src\/surface\.ts:3:\d+$/)
  expect(broken.unresolved).toContain("./gone.ts")
  expect(broken.unresolved).toContain(".baba/surfaces/unresolved/src/surface.ts")
  expect(broken.unresolved).not.toContain(project)
  expect(broken.empty).toBe("src/surface.ts exports no surface as its default")
})
