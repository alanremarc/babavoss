// The canvas's rules, as stories: the homepage's sections, tickets moved along with their posts, a subagent's worktree
// assigned only where git lists it, and one record shared by tabs on the same file. Git is faked through `io`; one story
// reads a real repo with a worktree, made in a temporary directory.
import { afterAll, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isDetail, story, writeJsonFile } from "babavoss/core/index.ts"
import { asCanvas, empty, fileOf } from "../src/canvas.ts"
import { io, type Git } from "../src/io.ts"
import { store } from "../src/store.ts"
import { canvas, type Command, type Event, type Model } from "../src/surface.ts"

/** io as it reads for real, kept before any test fakes it. */
const original = { ...io }
const temp = mkdtempSync(join(tmpdir(), "canvas-spec-"))
let made = 0
/** A surface on a record file of its own. */
const fresh = (file = join(temp, `record-${++made}`, "canvas.json")) => ({ file, surface: canvas(store(() => file)) })

afterAll(() => rmSync(temp, { recursive: true, force: true }))
beforeEach(() => {
  io.git = async () => ({ here: "/work/babavoss", trees: [{ path: "/work/babavoss", branch: "main" }] })
  io.commonDir = async () => undefined
})

type World = ReturnType<typeof story<Model, Event, Command>>["world"]
const opening = (c: Command) => c.kind === "open"
const kind = (k: Command["kind"]) => (c: Command) => c.kind === k
/** The record as the tab first hears it: empty. */
const heard = (world: World) => world.send(opening, { kind: "heard", canvas: empty() })

test("a section written replaces what it held, stamped; the title names the canvas", async () => {
  const { agent, world } = story(fresh().surface)

  expect(agent.sees()).toMatchObject({ reading: true, title: "Canvas" })
  await heard(world)
  expect(agent.sees()).not.toHaveProperty("reading")

  expect(await agent.call("/", "title", { text: "Order export" })).toMatchObject({ outcome: "written" })
  expect(await agent.call("/", "write", { section: "now", text: "Reading the export code." })).toMatchObject({ outcome: "written" })
  expect(await agent.call("/", "write", { section: "now", text: "Writing the **CSV** writer." })).toMatchObject({ outcome: "written" })

  const seen = agent.sees() as { now: { text: string; updatedAt: string }; brief: object }

  expect(seen).toMatchObject({ title: "Order export", now: { text: "Writing the **CSV** writer." }, brief: { text: "" } })
  expect(Date.parse(seen.now.updatedAt)).toBeGreaterThan(0)
  expect(seen.brief).not.toHaveProperty("updatedAt")
  expect(await agent.call("/", "write", { section: "agenda", text: "x" })).toMatchObject({ outcome: "refused" })

  // Now is a glance: a longer text is refused, and the brief takes any length.
  expect(await agent.call("/", "write", { section: "now", text: "one\ntwo\nthree\nfour" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("belongs in a note") })
  expect(await agent.call("/", "write", { section: "now", text: "x".repeat(400) })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "write", { section: "brief", text: "x\n".repeat(40) })).toMatchObject({ outcome: "written" })
})

test("an ask puts a decision to the person, highlighted; the person answers it on the page, and the answer is in the journal", async () => {
  const { agent, person, world } = story(fresh().surface)

  await heard(world)
  expect(await agent.call("/", "ask", { question: "Delimiter?", options: "comma", context: "" })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "ask", { question: "Delimiter?", options: "*comma | *semicolon", context: "" })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "ask", { question: "Delimiter?", options: "comma | *semicolon", context: "Excel in **DE** reads `;`." })).toMatchObject({ outcome: "written" })
  expect(person.noticed()).toEqual(["highlight: Asked: Delimiter?"])
  expect(agent.sees()).toMatchObject({ asks: [{ at: "/asks/1", question: "Delimiter?", options: ["comma", "semicolon"], recommended: "semicolon", context: "Excel in **DE** reads `;`." }] })

  expect(await person.call("/asks/1", "answer", { n: 1, choice: "semicolon" })).toMatchObject({ outcome: "written" })
  expect(agent.noticed()).toEqual(['The person answered "Delimiter?": semicolon'])
  expect(agent.sees("/asks/1")).toMatchObject({ answer: { text: "semicolon", by: "person" } })
  expect(agent.offered("/asks/1")).not.toContain("answer")
  expect(agent.sees("/journal")).toMatchObject({ journal: [{ by: "person", text: "Decided: Delimiter? → semicolon" }] })

  // A settled ask is detail at /, and one withdrawn is settled too.
  await agent.call("/", "ask", { question: "Header row?", options: "yes | no", context: "" })
  await agent.call("/asks/2", "withdraw", { n: 2, text: "The format fixes it." })
  expect(agent.sees("/asks/2")).toMatchObject({ withdrawn: "The format fixes it." })
})

