// The lab's rules, as stories, with its outside faked: the framework's fake harness, whose stream the story emits as Claude
// Code's would be read, and a fake of where runs live, so nothing is copied, started or written for real.
import { expect, test } from "bun:test"
import { story, type Json } from "babavoss/core/index.ts"
import { fakeHarness, type HarnessEvent } from "babavoss/core/harness/index.ts"
import type { Heard, Made, Runs } from "../src/runs.ts"
import { END_MOVE, lab, type Model } from "../src/surface.ts"

const DIR = "/repo/.babavoss/lab/runs/r1"
const MADE: Omit<Made, "dir"> = {
  project: `${DIR}/project`,
  home: `${DIR}/home`,
  checkout: { from: "/repo", commit: "0123456789abcdef", dirty: ["framework/core/session.ts", "notes.md"] },
  ms: 700,
  page: "http://127.0.0.1:5555/",
}

/** Where runs live, faked: what was made, called and written is kept; records are what the story says was kept before. */
function place(kept: Json[] = []) {
  const world = {
    made: [] as { id: string; from: string; session: string }[],
    acts: [] as Json[],
    closed: [] as string[],
    cleared: [] as string[],
    forgotten: [] as string[],
    swept: [] as { id: string; spared: boolean }[],
    /** The root under test's activity, as its /activity has it. */
    activity: [] as Heard[],
    /** Something done on the page under test, as its activity keeps it, with the name its call was given where it was given one. */
    did: (who: string, at: string, what: string, id?: string) =>
      void world.activity.push({ n: world.activity.length + 1, when: Date.now(), who, surface: "queue", at, what, ...(id && { id }) }),
    /** What the person does on the page under test while the lab's act is answered, as their click at that moment would. */
    meanwhile: undefined as (() => void) | undefined,
    records: new Map<string, Json>(kept.map((r) => [(r as { id: string }).id, r])),
    fail: "",
  }
  const runs: Runs = {
    async make(id, from, session) {
      if (world.fail) throw new Error(world.fail)
      world.made.push({ id, from, session })

      return { dir: DIR, ...MADE }
    },
    async act(_project, _home, _session, id, at, handle, args) {
      world.acts.push({ at, handle, args })
      world.meanwhile?.()
      if (handle === "approve") world.did("person", at, `approve n=${(args as { n?: number }).n}`, id)

      return handle === "approve" ? { ok: true, text: `written: ${handle} at ${at}` } : { ok: false, text: "refused: approve is offered" }
    },
    activity: async (_project, _session, after) => world.activity.filter((e) => e.n > after),
    async look(_project, _home, _session, at) {
      world.acts.push({ at })

      return { ok: true, text: '{ "title": "Queue" }' }
    },
    async close(project) {
      world.closed.push(project)

      return " M notes.md"
    },
    clear: (dir) => void world.cleared.push(dir),
    forget(id) {
      world.forgotten.push(id)
      world.records.delete(id)
    },
    // As where runs live has it, a closed run has nothing left to clear.
    async sweep(spared) {
      const held = [...world.records].filter(([, r]) => !["closed", "cleared"].includes((r as { status: string }).status))

      world.swept = held.map(([id, r]) => ({ id, spared: spared(id, r) }))

      return world.swept.filter((r) => !r.spared).map((r) => r.id)
    },
    record: (_dir, run) => void world.records.set((run as { id: string }).id, run),
    list: () => [...world.records.values()],
  }

  return Object.assign(world, { runs })
}

/** Waits until `check` holds, as the run's events arrive. */
async function until(check: () => boolean, ms = 2000) {
  for (const end = Date.now() + ms; !check(); await Bun.sleep(5)) if (Date.now() > end) throw new Error("timed out")
}

type Row = { at: string; i: number; kind: string; title: string; size: number; line: string }
type Root = { status: string; run: string; entries?: number; recent?: Row[]; tokens: Json; cost: number; page?: string; turn?: { since: number } }
const root = (s: { sees: (path?: string) => unknown }) => s.sees() as Root

const replay = (text: string): HarnessEvent => ({ kind: "message", text })
const request = (id: string, context = 10_010) => ({ id, context })
const turn = (total: number): HarnessEvent => ({
  kind: "turn",
  ok: true,
  text: "",
  tokens: { input: 20, cache_write: 2100, cache_read: 16_000, output: 40 },
  total,
  ms: 4200,
  calls: 2,
})

