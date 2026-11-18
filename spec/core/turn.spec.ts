// Whose move it is, from what the hooks tell: a message starts the agent's turn, tool calls are work, a stop ends it, the
// session's end leaves it unknown, and a working turn unheard for long reads as unknown rather than stuck; whether the hooks
// have gone quiet between the agent's calls; and which of baba's words a session's start is given, once a boundary.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { hookContext, returning } from "../../framework/core/hook.ts"
import type { HookEvent } from "../../framework/core/harness/harness.ts"
import {
  answered,
  hooksHeard,
  HUSH_MS,
  hushed,
  NO_HOOKS_LINE,
  QUIET_LINE,
  reading,
  STALE_MS,
  startTurn,
  turned,
  unheardHooks,
  unheardOf,
  unknownTurn,
  type Hooks,
  type Turn,
  type TurnEvent,
} from "../../framework/core/runtime/turn.ts"

const run = (events: [TurnEvent, number][], from: Turn = unknownTurn(0)) => events.reduce((turn, [event, at]) => turned(turn, event, at), from)

test("a message starts the agent's turn, tool calls keep it, and a stop ends it", () => {
  expect(run([["started", 10]])).toEqual({ agent: "working", since: 10, heard: 10 })
  expect(run([["started", 10], ["working", 20], ["working", 30]])).toEqual({ agent: "working", since: 10, heard: 30 })
  expect(run([["started", 10], ["working", 20], ["ended", 40]])).toMatchObject({ agent: "idle", since: 40 })
  // A second stop says nothing new: the agent has been idle since the first.
  expect(run([["started", 10], ["ended", 40], ["ended", 50]])).toMatchObject({ agent: "idle", since: 40 })
  // Each message is a new turn.
  expect(run([["started", 10], ["started", 60]])).toMatchObject({ agent: "working", since: 60 })
})

test("a tool call is work even where the hooks missed the turn's start, as when the runtime started again within it", () => {
  expect(run([["working", 20]])).toEqual({ agent: "working", since: 20, heard: 20 })
  expect(run([["ended", 10], ["working", 20]])).toMatchObject({ agent: "working", since: 20 })
})

test("the session's end leaves the turn unknown", () => {
  expect(run([["started", 10], ["gone", 30]])).toMatchObject({ agent: "unknown", since: 30 })
  expect(run([["ended", 10], ["gone", 30]])).toMatchObject({ agent: "unknown", since: 30 })
})

test("a working turn unheard for STALE_MS reads as unknown, unless a call of the agent's is under way; idle never goes stale", () => {
  const working = run([["started", 0], ["working", 100]])

  expect(reading(working, 100 + STALE_MS)).toBe(working)
  expect(reading(working, 101 + STALE_MS)).toEqual({ agent: "unknown", since: 100 + STALE_MS, heard: 100 })
  expect(reading(working, 101 + STALE_MS, true)).toBe(working)
  // The next tool call brings it back.
  expect(reading(turned(working, "working", 200 + STALE_MS), 200 + STALE_MS)).toMatchObject({ agent: "working", since: 0 })

  const idle = run([["started", 0], ["ended", 10]])

  expect(reading(idle, 10 * STALE_MS)).toBe(idle)
})

test("no harness can be driven yet, so starting a turn says why it cannot", async () => {
  expect(await startTurn("S", "take them up")).toEqual({ cannot: expect.stringContaining("send the agent a message") })
})

test("a start returns to a session that had the words where it was compacted, resumed or forked; a new or cleared one does not", () => {
  expect(returning("startup")).toBe(false)
  expect(returning("clear")).toBe(false)
  // Codex and Claude Code say the source; where a harness does not, a start like any.
  expect(returning(undefined)).toBe(false)
  expect(returning("compact")).toBe(true)
  expect(returning("resume")).toBe(true)
  expect(returning("fork")).toBe(true)
})

