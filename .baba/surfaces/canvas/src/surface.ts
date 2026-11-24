// Canvas: the alignment surface of one worktree's work. Its homepage reads top to bottom as where the work stands: the
// title and the brief; the asks waiting on the person; now; the plan, tickets by phase, each a unit
// of the work worked by the main agent or by a subagent in a worktree of its own, with the short posts made as it went; the
// notes, the long material, each opened on its own page; and the journal, what happened. The record is the worktree's, not a tab's: every
// canvas tab opens the one file (store.ts), and each change is applied to the tab's copy and then to the record, again over
// the record as it is by then. A subagent's worker reports through this worktree's command, naming the session of the tab.
import { action, admit, detail, surface, view, type Call, type Surface, type Update } from "babavoss/core/index.ts"
import {
  asCanvas,
  ask as askOf,
  empty,
  finished,
  optionsOf,
  phases,
  SECTIONS,
  settled,
  ticket,
  type Ask,
  type By,
  type Canvas,
  type Entry,
  fileOf,
  show,
  type NoteFile,
  type Shown,
  type SectionName,
  type Status,
  type Ticket,
} from "./canvas.ts"
import { io, notesDir, project, recordFile, same, type Git } from "./io.ts"
import { store as kept, type Store } from "./store.ts"
import { mkdirSync, watch } from "node:fs"
import { dirname, join } from "node:path"
import { fromQueues } from "./queue.ts"

/** `reading`: the tab has not heard the record yet; `trouble`: why the record cannot be kept. */
/** `notes`: the worktree's note files as last read, kept by the tab and never in the record. */
export type Model = { canvas: Canvas; git?: Git; notes?: Shown[]; reading?: true; trouble?: string }
export type Event =
  | { kind: "heard"; canvas: Canvas }
  | { kind: "watch-git"; git: Git }
  | { kind: "watch-notes"; files: NoteFile[]; figures: Record<string, string> }
  | { kind: "failed"; command: string; error: string }
export type Command =
  | { kind: "open" }
  | { kind: "apply"; message: Call | Event; git?: Git }
  | { kind: "watch-git" }
  | { kind: "watch-notes" }
  | { kind: "export-notes"; notes: Canvas["notes"] }
type Result = Update<Model, Command>

/** How often the repo's worktrees are read again. */
const GIT_MS = 20 * 1000
/** The posts a ticket keeps, and the entries the journal keeps: the latest. */
const KEPT = 300
const JOURNAL = 500
/** How much now holds: a glance, not a report. */
const NOW_LINES = 3
const NOW_CHARS = 360

const N = { n: "number" } as const
const iso = (call: Call) => new Date(call.t ?? 0).toISOString()
const at = (n: number) => `/tickets/${n}`
const withCanvas = (m: Model, canvas: Canvas): Model => ({ ...m, canvas })
/** The canvas with ticket `n` changed and its updatedAt stamped; `moved` stamps its order too, as a change of status does. */
function changed(m: Model, n: number, t: string, change: (x: Ticket) => Ticket, moved = false): Model {
  const c = m.canvas

  return withCanvas(m, {
    ...c,
    tickets: c.tickets.map((x) => (x.n === n ? { ...change(x), updatedAt: t, ...(moved && { order: c.clock }) } : x)),
    ...(moved && { clock: c.clock + 1 }),
  })
}
const named = (x: Ticket) => `Ticket ${x.n}, ${x.title}`
/** The canvas with an entry added to its journal. */
const logged = (c: Canvas, by: By, text: string, t: string): Canvas => ({ ...c, journal: [...c.journal, { at: t, by, text }].slice(-JOURNAL) })
/** Who a call at / is: the person on the page, else main. */
const caller = (call: Call): By => (call.actor === "person" ? "person" : "main")
/** One or two lines, trimmed; undefined where there is nothing or more. */
const short = (text: string) => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  return lines.length && lines.length <= 2 ? lines.join("\n") : undefined
}
const SHORT = "A post is one or two lines"
const post = (x: Ticket, by: By, text: string, t: string): Ticket => ({ ...x, posts: [...x.posts, { at: t, by, text }].slice(-KEPT) })
/** Who a call posts as: the person on the page; else the worker of the ticket for its own words, main otherwise. */
const who = (call: Call, x: Ticket, as: "main" | "worker" | "its worker"): By =>
  call.actor === "person" ? "person" : as === "its worker" ? (x.worker === "subagent" ? "worker" : "main") : as

