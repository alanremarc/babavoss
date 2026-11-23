// The harness layer: the interface every adapter has, the adapters, Claude Code's, Codex's and Antigravity's, and a fake for stories.
import { antigravity } from "./antigravity.ts"
import { claude } from "./claude.ts"
import { codex } from "./codex.ts"
import type { Adapter } from "./harness.ts"

export { NONE, type Adapter, type Harness, type HarnessEvent, type HookEvent, type Keep, type Loaded, type Moment, type Request, type Session, type SetUp, type Start, type Tokens } from "./harness.ts"
export {
  antigravity,
  antigravityArgs,
  antigravityCli,
  antigravityEvents,
  ANTIGRAVITY_EVENTS,
  editAntigravityHooks,
  streamState,
  withoutAntigravity,
  type AntigravityOptions,
  type StreamState,
} from "./antigravity.ts"
export { blocked, claude, claudeArgs, CLAUDE_EVENTS, claudeCode, claudeEvents, cleanEnv, managedAt, managedPolicy, redact, sessionEnv, trust, WORD, type ClaudeOptions } from "./claude.ts"
export { codex, codexArgs, codexCli, codexEvents, codexInjected, codexTurn, CODEX_EVENTS, type CodexOptions } from "./codex.ts"
export { fakeHarness, type FakeHarness } from "./fake.ts"

/** Every harness the framework knows, each enabled where the configuration does not say otherwise. */
export const ADAPTERS: readonly Adapter[] = [claude, codex, antigravity]