test("tickets are in phases, in the order the phases first appear; done and dropped tickets are entered in the journal", async () => {
  const { agent, world } = story(fresh().surface)

  await heard(world)
  await agent.call("/", "add", { title: "Read the code", about: "", worker: "main", phase: "Study" })
  await agent.call("/", "add", { title: "Write the design", about: "", worker: "main", phase: "Design" })
  await agent.call("/", "add", { title: "Measure", about: "", worker: "main", phase: "Study" })
  await agent.call("/", "add", { title: "Loose end", about: "", worker: "main", phase: "" })
  expect(agent.sees()).toMatchObject({ phases: ["Study", "Design"], progress: { open: 4, done: 0 } })
  expect(agent.sees("/tickets/4")).not.toHaveProperty("phase")

  await agent.call("/tickets/4", "phase", { n: 4, text: "Ship" })
  expect(agent.sees()).toMatchObject({ phases: ["Study", "Design", "Ship"] })
  expect(await agent.call("/", "order", { phases: "Ship | Later" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("No ticket is in Later") })
  expect(await agent.call("/", "order", { phases: "Ship | Study" })).toMatchObject({ outcome: "written" })
  expect(agent.sees()).toMatchObject({ phases: ["Ship", "Study", "Design"] })
  await agent.call("/tickets/1", "done", { n: 1, text: "Five gaps found." })
  await agent.call("/tickets/3", "drop", { n: 3, text: "No access to the data." })
  expect(agent.sees()).toMatchObject({ progress: { done: 1, dropped: 1, open: 2 } })
  expect(agent.sees("/journal")).toMatchObject({
    journal: [
      { by: "main", text: "Dropped: Measure\n\nNo access to the data." },
      { by: "main", text: "Done: Read the code\n\nFive gaps found." },
    ],
  })
})

test("the journal takes entries with a short headline", async () => {
  const { agent, world } = story(fresh().surface)

  await heard(world)
  expect(await agent.call("/", "log", { text: "Design proposed\n\nSix layers, four decisions." })).toMatchObject({ outcome: "written" })
  expect(await agent.call("/", "log", { text: "x".repeat(121) })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "log", { text: "  " })).toMatchObject({ outcome: "refused" })
  expect(agent.sees("/journal")).toMatchObject({ journal: [{ text: "Design proposed\n\nSix layers, four decisions." }] })
})

const notesRead = (files: { name: string; text: string }[], figures: Record<string, string> = {}): Event => ({
  kind: "watch-notes",
  files: files.map((f) => ({ ...f, updatedAt: "2026-11-19T10:00:00.000Z" })),
  figures,
})

test("notes are the worktree's files: the title is the # heading, the summary the paragraph after it, figures embedded from their files", async () => {
  const { agent, world } = story(fresh().surface)

  await heard(world)
  expect(agent.offered()).not.toContain("note")
  await world.send(
    kind("watch-notes"),
    notesRead([{ name: "design", text: "# Design\n\nTriage, then layered dedup.\n\n## Layers\n\n![flow](figures/flow.html)\n" }], {
      "figures/flow.html": '<style>.n{background:var(--card)}</style><div class="n">a → b</div>',
    }),
  )
  expect(agent.sees()).toMatchObject({ notes: [{ at: "/notes/design", title: "Design", summary: "Triage, then layered dedup." }] })
  expect(agent.sees("/notes/design")).toMatchObject({
    text: "## Layers\n\n![flow](figures/flow.html)",
    figures: { "figures/flow.html": expect.stringContaining("a → b") },
    problems: [],
  })

  // A note without a heading takes its file's name; a file removed leaves the canvas.
  await world.send(kind("watch-notes"), notesRead([{ name: "loose", text: "## Only a section" }]))
  expect(agent.sees("/notes/loose")).toMatchObject({ title: "loose", summary: "", text: "## Only a section" })
  expect(agent.sees("/notes/design")).toBeUndefined()
})