// Actions at /

const title = action({
  name: "title",
  description: "names the canvas",
  subject: {},
  inputs: { text: { type: "string", kind: "line" } },
  update: (m: Model, { text }): Result => (text.trim() ? { model: withCanvas(m, { ...m.canvas, title: text.trim() }) } : { refused: "Give the title" }),
})
const write = action({
  name: "write",
  description: "replaces the section whole, empty clears it; now holds three short lines at most",
  subject: {},
  inputs: { section: { type: "string", choices: [...SECTIONS] }, text: { type: "string", kind: "markdown" } },
  update(m: Model, { section, text }, call): Result {
    const said = text.trim()

    if (section === "now" && (said.split("\n").filter((l) => l.trim()).length > NOW_LINES || said.length > NOW_CHARS))
      return { refused: `Now is at most ${NOW_LINES} lines and ${NOW_CHARS} characters; long material belongs in a note` }

    return { model: withCanvas(m, { ...m.canvas, sections: { ...m.canvas.sections, [section]: { text: said, updatedAt: iso(call) } } }) }
  },
})
const add = action({
  name: "add",
  description: "a new ticket, open; about in markdown; phase by name, empty for none",
  subject: {},
  inputs: {
    title: { type: "string", kind: "line" },
    about: { type: "string", kind: "markdown" },
    worker: { type: "string", choices: ["main", "subagent"] },
    phase: { type: "string", kind: "line" },
  },
  update(m: Model, { title, about, worker, phase }, call): Result {
    if (!title.trim()) return { refused: "A ticket needs a title" }
    const c = m.canvas
    const t = iso(call)
    const x: Ticket = {
      n: c.next,
      title: title.trim(),
      about: about.trim(),
      status: "open",
      worker,
      ...(phase.trim() && { phase: phase.trim() }),
      posts: [],
      createdAt: t,
      updatedAt: t,
      order: c.clock,
    }

    return { model: withCanvas(m, { ...c, tickets: [...c.tickets, x], next: c.next + 1, clock: c.clock + 1 }) }
  },
})

const put = action({
  name: "ask",
  description: "puts a decision to the person, highlighted; options on one line as `a | *b`, the one marked * proposed; context in markdown",
  subject: {},
  inputs: { question: { type: "string", kind: "line" }, options: { type: "string", kind: "line" }, context: { type: "string", kind: "markdown" } },
  update(m: Model, { question, options, context }, call): Result {
    const q = question.trim()
    const o = optionsOf(options)

    if (!q) return { refused: "An ask needs its question" }
    if (!o) return { refused: "Give two options or more on one line, `a | *b | c`, at most one marked * as proposed" }
    const c = m.canvas
    const a: Ask = { n: c.nextAsk, question: q, context: context.trim(), ...o, createdAt: iso(call) }

    return {
      model: withCanvas(m, { ...c, asks: [...c.asks, a], nextAsk: c.nextAsk + 1 }),
      notices: [{ text: `Asked: ${q}`, highlight: true, at: `/asks/${a.n}` }],
    }
  },
})
const log = action({
  name: "log",
  description: "adds an entry to the journal: its first line the headline, at most 120 characters, the rest markdown behind it",
  subject: {},
  inputs: { text: { type: "string", kind: "markdown" } },
  update(m: Model, { text }, call): Result {
    const said = text.trim()
    const headline = said.split("\n")[0]!.trim()

    if (!headline) return { refused: "An entry needs its headline, on its first line" }
    if (headline.length > 120) return { refused: "The headline is at most 120 characters; the rest goes on the lines after it" }

    return { model: withCanvas(m, logged(m.canvas, caller(call), said, iso(call))) }
  },
})
const arrange = action({
  name: "order",
  description: "sets the order of the phases, named on one line as `a | b`; phases not named follow in the order they first appear",
  subject: {},
  inputs: { phases: { type: "string", kind: "line" } },
  update(m: Model, { phases: line }): Result {
    const named = [...new Set(line.split("|").map((p) => p.trim()).filter(Boolean))]
    const known = phases(m.canvas)
    const unknown = named.filter((p) => !known.includes(p))

    if (!named.length) return { refused: "Name the phases, `a | b`" }
    if (unknown.length) return { refused: `No ticket is in ${unknown.join(", ")}; the phases: ${known.join(", ") || "none"}` }

    return { model: withCanvas(m, { ...m.canvas, phaseOrder: named }) }
  },
})