async function started(kept: Json[] = []) {
  const harness = fakeHarness()
  const where = place(kept)
  const s = story(lab(harness.harness, where.runs, 5), { effects: "real" })

  expect(await s.agent.call("/", "start", { model: "haiku" })).toMatchObject({ outcome: "written" })
  await until(() => root(s.agent).status === "idle")

  return { ...s, harness, where }
}

test("a run starts on a copy of this repository, with its page from the start and the agent under test in a home of its own", async () => {
  const { agent, harness, where } = await started()

  expect(where.made).toEqual([{ id: expect.any(String), from: "", session: expect.any(String) }])
  expect(harness.homes).toEqual([MADE.home])
  expect(harness.started).toEqual([{ project: MADE.project, home: MADE.home, session: where.made[0]!.session, model: "haiku", budget: 0.5 }])
  expect(agent.sees()).toMatchObject({
    status: "idle",
    run: where.made[0]!.id,
    checkout: "/repo",
    commit: "0123456789",
    uncommitted: 2,
    project: MADE.project,
    page: MADE.page,
    entries: 1,
    recent: [{ kind: "note", title: `run ${where.made[0]!.id} made` }],
  })
  expect(agent.sees("/entries/1")).toMatchObject({ text: expect.stringContaining("notes.md") })
  expect(agent.sees("/entries/1")).toMatchObject({ text: expect.stringContaining("login: a fake login") })
  expect(agent.sees("/entries/1")).toMatchObject({ text: expect.stringContaining("left out: .baba/surfaces/lab, so the run cannot start runs of its own") })
  expect(agent.offered()).toEqual(["say", "end_move", "act", "look", "close"])
  expect(where.records.get(where.made[0]!.id)).toMatchObject({ status: "idle", entries: [{ kind: "note" }] })
})

test("another checkout is started from by its path", async () => {
  const harness = fakeHarness()
  const where = place()
  const { agent } = story(lab(harness.harness, where.runs), { effects: "real" })

  expect(await agent.call("/", "start_from", { model: "haiku", from: " " })).toEqual({ outcome: "refused", reason: "from is a checkout's path" })
  await agent.call("/", "start_from", { model: "haiku", from: "/work/tree" })
  await until(() => root(agent).status === "idle")
  expect(where.made[0]).toMatchObject({ from: "/work/tree" })
})

test("a checkout that cannot be copied ends the run, saying why", async () => {
  const harness = fakeHarness()
  const where = place()
  const { agent } = story(lab(harness.harness, where.runs), { effects: "real" })

  where.fail = "/nowhere is not the top of a git checkout"
  await agent.call("/", "start_from", { model: "haiku", from: "/nowhere" })
  await until(() => root(agent).status === "ended")
  expect(agent.sees()).toMatchObject({ ended: "the run could not go on: /nowhere is not the top of a git checkout", checkout: "/nowhere" })
  expect(agent.offered()).toEqual(["start", "start_from"])
})

