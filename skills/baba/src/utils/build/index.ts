// The build util: the brief of an app, agreed with the person before it is written, and the steps of building it.
import { util } from "babavoss/shell/index.ts"
import { buildPorts } from "./files.ts"
import { buildSurface, type BuildPorts } from "./surface.ts"
export { buildSurface, nextOf, PARTS, STATUSES, type Brief, type BuildPorts, type Entry, type Model, type Command, type Event } from "./surface.ts"
export { buildPorts, APPS_DIR, BRIEF_FILE, HARNESS_SKILLS } from "./files.ts"
export const build = (options: { project: string } | BuildPorts) =>
  util(
    "build",
    "An app's brief, agreed with the person before it is written, and the steps of building it",
    buildSurface("load" in options ? options : buildPorts(options.project)),
    { open: "always" }
  )