test("a figure that breaks the rules is told once, and shown on its note, until it is fixed", async () => {
  const { agent, world } = story(fresh().surface)

  await heard(world)
  agent.noticed()
  const note = { name: "flow", text: '# Flow\n\n![a](figures/a.html)\n\n![gone](figures/gone.html)\n\n```html figure\n<div style="height:50vh">x</div>\n```' }

  await world.send(kind("watch-notes"), notesRead([note], { "figures/a.html": '<style>.n{color:#fff}</style><script src="https://cdn.example/x.js"></script>' }))
  expect(agent.noticed()).toEqual([
    "notes/flow: figures/a.html uses a fixed colour (#fff); use the theme variables",
    "notes/flow: figures/a.html loads something from outside; keep it self-contained",
    "notes/flow: figures/gone.html is not there",
    "notes/flow: figure 1 in the text uses vh units; let the content set the height",
  ])
  expect(agent.sees()).toMatchObject({ notes: [{ problems: 4 }] })
  expect(agent.sees("/notes/flow")).toMatchObject({ figures: { "figures/gone.html": null } })

  // The same problems read again are not told again; a fixed figure leaves the list.
  await world.send(kind("watch-notes"), notesRead([note], { "figures/a.html": "<style>.n{color:var(--foreground)}</style>" }))
  expect(agent.noticed()).toEqual([])
  expect((agent.sees("/notes/flow") as { problems: string[] }).problems).toHaveLength(2)
})

test("a record kept before notes were files has its agenda written out as a note file, then taken out of the record", async () => {
  const old = { ...empty(), title: "Old", sections: { now: { text: "Now." }, brief: { text: "" }, agenda: { text: "1. a", updatedAt: "2026-11-19T10:00:00.000Z" }, recap: { text: "" } } }
  const { asks: _a, notes: _n, journal: _j, nextAsk: _x, nextNote: _y, ...before } = old
  const { agent, world } = story(fresh().surface)

  await world.send(opening, { kind: "heard", canvas: asCanvas(before)! })
  expect(agent.sees()).toMatchObject({ title: "Old", now: { text: "Now." }, asks: [], journal: [] })
  expect(world.commands().find(kind("export-notes"))).toMatchObject({ notes: [{ title: "Agenda", text: "1. a" }] })
  expect(fileOf(asCanvas(before)!.notes[0]!)).toEqual({
    name: "agenda",
    text: "# Agenda\n\nThe agenda as it was written before notes\n\n1. a\n",
    updatedAt: "2026-11-19T10:00:00.000Z",
  })
})

test("a ticket moves from open through working and waiting to done, the wait highlighted for the person, and is then detail", async () => {
  const { agent, person, world } = story(fresh().surface)

  await heard(world)
  expect(await agent.call("/", "add", { title: "CSV writer", about: "Writes the **orders** as CSV.", worker: "main", phase: "" })).toMatchObject({ outcome: "written" })
  expect(agent.sees("/tickets/1")).toMatchObject({ n: 1, title: "CSV writer", status: "open", worker: "main", about: "Writes the **orders** as CSV.", posts: [] })
  expect(agent.offered("/tickets/1")).toEqual(expect.arrayContaining(["post", "start", "wait", "done", "drop", "edit"]))
  expect(agent.offered("/tickets/1")).not.toContain("report")
  expect(agent.offered("/tickets/1")).not.toContain("assign")

  await agent.call("/tickets/1", "start", { n: 1 })
  expect(agent.sees("/tickets/1")).toMatchObject({ status: "working" })
  expect(agent.offered("/tickets/1")).not.toContain("start")

  person.noticed()
  await agent.call("/tickets/1", "wait", { n: 1, text: "Which delimiter: comma or semicolon?" })
  expect(agent.sees("/tickets/1")).toMatchObject({ status: "waiting", posts: [{ by: "main", text: "Which delimiter: comma or semicolon?" }] })
  expect(person.noticed()).toEqual(["highlight: Ticket 1, CSV writer, waits on the person: Which delimiter: comma or semicolon?"])

  await person.call("/tickets/1", "post", { n: 1, text: "Semicolon." })
  await agent.call("/tickets/1", "start", { n: 1 })
  await agent.call("/tickets/1", "done", { n: 1, text: "Writer merged, semicolon-delimited." })
  expect(person.noticed()).toContain("Ticket 1, CSV writer, is done: Writer merged, semicolon-delimited.")
  expect(agent.sees("/tickets/1")).toMatchObject({
    status: "done",
    posts: [{ by: "main" }, { by: "person", text: "Semicolon." }, { by: "main", text: "Writer merged, semicolon-delimited." }],
  })
  expect(agent.offered("/tickets/1")).toEqual(expect.arrayContaining(["reopen", "post"]))
  expect(agent.offered("/tickets/1")).not.toContain("done")

  await agent.call("/", "add", { title: "Export button", about: "", worker: "main", phase: "" })
  expect((agent.sees() as { tickets: { n: number }[] }).tickets.map((t) => t.n)).toEqual([2, 1])

  expect(agent.noticed()).toContain("Ticket 1, CSV writer: the person posts: Semicolon.")
  await agent.call("/tickets/2", "drop", { n: 2, text: "Out of scope." })
  // The caller is not told back what its own call gave.
  expect(agent.noticed()).toEqual([])
  expect(person.noticed()).toContain("Ticket 2, Export button, is dropped: Out of scope.")
  await agent.call("/tickets/2", "reopen", { n: 2 })
  expect(agent.sees("/tickets/2")).toMatchObject({ status: "open" })
})