// Actions at /asks/N

const answer = action({
  name: "answer",
  description: "settles it with one of its options or any other line; the answer goes in the journal",
  subject: N,
  inputs: { choice: { type: "string", kind: "line" } },
  update(m: Model, { n, choice }, call): Result {
    const said = choice.trim()

    if (!said) return { refused: "Give the answer" }
    const a = askOf(m.canvas, n)!
    const by = caller(call)
    const t = iso(call)
    const c = logged(m.canvas, by, `Decided: ${a.question} → ${said}`, t)

    return {
      model: withCanvas(m, { ...c, asks: c.asks.map((x) => (x.n === n ? { ...x, answer: { text: said, by, at: t } } : x)) }),
      ...(by === "person" && { notices: [{ text: `The person answered "${a.question}": ${said}`, at: `/asks/${n}` }] }),
    }
  },
})
const withdraw = action({
  name: "withdraw",
  description: "takes it back unanswered, the text as why",
  subject: N,
  inputs: { text: { type: "string", kind: "line" } },
  update(m: Model, { n, text }): Result {
    const why = text.trim()

    if (!why) return { refused: "Say why it is withdrawn" }

    return { model: withCanvas(m, { ...m.canvas, asks: m.canvas.asks.map((x) => (x.n === n ? { ...x, withdrawn: why } : x)) }) }
  },
})

// Actions at /tickets/N

const TEXT = { text: { type: "string", kind: "line" } } as const

const postAs = (name: "post" | "report", as: "main" | "worker", description: string) =>
  action({
    name,
    description,
    subject: N,
    inputs: TEXT,
    update(m: Model, { n, text }, call): Result {
      const x = ticket(m.canvas, n)!
      const said = short(text)

      if (!said) return { refused: SHORT }
      const by = who(call, x, as)

      return {
        model: changed(m, n, iso(call), (x) => post(x, by, said, iso(call))),
        ...(by !== "main" && { notices: [{ text: `${named(x)}: ${by === "worker" ? "the worker reports" : "the person posts"}: ${said}`, at: at(n) }] }),
      }
    },
  })
const postMain = postAs("post", "main", "a short report by main, one or two lines")
const report = postAs("report", "worker", "a short report by the subagent's worker, one or two lines")

/** A move to `to`, with the text posted where it takes one, and its notice. */
const move = (name: string, to: Status, description: string, as: "main" | "its worker", say?: (x: Ticket, text: string) => { text: string; highlight?: true }) =>
  action({
    name,
    description,
    subject: N,
    inputs: say ? TEXT : {},
    update(m: Model, args, call): Result {
      const { n } = args
      const text = (args as { text?: string }).text
      const x = ticket(m.canvas, n)!
      const said = say ? short(text ?? "") : undefined

      if (say && !said) return { refused: SHORT }
      const by = who(call, x, as)

      const moved = changed(m, n, iso(call), (x) => (said ? post({ ...x, status: to }, by, said, iso(call)) : { ...x, status: to }), true)
      const story = to === "done" ? `Done: ${x.title}` : to === "dropped" ? `Dropped: ${x.title}` : undefined

      return {
        model: story ? withCanvas(moved, logged(moved.canvas, by, `${story}\n\n${said}`, iso(call))) : moved,
        ...(say && { notices: [{ ...say(x, said!), at: at(n) }] }),
      }
    },
  })
