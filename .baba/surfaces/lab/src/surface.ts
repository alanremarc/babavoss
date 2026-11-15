// The lab: an agent that built something drives an agent that uses it, and reads what it was told, while the person
// watches. A run is a copy of a checkout as it is now, uncommitted changes included, with its own root and page, and an
// agent under test in it with a home of its own, under a harness the lab reaches through the framework's adapter. Every
// event of its stream joins the timeline: what entered the agent's context, chunk by chunk, with sizes, tokens and cost,
// and what was done on its page as the person, by the developing agent or by the person's own clicks, which the lab
// follows in the root under test's activity. A turn that ends, and a run that cannot go on, are noticed. A run's record
// is kept under .babavoss/lab/runs, so it outlives its tab; a closed run keeps only that, the last KEEP of them, and a run
// left behind by a lab that is gone is cleared when the lab starts.
import { randomBytes, randomUUID } from "node:crypto"
import { action, isPerson, surface, view, type Call, type Json, type Notice, type Surface, type Update } from "babavoss/core/index.ts"
import { claudeCode, type Harness, type HarnessEvent, type Session } from "babavoss/core/harness/index.ts"
import { LEFT_OUT, runs as onDisk, type Checkout, type Heard, type Made, type Runs, type Said } from "./runs.ts"
import { append, empty, line, resolve, stream, type Entry, type Timeline } from "./timeline.ts"

export const MODELS = ["haiku", "sonnet", "opus"]
export const END_MOVE = "[The person ended their move on the page.]"
const RECENT = 5
const BUDGET_USD = 0.5
/** How often the root under test's activity is read, in ms, for what the person did on its page. */
const FOLLOW_MS = 1000
/** How many runs' records are kept: past it, the oldest is forgotten. */
export const KEEP = 20

/** starting: the project is being made; idle: the agent waits for a message; working: a turn runs; ended: its process is gone. */
export type Status = "starting" | "idle" | "working" | "ended" | "closing" | "closed"
export type Run = Timeline & {
  /** This tab's number for the run, which its events carry; `id` is its directory's name, once made. */
  n: number
  id?: string
  model: string
  status: Status
  /** When the run started, in ms since the epoch, as its command saw it. */
  began: number
  /** The checkout asked for: a path, or empty for this repository. */
  from: string
  checkout?: Checkout
  /** The entry the running or last turn began after. */
  since: number
  session?: string
  dir?: string
  project?: string
  home?: string
  login?: string
  page?: string
  ended?: string
  /** The process of the lab that runs it, so another lab's start tells a live run from one left behind. */
  lab?: number
  /** The last entry of the root under test's activity that was heard, so each is on the timeline once. */
  heard?: number
}
/** A run as the list of runs has it. */
export type Summary = { id: string; began: number; model: string; status: Status; checkout?: Checkout; turns: number; cost: number; entries: number }
export type Model = { next: number; run?: Run; runs: Summary[] }
export type Event =
  | ({ kind: "made"; n: number; t: number; id: string; session: string; login: string; lab: number } & Made)
  | { kind: "stream"; n: number; t: number; event: HarnessEvent }
  | { kind: "acted"; n: number; t: number; id: string; said: Said; own?: number[] }
  | { kind: "heard"; n: number; entries: Heard[] }
  | { kind: "closed"; n: number; t: number; changed: string }
  | { kind: "listed"; runs: Json[] }
  | { kind: "read"; run: Json }
  | { kind: "failed"; n: number; t: number; command: string; error: string; id?: string }
export type Command =
  | { kind: "harness"; n: number; model: string; from: string }
  | { kind: "say"; n: number; session: string; text: string }
  | { kind: "interrupt"; n: number; session: string }
  | { kind: "act"; n: number; id: string; project: string; home: string; session: string; at: string; handle?: string; args?: Json }
  | { kind: "follow"; n: number; project: string; session: string }
  | { kind: "close"; n: number; session?: string; dir?: string; project?: string; home?: string }
  | { kind: "record"; dir: string; run: Run }
  | { kind: "list" }
  | { kind: "read"; id: string }
  | { kind: "forget"; ids: string[] }
  | { kind: "sweep"; keep?: string }