test("posts say who wrote them: main posts, the subagent's worker reports, the person on the page; each one or two lines", async () => {
  const { agent, person, world } = story(fresh().surface)

  await heard(world)
  await agent.call("/", "add", { title: "Price rounding", about: "", worker: "subagent", phase: "" })
  await agent.call("/tickets/1", "post", { n: 1, text: "Handed to a worker." })
  expect(await agent.call("/tickets/1", "report", { n: 1, text: "Found the rounding in prices.ts.\nWriting a test." })).toMatchObject({ outcome: "written" })
  expect(await agent.call("/tickets/1", "report", { n: 1, text: "one\ntwo\nthree" })).toEqual({ outcome: "refused", reason: "A post is one or two lines" })
  expect(await agent.call("/tickets/1", "post", { n: 1, text: "  " })).toMatchObject({ outcome: "refused" })
  await person.call("/tickets/1", "post", { n: 1, text: "Keep it to orders." })
  await agent.call("/tickets/1", "done", { n: 1, text: "Rounded half up, tested." })

  expect(agent.sees("/tickets/1")).toMatchObject({
    posts: [
      { by: "main", text: "Handed to a worker." },
      { by: "worker", text: "Found the rounding in prices.ts.\nWriting a test." },
      { by: "person", text: "Keep it to orders." },
      { by: "worker", text: "Rounded half up, tested." },
    ],
  })
  expect(person.noticed()).toContain("Ticket 1, Price rounding: the worker reports: Found the rounding in prices.ts.\nWriting a test.")
  expect(agent.sees()).toMatchObject({ tickets: [{ n: 1, posts: 4, last: { by: "worker", text: "Rounded half up, tested." } }] })
})

test("a subagent's ticket gives its worker the commands that reach this canvas from any directory", async () => {
  process.env.CANVAS_PROJECT = "/work/babavoss"
  try {
    const { agent, world } = story(fresh().surface)

    await heard(world)
    await agent.call("/", "add", { title: "Price rounding", about: "", worker: "subagent", phase: "" })
    expect(agent.sees("/tickets/1")).toMatchObject({
      report: {
        report: '/work/babavoss/.baba/.state/bin/baba /canvas/tickets/1 report text="…"',
        wait: '/work/babavoss/.baba/.state/bin/baba /canvas/tickets/1 wait text="…"',
        done: '/work/babavoss/.baba/.state/bin/baba /canvas/tickets/1 done text="…"',
      },
    })
  } finally {
    delete process.env.CANVAS_PROJECT
  }
})

/** Runs git in `cwd`, as a test sets a repo up. */
const sh = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } })

  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
}

