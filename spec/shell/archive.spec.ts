// The archive of closed tabs: read only, read by the agent at /activity/closed, cleared by its rolling window as a runtime
// starts and by the person's two clears, and never touching a session a runtime serves.
import { closeSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import { action, run, surface, view, type Update } from "../../framework/core/index.ts"
import { holdLock } from "../../framework/core/runtime/service.ts"
import { clear, closedTabs, DAY_MS, measure, sweep, archiveOf, type Window } from "../../framework/shell/src/archive.ts"
import { shellKeep } from "../../framework/shell/src/keep.ts"
import { shell } from "../../framework/shell/src/surface.ts"

const NOW = Date.UTC(2026, 10, 17)
const WINDOW: Window = { days: 30, megabytes: 200 }
const temp = () => mkdtempSync(join(tmpdir(), "archive-"))

/** Sets the times of a path and everything below it. */
function age(path: string, when: number) {
  const stat = statSync(path)

  if (stat.isDirectory()) for (const name of readdirSync(path)) age(join(path, name), when)
  utimesSync(path, when / 1000, when / 1000)
}
/** A closed tab in a session's root, closed at `closed`, its log `bytes` long. */
function closedTab(session: string, n: number, closed: number, bytes = 100) {
  const folder = join(session, "baba", "closed", String(n))

  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, "about.json"), JSON.stringify({ n, surface: "notes", title: `Notes ${n}`, opened: closed - 1000, closed, by: "agent" }))
  writeFileSync(join(folder, "log.jsonl"), `${JSON.stringify({ n: 1, when: closed, who: "agent", surface: "notes", at: `/tabs/${n}`, did: "add" })}\n`.padEnd(bytes, " "))
  writeFileSync(join(folder, "state.json"), "{}")
  age(folder, NOW)

  return folder
}
/** A session's folder with a root that was served, and work of a surface beside it. */
function session(home: string, id: string) {
  const path = join(home, "sessions", id)

  mkdirSync(join(path, "baba"), { recursive: true })
  writeFileSync(join(path, "baba", "service.lock"), "")
  writeFileSync(join(path, "work.json"), "{}")

  return path
}
const ended = (path: string, when: number) => {
  writeFileSync(join(path, "ended"), "")
  utimesSync(join(path, "ended"), when / 1000, when / 1000)
}

describe("the archive's sweep", () => {
  it("removes closed tabs past the window and the folders of sessions over for longer, and nothing else", () => {
    const home = temp()
    const own = session(home, "own")
    const old = closedTab(own, 1, NOW - 31 * DAY_MS)
    const fresh = closedTab(own, 2, NOW - DAY_MS)
    const done = session(home, "done")
    const recent = session(home, "recent")
    const quiet = session(home, "quiet")
    const idle = session(home, "idle")
    const idleOld = closedTab(idle, 4, NOW - 40 * DAY_MS)
    const live = session(home, "live")
    const liveOld = closedTab(live, 3, NOW - 40 * DAY_MS)

    age(done, NOW - 40 * DAY_MS)
    ended(done, NOW - 40 * DAY_MS)
    ended(recent, NOW - 2 * DAY_MS)
    age(quiet, NOW - 45 * DAY_MS)
    age(own, NOW)

    // A runtime serves the live session: it holds its root's lock.
    const held = holdLock(join(live, "baba", "service.lock"))!

    try {
      expect(sweep(home, own, WINDOW, NOW)).toEqual({ tabs: 2, sessions: 2, bytes: expect.any(Number) })
    } finally {
      closeSync(held)
    }
    expect([old, fresh, idleOld, liveOld].map(existsSync)).toEqual([false, true, false, true])
    expect([own, done, recent, quiet, idle, live].map(existsSync)).toEqual([true, false, true, false, true, true])
  })

  it("removes the oldest first once the project's archive is past its size, whatever their age", () => {
    const home = temp()
    const own = session(home, "own")
    const tabs = [5, 4, 3, 2, 1].map((days, i) => closedTab(own, i + 1, NOW - days * DAY_MS, 400_000))

    sweep(home, own, { days: 30, megabytes: 1 }, NOW)
    expect(tabs.map(existsSync)).toEqual([false, false, false, true, true])
  })

  it("runs at most once a day for the project, and not while another runtime sweeps", () => {
    const home = temp()
    const own = session(home, "own")

    closedTab(own, 1, NOW - 31 * DAY_MS)

    const lock = holdLock(join(home, "sweep.lock"))!

    expect(sweep(home, own, WINDOW, NOW)).toBeUndefined()
    closeSync(lock)
    expect(sweep(home, own, WINDOW, NOW)).toEqual({ tabs: 1, sessions: 0, bytes: expect.any(Number) })
    closedTab(own, 2, NOW - 31 * DAY_MS)
    expect(sweep(home, own, WINDOW, NOW + DAY_MS / 2)).toBeUndefined()
    expect(sweep(home, own, WINDOW, NOW + DAY_MS + 1)).toEqual({ tabs: 1, sessions: 0, bytes: expect.any(Number) })
  })
})