type Result = Update<Model, Command>

const up = (run: Run | undefined): boolean => !!run && (run.status === "idle" || run.status === "working")
/** A run with a process, or one being closed: nothing new starts until it is done. */
const live = (run: Run | undefined) => !!run && ["starting", "idle", "working", "closing"].includes(run.status)
/** The run with a note of the lab's own, `t` in ms since the epoch. */
const note = (run: Run, t: number, title: string, text = "", error = false): Run => ({
  ...run,
  ...append(run, run.began ? t - run.began : 0, { kind: "note", title, text, ...(error && { error }) }),
})
const at = (run: Run) => run.began + (run.entries.at(-1)?.t ?? 0)
/** Who did it, as the timeline says: the person on the lab's page, or the agent that drives the run. */
const who = (call: Call) => (isPerson(call.actor) ? "the person" : "the developing agent")
/** The commands that close a run: its process killed, its root closed, its home's login taken back, its project and home deleted. */
const closing = (run: Run): Command[] =>
  run.project ? [{ kind: "close", n: run.n, session: run.session, dir: run.dir, project: run.project, home: run.home }] : []
const said = (m: Model, run: Run, text: string, call: Call): Result =>
  up(run)
    ? {
        model: {
          ...m,
          // A message to a turn that runs joins it; otherwise a turn begins after the last entry.
          run: { ...run, status: "working", since: run.status === "working" ? run.since : run.entries.length, senders: [...run.senders, who(call)] },
        },
        commands: [{ kind: "say", n: run.n, session: run.session!, text }],
      }
    : { refused: "no run is up: start one" }
const summary = (run: Run): Summary | undefined =>
  run.id
    ? {
        id: run.id,
        began: run.began,
        model: run.model,
        status: run.status,
        checkout: run.checkout,
        turns: run.turns,
        cost: run.cost,
        entries: run.entries.length,
      }
    : undefined
const starting = (m: Model, model: string, from: string): Result => {
  if (!MODELS.includes(model)) return { refused: `model is one of ${MODELS.join(", ")}` }
  if (live(m.run)) return { refused: `the run ${m.run!.id ?? ""} is up or closing: close it first` }

  const run: Run = { ...empty(), n: m.next, model, status: "starting", began: 0, from, since: 0 }
  const old = m.run && m.run.status === "ended" ? closing(m.run) : []

  return { model: { ...m, next: m.next + 1, run }, commands: [...old, { kind: "harness", n: run.n, model, from }] }
}