test("a subagent's worktree is assigned only where git lists it as another worktree of this repo, and its git state is shown", async () => {
  const repo = join(temp, "repo")
  const tree = join(temp, "repo-worker")

  Bun.spawnSync(["mkdir", "-p", repo])
  sh(repo, "init", "-q", "-b", "main")
  writeFileSync(join(repo, "a.txt"), "a\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "first")
  sh(repo, "worktree", "add", "-q", "-b", "fix/price-rounding", tree)
  const { agent, world } = story(fresh().surface)

  await heard(world)
  await agent.call("/", "add", { title: "Price rounding", about: "", worker: "subagent", phase: "" })
  expect(await agent.call("/tickets/1", "assign", { n: 1, worktree: tree })).toEqual({ outcome: "refused", reason: "The repo's worktrees have not been read yet" })

  const read = async () => world.send(kind("watch-git"), { kind: "watch-git", git: await readReal(repo) })

  await read()
  expect(await agent.call("/tickets/1", "assign", { n: 1, worktree: join(temp, "elsewhere") })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("is not a worktree of this repo") })
  expect(await agent.call("/tickets/1", "assign", { n: 1, worktree: repo })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("is this worktree") })
  expect(await agent.call("/tickets/1", "assign", { n: 1, worktree: "repo-worker" })).toEqual({ outcome: "refused", reason: "Give the worktree's absolute path" })
  expect(await agent.call("/tickets/1", "assign", { n: 1, worktree: `${tree}/` })).toMatchObject({ outcome: "written" })
  expect(agent.sees("/tickets/1")).toMatchObject({ worktree: expect.stringContaining("repo-worker"), git: { branch: "fix/price-rounding", dirty: 0, ahead: 0 } })

  writeFileSync(join(tree, "b.txt"), "b\n")
  sh(tree, "add", ".")
  sh(tree, "commit", "-qm", "round half up")
  writeFileSync(join(tree, "c.txt"), "c\n")
  await read()
  expect(agent.sees("/tickets/1")).toMatchObject({ git: { branch: "fix/price-rounding", dirty: 1, ahead: 1 } })
  expect(await agent.call("/", "add", { title: "Main's own", about: "", worker: "main", phase: "" })).toMatchObject({ outcome: "written" })
  expect(agent.offered("/tickets/2")).not.toContain("assign")
})

/** git as io reads it, whatever a test put in io's place. */
const readReal = async (dir: string): Promise<Git> => {
  const saved = { ...io }

  Object.assign(io, original)
  try {
    return await io.git(dir)
  } finally {
    Object.assign(io, saved)
  }
}

/** Waits for what `ok` checks, as a file's change is heard a little later. */
async function until(ok: () => boolean, ms = 3000) {
  for (const end = Date.now() + ms; !ok(); await Bun.sleep(25)) if (Date.now() > end) throw new Error("not heard in time")
}

test("a finished ticket is detail at /: read there, left out of the present", () => {
  const s = fresh().surface
  const call = (m: Model, path: string, handle: string, args: Record<string, unknown>) =>
    (s.update(m, { kind: "call", path, handle, args: args as never, actor: "agent", t: 1 }) as { model: Model }).model
  let m = (s.update(s.init(), { kind: "heard", canvas: empty() }) as { model: Model }).model

  m = call(m, "/", "add", { title: "First", about: "", worker: "main", phase: "" })
  m = call(m, "/", "add", { title: "Second", about: "", worker: "main", phase: "" })
  m = call(m, "/tickets/1", "drop", { n: 1, text: "Not needed." })
  const rows = (s.view(m, "/") as { tickets: unknown[] }).tickets

  expect(rows.map((r) => isDetail(r as never))).toEqual([false, true])
})

test("two tabs on one record share it: a change in either, or a write from outside, is heard in the other", async () => {
  // The notes are watched for real too: in a worktree of the test's own.
  process.env.CANVAS_PROJECT = join(temp, "tabs-project")
  const { file } = fresh()
  const one = story(canvas(store(() => file)), { effects: "real" })
  const two = story(canvas(store(() => file)), { effects: "real" })

  await until(() => !("reading" in (one.agent.sees() as object)) && !("reading" in (two.agent.sees() as object)))
  expect(await one.agent.call("/", "title", { text: "Shared" })).toMatchObject({ outcome: "written" })
  await one.world.idle()
  await until(() => (two.agent.sees() as { title: string }).title === "Shared")

  expect(await two.agent.call("/", "add", { title: "From the other tab", about: "", worker: "subagent", phase: "" })).toMatchObject({ outcome: "written" })
  await until(() => (one.agent.sees() as { tickets: unknown[] }).tickets.length === 1)
  expect(await one.agent.call("/tickets/1", "report", { n: 1, text: "Reported from one." })).toMatchObject({ outcome: "written" })
  await until(() => (two.agent.sees("/tickets/1") as { posts: unknown[] }).posts.length === 1)

  // Another runtime writes the file whole: both hear it.
  writeJsonFile(file, { ...empty(), title: "Written outside" })
  await until(() => (one.agent.sees() as { title: string }).title === "Written outside" && (two.agent.sees() as { title: string }).title === "Written outside")

  // A note file written in the worktree is heard by both.
  mkdirSync(join(temp, "tabs-project", "notes"), { recursive: true })
  writeFileSync(join(temp, "tabs-project", "notes", "plan.md"), "# Plan\n\nThe short version.\n")
  await until(() => (one.agent.sees() as { notes: { title: string }[] }).notes[0]?.title === "Plan" && (two.agent.sees() as { notes: unknown[] }).notes.length === 1)
  delete process.env.CANVAS_PROJECT
})