test("while a turn runs the root stands still, so a wait ends with the turn; then the turn's entries are read since where it began", async () => {
  const { agent, harness } = await started()
  const present = "baba's words\nThe root of .baba/ was started for this session, and answered:\npage: http://127.0.0.1:5555"
  const answer = 'title: "baba"\nsurfaces: name\tdescription\n"queue"\t"Keep the work"'

  expect(await agent.call("/", "say", { text: "What surfaces are there?" })).toMatchObject({ outcome: "written" })
  expect(harness.told).toEqual(["What surfaces are there?"])

  const before = JSON.stringify(agent.sees())

  harness.emit(
    { kind: "injected", event: "SessionStart", text: present },
    replay("What surfaces are there?"),
    { kind: "call", id: "t1", tool: "Bash", input: ".babavoss/bin/baba /", word: true, request: request("m1") },
    { kind: "result", id: "t1", text: answer },
    { kind: "injected", event: "PostToolUse", text: "What changed: tabs.1.title" }
  )
  await until(() => (agent.sees("/entries") as { entries: Row[] }).entries.length === 5)
  expect(JSON.stringify(agent.sees())).toBe(before)
  expect(agent.sees()).toMatchObject({ status: "working", turn: { since: 1, at: "/entries/since/1" } })
  expect(agent.sees()).not.toHaveProperty("recent")

  harness.emit({ kind: "reply", text: "There is one: queue.", request: request("m2", 10_510) }, turn(0.0042))
  await until(() => root(agent).status === "idle")
  expect(agent.sees()).toMatchObject({ entries: 7, last_turn: { at: "/entries/since/1" }, turns: 1, cost: 0.0042 })

  const rows = (agent.sees("/entries/since/1") as { entries: Row[] }).entries

  expect(rows.map((r) => [r.kind, r.size])).toEqual([
    ["hook", present.length],
    ["message", 24],
    ["word", answer.length],
    ["hook", 26],
    ["reply", 20],
    ["turn", 0],
  ])
  expect(agent.sees(rows[0]!.at)).toMatchObject({ kind: "hook", title: "SessionStart", text: present, size: present.length })
  expect(agent.sees(rows[1]!.at)).toMatchObject({ kind: "message", title: "the developing agent", text: "What surfaces are there?" })
  expect(agent.sees(rows[2]!.at)).toMatchObject({ kind: "word", call: ".babavoss/bin/baba /", text: answer, pending: false, context: 10_010, growth: 10_010 })
  expect(agent.sees(rows[4]!.at)).toMatchObject({ kind: "reply", context: 10_510, growth: 500 })
  expect(agent.sees(rows[5]!.at)).toMatchObject({
    kind: "turn",
    tokens: { input: 20, cache_write: 2100, cache_read: 16_000, output: 40 },
    cost: 0.0042,
    calls: 2,
    ms: 4200,
  })
  expect((agent.sees("/injected") as { injected: { title: string; text: string }[] }).injected.map((e) => e.title)).toEqual(["SessionStart", "PostToolUse"])
  expect((agent.sees("/injected/since/3") as { injected: Json[] }).injected).toEqual([expect.objectContaining({ text: "What changed: tabs.1.title" })])
})

test("a run says which hooks were heard, one that added nothing among them; a turn that ends with none heard says so plainly, once", async () => {
  const told = await started()

  expect(told.agent.sees()).toMatchObject({ hooks: "none heard yet" })
  await told.agent.call("/", "say", { text: "Hi" })
  told.harness.emit({ kind: "injected", event: "SessionStart", text: "baba's words" }, replay("Hi"), { kind: "hook", event: "UserPromptSubmit" }, turn(0.001))
  await until(() => root(told.agent).status === "idle")
  expect(told.agent.sees()).toMatchObject({ hooks: ["SessionStart", "UserPromptSubmit"] })
  expect((told.agent.sees("/entries") as { entries: Row[] }).entries.map((r) => r.title)).not.toContain("no hook heard")

  // A run whose harness ran no hook: the agent under test was never told of the surfaces, and the run does not pass for one that was.
  const silent = await started()

  for (const text of ["Hi", "Again"]) {
    await silent.agent.call("/", "say", { text })
    silent.harness.emit(replay(text), { kind: "reply", text: "Hello.", request: request(text) }, turn(0.001))
    await until(() => root(silent.agent).status === "idle")
  }

  const rows = (silent.agent.sees("/entries") as { entries: Row[] }).entries
  const note = rows.filter((r) => r.title === "no hook heard")

  expect(silent.agent.sees()).toMatchObject({ hooks: "no hook heard: the agent under test was told nothing by baba's hooks" })
  expect(note).toHaveLength(1)
  expect(rows.indexOf(note[0]!)).toBe(rows.findIndex((r) => r.kind === "turn") + 1)
  expect(silent.agent.sees(note[0]!.at)).toMatchObject({ kind: "note", error: true, text: expect.stringContaining("told nothing by baba's hooks") })
  expect(silent.where.records.get(silent.where.made[0]!.id)).toMatchObject({ hooks: [], entries: expect.arrayContaining([expect.objectContaining({ title: "no hook heard" })]) })
})