const start = action({
  name: "start",
  description: `Start a run on this repository as it is now, uncommitted changes included; model is ${MODELS.join(", ")}, haiku the cheapest`,
  subject: {},
  inputs: { model: "string" },
  update: (m: Model, { model }): Result => starting(m, model, ""),
})
const startFrom = action({
  name: "start_from",
  description: "Start a run on another checkout as it is now, such as the worktree you built in: from is the path of its top, which has a .baba/",
  subject: {},
  inputs: { model: "string", from: "string" },
  update: (m: Model, { model, from }): Result => (from.trim() ? starting(m, model, from.trim()) : { refused: "from is a checkout's path" }),
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
  description: "End the person's move on the page under test: a message starts the agent's turn, and its hook tells it what changed",
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
/** An act on the page under test: on the timeline at once, as the person, and its answer when it comes. */
const acting = (m: Model, call: Call, title: string, what: string, command: Pick<Command & { kind: "act" }, "at" | "handle" | "args">): Result => {
  const run = m.run

  if (!run || !up(run)) return { refused: "no run is up: start one" }

  const id = `act-${run.entries.length + 1}`
  const t = Date.now() - run.began
  const next = { ...run, ...append(run, t, { kind: "act", title: `${who(call)}, as the person: ${title}`, call: what, text: "", id, pending: true }) }

  return {
    model: { ...m, run: next },
    commands: [{ kind: "act", n: run.n, id, project: run.project!, home: run.home!, session: run.session!, ...command }],
  }
}
const act = action({
  name: "act",
  description:
    "Call a handle in the root under test as the person, as their click on its page would: " +
    'at is its path, such as /tabs/1; args is a JSON object, such as {"n":1}',
  subject: {},
  inputs: { at: "string", handle: "string", args: "string" },
  update(m: Model, { at, handle, args }, call): Result {
    let parsed: Json

    try {
      parsed = JSON.parse(args || "{}") as Json
    } catch {
      return { refused: "args is a JSON object, such as {}" }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { refused: "args is a JSON object, such as {}" }
    if (!at.startsWith("/") || !handle.trim()) return { refused: "at is a path, such as /tabs/1, and handle a name" }

    return acting(m, call, `${handle} at ${at}`, `${handle} ${JSON.stringify(parsed)} at ${at}`, { at, handle: handle.trim(), args: parsed })
  },
})
const look = action({
  name: "look",
  description: "Read a path of the root under test as the person sees it, with the handles offered to them alone; its answer joins the timeline",
  subject: {},
  inputs: { at: "string" },
  update: (m: Model, { at }, call): Result =>
    at.startsWith("/") ? acting(m, call, `look at ${at}`, `look at ${at}`, { at }) : { refused: "at is a path, such as /tabs/1" },
})
const close = action({
  name: "close",
  description: "Close the run: its agent's process is killed, its root closed, its project and home deleted; its timeline and record stay",
  subject: {},
  inputs: {},
  update(m: Model): Result {
    const run = m.run

    if (!run || run.status === "closing" || run.status === "closed") return { refused: "no run to close" }
    if (!run.project) return { refused: "the run is still starting" }

    return { model: { ...m, run: { ...run, status: "closing" } }, commands: closing(run) }
  },
})
const forget = action({
  name: "forget",
  description: ({ id }) => `Delete run ${id}'s record whole`,
  subject: { id: "string" },
  inputs: {},
  update(m: Model, { id }): Result {
    if (!m.runs.some((r) => r.id === id)) return { refused: `no run ${id}` }
    if (m.run?.id === id && m.run.status !== "closed") return { refused: "the run is shown here and not closed: close it first" }

    const { run, ...rest } = m

    return { model: { ...rest, ...(run?.id !== id && run && { run }), runs: m.runs.filter((r) => r.id !== id) }, commands: [{ kind: "forget", ids: [id] }] }
  },
})
/** The model past an event, with the oldest records past KEEP forgotten, never the run shown here. */
const kept = (result: { model: Model; commands?: Command[]; notices?: Notice[] }): Result => {
  const m = result.model
  const over = m.runs.length - KEEP
  const old = over > 0 ? m.runs.filter((r) => r.id !== m.run?.id).slice(0, over).map((r) => r.id) : []

  return old.length
    ? { ...result, model: { ...m, runs: m.runs.filter((r) => !old.includes(r.id)) }, commands: [...(result.commands ?? []), { kind: "forget", ids: old }] }
    : result
}
const open = action({
  name: "open",
  description: ({ id }) => `Show run ${id} here, its timeline as it was recorded`,
  subject: { id: "string" },
  inputs: {},
  update(m: Model, { id }): Result {
    if (live(m.run)) return { refused: "a run is up here: close it first" }
    if (!m.runs.some((r) => r.id === id)) return { refused: `no run ${id}` }

    return { model: m, commands: [{ kind: "read", id }] }
  },
})

/** An entry in one line, with the path that has it whole. */
const row = (entry: Entry) => ({ at: `/entries/${entry.i}`, i: entry.i, kind: entry.kind, title: entry.title, size: entry.text.length, line: line(entry) })
/** An entry whole: what entered the context, its size, and what it cost where it is a turn. */
const whole = (entry: Entry) => ({ at: `/entries/${entry.i}`, ...entry, size: entry.text.length })
const rows = (m: Model, from = 0) =>
  m.run && {
    run: m.run.id ?? null,
    entries: m.run.entries.slice(from).map((entry) => ({ ...row(entry), context: entry.context ?? null, growth: entry.growth ?? null })),
  }
const injected = (m: Model, from = 0) =>
  m.run && { run: m.run.id ?? null, injected: m.run.entries.slice(from).filter((entry) => entry.kind === "hook").map(whole) }
const checkout = (c: Checkout | undefined) => c && { checkout: c.from, commit: c.commit.slice(0, 10), uncommitted: c.dirty.length }
const HOW =
  "Start a run, say a message, then wait: the wait ends when the turn does, status idle. Read what the agent under test was told: " +
  "/entries a line each, /entries/since/N the entries after N, /entries/N one whole, /injected what hooks injected. Act on its page as " +
  "the person with look and act, then end_move. All of it is on the timeline the person watches. Close the run when done: its record stays, in /runs."

const pages = view([start, startFrom, say, endMove, stop, act, look, close, open, forget], {
  "/": (m) => {
    const run = m.run
    const working = run?.status === "working"
    // While a turn runs or the run closes, the timeline's facts stand still, so a wait ends when it is done.
    const still = working || run?.status === "closing"

    return {
      title: "Lab",
      how: HOW,
      ...(run
        ? {
            run: run.id ?? null,
            status: run.status,
            model: run.model,
            ...(checkout(run.checkout) ?? (run.from && { checkout: run.from })),
            ...(run.project && run.status !== "closed" && { project: run.project }),
            ...(run.page && run.status !== "closed" && { page: run.page }),
            ...(run.ended && { ended: run.ended }),
            turns: run.turns,
            tokens: run.tokens,
            cost: Math.round(run.cost * 10_000) / 10_000,
            ...(working && { turn: { since: run.since, at: `/entries/since/${run.since}` } }),
            ...(!still && {
              entries: run.entries.length,
              ...(run.turns > 0 && { last_turn: { at: `/entries/since/${run.since}` } }),
              timeline: { at: "/entries" },
              recent: run.entries.slice(-RECENT).map(row),
            }),
          }
        : { status: "no run" }),
      runs: { count: m.runs.length, at: "/runs" },
      ...(!live(run) && { start: start.bind({}), start_from: startFrom.bind({}) }),
      ...(up(run) && { say: say.bind({}), end_move: endMove.bind({}), act: act.bind({}), look: look.bind({}) }),
      ...(working && { stop: stop.bind({}) }),
      ...(run?.project && (up(run) || run.status === "ended") && { close: close.bind({}) }),
    }
  },
  // The whole list, each with the tokens its API call was given where it opened one.
  "/entries": (m) => rows(m),
  "/entries/since/:n": (m, { n }) => rows(m, Math.max(0, Number(n) || 0)),
  "/entries/:i": (m, { i }) => {
    const entry = m.run?.entries[Number(i) - 1]

    return entry && whole(entry)
  },
  "/injected": (m) => injected(m),
  "/injected/since/:n": (m, { n }) => injected(m, Math.max(0, Number(n) || 0)),
  "/runs": (m) => ({
    runs: m.runs
      .slice()
      .reverse()
      .map((r) => ({
        id: r.id,
        began: new Date(r.began).toISOString(),
        model: r.model,
        status: r.status,
        ...checkout(r.checkout),
        turns: r.turns,
        cost: Math.round(r.cost * 10_000) / 10_000,
        entries: r.entries,
        ...(r.id === m.run?.id ? { shown: true } : !live(m.run) && { open: open.bind({ id: r.id }) }),
        ...((r.id !== m.run?.id || m.run.status === "closed") && { forget: forget.bind({ id: r.id }) }),
      })),
  }),
})

/** The run after an event of its own command. */
function happened(run: Run, e: Exclude<Event, { kind: "listed" | "read" }>): Run {
  if (e.kind === "made") {
    const { id, session, dir, project, home, checkout, login, page, lab } = e
    const made = { ...run, began: e.t, status: "idle" as const, id, session, dir, project, home, checkout, login, lab, ...(page && { page }) }
    const dirty = checkout.dirty.length ? `, and ${checkout.dirty.length} paths uncommitted:\n${checkout.dirty.join("\n")}` : ", nothing uncommitted"

    return note(
      made,
      e.t,
      `run ${id} made`,
      `a copy of ${checkout.from} at ${checkout.commit.slice(0, 10)}${dirty}\n` +
        `left out: ${LEFT_OUT.join(", ")}, so the run cannot start runs of its own\n` +
        `in ${project}, made in ${(e.ms / 1000).toFixed(1)}s\nhome ${home}; login: ${login}\nsession ${session}${page ? `\npage ${page}` : ""}`
    )
  }
  if (e.kind === "stream") {
    const event = e.event

    if (event.kind === "ended") {
      const text = [`exit code ${event.code}`, event.stderr].filter(Boolean).join("\n")

      return run.status === "closing" || run.status === "closed"
        ? note(run, e.t, "process ended", text)
        : note({ ...run, status: "ended", ended: `the agent's process ended, exit code ${event.code}` }, e.t, "process ended", text, event.code !== 0)
    }

    const next = { ...run, ...stream(run, e.t - run.began, event) }

    return event.kind === "turn" && next.status === "working" ? { ...next, status: "idle" } : next
  }
  if (e.kind === "acted") return { ...run, ...resolve(run, e.id, e.said.text, !e.said.ok), heard: Math.max(run.heard ?? 0, ...(e.own ?? [])) }
  if (e.kind === "heard") return heardOf(run, e.entries)
  if (e.kind === "closed") {
    const left = e.changed ? `what git said of it, against the commit it was copied at:\n${e.changed}` : "nothing changed against the commit it was copied at"
    const closed = note({ ...run, status: "closed" }, e.t, "the project at close", left)

    return note(closed, e.t, "closed", "the root under test is closed, the home's login link taken back, its project and home deleted; this record stays")
  }
  if (e.command === "act" && e.id) return { ...run, ...resolve(run, e.id, `failed: ${e.error}`, true) }

  const failed = note(run, e.t, `${e.command} failed`, e.error, true)

  if (e.command === "harness" && live(run)) return { ...failed, status: "ended", ended: `the run could not go on: ${e.error}` }
  if (e.command === "close") return { ...failed, status: "ended" }

  return failed
}

/** The run with what the person did on the page under test on its timeline, each once, in the order it was done. */
function heardOf(run: Run, entries: Heard[]): Run {
  let next = run

  for (const e of entries.toSorted((a, b) => a.n - b.n)) {
    if (e.n <= (next.heard ?? 0)) continue
    if (e.who === "person") {
      // Its time is the root's, to the second: never before what is already on the timeline.
      const t = Math.max(e.when - run.began, next.entries.at(-1)?.t ?? 0)

      next = { ...next, ...append(next, t, { kind: "person", title: `the person, on ${e.surface}`, call: `${e.what}${e.at ? ` at ${e.at}` : ""}`, text: "" }) }
    }
    next = { ...next, heard: e.n }
  }

  return next
}

/** What an event of the run's own command is worth noticing: a turn that ended, a run that could not go on. */
function noticed(before: Run, after: Run): Notice[] {
  if (before.status === "working" && after.status === "idle") {
    const turn = after.entries.findLast((entry) => entry.kind === "turn")

    return [{ text: `turn ${after.turns} ended${turn?.error ? `: ${turn.text}` : ""}`, ...(turn && { at: `/entries/${turn.i}` }) }]
  }

  return after.status === "ended" && before.status !== "ended" && after.ended ? [after.ended] : []
}

/** A run from its record, as the lab shows one it did not start: if it was left live, its process is gone. */
const recorded = (saved: Json | undefined, n: number, ended: string): Run | undefined => {
  const run = saved as Run | undefined

  if (!run || typeof run !== "object" || !Array.isArray(run.entries)) return undefined

  // A record from before a run had these is shown without them.
  const kept: Run = { ...run, from: run.from ?? "", since: run.since ?? 0, n }

  return live(kept) ? note({ ...kept, status: "ended", ended }, at(kept), "process gone", ended, true) : kept
}
const RESTARTED = "the lab was started again, by a change to its code or a new runtime, and the agent under test's process did not survive it"
const ORPHANED = "the lab that ran it is gone, and the agent under test's process with it"
/** Whether a record is of a run another lab, still running, runs: its process is up and is not this one. */
const ranElsewhere = (record: Json | undefined): boolean => {
  const pid = (record as { lab?: unknown } | undefined)?.lab

  if (typeof pid !== "number" || pid === process.pid) return false
  try {
    process.kill(pid, 0)

    return live(record as unknown as Run)
  } catch {
    return false
  }
}
const summaries = (records: Json[]): Summary[] =>
  records.flatMap((r) => {
    const run = recorded(r, 0, ORPHANED)
    const s = run && summary(run)

    return s ? [s] : []
  })

/** Who follows a run's activity: what was heard up to, the turn its reads and acts take one at a time, and its end. */
type Follower = { after: number; turn: Promise<unknown>; stop: AbortController }

/** The lab, with its outside given: a harness, where runs live, and how often a run's activity is read; fakes in its specs. */
export function lab(harness: Harness, place: Runs, every: number = FOLLOW_MS): Surface<Model, Event, Command> {
  /** The sessions under test of this process, by id; a process does not outlive the runtime that started it. */
  const sessions = new Map<string, Session>()
  /** Who follows each session under test's activity: a read of it and an act as the person never interleave. */
  const followers = new Map<string, Follower>()
  const serially = <T>(f: Follower, fn: () => Promise<T>): Promise<T> => {
    const next = f.turn.then(fn, fn)

    f.turn = next.catch(() => {})

    return next
  }
  /** The activity after what `f` heard, which it has heard now; none where it cannot be read. */
  const hear = async (f: Follower, project: string, session: string): Promise<Heard[]> => {
    const entries = await place.activity(project, session, f.after).catch((): Heard[] => [])

    f.after = Math.max(f.after, ...entries.map((e) => e.n))

    return entries
  }

  return surface<Model, Event, Command>({
    description:
      "Have an agent under test use a checkout as it is now, uncommitted work included, through its real surfaces and hooks: what entered " +
      "its context chunk by chunk, with tokens and cost, its page beside, acted on as the person. " +
      "Use when checking how a surface you built appears to the agent that uses it.",
    init: () => ({ next: 1, runs: [] }),
    // A run whose process this runtime did not start is gone: it is shown ended, its timeline kept, its project still to close.
    restore(saved) {
      const kept = saved as Partial<Model> | undefined

      if (!kept || typeof kept.next !== "number") return { next: 1, runs: [] }

      const run = kept.run && recorded(kept.run as unknown as Json, kept.run.n, RESTARTED)

      return { next: kept.next, runs: Array.isArray(kept.runs) ? kept.runs : [], ...(run && { run }) }
    },
    // What a lab that is gone left of its runs is cleared: every run but the one shown here and those of a lab still running.
    start: (m) => [{ kind: "sweep", ...(m.run?.id && m.run.status !== "closed" && { keep: m.run.id }) }, { kind: "list" }],
    working: (m) => live(m.run),
    session: (c) => c.kind === "harness" || c.kind === "follow",
    update(m, message) {
      if (message.kind === "call") return pages.update(m, message)
      if (message.kind === "listed") return kept({ model: { ...m, runs: summaries(message.runs) } })
      if (message.kind === "read") {
        const run = recorded(message.run, m.next, ORPHANED)

        return run && !live(m.run) ? { model: { ...m, next: m.next + 1, run } } : { refused: "the run is not to be shown now" }
      }
      // An event of a run that is no longer the current one lands nowhere.
      if (!m.run || message.n !== m.run.n) return { model: m }

      const run = happened(m.run, message)
      const s = summary(run)
      const runs = s ? [...m.runs.filter((r) => r.id !== s.id), s].sort((a, b) => a.began - b.began) : m.runs
      const notices = noticed(m.run, run)

      const follow: Command[] = message.kind === "made" ? [{ kind: "follow", n: run.n, project: message.project, session: message.session }] : []
      const commands: Command[] = [...(run.dir ? [{ kind: "record" as const, dir: run.dir, run }] : []), ...follow]

      return kept({ model: { ...m, run, runs }, commands, ...(notices.length && { notices }) })
    },
    view: pages.view,
    async run(c, send, signal) {
      if (c.kind === "record") return place.record(c.dir, c.run)
      if (c.kind === "list") return send({ kind: "listed", runs: place.list() })
      if (c.kind === "forget") return c.ids.forEach((id) => place.forget(id))
      if (c.kind === "sweep") {
        const spared = (id: string, record: Json | undefined) => id === c.keep || ranElsewhere(record)

        return void (await place.sweep(spared, (home) => harness.release(home)))
      }
      if (c.kind === "read") {
        const found = place.list().find((r) => (r as { id?: unknown } | null)?.id === c.id)

        if (!found) throw new Error(`no record of run ${c.id}`)

        return send({ kind: "read", run: found })
      }
      if (c.kind === "harness") {
        const session = randomUUID()
        const stamp = new Date().toISOString().replace(/\.\d+Z$/, "").replaceAll(":", "-")
        const id = `${stamp}-${randomBytes(2).toString("hex")}`
        const made = await place.make(id, c.from, session)
        const login = harness.home(made.home)

        if (signal.aborted) {
          await place.close(made.project)
          harness.release(made.home)

          return place.clear(made.dir)
        }
        send({ kind: "made", n: c.n, t: Date.now(), id, session, login, lab: process.pid, ...made })

        const agent = harness.start({ project: made.project, home: made.home, session, model: c.model, budget: BUDGET_USD })

        sessions.set(session, agent)
        signal.addEventListener("abort", () => void agent.end(), { once: true })
        try {
          for await (const event of agent.events) send({ kind: "stream", n: c.n, t: Date.now(), event })
        } finally {
          sessions.delete(session)
        }

        return
      }
      if (c.kind === "close") {
        const agent = c.session ? sessions.get(c.session) : undefined
        const f = c.session ? followers.get(c.session) : undefined

        // What the person did up to the close is heard, and then no more.
        f?.stop.abort()
        await f?.turn
        if (f && c.project && c.session) {
          const last = await hear(f, c.project, c.session)

          if (last.length) send({ kind: "heard", n: c.n, entries: last })
        }
        await agent?.end()
        const changed = c.project ? await place.close(c.project) : ""

        if (c.home) harness.release(c.home)
        if (c.dir) place.clear(c.dir)

        return send({ kind: "closed", n: c.n, t: Date.now(), changed })
      }
      if (c.kind === "follow") {
        const f: Follower = { after: 0, turn: Promise.resolve(), stop: new AbortController() }
        const ended = AbortSignal.any([signal, f.stop.signal])

        followers.set(c.session, f)
        try {
          while (!ended.aborted) {
            await serially(f, async () => {
              const entries = await hear(f, c.project, c.session)

              if (entries.length) send({ kind: "heard", n: c.n, entries })
            })
            await new Promise<void>((done) => {
              const timer = setTimeout(done, every)

              ended.addEventListener("abort", () => (clearTimeout(timer), done()), { once: true })
            })
          }
        } finally {
          if (followers.get(c.session) === f) followers.delete(c.session)
        }

        return
      }
      if (c.kind === "act") {
        const { project, home, session, at, handle } = c

        if (!handle) return send({ kind: "acted", n: c.n, t: Date.now(), id: c.id, said: await place.look(project, home, session, at) })

        const f = followers.get(session)
        const acting = async () => {
          // What the person did before is heard first; what came of the act is its own, not the person's on the page.
          const before = f ? await hear(f, project, session) : []

          if (before.length) send({ kind: "heard", n: c.n, entries: before })

          const said = await place.act(project, home, session, at, handle, c.args ?? {})
          const after = f ? await hear(f, project, session) : []
          const tab = /^\/tabs\/\d+/.exec(at)?.[0]
          const mine = (e: Heard) => said.ok && e.who === "person" && (!tab || e.at === tab || e.at.startsWith(`${tab}/`))
          const others = after.filter((e) => !mine(e))

          if (others.length) send({ kind: "heard", n: c.n, entries: others })
          send({ kind: "acted", n: c.n, t: Date.now(), id: c.id, said, own: after.filter(mine).map((e) => e.n) })
        }

        return f ? serially(f, acting) : acting()
      }

      const agent = sessions.get(c.session)

      if (!agent) throw new Error("the agent's process is gone")
      if (c.kind === "say") agent.say(c.text)
      else agent.stop()
    },
    // A record that could not be written or read is the lab's own trouble, of no run: its event lands nowhere.
    failed: (c, error) => ({ kind: "failed", n: "n" in c ? c.n : 0, t: Date.now(), command: c.kind, error, ...(c.kind === "act" && { id: c.id }) }),
  })
}

export default lab(claudeCode(), onDisk)
