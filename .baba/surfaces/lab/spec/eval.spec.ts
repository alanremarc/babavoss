// The eval's rig, dry: whole campaigns on this checkout through the fake harness, each run a scratch project with the
// fixture and a root of its own, checked, recorded, tabled and counted, and nothing left behind; and what it counts in a
// stream of the harness's events.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, test } from "bun:test"
import { babaIn, campaign, dryHarness, mask, measure, MODEL, programs, REPO, table, tally, variantOf, type Options } from "../eval/rig.ts"
import type { Harness } from "babavoss/core/index.ts"
import { TASKS, tasksNamed, touched } from "../eval/tasks.ts"
import { seed } from "../eval/fixture/queue/src/seed.ts"

const out = mkdtempSync(join(tmpdir(), "babavoss-eval-spec-"))
const scratch = () => readdirSync(tmpdir()).filter((name) => name.startsWith("babavoss-eval-") && !name.startsWith("babavoss-eval-spec-"))
const before = scratch()
const v1 = variantOf(REPO, "v1")
const options = (names: string, more: Partial<Options> = {}): Options => ({
  variants: [v1, { ...v1, label: "v2" }],
  tasks: tasksNamed(names),
  model: MODEL,
  runs: 1,
  cap: 1,
  turns: 40,
  minutes: 2,
  out,
  dry: true,
  ...more,
})

afterAll(() => rmSync(out, { recursive: true, force: true }))

test("a dry campaign runs each task on each variant in a project of its own, checks it, records it, tables it and leaves nothing behind", async () => {
  const o = options("done-one,note-backlog,lanes-read")
  const harness = dryHarness((prompt) => o.tasks.find((t) => t.prompt === prompt)!.dry)
  const done = await campaign(o, harness, new AbortController().signal)

  expect(done.runs.map((r) => `${r.task} ${r.variant} ${r.pass} ${r.reason}`)).toEqual(
    ["done-one", "note-backlog", "lanes-read"].flatMap((task) => ["v1", "v2"].map((v) => `${task} ${v} true as asked`)),
  )

  const lines = readFileSync(join(done.dir, "results.jsonl"), "utf8").trim().split("\n")

  expect(lines).toHaveLength(6)

  const batch = done.runs.find((r) => r.task === "note-backlog")!

  // The program wrote twelve notes, which the root counts though the stream shows one call.
  expect(batch).toMatchObject({ commit: v1.commit, program: ["-e"], baba: { reads: 1, actions: 0, programs: 1, other: 0 }, root_calls: 12, mode: "dry" })
  // Everything baba told: the session's start, which carries the present with the fixture's tab, and each answer.
  expect(batch.told.hooks).toBeGreaterThan(1000)
  expect(batch.told.answers).toBeGreaterThan(0)
  expect(existsSync(join(done.dir, batch.transcript))).toBe(true)
  expect(readFileSync(join(done.dir, batch.transcript), "utf8")).toContain('"kind":"injected"')

  const text = table(done.runs, o.variants)

  expect(text).toContain("note-backlog  v2")
  expect(text).toMatch(/vs v1\s+v2/)
  expect(tally(out, done.runs, "dry")).toContain("this campaign: 6 runs")
  expect(tally(out, done.runs, "dry")).toContain("all dry campaigns")
  expect(JSON.parse(readFileSync(join(out, "tally.json"), "utf8"))).toMatchObject({ campaigns: 2, dry: { runs: 12 }, real: { runs: 0 } })
  // Every scratch project and home is deleted, and its root is gone.
  expect(scratch()).toEqual(before)
}, 120_000)

test("a run that does not do what was asked fails with the check's reason, and a stopped campaign says what it did not run", async () => {
  const o = options("done-one,add-one")
  const stop = new AbortController()
  const harness = dryHarness((prompt) => {
    // The campaign is stopped while its first run is under way.
    stop.abort()

    return prompt === o.tasks[0]!.prompt ? { calls: [["/queue/issues/12", "done", "n=12"]] } : { calls: [] }
  })
  const done = await campaign(o, harness, stop.signal)

  expect(done.runs).toHaveLength(1)
  expect(done.runs[0]).toMatchObject({ task: "done-one", pass: false, reason: "the campaign was stopped; also changed 12" })
  expect(done.skipped).toEqual(["done-one on v2, run 1 (stopped)", "add-one on v1, run 1 (stopped)", "add-one on v2, run 1 (stopped)"])
  expect(scratch()).toEqual(before)
}, 60_000)