test("a second turn adds its cost; the run's totals are the harness's", async () => {
  const { agent, harness } = await started()

  await agent.call("/", "say", { text: "Hi" })
  harness.emit({ kind: "hook", event: "UserPromptSubmit" }, turn(0.0042))
  await until(() => root(agent).status === "idle")
  await agent.call("/", "say", { text: "Again" })
  harness.emit(turn(0.0062))
  await until(() => root(agent).status === "idle")
  expect(agent.sees("/entries/3")).toMatchObject({ kind: "turn", title: "turn 2", cost: expect.closeTo(0.002) })
  expect(agent.sees()).toMatchObject({ turns: 2, cost: 0.0062, tokens: { input: 40, output: 80 } })
})

test("the developing agent acts on the page under test as the person, and the person sees it on the timeline", async () => {
  const { agent, where } = await started()

  expect(await agent.call("/", "act", { at: "/tabs/1", handle: "approve", args: "{nope" })).toEqual({
    outcome: "refused",
    reason: "args is a JSON object, such as {}",
  })
  expect(await agent.call("/", "look", { at: "/tabs/1" })).toMatchObject({ outcome: "written" })
  expect(await agent.call("/", "act", { at: "/tabs/1", handle: "approve", args: '{"n":1}' })).toMatchObject({ outcome: "written" })
  await until(() => where.acts.length === 2 && !(agent.sees("/entries/3") as { pending?: boolean }).pending)
  expect(where.acts).toEqual([{ at: "/tabs/1" }, { at: "/tabs/1", handle: "approve", args: { n: 1 } }])
  expect(agent.sees("/entries/2")).toMatchObject({ kind: "act", title: "the developing agent, as the person: look at /tabs/1", text: '{ "title": "Queue" }' })
  expect(agent.sees("/entries/3")).toMatchObject({
    kind: "act",
    title: "the developing agent, as the person: approve at /tabs/1",
    call: 'approve {"n":1} at /tabs/1',
    text: "written: approve at /tabs/1",
    pending: false,
  })

  await agent.call("/", "act", { at: "/tabs/1", handle: "drop", args: "{}" })
  await until(() => (agent.sees("/entries/4") as { pending?: boolean } | undefined)?.pending === false)
  expect(agent.sees("/entries/4")).toMatchObject({ text: "refused: approve is offered", error: true })
})

test("the person ends their move with a message, and stop interrupts the turn", async () => {
  const { person, harness } = await started()

  expect(await person.call("/", "end_move", {})).toMatchObject({ outcome: "written" })
  expect(person.offered()).toEqual(["say", "end_move", "act", "look", "stop", "close"])
  await person.call("/", "stop", {})
  await until(() => harness.told.length === 2)
  expect(harness.told).toEqual([END_MOVE, "stop"])
  harness.emit(replay(END_MOVE))
  await until(() => (person.sees("/entries") as { entries: Row[] }).entries.length === 2)
  expect(person.sees("/entries/2")).toMatchObject({ kind: "message", title: "the person" })
})

test("a message is refused while no run is up", async () => {
  const { agent } = story(lab(fakeHarness().harness, place().runs), { effects: "real" })

  expect(agent.sees()).toMatchObject({ status: "no run", runs: { count: 0 } })
  expect(agent.sees("/entries")).toEqual({ run: null, entries: [] })
  expect(agent.sees("/injected")).toEqual({ run: null, injected: [] })
  expect(agent.offered()).toEqual(["start", "start_from"])
  expect(await agent.call("/", "say", { text: "hello" })).toMatchObject({ outcome: "refused" })
  expect(await agent.call("/", "start", { model: "gpt" })).toEqual({ outcome: "refused", reason: "model is one of haiku, sonnet, opus" })
})

test("close ends the process, takes back the login, deletes the project and home and keeps the record, with what was left changed", async () => {
  const { agent, harness, where } = await started()
  const id = where.made[0]!.id

  await agent.call("/", "close", {})
  await until(() => root(agent).status === "closed")
  expect(harness.told).toEqual(["end"])
  expect(where.closed).toEqual([MADE.project])
  expect(harness.released).toEqual([MADE.home])
  expect(where.cleared).toEqual([DIR])
  expect(agent.offered()).toEqual(["start", "start_from"])
  expect(agent.sees()).not.toHaveProperty("project")
  expect((root(agent).recent ?? []).map((r) => r.title)).toEqual(expect.arrayContaining(["closed", "the project at close"]))
  expect(where.records.get(id)).toMatchObject({ status: "closed" })
  expect(agent.sees("/runs")).toMatchObject({ runs: [{ id, status: "closed", checkout: "/repo", uncommitted: 2, shown: true }] })
})

