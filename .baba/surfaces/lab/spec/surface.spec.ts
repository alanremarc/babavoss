// The lab's rules, as stories, with the harness faked: the agent under test is a fake process whose stream the story writes,
// so a run's events come back as they would from Claude Code, and nothing real is started.
import { expect, test } from "bun:test"
import { story, type Json } from "babavoss/core/index.ts"
import type { Agent, Harness } from "../src/harness.ts"
import { END_MOVE, lab, type Model } from "../src/surface.ts"

const SANDBOX = "/tmp/baba-lab-fake"

/** A fake harness: one agent under test at a time, whose stream the story writes and whose stdin it reads. */
function fake() {
  let push: (event: Json | undefined) => void = () => {}
  let exit: (code: number) => void = () => {}
  const written: Json[] = []
  const removed: string[] = []
  const state = { killed: false, page: undefined as string | undefined }
  const harness: Harness = {
    make: async () => SANDBOX,
    spawn(): Agent {
      const queue: (Json | undefined)[] = []
      let wake: (() => void) | undefined
      const exited = new Promise<{ code: number | null; stderr: string }>((done) => {
        exit = (code) => {
          push(undefined)
          done({ code, stderr: "" })
        }
      })

      push = (event) => {
        queue.push(event)
        wake?.()
      }

      return {
        write: (line) => void written.push(line),
        lines: (async function* () {
          for (;;) {
            if (!queue.length) await new Promise<void>((done) => (wake = done))

            const event = queue.shift()

            if (event === undefined) return
            yield event
          }
        })(),
        exited,
        kill() {
          state.killed = true
          exit(143)
        },
      }
    },
    page: () => state.page,
    remove: async (sandbox) => void removed.push(sandbox),
  }

  return { harness, written, removed, state, emit: (...events: Json[]) => events.forEach((e) => push(e)), exit: (code: number) => exit(code) }
}

/** Waits until `check` holds, as the run's events arrive. */
async function until(check: () => boolean, ms = 2000) {
  for (const end = Date.now() + ms; !check(); await Bun.sleep(5)) if (Date.now() > end) throw new Error("timed out")
}

type Root = { status: string; entries: number; recent: { at: string; kind: string; size: number; line: string }[]; tokens: Json; cost: number; page?: string }

const hook = (event: string, stdout: string) => ({ type: "system", subtype: "hook_response", hook_event: event, hook_name: event, stdout, exit_code: 0 })
const replay = (text: string) => ({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })
const USAGE = { input_tokens: 10, cache_creation_input_tokens: 2000, cache_read_input_tokens: 8000, output_tokens: 5 }
const assistant = (id: string, block: Json, usage = USAGE) => ({
  type: "assistant",
  message: { id, content: [block], usage },
  parent_tool_use_id: null,
})
const result = (cost: number) => ({
  type: "result",
  subtype: "success",
  usage: { input_tokens: 20, cache_creation_input_tokens: 2100, cache_read_input_tokens: 16000, output_tokens: 40 },
  total_cost_usd: cost,
  num_turns: 2,
  duration_ms: 4200,
  result: "There are two.",
})

async function started() {
  const world = fake()
  const s = story(lab(world.harness), { effects: "real" })

  expect(await s.agent.call("/", "start", { model: "haiku" })).toMatchObject({ outcome: "written" })
  await until(() => (s.agent.sees() as Root).status === "idle")

  return { ...s, ...world }
}

test("a run starts in a sandbox, and the timeline fills from its stream, with the page once the sandbox's root is up", async () => {
  const { agent, emit, state } = await started()

  expect(agent.sees()).toMatchObject({ status: "idle", model: "haiku", entries: 1, recent: [{ kind: "note", title: "sandbox made" }] })
  expect(agent.offered()).toEqual(["say", "end_move", "close"])

  state.page = "http://127.0.0.1:5555/"
  await until(() => (agent.sees() as Root).page !== undefined)
  emit({ type: "system", subtype: "init", model: "claude-haiku", tools: ["Bash"] })
  await until(() => (agent.sees() as Root).entries === 3)
  expect((agent.sees() as Root).recent.map((r) => r.kind)).toEqual(["note", "note", "note"])
  expect(agent.sees("/entries")).toMatchObject({ entries: [{ at: "/entries/1" }, { at: "/entries/2" }, { title: "init claude-haiku" }] })
})

test("a hook injection and a word's answer are entries with their sizes, whole at their own paths", async () => {
  const { agent, emit } = await started()
  const present = "baba's words\nThe root of .baba/ was started for this session, and answered:\npage: http://127.0.0.1:5555"
  const answer = 'title: "baba"\nsurfaces: name\tdescription\n"greeting"\t"Keep a greeting"'

  expect(await agent.call("/", "say", { text: "What surfaces are there?" })).toMatchObject({ outcome: "written" })
  expect(agent.sees()).toMatchObject({ status: "working" })
  emit(
    hook("SessionStart", present),
    hook("UserPromptSubmit", ""),
    replay("What surfaces are there?"),
    assistant("m1", { type: "tool_use", id: "t1", name: "Bash", input: { command: ".babavoss/bin/baba /" } }),
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: answer }] }, parent_tool_use_id: null },
    hook("PostToolUse", JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "What changed: tabs.1.title" } }))
  )
  await until(() => (agent.sees() as Root).entries === 5)

  const recent = (agent.sees() as Root).recent

  expect(recent.map((r) => [r.kind, r.size])).toEqual([
    ["note", expect.any(Number)],
    ["hook", present.length],
    ["message", 24],
    ["word", answer.length],
    ["hook", 26],
  ])
  expect(agent.sees(recent[1]!.at)).toMatchObject({ kind: "hook", title: "SessionStart", text: present, size: present.length })
  expect(agent.sees(recent[2]!.at)).toMatchObject({ kind: "message", title: "the agent", text: "What surfaces are there?" })
  expect(agent.sees(recent[3]!.at)).toMatchObject({ kind: "word", call: ".babavoss/bin/baba /", text: answer, pending: false, context: 10_010, growth: 10_010 })
  expect(agent.sees(recent[4]!.at)).toMatchObject({ title: "PostToolUse", text: "What changed: tabs.1.title" })
  expect(agent.sees()).not.toHaveProperty("recent.1.text")
})

