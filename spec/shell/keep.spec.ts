// How the shell's model is kept on disk: its own part, and a folder per open tab with its state and its log, each written
// only where it changed; a tab closed moved to the archive, read only; a session of the one file of before written out so.
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import { action, run, surface, view, type Update } from "../../framework/core/index.ts"
import { closedLog, closedTabs } from "../../framework/shell/src/archive.ts"
import { KEPT } from "../../framework/shell/src/activity.ts"
import { LOG_BYTES, readLog, shellKeep } from "../../framework/shell/src/keep.ts"
import { shell } from "../../framework/shell/src/surface.ts"

type Model = { n: number; note?: string }

const bump = action({
  name: "bump",
  description: "add",
  subject: {},
  inputs: { by: "number" },
  update: (m: Model, { by }): Update<Model, never> => ({ model: { ...m, n: m.n + by }, notices: [`now ${m.n + by}`] }),
})
const write = action({
  name: "write",
  description: "keep a note",
  subject: {},
  inputs: { note: "string" },
  update: (m: Model, { note }): Update<Model, never> => ({ model: { ...m, note } }),
})
const pages = view([bump, write], { "/": (m) => ({ title: `Counter at ${m.n}`, n: m.n, bump: bump.bind({}), write: write.bind({}) }) })
const counter = surface<Model, never, never>({
  description: "counts",
  init: () => ({ n: 0 }),
  update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => {
    throw new Error("no commands")
  },
})

const temp = () => mkdtempSync(join(tmpdir(), "keep-"))
const start = (dir: string) => run(shell({ counter }, "/project/.baba"), shellKeep(dir))
const mode = (path: string) => statSync(path).mode & 0o777
const read = (path: string) => readFileSync(path, "utf8")
const lines = (path: string) => read(path).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { n: number; did?: string; times?: number })

