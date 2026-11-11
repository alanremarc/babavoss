// The promptware util: an app's skill and references as the agent reads them, and what its door answers at open.
import { util } from "babavoss/shell/index.ts"
import { discoverApps } from "../playground/apps.ts"
import { runOpen } from "./open.ts"
import { readPromptware } from "./promptware.ts"
import { promptwareSurface, type PromptwarePorts } from "./surface.ts"
export { promptwareSurface, type PromptwarePorts, type Entry, type Model, type Command, type Event } from "./surface.ts"
export { readPromptware, size, frontmatter, type Promptware, type Skill } from "./promptware.ts"
export { runOpen, stopRuntimes, type OpenResult } from "./open.ts"
export const promptwarePorts = (project: string): PromptwarePorts => ({
  project,
  discover: async () => discoverApps(project).map((p) => ({ ...p, promptware: readPromptware(p.path, project) })),
  open: runOpen,
})
export const promptware = (options: { project: string } | PromptwarePorts) =>
  util(
    "promptware",
    "An app's skill and references as the agent reads them, and what open answers with, each with its size",
    promptwareSurface("discover" in options ? options : promptwarePorts(options.project))
  )
