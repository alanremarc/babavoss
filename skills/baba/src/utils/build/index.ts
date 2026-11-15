// The build util: the apps made in the project, and making a new one from the template.
import { util } from "babavoss/shell/index.ts"
import { buildPorts } from "./files.ts"
import { buildSurface, type BuildPorts } from "./surface.ts"
export { buildSurface, type BuildPorts, type Made, type Model, type Command, type Event } from "./surface.ts"
export { buildPorts, APPS_DIR, HARNESS_SKILLS } from "./files.ts"
export const build = (options: { project: string } | BuildPorts) =>
  util("build", "The apps made in the project, and making a new one from the template", buildSurface("load" in options ? options : buildPorts(options.project)), {
    open: "always",
  })
