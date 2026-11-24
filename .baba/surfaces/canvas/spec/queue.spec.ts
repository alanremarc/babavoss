// Canvas takes the worktree's old queues once and leaves their files in place.
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeJsonFile } from "babavoss/core/index.ts"
import type { Canvas } from "../src/canvas.ts"
import { fromQueues } from "../src/queue.ts"
import { store } from "../src/store.ts"

test("imports multiple sessions once, keeping the current session's IDs and the other session's references", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canvas-queue-"))
  const file = join(dir, "canvas/canvas.json")
  const active = join(dir, "sessions/current/work.json")
  const earlier = join(dir, "sessions/archive/work.json")
  const issue = { n: 1, title: "Port Canvas", about: "Use the worktree record.", status: "lane", lane: 2, order: 0, narrative: "work" }
  const narratives = [{ id: "work", title: "The work" }]
  const seed = () => fromQueues(dir, "current")
  const open = async () => {
    let result: Canvas | undefined
    const signal = AbortSignal.abort()

    await store(() => file, seed).open((canvas) => { result = canvas }, signal)

    return result!
  }

  try {
    writeJsonFile(active, { issues: [{ ...issue, updates: [{ t: 100, text: "Reported" }], note: "Testing" }], narratives, next: 4 })
    writeJsonFile(earlier, { issues: [
      { ...issue, title: "Older ticket", status: "done", iterations: [{ title: "First pass", why: "Why", decided: "Decision", outcome: "Result" }] },
      { ...issue, n: 2, title: "Await approval", status: "draft", order: 1, from: [1] },
    ], narratives })
    const original = readFileSync(earlier, "utf8")
    const canvas = await open()

    expect(canvas.tickets).toMatchObject([
      { n: 1, status: "working", worker: "subagent", phase: "The work", posts: [{ text: "Reported" }, { text: "Testing" }] },
      { n: 4, title: "Older ticket", status: "done", about: expect.stringContaining("First pass\n\nWhy\n\nDecision\n\nResult") },
      { n: 2, title: "Await approval", status: "waiting", about: expect.stringContaining("Came from #4.") },
    ])
    expect(canvas.next).toBe(5)
    expect(readFileSync(earlier, "utf8")).toBe(original)

    writeJsonFile(active, { issues: [], narratives })
    expect(await open()).toEqual(canvas)
  } finally {
    rmSync(dir, { recursive: true })
  }
})
