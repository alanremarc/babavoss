// A queue tab kept from before brings its issues into the session's work once, placed on the map's narratives, losing nothing;
// and the work is kept in the session's file, which a runtime started again reads. The tab's state here is a copy of its shape.
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { story, writeJsonFile } from "babavoss/core/index.ts"
import { adopt, FROM_MAP, seed, type Legacy } from "../src/migrate.ts"
import { FILE, store } from "../src/store.ts"
import { queue, type Model } from "../src/surface.ts"
import type { Work } from "../src/work.ts"

const heard = () => new Promise((done) => setTimeout(done, 250))

/** A queue tab's model as it was kept before: issues the map knew, ones it did not, and one dropped from the map's list. */
const legacy = (): Legacy => ({
  next: 40,
  clock: 90,
  issues: [
    { n: 10, title: "Shape what the agent sees", about: "The queue's own words", status: "done", note: "merged", updates: [{ t: 1, text: "landed" }], at: 3 },
    { n: 14, title: "Weave the surface into baba", about: "Why", status: "done", at: 2 },
    { n: 34, title: "Experiment: a map", about: "Why", status: "lane", lane: 2, at: 60 },
    { n: 35, title: "A later shell change", about: "Why", status: "backlog", at: 70 },
    { n: 38, title: "Weave the map into the queue", about: "Why", status: "lane", lane: 1, updates: [{ t: 2, text: "begun" }], at: 80 },
    { n: 39, title: "Something new", about: "Why", status: "draft", at: 85 },
  ],
})

test("a tab kept from before keeps every issue as it was and gains the map's narrative, edges and iterations", () => {
  const work = adopt(legacy())
  const by = (n: number) => work.issues.find((issue) => issue.n === n)!

  expect(work.issues).toHaveLength(28)
  expect(by(10)).toMatchObject({ title: "Shape what the agent sees", about: "The queue's own words", status: "done", note: "merged", updates: [{ text: "landed" }] })
  expect(by(10)).toMatchObject({ narrative: "told", from: [14], order: 3 })
  expect(by(10).iterations.length).toBeGreaterThan(0)
  expect(by(34)).toMatchObject({ status: "lane", lane: 2, narrative: "queue", from: [9, 26] })
  expect(by(9)).toMatchObject({ status: "done", about: FROM_MAP, narrative: "queue" })
  expect(by(35)).toMatchObject({ narrative: "shell", from: [31, 33] })
  expect(by(38)).toMatchObject({ narrative: "queue", from: [34], updates: [{ text: "begun" }] })
  expect(by(39)).toMatchObject({ narrative: "work", from: [] })
  expect(work.narratives.map((x) => x.id)).toEqual(["told", "alive", "shell", "lab", "queue", "work"])
  expect(work.next).toBe(40)
  expect(seed(work)).toBe(work)
})

test("on first load the tab's issues migrate into the session's file, which a runtime started again reads; never fewer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "queue-"))
  const file = join(dir, FILE)

  try {
    const first = story(queue(store(() => file)), { effects: "real", model: legacy() as unknown as Model })

    await heard()
    expect((first.agent.sees() as { issues: unknown[] }).issues).toHaveLength(28)

    const saved = JSON.parse(readFileSync(file, "utf8")) as Work

    expect(saved.issues).toHaveLength(28)
    expect(saved.seeded).toBe(true)

    // A second tab, and a runtime started again over the same file: the same work, and the tab kept before brings nothing new.
    const again = story(queue(store(() => file)), { effects: "real" })

    await heard()
    expect(again.agent.sees()).toEqual(first.agent.sees())
    await again.agent.call("/issues/39", "drop", { n: 39 })
    expect((JSON.parse(readFileSync(file, "utf8")) as Work).issues).toHaveLength(27)

    // A change written from outside, whole as the store writes it, is heard by a tab that follows the file.
    writeJsonFile(file, { ...saved, issues: saved.issues.filter((issue) => issue.n !== 35) })
    await heard()
    expect((again.agent.sees("/issues/35") as unknown) ?? null).toBeNull()

    // Work that cannot be read is never written over: the tab says so, and keeps what it showed.
    writeFileSync(file, "{ not json")

    const broken = story(queue(store(() => file)), { effects: "real", model: legacy() as unknown as Model })

    await heard()
    expect(broken.agent.sees()).toHaveProperty("broken")
    expect((broken.agent.sees() as { issues: unknown[] }).issues).toHaveLength(28)
    expect(readFileSync(file, "utf8")).toBe("{ not json")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a tab that brings work from before has it told to every tab that follows the session's work", async () => {
  const work = store()
  const open = story(queue(work), { effects: "real" })

  await heard()
  expect((open.agent.sees() as { issues: unknown[] }).issues).toHaveLength(0)
  story(queue(work), { effects: "real", model: legacy() as unknown as Model })
  await heard()
  expect((open.agent.sees() as { issues: unknown[] }).issues).toHaveLength(28)
})