test("a boundary is told once: a start that follows another with nothing heard between is given nothing again, as a compaction at once after a resume", async () => {
  const home = mkdtempSync(join(tmpdir(), "boundary-"))
  const was = { home: process.env.BABAVOSS_HOME, cwd: process.cwd() }
  const at = (moment: HookEvent["moment"], source?: HookEvent["source"]): HookEvent => ({ session: "B", event: moment, moment, ...(source && { source }) })
  const whole = readFileSync(new URL("../../framework/core/session-start.md", import.meta.url), "utf8").trim()
  // The words a start is given, before the shell's answer; or nothing.
  const told = async (event: HookEvent) => {
    const context = await hookContext(event, join(home, ".baba"))

    if (context === undefined) return undefined

    expect(context.startsWith(whole)).toBe(true)

    return whole
  }

  process.env.BABAVOSS_HOME = home
  process.chdir(home)
  try {
    // A resume, then a compaction at once and another, as Claude Code plays them: the words again, once.
    expect(await told(at("SessionStart", "resume"))).toBe(whole)
    expect(await told(at("SessionStart", "compact"))).toBeUndefined()
    expect(await told(at("SessionStart", "compact"))).toBeUndefined()
    // The session's end opens nothing: a resume after it is the same boundary still.
    // It is left in the session's folder, for the archive's sweep, until anything else is heard.
    await told(at("SessionEnd"))
    expect(existsSync(join(home, "sessions/B/ended"))).toBe(true)
    expect(await told(at("SessionStart", "resume"))).toBeUndefined()
    expect(existsSync(join(home, "sessions/B/ended"))).toBe(false)
    // A message is heard: the next compaction is a boundary of its own; so after a tool call, or a stop.
    await told(at("UserPromptSubmit"))
    expect(await told(at("SessionStart", "compact"))).toBe(whole)
    for (const moment of ["PostToolUse", "Stop"] as const) {
      await told(at(moment))
      expect(await told(at("SessionStart", "compact"))).toBe(whole)
    }
    // A cleared context has nothing of them: it is given the words whole, whatever came before.
    expect(await told(at("SessionStart", "clear"))).toBe(whole)
    expect(await told(at("SessionStart", "compact"))).toBeUndefined()
  } finally {
    process.chdir(was.cwd)
    if (was.home === undefined) delete process.env.BABAVOSS_HOME
    else process.env.BABAVOSS_HOME = was.home
    // Each start started the shell for the session: its runtime is stopped.
    for (const root of readdirSync(join(home, "sessions/B"), { withFileTypes: true }).filter((e) => e.isDirectory()))
      try {
        process.kill((JSON.parse(readFileSync(join(home, "sessions/B", root.name, "service.json"), "utf8")) as { pid: number }).pid)
      } catch {}
    await Bun.sleep(100)
    rmSync(home, { recursive: true, force: true })
  }
}, 60_000)

test("the hooks are quiet where a run of the word begins over HUSH_MS after another's last answer with no hook heard since: told once a stretch", () => {
  const ask = (hooks: Hooks, call: string, at: number) => hushed(hooks, call, at)
  let hooks = hooksHeard()

  // Each run is followed by its PostToolUse hook: never quiet.
  hooks = answered(ask(hooks, "a", 0).hooks, "a", 100)
  hooks = hooksHeard()
  expect(ask(hooks, "b", 60_000).line).toBeUndefined()

  // One long run, a program or a wait, is one tool call: its own requests never find the hooks quiet.
  hooks = answered(hooks, "b", 60_000)
  expect(ask(hooks, "b", 300_000).line).toBeUndefined()
  // Runs in parallel, or one right after another before its hook is heard, are not silence.
  expect(ask(hooks, "c", 60_000 + HUSH_MS).line).toBeUndefined()

  // A run long after the last, no hook heard: told once, and the turn takes nothing from calls while it lasts.
  const quiet = ask(hooks, "c", 60_000 + HUSH_MS + 1)

  expect(quiet.line).toBe(QUIET_LINE)
  expect(quiet.hooks.told).toBe(true)
  expect(ask(answered(quiet.hooks, "c", 80_000), "d", 200_000).line).toBeUndefined()
  // A hook heard ends the stretch: a later silence is told again.
  expect(ask(answered(hooksHeard(), "e", 0), "f", HUSH_MS + 1).line).toBe(QUIET_LINE)

  // A session that never had hooks, a harness without them, is told so once, and never again.
  const none = ask(answered(unheardHooks(), "a", 0), "b", HUSH_MS + 1)

  expect(none.line).toBe(NO_HOOKS_LINE)
  expect(ask(answered(none.hooks, "b", HUSH_MS + 2), "c", 10 * HUSH_MS).line).toBeUndefined()
})

test("the person is shown the silence the agent was told of, never heard or gone quiet, from the run that found it to the next hook", () => {
  const ask = (hooks: Hooks, call: string, at: number) => hushed(hooks, call, at).hooks

  // Before the first run, and between turns, nothing is found: the agent's silence alone is no sign.
  expect(unheardOf(unheardHooks())).toBeUndefined()
  expect(unheardOf(answered(unheardHooks(), "a", 0))).toBeUndefined()
  expect(unheardOf(ask(answered(hooksHeard(), "a", 0), "a", 10 * HUSH_MS))).toBeUndefined()

  // Never heard: a harness with no hooks for the session.
  const never = ask(answered(unheardHooks(), "a", 0), "b", HUSH_MS + 1)

  expect(unheardOf(never)).toEqual({ ever: false, since: HUSH_MS + 1 })
  // Heard, then gone quiet; and it lasts while the agent runs on, dated from when it was found.
  const quiet = ask(answered(hooksHeard("claude"), "a", 0), "b", HUSH_MS + 5)

  expect(unheardOf(quiet)).toEqual({ ever: true, since: HUSH_MS + 5 })
  expect(unheardOf(ask(answered(quiet, "b", HUSH_MS + 6), "c", 100 * HUSH_MS))).toEqual({ ever: true, since: HUSH_MS + 5 })
  // A hook heard ends either.
  expect(unheardOf(hooksHeard("claude"))).toBeUndefined()
})