describe("the clears", () => {
  it("say what each would free, and free it: this session's closed tabs, or the project's, the folders of sessions over included", () => {
    const home = temp()
    const own = session(home, "own")
    const other = session(home, "other")
    const done = session(home, "done")

    closedTab(own, 1, NOW - DAY_MS, 1000)
    closedTab(own, 2, NOW - DAY_MS, 1000)
    closedTab(other, 1, NOW - DAY_MS, 1000)
    ended(done, NOW - DAY_MS)

    const before = measure(own, WINDOW, NOW)

    expect(before.session).toEqual({ tabs: 2, sessions: 0, bytes: expect.any(Number) })
    expect(before.session.bytes).toBeGreaterThan(2000)
    expect(before.project).toEqual({ tabs: 3, sessions: 1, bytes: expect.any(Number), running: 0 })
    expect(clear(own, "session", WINDOW, NOW)).toEqual(before.session)
    expect(closedTabs(join(own, "baba"))).toEqual([])
    expect(existsSync(join(other, "baba", "closed", "1"))).toBe(true)

    const project = measure(own, WINDOW, NOW).project

    expect(clear(own, "project", WINDOW, NOW)).toEqual({ tabs: project.tabs, sessions: project.sessions, bytes: project.bytes })
    expect([own, other, done].map(existsSync)).toEqual([true, true, false])
    expect(existsSync(join(other, "baba", "closed", "1"))).toBe(false)
    expect(existsSync(join(other, "work.json"))).toBe(true)
  })

  it("leave a session a runtime serves as it is", () => {
    const home = temp()
    const own = session(home, "own")
    const live = session(home, "live")
    const tab = closedTab(live, 1, NOW - DAY_MS)

    writeFileSync(join(live, "baba", "service.json"), JSON.stringify({ pid: process.pid }))

    const held = holdLock(join(live, "baba", "service.lock"))!

    try {
      expect(measure(own, WINDOW, NOW).project).toEqual({ tabs: 0, sessions: 0, bytes: 0, running: 1 })
      expect(clear(own, "project", WINDOW, NOW)).toEqual({ tabs: 0, sessions: 0, bytes: 0 })
    } finally {
      closeSync(held)
    }
    expect(existsSync(tab)).toBe(true)
  })
})

type Model = { n: number }

const bump = action({
  name: "bump",
  description: "add",
  subject: {},
  inputs: { by: "number" },
  update: (m: Model, { by }): Update<Model, never> => ({ model: { n: m.n + by } }),
})
const pages = view([bump], { "/": (m) => ({ title: "Counter", n: m.n, bump: bump.bind({}) }) })
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

describe("the archive as the agent reads it", () => {
  it("lists the session's closed tabs at /activity/closed, and pages a closed tab's log, read only", async () => {
    const dir = temp()
    const r = run(shell({ counter }, "/project/.baba", {}, undefined, "baba", archiveOf(() => dir)), shellKeep(dir))

    expect(r.read("/activity/closed")).toEqual({ at: "/activity/closed", about: expect.any(String), kept: 0, tabs: "none" })
    await r.call("/", "open", { surface: "counter" }, "agent")
    for (let i = 0; i < 60; i++) await r.call("/counter", "bump", { by: 1 }, "agent")
    await r.call("/", "close", { n: 1 }, "person")

    expect(r.read("/activity")).toMatchObject({ closed: { at: "/activity/closed" } })
    expect(r.read("/activity/closed")).toEqual({
      at: "/activity/closed",
      about: expect.any(String),
      kept: 1,
      tabs: [{ n: 1, surface: "counter", title: "Counter", opened: expect.any(String), closed: expect.any(String), by: "person", entries: 60, size: expect.any(String), at: "/activity/closed/1" }],
    })

    const log = r.read("/activity/closed/1")!

    expect(log).toMatchObject({ at: "/activity/closed/1", title: "Counter", kept: 60, earlier: { at: "/activity/closed/1/11" } })
    expect((log.entries as { n: number; at: string; did: string }[])[0]).toMatchObject({ who: "agent", at: "/tabs/1", did: "bump by=1" })
    expect(log.entries).toHaveLength(50)
    expect(r.read("/activity/closed/1/11")!.entries).toHaveLength(10)
    expect(r.read("/activity/closed/2")).toBeUndefined()
    // A path into the closed tab says where its log is.
    expect(await r.call("/tabs/1", "bump", { by: 1 }, "agent")).toMatchObject({ outcome: "refused", reason: expect.stringContaining("its log kept at /activity/closed/1") })
  })
})