test("a turn's result carries its tokens and cost, and the run its totals; a second API call says how its context grew", async () => {
  const { agent, emit } = await started()

  await agent.call("/", "say", { text: "Hi" })
  emit(
    assistant("m1", { type: "thinking", thinking: "" }),
    assistant("m1", { type: "text", text: "Looking." }),
    assistant("m2", { type: "text", text: "There are two." }, { ...USAGE, cache_creation_input_tokens: 500, cache_read_input_tokens: 10_000 }),
    result(0.0042)
  )
  await until(() => (agent.sees() as Root).status === "idle")
  expect(agent.sees("/entries/2")).toMatchObject({ kind: "reply", text: "Looking.", context: 10_010 })
  expect(agent.sees("/entries/3")).toMatchObject({ kind: "reply", text: "There are two.", context: 10_510, growth: 500 })
  expect(agent.sees("/entries/4")).toMatchObject({
    kind: "turn",
    tokens: { input: 20, cache_write: 2100, cache_read: 16_000, output: 40 },
    cost: 0.0042,
    calls: 2,
    ms: 4200,
  })

  expect(agent.noticed()).toEqual(["turn 1 ended"])

  await agent.call("/", "say", { text: "Again" })
  emit(result(0.0062))
  await until(() => (agent.sees() as Root).status === "idle")
  expect(agent.noticed()).toEqual(["turn 2 ended"])
  expect(agent.sees("/entries/5")).toMatchObject({ kind: "turn", cost: expect.closeTo(0.002) })
  expect(agent.sees()).toMatchObject({ turns: 2, cost: 0.0062, tokens: { input: 40, output: 80 } })
})

test("a message is refused while no run is up", async () => {
  const { agent } = story(lab(fake().harness), { effects: "real" })

  expect(agent.sees()).toMatchObject({ status: "no run" })
  expect(agent.offered()).toEqual(["start"])
  expect(await agent.call("/", "say", { text: "hello" })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "start", { model: "gpt" })).toEqual({ outcome: "refused", reason: "model is one of haiku, sonnet, opus" })
})

test("the person ends their move with a message, and stop interrupts the turn", async () => {
  const { person, written, emit } = await started()

  expect(await person.call("/", "end_move", {})).toMatchObject({ outcome: "written" })
  await until(() => written.length === 1)
  expect(written[0]).toMatchObject({ type: "user", message: { content: END_MOVE } })
  expect(person.offered()).toEqual(["say", "end_move", "stop", "close"])

  await person.call("/", "stop", {})
  await until(() => written.length === 2)
  expect(written[1]).toMatchObject({ type: "control_request", request: { subtype: "interrupt" } })
  emit(replay(END_MOVE))
  await until(() => (person.sees() as Root).entries === 2)
  expect(person.sees("/entries/2")).toMatchObject({ kind: "message", title: "the person" })
})

test("close kills the process, deletes the sandbox and keeps the timeline; a new run may start", async () => {
  const { agent, state, removed } = await started()

  await agent.call("/", "close", {})
  await until(() => (agent.sees() as Root).status === "closed")
  expect(state.killed).toBe(true)
  expect(removed).toEqual([SANDBOX])
  expect(agent.offered()).toEqual(["start"])
  expect((agent.sees() as { recent: { title: string }[] }).recent.map((r) => r.title)).toContain("closed")
  expect(await agent.call("/", "say", { text: "hello" })).toMatchObject({ outcome: "refused" })
})

test("a process that ends by itself ends the run, which is still to close", async () => {
  const { agent, exit } = await started()

  exit(1)
  await until(() => (agent.sees() as Root).status === "ended")
  expect(agent.sees()).toMatchObject({ ended: expect.stringContaining("exit code 1") })
  expect(agent.offered()).toEqual(["start", "close"])
})

test("a restored run whose process is gone is ended, its timeline kept", async () => {
  const kept: Model = {
    next: 2,
    run: {
      n: 1,
      model: "haiku",
      status: "working",
      began: 1000,
      session: "s",
      sandbox: SANDBOX,
      entries: [{ i: 1, t: 50, kind: "message", title: "the agent", text: "hi" }],
      senders: [],
      tokens: { input: 0, cache_write: 0, cache_read: 0, output: 0 },
      cost: 0,
      turns: 0,
    },
  }
  const world = fake()
  const { agent } = story(lab(world.harness), { model: kept, effects: "real" })

  expect(agent.sees()).toMatchObject({ status: "ended", ended: expect.stringContaining("did not survive"), entries: 2 })
  expect(agent.sees("/entries/1")).toMatchObject({ text: "hi" })
  expect(agent.offered()).toEqual(["start", "close"])
  expect(await agent.call("/", "say", { text: "hello" })).toMatchObject({ outcome: "refused" })
})
