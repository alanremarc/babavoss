// The root: what a .baba/ directory is to its session before any role is opened, and beside them after. The framework
// provides it, so a .baba/ with no roles has a runtime, a page and an answer all the same. It works on the .baba/ of
// the directory the session runs in.
import { defineRole } from "../../core/role.ts"
import { findBaba } from "../../core/provision.ts"
import { shell, shellUi, util } from "../../shell/index.ts"
import { rolesSurface } from "./surface.ts"

export default defineRole({
  name: "baba",
  ui: shellUi(new URL("../ui/", import.meta.url)),
  surface: shell({ title: "baba", utils: [util("roles", "The roles in this .baba/", rolesSurface(findBaba(process.cwd())), { open: "always" })] }),
})
