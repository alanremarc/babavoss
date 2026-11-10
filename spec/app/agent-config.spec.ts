// Fixture apps prove promptware sizes, live CLI answers, failures, selection, refresh and scratch cleanup.
import { notesApp } from "../support/notes.ts"
import { poll } from "../support/poll.ts"
import { mkdirSync, mkdtempSync, existsSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { run } from "#babavoss/core/index.ts"
import { agentConfigPorts, agentConfigSurface, frontmatter, readPromptware, runOpen, size } from "../../skills/babavoss/src/utils/agent-config/index.ts"

const dirs: string[] = []
const scratch = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "ac-fixture-")))

  dirs.push(d)

  return d
}
const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const app = (dir: string, body = 'console.log("Hello agent")') => {
  write(join(dir, "SKILL.md"), "---\nname: demo\ndescription: Keep notes\n---\nOpen the app.\n")
  write(join(dir, "scripts/open.ts"), body)
}
const memory = () => ({ load: () => undefined, save: () => {} })
const agent = "agent:s1"
const until = (read: () => unknown, value: object) => poll(read, { timeout: 10000 }).toMatchObject(value)

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
it("reads the root description, body and each nested reference with sizes, and permits no references", () => {
  const dir = scratch()

  app(dir)
  expect(readPromptware(dir, dir).references).toEqual([])
  write(join(dir, "references/a.md"), "Read A")
  write(join(dir, "references/nested/b.txt"), "Read B")

  const read = readPromptware(dir, dir)

  expect(read.skill).toEqual({ name: "demo", description: "Keep notes", text: "Open the app.\n", file: "SKILL.md" })
  expect(size(read.skill.description)).toEqual({ chars: 10, tokens: 3 })
  expect(size(read.skill.text)).toEqual({ chars: 14, tokens: 4 })
  expect(read.references.map((r) => [r.name, r.text, size(r.text)])).toEqual([
    ["a.md", "Read A", { chars: 6, tokens: 2 }],
    ["nested/b.txt", "Read B", { chars: 6, tokens: 2 }],
  ])
  expect(frontmatter('---\nname: "demo"\ndescription: >\n  Keep\n  notes\n---\nBody')).toEqual({
    fields: { name: "demo", description: "Keep notes" },
    body: "Body",
  })
})
it("computes open from the app CLI with duration and scratch state, and stops its runtime", async () => {
  const dir = scratch()

  app(
    dir,
    `import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
if (process.argv[2] !== "--session") throw Error("wrong args")
const at = process.env.BABAVOSS_HOME + "/sessions/" + process.argv[3] + "/demo"
mkdirSync(at, { recursive: true })
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" })
child.unref()
writeFileSync(at + "/service.json", JSON.stringify({ pid: child.pid, token: "t", port: 1 }))
console.log(JSON.stringify({ pid: child.pid, state: process.env.BABAVOSS_HOME, home: process.env.BABAVOSS_HOME, bin: process.env.BABAVOSS_BIN }))`
  )

  const before = readdirSync(tmpdir()).filter((n) => n.startsWith("agent-config-"))
  const result = await runOpen(dir, new AbortController().signal)

  expect(result.status).toBe("ready")
  expect(result.tookMs).toBeGreaterThan(0)

  const { pid, state, home, bin } = JSON.parse(result.text)

  expect(existsSync(state)).toBe(false)
  expect(home).toBe(state)
  expect(bin).toBe(join(dirname(state), "bin"))
  expect(existsSync(bin)).toBe(false)
  expect(() => process.kill(pid, 0)).toThrow()
  expect(readdirSync(tmpdir()).filter((n) => n.startsWith("agent-config-"))).toEqual(before)
})
it("computes the notes app's actual door answer and removes its scratch session", async () => {
  const before = readdirSync(tmpdir()).filter((name) => name.startsWith("agent-config-"))
  const result = await runOpen(notesApp(join(scratch(), "notes")), new AbortController().signal)

  expect(result.status).toBe("ready")
  expect(result.text).toContain("demo PATH")
  expect(result.text).toContain("page:")
  expect(result.text).toContain("bv is now a command on this machine")
  expect(result.tookMs).toBeGreaterThan(0)
  expect(readdirSync(tmpdir()).filter((name) => name.startsWith("agent-config-"))).toEqual(before)
})
it("shows a failing CLI's stdout and stderr as failure output", async () => {
  const dir = scratch()

  app(dir, 'console.log("partial"); console.error("broken"); process.exit(3)')
  expect(await runOpen(dir, new AbortController().signal)).toMatchObject({ status: "failed", text: "", output: "partial\nbroken\n", error: "exited 3" })
})
it("lists apps, selects one, exposes exact promptware and reference text, refreshes and returns to the list", async () => {
  const project = scratch()

  app(join(project, "a"))
  app(join(project, "b"))
  write(join(project, "a/references/a.md"), "Reference A")

  const r = run(agentConfigSurface(agentConfigPorts(project)), memory())

  try {
    await until(() => r.read("/", agent), { app: null, apps: [{ id: "a" }, { id: "b" }] })
    expect(await r.call("/", "select", { app: "missing" }, agent)).toMatchObject({ outcome: "refused" })
    await r.call("/", "select", { app: "a" }, agent)
    await until(() => r.read("/open", agent), { status: "ready", text: "Hello agent\n", chars: 12, tokens: 3, tookMs: expect.any(Number) })
    expect(r.read("/", agent)).toMatchObject({
      description: { text: "Keep notes", chars: 10, tokens: 3 },
      skill: { text: "Open the app.\n", chars: 14, tokens: 4 },
      references: [{ name: "a.md", chars: 11, tokens: 3 }],
    })
    expect(r.read("/references/a.md", agent)).toMatchObject({ text: "Reference A", chars: 11 })
    write(join(project, "a/scripts/open.ts"), 'console.log("Fresh")')
    await r.call("/", "refresh", {}, agent)
    await until(() => r.read("/open", agent), { status: "ready", text: "Fresh\n" })
    await r.call("/", "back", {}, agent)
    await until(() => r.read("/", agent), { app: null })
  } finally {
    await r.stop()
  }
})
it("opens the sole app automatically, with no references", async () => {
  const project = scratch()

  app(project)

  const r = run(agentConfigSurface(agentConfigPorts(project)), memory())

  try {
    await until(() => r.read("/", agent), { app: { name: "demo" }, references: [], answer: { status: "ready" } })
    expect(r.read("/", agent)).not.toHaveProperty("back")
  } finally {
    await r.stop()
  }
})
it("stops superseded computation and drops late answers on refresh", async () => {
  const project = scratch()

  app(project)

  const ports = agentConfigPorts(project)
  const waiting: { signal: AbortSignal; release: (value: Awaited<ReturnType<typeof runOpen>>) => void }[] = []

  ports.open = (_dir, signal) =>
    new Promise((resolve) => {
      waiting.push({ signal, release: resolve })
    })

  const r = run(agentConfigSurface(ports), memory())

  try {
    await poll(() => waiting.length).toBe(1)
    await r.call("/", "refresh", {}, agent)
    await poll(() => waiting.length).toBe(2)
    expect(waiting[0]!.signal.aborted).toBe(true)

    const result = (text: string) => ({ status: "ready" as const, text, output: text, command: "open", tookMs: 1 })

    waiting[1]!.release(result("fresh"))
    waiting[0]!.release(result("stale"))
    await until(() => r.read("/open", agent), { text: "fresh", status: "ready" })
  } finally {
    await r.stop()
  }
})
