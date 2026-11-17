// A Bun program: const root = await connect(definition, { id: session });
// then root.read(path, actor), root.call(path, handle, args, actor), root.changes(actor, signal), and root.page.
// The framework. Built layer by layer; each layer is exported here when it exists.
export { agentActor, isPerson, type Session } from "./session.ts"
export * from "./surface/index.ts"
export { baseDir, stateDir, modelPorts } from "./state/state.ts"
export { readJsonFile, writeJsonFile } from "./state/json-file.ts"
export { sessionDir } from "./state/session-dir.ts"
export { defineRoot, type RootDefinition } from "./root.ts"
export { diff, tell, whole } from "./present/present.ts"
export * from "./runtime/index.ts"
// A harness, for a surface that drives an agent of its own: Claude Code's adapter, a fake one for stories, and their events.
export {
  claudeCode,
  fakeHarness,
  sessionEnv,
  NONE,
  type ClaudeOptions,
  type FakeHarness,
  type Harness,
  type HarnessEvent,
  type Session as HarnessSession,
  type Tokens,
} from "./harness/index.ts"

export { reach as connect } from "./runtime/reach.ts"
