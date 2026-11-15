// The lab: how a surface appears to an agent. A run is a throwaway sandbox project holding the surfaces under test and one
// headless Claude Code in it, with a root and a page of its own; the lab only watches and drives it. Every event of its
// stream comes back as a command event and joins the timeline: what entered the agent's context, chunk by chunk, with
// sizes, tokens and cost. At / a run is short: its status, totals and last few entries; each entry's path has it in full.
// A turn that ends, and a run that cannot go on, are noticed.
import { randomUUID } from "node:crypto"
import { action, isPerson, surface, view, type Call, type Json, type Notice, type Surface, type Update } from "babavoss/core/index.ts"
import { claude, type Agent, type Harness } from "./harness.ts"
import { append, empty, line, stream, type Entry, type Timeline } from "./timeline.ts"

export const MODELS = ["haiku", "sonnet", "opus"]
export const END_MOVE = "[The person ended their move on the page.]"
const RECENT = 5

/** starting: the sandbox is being made; idle: the agent waits for a message; working: a turn runs; ended: its process is gone. */
export type Status = "starting" | "idle" | "working" | "ended" | "closing" | "closed"
export type Run = Timeline & {
  n: number
  model: string
  status: Status
  /** When the run started, in ms since the epoch, as its command saw it. */
  began: number
  session?: string
  sandbox?: string
  page?: string
  ended?: string
}
export type Model = { next: number; run?: Run }
export type Event =
  | { kind: "made"; n: number; t: number; session: string; sandbox: string }
  | { kind: "page"; n: number; t: number; page: string }
  | { kind: "stream"; n: number; t: number; event: Json }
  | { kind: "exited"; n: number; t: number; code: number | null; stderr: string }
  | { kind: "closed"; n: number; t: number }
  | { kind: "failed"; n: number; t: number; command: string; error: string }
export type Command =
  | { kind: "harness"; n: number; model: string }
  | { kind: "say"; n: number; session: string; text: string }
  | { kind: "interrupt"; n: number; session: string }
  | { kind: "close"; n: number; session?: string; sandbox?: string }
type Result = Update<Model, Command>

const up = (run: Run | undefined): boolean => !!run && (run.status === "idle" || run.status === "working")
/** A run with a process, or one being closed: nothing new starts until it is done. */
const live = (run: Run | undefined) => !!run && ["starting", "idle", "working", "closing"].includes(run.status)
/** The run with a note of the lab's own, `t` in ms since the epoch. */
const note = (run: Run, t: number, title: string, text = "", error = false): Run => ({
  ...run,
  ...append(run, run.began ? t - run.began : 0, { kind: "note", title, text, ...(error && { error }) }),
})
const sender = (call: Call) => (isPerson(call.actor) ? "the person" : "the agent")
/** The commands that close a run: its process killed, its sandbox's root closed and the sandbox deleted. */
const closing = (run: Run): Command[] => (run.sandbox ? [{ kind: "close", n: run.n, session: run.session, sandbox: run.sandbox }] : [])
const said = (m: Model, run: Run, text: string, call: Call): Result =>
  up(run)
    ? {
        model: { ...m, run: { ...run, status: "working", senders: [...run.senders, sender(call)] } },
        commands: [{ kind: "say", n: run.n, session: run.session!, text }],
      }
    : { refused: "no run is up: start one" }