const start = move("start", "working", "to working", "main")
const wait = move("wait", "waiting", "to waiting on the person, the text posted as what it waits on", "its worker", (x, text) => ({
  text: `${named(x)}, waits on the person: ${text}`,
  highlight: true,
}))
const done = move("done", "done", "the text posted as its result", "its worker", (x, text) => ({ text: `${named(x)}, is done: ${text}` }))
const drop = move("drop", "dropped", "it will not be done; the text posted as why", "main", (x, text) => ({ text: `${named(x)}, is dropped: ${text}` }))
const reopen = move("reopen", "open", "to open", "main")

const assign = action({
  name: "assign",
  description: "sets the subagent's worktree, by absolute path: a worktree of this repo other than this one",
  subject: N,
  inputs: { worktree: { type: "string", kind: "path" } },
  update(m: Model, { n, worktree }, call): Result {
    const path = worktree.trim().replace(/\/+$/, "")

    if (!path.startsWith("/")) return { refused: "Give the worktree's absolute path" }
    if (!m.git) return { refused: "The repo's worktrees have not been read yet" }
    if (same(path, m.git.here)) return { refused: `${path} is this worktree` }
    const tree = m.git.trees.find((t) => same(t.path, path))

    if (!tree) return { refused: `${path} is not a worktree of this repo; its worktrees: ${m.git.trees.map((t) => t.path).join(", ")}` }

    return { model: changed(m, n, iso(call), (x) => ({ ...x, worktree: tree.path })) }
  },
})
const edit = action({
  name: "edit",
  description: "replaces its title and about",
  subject: N,
  inputs: { title: { type: "string", kind: "line" }, about: { type: "string", kind: "markdown" } },
  update: (m: Model, { n, title, about }, call): Result =>
    title.trim() ? { model: changed(m, n, iso(call), (x) => ({ ...x, title: title.trim(), about: about.trim() })) } : { refused: "A ticket needs a title" },
})
const setPhase = action({
  name: "phase",
  description: "moves it to the phase, by name; empty for none",
  subject: N,
  inputs: TEXT,
  update: (m: Model, { n, text }, call): Result =>
    ({ model: changed(m, n, iso(call), ({ phase: _p, ...x }) => ({ ...x, ...(text.trim() && { phase: text.trim() }) })) }),
})

// Views

const HOW =
  "One record of this worktree's work, shared by every canvas tab of the worktree. A title; the brief, markdown, and now, at most " +
  "three short lines, each replaced whole by write; asks, decisions put to the person with their options, open until answered or withdrawn; tickets, each in a " +
  "phase or none, the phases in the order set by order, the rest as they first appear; notes, the markdown files of the worktree's notes/, each read whole at its path: its title the file's # heading, its summary the paragraph after it, its figures embedded from notes/figures/ as ![…](figures/NAME.html) or written in ```html figure blocks, each checked against the figure rules, what breaks them told; and the journal, " +
  "entries in order, each a headline and markdown behind it, where a ticket done or dropped and an ask answered are entered too. " +
  "A ticket is open, working, waiting on the person, done or dropped, and worked by main, this worktree's agent, or by a subagent's " +
  "worker in a worktree of its own. Its posts are one or two lines each, in order, by main, the worker or the person: post writes " +
  "as main, report as the worker, wait and done post their text as the ticket's worker, drop as main. Finished tickets, settled " +
  "asks and the journal are detail. A ticket's path has the rest: its posts, its worktree's branch and git state, and for a " +
  "subagent the commands its worker runs to report from any directory."

