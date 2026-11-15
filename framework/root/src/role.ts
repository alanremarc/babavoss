// The root: what a .baba/ directory is to its session. The framework provides it, so a .baba/ with no roles has a
// runtime, a page and an answer all the same. Its first tab lists the roles; each role is a util of it, opened as a tab
// by the agent or by the person. An open role teaches the agent by its tab: its own know-how, from its ROLE.md, stands
// among its facts, so it reaches the agent with the present. The root works on the .baba/ of the directory the session
// runs in, and is generated from the roles there: when one is made, removed or told otherwise, the generated module
// changes, and the running root loads it.
import { join } from "node:path"
import { defineRole } from "../../core/role.ts"
import { findBaba, generateRoot, type Described } from "../../core/provision.ts"
import type { AnySurface } from "../../core/surface/surface.ts"
import { shell, shellUi, util } from "../../shell/index.ts"
import { rolesSurface } from "./surface.ts"

const baba = findBaba(process.cwd())
const generated = baba && generateRoot(baba)
const roles = generated ? ((await import(join(generated, "roles.ts"))) as { default: Record<string, AnySurface>; described: Described[] }) : undefined
/** A role's surface with its know-how among the facts at /: what its tab says to whoever reads it, the root's present included. */
const taught = (surface: AnySurface, knowhow: string): AnySurface =>
  knowhow ? { ...surface, view: (model, path, actor) => (path === "/" ? { ...surface.view(model, path, actor), knowhow } : surface.view(model, path, actor)) } : surface

export default defineRole({
  name: "baba",
  ui: shellUi(generated ?? new URL("../ui/", import.meta.url)),
  surface: shell({
    title: "baba",
    utils: [
      util("roles", "The roles in this .baba/", rolesSurface(baba), { open: "always" }),
      ...(roles?.described ?? []).map((role) => util(role.name, role.description, taught(roles!.default[role.name]!, role.knowhow))),
    ],
  }),
})