test("a process that ends by itself ends the run, which is still to close", async () => {
  const { agent, harness } = await started()

  harness.exit(1)
  await until(() => root(agent).status === "ended")
  expect(agent.sees()).toMatchObject({ ended: expect.stringContaining("exit code 1") })
  expect(agent.offered()).toEqual(["start", "start_from", "close"])
})

const KEPT = {
  id: "2026-11-15T10-00-00-ab12",
  n: 3,
  model: "haiku",
  status: "working",
  began: 1000,
  from: "",
  since: 0,
  session: "s",
  dir: "/repo/.babavoss/lab/runs/2026-11-15T10-00-00-ab12",
  project: "/repo/.babavoss/lab/runs/2026-11-15T10-00-00-ab12/project",
  home: "/repo/.babavoss/lab/runs/2026-11-15T10-00-00-ab12/home",
  checkout: { from: "/repo", commit: "fedcba9876543210", dirty: [] },
  entries: [{ i: 1, t: 50, kind: "message", title: "the developing agent", text: "hi" }],
  senders: [],
  tokens: { input: 0, cache_write: 0, cache_read: 0, output: 0 },
  cost: 0.01,
  turns: 0,
}

test("a restored run whose process is gone is ended, its timeline kept", async () => {
  const { agent } = story(lab(fakeHarness().harness, place().runs), { model: { next: 4, runs: [], run: KEPT } as unknown as Model, effects: "real" })

  expect(agent.sees()).toMatchObject({ status: "ended", ended: expect.stringContaining("did not survive"), entries: 2 })
  expect(agent.sees("/entries/1")).toMatchObject({ text: "hi" })
  expect(agent.offered()).toEqual(["start", "start_from", "close"])
  expect(await agent.call("/", "say", { text: "hello" })).toMatchObject({ outcome: "refused" })
})

test("past runs are listed from their records, and one is shown here when no run is up", async () => {
  const { agent } = story(lab(fakeHarness().harness, place([{ ...KEPT, status: "closed" }]).runs), { effects: "real" })

  await until(() => (agent.sees() as { runs: { count: number } }).runs.count === 1)

  const listed = agent.sees("/runs") as { runs: { id: string; status: string; open?: Json }[] }

  expect(listed.runs).toMatchObject([{ id: KEPT.id, status: "closed", checkout: "/repo", commit: "fedcba9876", uncommitted: 0, turns: 0 }])
  expect(agent.offered("/runs")).toEqual(["open", "forget"])
  expect(await agent.call("/runs", "open", { id: KEPT.id })).toMatchObject({ outcome: "written" })
  await until(() => root(agent).run === KEPT.id)
  expect(agent.sees()).toMatchObject({ status: "closed" })
  expect(agent.sees("/entries/1")).toMatchObject({ text: "hi" })
  expect(agent.offered()).toEqual(["start", "start_from"])
})

test("a record is forgotten whole from the list of runs, the shown one once it is closed, and only the last 20 are kept", async () => {
  const { agent, where } = await started()
  const id = where.made[0]!.id

  expect(agent.offered("/runs")).toEqual([])
  await agent.call("/", "close", {})
  await until(() => root(agent).status === "closed")
  expect(agent.offered("/runs")).toEqual(["forget"])
  expect(await agent.call("/runs", "forget", { id })).toMatchObject({ outcome: "written" })
  await until(() => where.forgotten.length === 1)
  expect(where.forgotten).toEqual([id])
  expect(agent.sees()).toMatchObject({ status: "no run", runs: { count: 0 } })

  const many = Array.from({ length: 22 }, (_, i) => ({ ...KEPT, id: `2026-11-${String(i + 1).padStart(2, "0")}T10-00-00-ab12`, began: 1000 + i }))
  const crowded = place(many)
  const s = story(lab(fakeHarness().harness, crowded.runs), { effects: "real" })

  await until(() => crowded.forgotten.length === 2)
  expect(crowded.forgotten).toEqual([many[0]!.id, many[1]!.id])
  expect(s.agent.sees()).toMatchObject({ runs: { count: 20 } })
})