const section = (c: Canvas, s: SectionName) => ({ text: c.sections[s].text, ...(c.sections[s].updatedAt && { updatedAt: c.sections[s].updatedAt }) })
const row = (x: Ticket) => {
  const last = x.posts.at(-1)

  return {
    at: at(x.n),
    n: x.n,
    title: x.title,
    status: x.status,
    worker: x.worker,
    ...(x.phase && { phase: x.phase }),
    ...(x.worktree && { worktree: x.worktree }),
    ...(last && { last }),
    posts: x.posts.length,
  }
}
const RANK: Record<Status, number> = { waiting: 0, working: 1, open: 2, done: 3, dropped: 3 }
const ordered = (c: Canvas) =>
  [...c.tickets].sort((a, b) => RANK[a.status] - RANK[b.status] || (finished(a) ? b.order - a.order : a.order - b.order))

/** The session whose runtime serves this tab, as the shell started it: a worker names it to reach this tab from its own session. */
const SESSION = ((at) => (at < 0 ? undefined : process.argv[at + 1]))(process.argv.indexOf("--serve"))

/** The commands a subagent's worker runs, from any directory: this worktree's command, in the session of the tab that shows the canvas. */
function commands(n: number) {
  const bin = join(project(), ".baba/.state/bin/baba")
  const quoted = /^[\w./-]+$/.test(bin) ? bin : `'${bin.replaceAll("'", "'\"'\"'")}'`
  const here = `${quoted}${SESSION ? ` --session ${SESSION}` : ""} /canvas/tickets/${n}`

  return { report: `${here} report text="…"`, wait: `${here} wait text="…"`, done: `${here} done text="…"` }
}
const REPORT =
  "From any directory, each text one or two lines. They act in this tab's session, so they are refused once no canvas tab is open in it."

const menu = [
  { label: "Move", actions: ["start", "wait", "done", "drop", "reopen"] },
  { label: "Edit", actions: ["edit", "phase", "assign"] },
]
const askRow = (a: Ask) => ({
  at: `/asks/${a.n}`,
  n: a.n,
  question: a.question,
  options: a.options,
  ...(a.recommended !== undefined && { recommended: a.options[a.recommended] }),
  ...(a.context && { context: a.context }),
  createdAt: a.createdAt,
  ...(a.answer && { answer: a.answer }),
  ...(a.withdrawn && { withdrawn: a.withdrawn }),
})
const noteRow = (x: Shown) => ({ at: `/notes/${x.name}`, name: x.name, title: x.title, summary: x.summary, updatedAt: x.updatedAt, ...(x.problems.length && { problems: x.problems.length }) })
const entryRow = (e: Entry) => e
const tally = (c: Canvas) => Object.fromEntries((["done", "working", "waiting", "open", "dropped"] as Status[]).map((s) => [s, c.tickets.filter((t) => t.status === s).length]))

function whole(m: Model, x: Ticket) {
  const s = { n: x.n }
  const tree = x.worktree ? m.git?.trees.find((t) => same(t.path, x.worktree!)) : undefined
  const subagent = x.worker === "subagent"

  return {
    ...row(x),
    about: x.about,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    ...(x.worktree &&
      m.git && {
        git: tree
          ? { branch: tree.branch ?? "(detached)", ...(tree.dirty !== undefined && { dirty: tree.dirty }), ...(tree.ahead !== undefined && { ahead: tree.ahead }) }
          : { gone: "not a worktree of this repo any more" },
      }),
    posts: x.posts,
    ...(subagent && { report: { how: REPORT, ...commands(x.n) } }),
    menu,
    post: postMain.bind(s),
    ...(subagent && { report_: report.bind(s) }),
    ...((x.status === "open" || x.status === "waiting") && { start: start.bind(s) }),
    ...((x.status === "open" || x.status === "working") && { wait: wait.bind(s) }),
    ...(!finished(x) && { done: done.bind(s), drop: drop.bind(s) }),
    ...(finished(x) && { reopen: reopen.bind(s) }),
    ...(subagent && !finished(x) && { assign: assign.bind(s) }),
    edit: edit.bind(s),
    phase_: setPhase.bind(s),
  }
}