const start = action({
  name: "start",
  description:
    "Start a run: a sandbox project with the greeting and queue surfaces, and an agent under test in it; " +
    `model is ${MODELS.join(", ")}, haiku the cheapest`,
  subject: {},
  inputs: { model: "string" },
  update(m: Model, { model }): Result {
    if (!MODELS.includes(model)) return { refused: `model is one of ${MODELS.join(", ")}` }
    if (live(m.run)) return { refused: `run ${m.run!.n} is up or closing: close it first` }

    const run: Run = { ...empty(), n: m.next, model, status: "starting", began: 0 }
    const old = m.run && m.run.status === "ended" ? closing(m.run) : []

    return { model: { next: m.next + 1, run }, commands: [...old, { kind: "harness", n: run.n, model }] }
  },
})
const say = action({
  name: "say",
  description: "Send the agent under test a message, as the person would; a turn starts, or the message waits for the one running",
  subject: {},
  inputs: { text: "string" },
  update(m: Model, { text }, call): Result {
    if (!text.trim()) return { refused: "a message needs text" }

    return m.run ? said(m, m.run, text.trim(), call) : { refused: "no run is up: start one" }
  },
})
const endMove = action({
  name: "end_move",
  description: "End the person's move on the sandbox's page: a message starts the agent's turn, and its hook tells it what changed",
  subject: {},
  inputs: {},
  update: (m: Model, _args, call): Result => (m.run ? said(m, m.run, END_MOVE, call) : { refused: "no run is up: start one" }),
})
const stop = action({
  name: "stop",
  description: "Interrupt the agent under test's turn",
  subject: {},
  inputs: {},
  update: (m: Model): Result =>
    m.run?.status === "working" ? { model: m, commands: [{ kind: "interrupt", n: m.run.n, session: m.run.session! }] } : { refused: "no turn is running" },
})
const close = action({
  name: "close",
  description: "Close the run: its agent's process is killed, the sandbox's root closed and the sandbox deleted; the timeline stays",
  subject: {},
  inputs: {},
  update(m: Model): Result {
    const run = m.run

    if (!run || run.status === "closing" || run.status === "closed") return { refused: "no run to close" }
    if (!run.sandbox) return { refused: "the run is still starting" }

    return { model: { ...m, run: { ...run, status: "closing" } }, commands: closing(run) }
  },
})

/** An entry in one line, with the path that has it whole. */
const row = (entry: Entry) => ({ at: `/entries/${entry.i}`, i: entry.i, kind: entry.kind, title: entry.title, size: entry.text.length, line: line(entry) })
/** An entry whole: what entered the context, its size, and what it cost where it is a turn. */
const whole = (entry: Entry) => ({ at: `/entries/${entry.i}`, ...entry, size: entry.text.length })
const HOW =
  "Start a run, then say a message and wait for its turn to end, status idle. Each entry of the timeline has its path, with what entered the " +
  "agent's context in full; /entries lists them all. The person may act on the sandbox's page, at page, and end their move. " +
  "Close the run when done: it deletes the sandbox."

const pages = view([start, say, endMove, stop, close], {
  "/": (m) => {
    const run = m.run

    return {
      title: "Lab",
      how: HOW,
      ...(run
        ? {
            run: run.n,
            status: run.status,
            model: run.model,
            ...(run.page && { page: run.page }),
            ...(run.ended && { ended: run.ended }),
            entries: run.entries.length,
            turns: run.turns,
            tokens: run.tokens,
            cost: Math.round(run.cost * 10_000) / 10_000,
            timeline: { at: "/entries" },
            recent: run.entries.slice(-RECENT).map(row),
          }
        : { status: "no run" }),
      ...(!live(run) && { start: start.bind({}) }),
      ...(up(run) && { say: say.bind({}), end_move: endMove.bind({}) }),
      ...(run?.status === "working" && { stop: stop.bind({}) }),
      ...(run?.sandbox && (up(run) || run.status === "ended") && { close: close.bind({}) }),
    }
  },
  // The whole list, each with the tokens its API call was given where it opened one.
  "/entries": (m) =>
    m.run && { run: m.run.n, entries: m.run.entries.map((entry) => ({ ...row(entry), context: entry.context ?? null, growth: entry.growth ?? null })) },
  "/entries/:i": (m, { i }) => {
    const entry = m.run?.entries[Number(i) - 1]

    return entry && whole(entry)
  },
})

/** The run after an event of its own command. */
function happened(run: Run, e: Event): Run {
  if (e.kind === "made") {
    const made = { ...run, began: e.t, status: "idle" as const, session: e.session, sandbox: e.sandbox }

    return note(made, e.t, "sandbox made", `${e.sandbox}\nsession ${e.session}`)
  }
  if (e.kind === "page") return note({ ...run, page: e.page }, e.t, "sandbox page", e.page)
  if (e.kind === "stream") {
    const next = { ...run, ...stream(run, e.t - run.began, e.event) }
    const ended = (e.event as { type?: unknown } | null)?.type === "result"

    return ended && next.status === "working" ? { ...next, status: "idle" } : next
  }
  if (e.kind === "exited") {
    const text = [`exit code ${e.code}`, e.stderr].filter(Boolean).join("\n")

    return run.status === "closing" || run.status === "closed"
      ? note(run, e.t, "process ended", text)
      : note({ ...run, status: "ended", ended: `the agent's process ended, exit code ${e.code}` }, e.t, "process ended", text, e.code !== 0)
  }
  if (e.kind === "closed") return note({ ...run, status: "closed" }, e.t, "closed", "the sandbox's root is closed and the sandbox deleted")

  const failed = note(run, e.t, `${e.command} failed`, e.error, true)

  if (e.command === "harness" && live(run)) return { ...failed, status: "ended", ended: `the run could not go on: ${e.error}` }
  if (e.command === "close") return { ...failed, status: "ended" }

  return failed
}

