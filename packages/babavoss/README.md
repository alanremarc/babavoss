# babavoss

The framework, published to npm as `babavoss`. An app depends on it at an exact version and imports it as `babavoss/core/…` and `babavoss/shell/…`. `core/` is the layers; `shell/` is a built-in, the page layer. Bun runs the TypeScript source directly; there is no build, and the package is published as source.

```text
src/index.ts   what exists, exported
src/harness-adapters/claude-code, codex   each harness as it is: manifests, hooks, env, paths, cli; verified against one version
src/session.ts                             Session, the plain values an entry fills
src/surface/                               model, pure update, view at a path, handles and admission, commands and events, the loop
src/state/                                 the model saved whole; one directory per session under the app's base
src/present/                               the view at / for a reader, whole first, the change after
src/cli/                                   the agent's door, for its session: list, read, call, open
src/runtime/                               a session's resident process: lock, endpoint, wake, the http door, serving an app's page, reach
src/launch/                                startAgent: an agent in a harness without a terminal; prompts in, events out; over the adapters
src/app.ts                              defineApp: name, version, state location, surface
spec/          one spec per layer
package.json   the framework's version, the product's; what its shell's page is built from, as its dependencies
```

docs/DESIGN.md in the repository says what is being built and in which order.