const actions = [
  title,
  write,
  add,
  put,
  arrange,
  log,
  answer,
  withdraw,
  postMain,
  report,
  start,
  wait,
  done,
  drop,
  reopen,
  assign,
  edit,
  setPhase,
]
const pages = view(actions, {
  "/": (m) => {
    const c = m.canvas

    return {
      title: c.title || "Canvas",
      how: HOW,
      brief: section(c, "brief"),
      now: section(c, "now"),
      progress: tally(c),
      phases: phases(c),
      asks: c.asks.map((a) => (settled(a) ? detail(askRow(a)) : askRow(a))),
      tickets: ordered(c).map((x) => (finished(x) ? detail(row(x)) : row(x))),
      notes: (m.notes ?? []).map(noteRow),
      journal: [...c.journal].reverse().map((e) => detail(entryRow(e))),
      title_: title.bind({}),
      write: write.bind({}),
      add: add.bind({}),
      ask: put.bind({}),
      ...(phases(c).length > 1 && { order: arrange.bind({}) }),
      log: log.bind({}),
    }
  },
  "/finished": (m) => ({ title: "Finished tickets", tickets: ordered(m.canvas).filter(finished).map(row) }),
  "/journal": (m) => ({ title: "Journal", journal: [...m.canvas.journal].reverse().map(entryRow) }),
  "/asks/:n": (m, { n }) => {
    const a = askOf(m.canvas, Number(n))

    return a && { ...askRow(a), ...(!settled(a) && { answer: answer.bind({ n: a.n }), withdraw: withdraw.bind({ n: a.n }) }) }
  },
  "/notes/:name": (m, { name }) => {
    const x = m.notes?.find((x) => x.name === name)

    return x && { ...noteRow(x), text: x.text, figures: x.figures, problems: x.problems }
  },
  "/tickets/:n": (m, { n }) => {
    const x = ticket(m.canvas, Number(n))

    return x && whole(m, x)
  },
})

// Events

/** A change made here, applied again to the record as it is now: a call no longer offered there, or refused, changes nothing. */
function replay(c: Canvas, message: Call | Event, git?: Git): Canvas | undefined {
  if (message.kind !== "call") return undefined
  const m: Model = { canvas: c, ...(git && { git }) }
  const seen = pages.view(m, message.path)

  if (!seen || typeof admit(seen, message.path, message.handle, message.args) === "string") return undefined
  const r = pages.update(m, message)

  return "refused" in r ? undefined : r.model.canvas
}