test("on start, what a lab that is gone left is swept: every run but the one shown here and those of a lab still running", async () => {
  // Another lab still running is a process of this user's that lives through the story, as the spec's parent may not.
  const other = Bun.spawn(["sleep", "30"])
  const running = { ...KEPT, id: "2026-11-15T09-00-00-cd34", lab: other.pid }
  const gone = { ...KEPT, id: "2026-11-15T08-00-00-ef56", lab: 2 ** 22 + 1 }
  const where = place([KEPT, running, gone])

  story(lab(fakeHarness().harness, where.runs), { model: { next: 4, runs: [], run: KEPT } as unknown as Model, effects: "real" })
  await until(() => where.swept.length === 3).finally(() => other.kill())
  expect(where.swept).toEqual([
    { id: KEPT.id, spared: true },
    { id: running.id, spared: true },
    { id: gone.id, spared: false },
  ])
})

test("a run swept on start reads as cleared, in the list and once shown: no project, no page, nothing to close, its record saying so", async () => {
  const gone = { ...KEPT, id: "2026-11-15T08-00-00-ef56", lab: 2 ** 22 + 1, page: "http://127.0.0.1:5555/" }
  const where = place([gone])
  const { agent } = story(lab(fakeHarness().harness, where.runs), { effects: "real" })

  await until(() => (agent.sees() as { runs: { count: number } }).runs.count === 1)
  expect(agent.sees("/runs")).toMatchObject({ runs: [{ id: gone.id, status: "cleared" }] })
  expect(where.records.get(gone.id)).toMatchObject({ status: "cleared" })
  expect(await agent.call("/runs", "open", { id: gone.id })).toMatchObject({ outcome: "written" })
  await until(() => root(agent).run === gone.id)
  expect(agent.sees()).toMatchObject({ status: "cleared" })
  expect(agent.sees()).not.toHaveProperty("project")
  expect(agent.sees()).not.toHaveProperty("page")
  expect(agent.offered()).toEqual(["start", "start_from"])
  expect(agent.offered("/runs")).toEqual(["forget"])
  expect((root(agent).recent ?? []).map((r) => r.title)).toEqual(["the developing agent", "process gone", "cleared"])
})

test("what the person does on the page under test joins the timeline once each, in order; what the lab did there as the person is not doubled", async () => {
  const { agent, where } = await started()
  const kinds = () => (agent.sees("/entries") as { entries: Row[] }).entries.map((r) => [r.kind, r.line])

  where.did("person", "/tabs/1", "open n=2")
  where.did("agent", "/tabs/1", "take n=3")
  await until(() => kinds().length === 2)
  await agent.call("/", "act", { at: "/tabs/1", handle: "approve", args: '{"n":1}' })
  await until(() => kinds().length === 3 && !(agent.sees("/entries/3") as { pending?: boolean }).pending)
  where.did("person", "/", "closed")
  await until(() => kinds().length === 4)
  await Bun.sleep(30)
  expect(kinds()).toEqual([
    ["note", expect.any(String)],
    ["person", "open n=2 at /tabs/1"],
    ["act", 'approve {"n":1} at /tabs/1'],
    ["person", "closed at /"],
  ])
  expect(agent.sees("/entries/2")).toMatchObject({ kind: "person", title: "the person, on queue" })

  await agent.call("/", "close", {})
  await until(() => root(agent).status === "closed")
  where.did("person", "/tabs/1", "too late")
  await Bun.sleep(30)
  expect(kinds().filter(([kind]) => kind === "person")).toHaveLength(2)
})

test("the person's click on the same tab as the lab's act, at the same moment, is the person's: the act is told by the name its call carried", async () => {
  const { agent, where } = await started()
  const kinds = () => (agent.sees("/entries") as { entries: Row[] }).entries.map((r) => [r.kind, r.line])

  where.meanwhile = () => where.did("person", "/tabs/1", "approve n=2")
  await agent.call("/", "act", { at: "/tabs/1", handle: "approve", args: '{"n":1}' })
  await until(() => kinds().length === 3 && !(agent.sees("/entries/2") as { pending?: boolean }).pending)
  await Bun.sleep(30)
  expect(kinds()).toEqual([
    ["note", expect.any(String)],
    ["act", 'approve {"n":1} at /tabs/1'],
    ["person", "approve n=2 at /tabs/1"],
  ])
})
