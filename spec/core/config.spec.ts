// The configuration of a .baba/: a harness's section filled in from its adapter's defaults, every harness enabled where
// nothing is said, and a section that names what no adapter has refused.
import { expect, test } from "bun:test"
import { checkConfig, config, sectionOf } from "../../framework/core/config.ts"
import { ADAPTERS, claude, CLAUDE_EVENTS, codex, CODEX_EVENTS } from "../../framework/core/harness/index.ts"

test("with nothing said, every harness is enabled with every event, and Codex's network left closed", () => {
  expect(sectionOf({}, claude)).toEqual({ enable: true, events: [...CLAUDE_EVENTS] })
  expect(sectionOf({}, codex)).toEqual({ enable: true, events: [...CODEX_EVENTS], network: false })
  expect(sectionOf(config({ harnesses: { codex: { enable: false } } }), codex)).toEqual({ enable: false, events: [...CODEX_EVENTS], network: false })
  expect(sectionOf(config({ harnesses: { claude: { enable: true, events: ["SessionStart"] } } }), claude)).toEqual({ enable: true, events: ["SessionStart"] })
})

test("a section that is not the adapter's is refused, saying what it has", () => {
  const refused = (value: unknown) => () => checkConfig(value as Parameters<typeof checkConfig>[0], ADAPTERS)

  expect(refused({ harnesses: { cursor: { enable: true } } })).toThrow("there is no harness cursor; there are claude, codex")
  expect(refused({ harnesses: { claude: {} } })).toThrow("harnesses.claude.enable is true or false")
  expect(refused({ harnesses: { claude: { enable: true, network: true } } })).toThrow("harnesses.claude has no option network; it has enable, events")
  expect(refused({ harnesses: { codex: { enable: true, network: "yes" } } })).toThrow("harnesses.codex.network is boolean")
  expect(refused({ harnesses: { codex: { enable: true, events: "Stop" } } })).toThrow("harnesses.codex.events is a list")
  expect(refused({ harnesses: { codex: { enable: true, events: ["StopFailure"] } } })).toThrow('harnesses.codex.events has "StopFailure"')
})
