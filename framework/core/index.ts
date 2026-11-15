// A Bun program: const role = await connect(definition, { id: session });
// then role.read(path, actor), role.call(path, handle, args, actor), role.changes(actor, signal), and role.page.
// The framework. Built layer by layer; each layer is exported here when it exists.
export { agentActor, isPerson, type Session } from "./session.ts"
export * from "./surface/index.ts"
export { baseDir, stateDir, modelPorts } from "./state/state.ts"
export { readJsonFile, writeJsonFile } from "./state/json-file.ts"
export { defineRole, type RoleDefinition } from "./role.ts"
export { flatten, changes } from "./present/present.ts"
export * from "./runtime/index.ts"

export { reach as connect } from "./runtime/reach.ts"
