// The root: what a .baba/ directory is to its session. The framework provides it, so a .baba/ with no roles has a
// runtime, a page and an answer all the same. Its first tab lists the roles; each role is a util of it, opened as a tab
// the first time it is asked for. It works on the .baba/ of the directory the session runs in, and is generated from
// the roles there: when one is made or removed the generated module changes, and the running root loads it.
import { join } from "node:path"
import { defineRole } from "../../core/role.ts"
import { describedRoles, findBaba, generateRoot } from "../../core/provision.ts"
import type { AnySurface } from "../../core/surface/surface.ts"
import { shell, shellUi, util } from "../../shell/index.ts"
import { rolesSurface } from "./surface.ts"

const baba = findBaba(process.cwd())
const generated = baba && generateRoot(baba)
const surfaces = generated ? ((await import(join(generated, "roles.ts"))) as { default: Record<string, AnySurface> }).default : {}
const described = new Map((baba ? describedRoles(baba) : []).map((role) => [role.name, role.description]))

export default defineRole({
  name: "baba",
  ui: shellUi(generated ?? new URL("../ui/", import.meta.url)),
  surface: shell({
    title: "baba",
    utils: [
      util("roles", "The roles in this .baba/", rolesSurface(baba), { open: "always" }),
      ...Object.entries(surfaces).map(([name, role]) => util(name, described.get(name) ?? name, role)),
    ],
  }),
})