/** What an event of the run's own command is worth noticing: a turn that ended, a run that could not go on. */
function noticed(before: Run, after: Run): Notice[] {
  if (before.status === "working" && after.status === "idle") {
    const turn = after.entries.findLast((entry) => entry.kind === "turn")

    return [{ text: `turn ${after.turns} ended${turn?.error ? `: ${turn.text}` : ""}`, ...(turn && { at: `/entries/${turn.i}` }) }]
  }

  return after.status === "ended" && before.status !== "ended" && after.ended ? [after.ended] : []
}

const RESTARTED = "the lab was started again, by a change to its code or a new runtime, and the agent under test's process did not survive it"

/** The lab, with its outside given: the real harness by default, a fake in its specs. */
export function lab(harness: Harness): Surface<Model, Event, Command> {
  /** The agents under test of this process, by session; a process does not outlive the runtime that started it. */
  const agents = new Map<string, Agent>()

  return surface<Model, Event, Command>({
    description:
      "Watch an agent under test work a sandbox project's surfaces: what entered its context, chunk by chunk, with sizes, tokens and cost, " +
      "its page beside, and a chat to drive it. Use when checking how a surface appears to an agent.",
    init: () => ({ next: 1 }),
    // A run whose process this runtime did not start is gone: it is shown ended, its timeline kept, its sandbox still to close.
    restore(saved) {
      const kept = saved as Partial<Model> | undefined

      if (!kept || typeof kept.next !== "number") return { next: 1 }

      const run = kept.run

      if (!run || !Array.isArray(run.entries)) return { next: kept.next }
      if (!live(run)) return { next: kept.next, run }

      const at = run.began + (run.entries.at(-1)?.t ?? 0)

      return { next: kept.next, run: note({ ...run, status: "ended", ended: RESTARTED }, at, "process gone", RESTARTED, true) }
    },
    working: (m) => live(m.run),
    session: (c) => c.kind === "harness",
    update(m, message) {
      if (message.kind === "call") return pages.update(m, message)
      // An event of a run that is no longer the current one lands nowhere.
      if (!m.run || message.n !== m.run.n) return { model: m }

      const run = happened(m.run, message)
      const notices = noticed(m.run, run)

      return { model: { ...m, run }, ...(notices.length && { notices }) }
    },
    view: pages.view,
    async run(c, send, signal) {
      if (c.kind === "harness") {
        const session = randomUUID()
        const sandbox = await harness.make()

        if (signal.aborted) return void (await harness.remove(sandbox, session))
        send({ kind: "made", n: c.n, t: Date.now(), session, sandbox })

        const agent = harness.spawn(sandbox, session, c.model)
        let page: string | undefined
        const look = setInterval(() => {
          page ??= harness.page(sandbox, session)
          if (page) {
            clearInterval(look)
            send({ kind: "page", n: c.n, t: Date.now(), page })
          }
        }, 250)

        agents.set(session, agent)
        signal.addEventListener("abort", () => agent.kill(), { once: true })
        try {
          for await (const event of agent.lines) send({ kind: "stream", n: c.n, t: Date.now(), event })

          const { code, stderr } = await agent.exited

          send({ kind: "exited", n: c.n, t: Date.now(), code, stderr })
        } finally {
          clearInterval(look)
          agents.delete(session)
        }

        return
      }
      if (c.kind === "close") {
        const agent = c.session ? agents.get(c.session) : undefined

        agent?.kill()
        await agent?.exited
        if (c.sandbox) await harness.remove(c.sandbox, c.session ?? "")
        send({ kind: "closed", n: c.n, t: Date.now() })

        return
      }

      const agent = agents.get(c.session)

      if (!agent) throw new Error("the agent's process is gone")
      if (c.kind === "say") agent.write({ type: "user", message: { role: "user", content: c.text }, parent_tool_use_id: null, session_id: c.session })
      else agent.write({ type: "control_request", request_id: `stop-${Date.now()}`, request: { subtype: "interrupt" } })
    },
    failed: (c, error) => ({ kind: "failed", n: c.n, t: Date.now(), command: c.kind, error }),
  })
}

export default lab(claude)
