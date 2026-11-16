// The harness layer: the interface every adapter has, the adapters, Claude Code's and Codex's, and a fake for stories.
import { claude } from "./claude.ts"
import { codex } from "./codex.ts"
import type { Adapter } from "./harness.ts"

export { NONE, type Adapter, type Harness, type HarnessEvent, type HookEvent, type Loaded, type Moment, type Request, type Session, type SetUp, type Start, type Tokens } from "./harness.ts"
export { blocked, claude, CLAUDE_EVENTS, claudeCode, claudeEvents, cleanEnv, managedAt, managedPolicy, PLUGIN, PLUGIN_ID, PLUGIN_LINK, redact, sessionEnv, trust, WORD, type ClaudeOptions } from "./claude.ts"
export { codex, CODEX_EVENTS, type CodexOptions } from "./codex.ts"
export { fakeHarness, type FakeHarness } from "./fake.ts"

/** Every harness the framework knows, each enabled where the configuration does not say otherwise. */
export const ADAPTERS: readonly Adapter[] = [claude, codex]