describe("the shell's state on disk", () => {
  it("keeps its own part, and each open tab's state and log in a folder of its own, its owner's alone", async () => {
    const dir = temp()
    const r = start(dir)

    await r.call("/", "open", { surface: "counter" }, "agent")
    await r.call("/", "open", { surface: "counter" }, "agent")
    await r.call("/tabs/1", "bump", { by: 2 }, "agent")
    await r.call("/tabs/2", "write", { note: "hello" }, "person")

    expect(readdirSync(dir).sort()).toEqual(["log.jsonl", "shell.json", "tabs"])
    expect(readdirSync(join(dir, "tabs")).sort()).toEqual(["1", "2"])
    expect(JSON.parse(read(join(dir, "tabs/1/state.json")))).toEqual({ n: 2 })
    expect(JSON.parse(read(join(dir, "tabs/2/state.json")))).toEqual({ n: 0, note: "hello" })
    expect(JSON.parse(read(join(dir, "tabs/1/about.json")))).toEqual({ n: 1, surface: "counter", named: true, opened: expect.any(Number) })
    expect(lines(join(dir, "tabs/1/log.jsonl")).map((e) => e.did)).toEqual(["bump"])
    expect(lines(join(dir, "tabs/2/log.jsonl")).map((e) => e.did)).toEqual(["write"])
    // The shell's own lines, its opening of tabs among them, are its own log.
    expect(lines(join(dir, "log.jsonl")).map((e) => e.did)).toEqual(["open", "open"])
    // Its own part holds no tab's state and no entry.
    const own = JSON.parse(read(join(dir, "shell.json")))

    expect(own.activity).toBeUndefined()
    expect(own.tabs).toEqual([
      { n: 1, surface: "counter", named: true, opened: expect.any(Number) },
      { n: 2, surface: "counter", opened: expect.any(Number) },
    ])
    for (const path of ["", "tabs", "tabs/1"]) expect([path, mode(join(dir, path))]).toEqual([path, 0o700])
    for (const path of ["shell.json", "log.jsonl", "tabs/1/state.json", "tabs/1/log.jsonl", "tabs/1/about.json"]) expect([path, mode(join(dir, path))]).toEqual([path, 0o600])
  })

  it("writes on a tab's commit only that tab's state and one line of its log; the others and its own part untouched", async () => {
    const dir = temp()
    const r = start(dir)

    await r.call("/", "open", { surface: "counter" }, "agent")
    await r.call("/", "open", { surface: "counter" }, "agent")

    const before = (path: string) => statSync(join(dir, path)).mtimeMs
    const times = { shell: before("shell.json"), other: before("tabs/2/state.json"), log: existsSync(join(dir, "tabs/1/log.jsonl")) ? read(join(dir, "tabs/1/log.jsonl")) : "" }

    await Bun.sleep(20)
    await r.call("/tabs/1", "bump", { by: 1 }, "agent")

    expect(before("shell.json")).toBe(times.shell)
    expect(before("tabs/2/state.json")).toBe(times.other)
    expect(read(join(dir, "tabs/1/log.jsonl")).startsWith(times.log)).toBe(true)
    expect(lines(join(dir, "tabs/1/log.jsonl"))).toHaveLength(1)
    // An entry folded or written again is appended under its number, and read as its last.
    appendFileSync(join(dir, "tabs/1/log.jsonl"), `${JSON.stringify({ ...lines(join(dir, "tabs/1/log.jsonl"))[0], times: 2 })}\n{"n": 9, "cut by a cra`)
    expect(readLog(join(dir, "tabs/1"))).toEqual([expect.objectContaining({ did: "bump", times: 2 })])
  })

  it("moves a closed tab to the archive whole, with what it was, when it opened and closed, and who closed it", async () => {
    const dir = temp()
    const r = start(dir)

    await r.call("/", "open", { surface: "counter" }, "agent")
    await r.call("/tabs/1", "bump", { by: 3 }, "agent")
    await r.call("/", "close", { n: 1 }, "person")

    expect(existsSync(join(dir, "tabs/1"))).toBe(false)
    expect(JSON.parse(read(join(dir, "closed/1/state.json")))).toEqual({ n: 3 })

    const [tab] = closedTabs(dir)

    expect(tab).toEqual({
      n: 1,
      surface: "counter",
      title: "Counter at 3",
      opened: expect.any(Number),
      closed: expect.any(Number),
      by: "person",
      entries: 1,
      bytes: expect.any(Number),
      folder: join(dir, "closed/1"),
    })
    expect(tab!.closed).toBeGreaterThanOrEqual(tab!.opened!)
    expect(closedLog(dir, 1)).toEqual([expect.objectContaining({ did: "bump", args: { by: 3 }, said: [{ text: "now 3" }] })])
    expect(mode(join(dir, "closed"))).toBe(0o700)
    expect(mode(join(dir, "closed/1/about.json"))).toBe(0o600)
  })

  it("comes back whole after a restart: every open tab's state and the newest KEPT of each tab's log", async () => {
    const dir = temp()
    const r = start(dir)

    await r.call("/", "open", { surface: "counter" }, "agent")
    await r.call("/", "open", { surface: "counter" }, "agent")
    for (let i = 0; i < KEPT + 10; i++) await r.call("/tabs/1", "bump", { by: 1 }, "agent")
    await r.call("/tabs/2", "write", { note: "kept" }, "person")
    await r.stop()

    const again = start(dir)

    expect(again.read("/tabs/1")).toMatchObject({ n: KEPT + 10 })
    expect(again.model().tabs[1]!.model).toEqual({ n: 0, note: "kept" })

    const held = again.model().activity!

    expect(held.filter((e) => e.at === "/tabs/1" && !e.own)).toHaveLength(KEPT)
    expect(held.filter((e) => e.at === "/tabs/2" && !e.own)).toHaveLength(1)
    // The whole log stays on disk; what the model holds is a tab's newest.
    expect(readLog(join(dir, "tabs/1"))).toHaveLength(KEPT + 10)

    // A commit after the restart appends only what is new.
    await again.call("/tabs/2", "write", { note: "again" }, "person")
    expect(lines(join(dir, "tabs/2/log.jsonl")).map((e) => e.did)).toEqual(["write", "write"])
    expect(lines(join(dir, "tabs/1/log.jsonl"))).toHaveLength(KEPT + 10)
  })

  it("moves a log past its bound aside, keeping the one before it", async () => {
    const dir = temp()
    const r = start(dir)
    const long = "x".repeat(150)

    await r.call("/", "open", { surface: "counter" }, "agent")
    let calls = 0

    while (!existsSync(join(dir, "tabs/1/log.1.jsonl")) && calls < 20_000) await r.call("/tabs/1", "write", { note: `${calls++}${long}` }, "agent")
    for (let i = 0; i < 10; i++) await r.call("/tabs/1", "write", { note: `${calls++}${long}` }, "agent")

    expect(statSync(join(dir, "tabs/1/log.1.jsonl")).size).toBeGreaterThanOrEqual(LOG_BYTES)
    expect(lines(join(dir, "tabs/1/log.jsonl"))).toHaveLength(11)
    expect(readLog(join(dir, "tabs/1"))).toHaveLength(calls)
  })

  it("writes a session kept in one model.json out in this layout, once, losing nothing, and removes that file", async () => {
    const dir = temp()
    const entry = (n: number, at: string, did: string, own?: true) => ({ n, when: 1000 + n, who: "agent", surface: "counter", at, did, ...(own && { own }) })

    writeFileSync(
      join(dir, "model.json"),
      JSON.stringify({
        model: {
          tabs: [
            { n: 1, surface: "counter", model: { n: 4 }, named: true },
            { n: 3, surface: "counter", model: { n: 7, note: "old" } },
          ],
          next: 4,
          activity: [entry(1, "/tabs/1", "open", true), entry(2, "/tabs/1", "bump"), entry(3, "/tabs/3", "write"), entry(4, "/", "show"), entry(5, "/tabs/1", "bump")],
          opened: { "1": 2 },
          closed: [{ n: 2, surface: "counter", by: "agent" }],
        },
      })
    )

    const r = start(dir)

    expect(existsSync(join(dir, "model.json"))).toBe(false)
    expect(JSON.parse(read(join(dir, "tabs/3/state.json")))).toEqual({ n: 7, note: "old" })
    expect(lines(join(dir, "tabs/1/log.jsonl")).map((e) => e.n)).toEqual([2, 5])
    expect(lines(join(dir, "tabs/3/log.jsonl")).map((e) => e.n)).toEqual([3])
    expect(lines(join(dir, "log.jsonl")).map((e) => e.n)).toEqual([1, 4])
    expect(r.read("/tabs/1")).toMatchObject({ n: 4 })
    expect(r.model().tabs[1]!.model).toEqual({ n: 7, note: "old" })
    expect(r.model()).toMatchObject({ next: 4, opened: { "1": 2 }, closed: [{ n: 2, surface: "counter", by: "agent" }] })
    expect(r.model().activity!.map((e) => e.n)).toEqual([1, 2, 3, 4, 5])
    // The next entry is numbered on from the last.
    await r.call("/tabs/1", "bump", { by: 1 }, "agent")
    expect(lines(join(dir, "tabs/1/log.jsonl")).map((e) => e.n)).toEqual([2, 5, 6])
    for (const path of ["tabs/3", "tabs/3/state.json", "shell.json"]) expect(mode(join(dir, path)) & 0o077).toBe(0)
  })

  it("moves to the archive a tab's folder its own part does not list, as a crash leaves one as the tab opens", () => {
    const dir = temp()

    mkdirSync(join(dir, "tabs/5"), { recursive: true })
    writeFileSync(join(dir, "tabs/5/about.json"), JSON.stringify({ n: 5, surface: "counter" }))
    writeFileSync(join(dir, "shell.json"), JSON.stringify({ tabs: [], next: 6 }))
    start(dir)

    expect(existsSync(join(dir, "tabs/5"))).toBe(false)
    expect(closedTabs(dir)).toEqual([expect.objectContaining({ n: 5, surface: "counter", by: "shell" })])
  })
})
