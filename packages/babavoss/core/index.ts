// A Bun program: const app = await connect(definition, { id: session });
// then app.read(path, actor), app.call(path, handle, args, actor), app.changes(actor, signal), and app.page.
// The framework. Built layer by layer; each layer is exported here when it exists.
export * as claudeCode from "./harness-adapters/claude-code/index.ts"
export * as codex from "./harness-adapters/codex/index.ts"
export { agentActor, isPerson, type Session } from "./session.ts"
export * from "./surface/index.ts"
export { baseDir, stateDir, modelPorts } from "./state/state.ts"
export { readJsonFile, writeJsonFile } from "./state/json-file.ts"
export { defineApp, type AppDefinition } from "./app.ts"
export { flatten, changes } from "./present/present.ts"
export * from "./runtime/index.ts"
export { startAgent, type Agent, type AgentEvent, type AgentOptions, type Harness as AgentHarness, type Tokens, type Tuning } from "./launch/agent.ts"
export { harnessModels, type HarnessModel, type ModelsOptions } from "./launch/models.ts"
export type { Scenario, ScenarioUser } from "./launch/scenario.ts"

export { reach as connect } from "./runtime/reach.ts"
