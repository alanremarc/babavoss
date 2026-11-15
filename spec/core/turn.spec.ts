// Whose move it is, from what the hooks tell: a message starts the agent's turn, tool calls are work, a stop ends it, the
// session's end leaves it unknown, and a working turn unheard for long reads as unknown rather than stuck.
import { expect, test } from "bun:test"
import { reading, STALE_MS, startTurn, turned, unknownTurn, type Turn, type TurnEvent } from "../../framework/core/runtime/turn.ts"

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