test("a campaign with a budget stops once the harness says it is spent, and says what it did not run", async () => {
  const o = options("done-one", { budget: 1 })
  const fake = dryHarness((prompt) => o.tasks.find((t) => t.prompt === prompt)!.dry)
  // Each run costs a dollar, as the harness reports it at the turn's end.
  const costly: Harness = {
    ...fake,
    start(s) {
      const session = fake.start(s)

      return {
        ...session,
        events: (async function* () {
          for await (const e of session.events) yield e.kind === "turn" ? { ...e, total: 1 } : e
        })(),
      }
    },
  }
  const done = await campaign(o, costly, new AbortController().signal)

  expect(done.runs.map((r) => r.cost)).toEqual([1])
  expect(done.skipped).toEqual(["done-one on v2, run 1 (the budget of $1.00 is spent)"])
}, 60_000)

test("every task passes on the fixture by its own dry script, and fails on the fixture untouched where it asks for a change", () => {
  const w = seed()

  for (const task of TASKS) {
    const untouched = task.check({ seed: w, final: w, answer: "" })

    expect(untouched.pass, task.name).toBe(false)
  }
  expect(touched(w, { ...w, issues: w.issues.map((i) => (i.n === 3 ? { ...i, order: 99 } : i)) })).toEqual([])
  expect(() => tasksNamed("done-one,nothing")).toThrow("no task nothing")
})

test("counts the root's command in a shell line by what follows it: a read, an action, a program", () => {
  expect(babaIn(".babavoss/bin/baba /queue")).toEqual({ reads: 1, actions: 0, programs: 0, other: 0 })
  expect(babaIn(".babavoss/bin/baba /queue/issues/3 done n=3 && .babavoss/bin/baba /queue | head")).toEqual({ reads: 1, actions: 1, programs: 0, other: 0 })
  expect(babaIn(".babavoss/bin/baba --session x /queue/issues/3 note n=3 text='a b'")).toEqual({ reads: 0, actions: 1, programs: 0, other: 0 })
  expect(babaIn(`.babavoss/bin/baba -e 'await root.read("/")'`)).toEqual({ reads: 0, actions: 0, programs: 1, other: 0 })
  expect(babaIn(".babavoss/bin/baba sleep; ls")).toEqual({ reads: 0, actions: 0, programs: 0, other: 1 })
  expect(babaIn("ls .babavoss")).toEqual({ reads: 0, actions: 0, programs: 0, other: 0 })
})

test("knows a program when the agent runs one: a loop, a pipeline, a script file", () => {
  const bash = (input: string) => ({ tool: "Bash", input })

  expect(programs([bash("for n in 3 5; do .babavoss/bin/baba /queue/issues/$n done n=$n; done")])).toEqual(["shell loop"])
  expect(programs([bash("echo 3 5 | xargs -n1 -I{} .babavoss/bin/baba /queue/issues/{} done n={}")])).toEqual(["pipeline"])
  expect(programs([{ tool: "Write", input: JSON.stringify({ file_path: "/p/mark.sh" }) }, bash("sh mark.sh")])).toEqual(["script file"])
  expect(programs([bash(".babavoss/bin/baba /queue")])).toEqual([])
})

test("measures a stream: the harness's tokens and cost, calls and refusals, what baba told, and the last words", () => {
  const m = measure([
    { kind: "started", session: "s", loaded: { model: "claude-sonnet-5-5", cwd: "", tools: [], skills: [], plugins: [], mcp: [], commands: [] } },
    { kind: "injected", event: "SessionStart", text: "12345" },
    { kind: "call", id: "a", tool: "Bash", input: ".babavoss/bin/baba /queue/issues/3 done n=3", word: true },
    { kind: "result", id: "a", text: "refused: no", error: true },
    { kind: "call", id: "b", tool: "Read", input: "{}", word: false },
    { kind: "result", id: "b", text: "missing", error: true },
    { kind: "reply", text: "Lanes 2 and 5." },
    { kind: "turn", ok: true, text: "", tokens: { input: 10, cache_write: 20, cache_read: 30, output: 5 }, total: 0.25, ms: 1, calls: 3 },
  ])

  expect(m).toMatchObject({
    reported_model: "claude-sonnet-5-5",
    tokens: { input: 10, cache_write: 20, cache_read: 30, output: 5 },
    cost: 0.25,
    tool_calls: 2,
    refusals: 1,
    failed: 1,
    told: { hooks: 5, answers: 11 },
    answer: "Lanes 2 and 5.",
  })
})

test("masks what looks like a credential, and a page's key", () => {
  expect(mask("http://127.0.0.1:1/?key=el9PDjza2ztXTHpL8QzcMLPvlDaZYvMRgRlTgshe0gU")).toBe("http://127.0.0.1:1/?key=<masked>")
  expect(mask('{"token": "abcdefghijkl"} sk-ant-api03-xyz')).toBe('{"token": "<masked>"} <masked>')
})
