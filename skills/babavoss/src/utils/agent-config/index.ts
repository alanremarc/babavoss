// The agent-config util reads app promptware and computes the app's own open answer.
import { util } from "#babavoss/shell/index.ts"
import { discoverApps } from "../playground/apps.ts"
import { runOpen } from "./open.ts"
import { readPromptware } from "./promptware.ts"
import { agentConfigSurface, type AgentConfigPorts } from "./surface.ts"
export { agentConfigSurface, type AgentConfigPorts, type Entry, type Model, type Command, type Event } from "./surface.ts"
export { readPromptware, size, frontmatter, type Promptware, type Skill } from "./promptware.ts"
export { runOpen, stopRuntimes, type OpenResult } from "./open.ts"
export const agentConfigPorts = (project: string): AgentConfigPorts => ({
  project,
  discover: async () => discoverApps(project).map((p) => ({ ...p, promptware: readPromptware(p.path, project) })),
  open: runOpen,
})
export const agentConfig = (options: { project: string } | AgentConfigPorts) =>
  util(
    "agent-config",
    "An app's skill description, text, references and computed open answer",
    agentConfigSurface("discover" in options ? options : agentConfigPorts(options.project))
  )