/** The canvas, with where its record is kept given: the worktree's file in the runtime, a temporary one in its specs. */
export function canvas(record: Store): Surface<Model, Event, Command> {
  return surface<Model, Event, Command>({
    description:
      "Plan this worktree's work and record its progress. The page shows the brief, current work, decisions, tickets and their posts, notes, and the journal. Tickets can track direct or delegated work.",
    init: () => ({ canvas: empty(), reading: true }),
    restore: (saved) => {
      const tab = saved as Partial<Model> | undefined

      return { canvas: (tab && asCanvas(tab.canvas)) || empty(), reading: true }
    },
    start: () => [{ kind: "open" }, { kind: "watch-git" }, { kind: "watch-notes" }],
    session: (c) => c.kind === "open" || c.kind === "watch-git" || c.kind === "watch-notes",
    update(m, message): Result {
      if (message.kind === "call") {
        const r = pages.update(m, message)

        if ("refused" in r) return r

        return { ...r, commands: [{ kind: "apply", message, ...(m.git && { git: m.git }) }, ...(r.commands ?? [])] }
      }
      if (message.kind === "heard") {
        const { reading: _r, trouble: _t, ...held } = m
        const kept = message.canvas.notes

        return { model: { ...held, canvas: message.canvas }, ...(kept.length && { commands: [{ kind: "export-notes", notes: kept }] }) }
      }
      if (message.kind === "watch-notes") {
        const notes = message.files.map((f) => show(f, message.figures))
        const before = new Set((m.notes ?? []).flatMap((x) => x.problems.map((p) => `${x.name}: ${p}`)))
        const fresh = notes.flatMap((x) => x.problems.map((p) => `${x.name}: ${p}`)).filter((p) => !before.has(p))

        return { model: { ...m, notes }, ...(fresh.length && { notices: fresh.map((p) => ({ text: `notes/${p}`, at: `/notes/${p.split(":")[0]}` })) }) }
      }
      if (message.kind === "watch-git") return { model: { ...m, git: message.git } }
      if (message.kind === "failed") {
        const kept = message.command === "open" || message.command === "save"

        return {
          model: kept ? { ...m, trouble: `${message.command}: ${message.error}` } : m,
          notices: [{ text: `The canvas's ${message.command} failed: ${message.error}`, highlight: true }],
        }
      }

      return { model: m }
    },
    view(m, path) {
      const seen = pages.view(m, path)

      if (!seen || path !== "/") return seen
      if (m.trouble) return { ...seen, broken: `the canvas cannot be kept: ${m.trouble}` }

      return m.reading ? { ...seen, reading: true } : seen
    },
    async run(c, send, signal) {
      if (c.kind === "open") return record.open((canvas) => send({ kind: "heard", canvas }), signal)
      if (c.kind === "apply") return record.apply((canvas) => replay(canvas, c.message, c.git))
      if (c.kind === "export-notes") {
        // Notes kept in the record before notes were files: each written once as a file, then taken out of the record.
        for (const x of c.notes) io.writeNote(notesDir(), fileOf(x))
        return record.apply((canvas) => (canvas.notes.length ? { ...canvas, notes: [] } : undefined))
      }
      if (c.kind === "watch-notes") {
        const dir = notesDir()
        let last = ""
        let again: ReturnType<typeof setTimeout> | undefined
        const read = () => {
          const got = io.readNotes(dir)
          const text = JSON.stringify(got)

          if (text !== last) send({ kind: "watch-notes", ...got })
          last = text
        }

        mkdirSync(dir, { recursive: true })
        read()
        const watcher = watch(dir, { recursive: true }, () => {
          clearTimeout(again)
          again = setTimeout(read, 80)
        })

        await new Promise((done) => signal.addEventListener("abort", done, { once: true }))
        clearTimeout(again)
        watcher.close()
        return
      }
      if (c.kind === "watch-git") {
        const dir = project()
        let last = ""
        let wake: (() => void) | undefined
        const common = await io.commonDir(dir)
        // A worktree added or removed changes the common directory's worktrees/: heard at once, and polled besides.
        const watchers: ReturnType<typeof watch>[] = []
        const follow = (dir: string, only?: string) => {
          try {
            watchers.push(watch(dir, (_, name) => (!only || name === only) && wake?.()))
          } catch {
            // Not there yet: the poll reads it.
          }
        }

        // The common directory says when worktrees/ is made, the first worktree added; worktrees/ says each one after.
        if (common) follow(common, "worktrees"), follow(join(common, "worktrees"))
        try {
          while (!signal.aborted) {
            const git = await io.git(dir)
            const text = JSON.stringify(git)

            if (text !== last) send({ kind: "watch-git", git })
            last = text
            await new Promise<void>((done) => {
              const t = setTimeout(finish, GIT_MS)

              function finish() {
                clearTimeout(t)
                wake = undefined
                signal.removeEventListener("abort", finish)
                done()
              }
              wake = () => setTimeout(finish, 300)
              signal.addEventListener("abort", finish, { once: true })
            })
          }
        } finally {
          for (const w of watchers) w.close()
        }
      }
    },
    failed: (c, error): Event => ({ kind: "failed", command: c.kind === "apply" ? "save" : c.kind, error }),
  })
}

export default canvas(kept(recordFile, () => fromQueues(dirname(dirname(recordFile())), SESSION)))
