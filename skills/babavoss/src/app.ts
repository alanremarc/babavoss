// The authoring app: a shell of utils for authoring babavoss apps. The core, harness-free.
import { defineApp } from "#babavoss/core/index.ts"
import { shell, shellUi } from "#babavoss/shell/index.ts"
import { agentConfig } from "./utils/agent-config/index.ts"
import { agents, playground } from "./utils/playground/index.ts"

// The project is the session's directory. The surface runs in the session's runtime, and the framework starts that in the
// directory the session's own entry recorded, whoever wakes it and from wherever: a subagent in a worktree, a cli call from
// a subdirectory, a restart. Before any record, the first waker's.
const project = process.cwd()

const identity = { name: "babavoss", version: (await import("../package.json")).default.version }

export default defineApp({
  ...identity,
  ui: shellUi(new URL("../ui/", import.meta.url)),
  surface: shell({ title: "babavoss", utils: [agentConfig({ project }), playground(agents(identity, project), { project })] }),
})
