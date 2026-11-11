// The app opened through its cli: answers carry agent and person changes.
import { notesApp } from "../support/notes.ts"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { endpointFile, readJsonFile, type Endpoint } from "#babavoss/core/index.ts"

const dirs: string[] = []
const run = (file: string, args: string[], input: string, state: string) => {
  const result = spawnSync(process.execPath, [file, ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, BABAVOSS_HOME: state, BABAVOSS_BIN: state },
  })

  return { out: result.stdout, err: result.stderr, status: result.status }
}
const sessionDir = (state: string) => join(state, "sessions", "S", "demo")
const stopRuntime = (state: string) => {
  const endpoint = readJsonFile<Endpoint>(endpointFile(sessionDir(state)))

  if (endpoint) process.kill(endpoint.pid, "SIGTERM")
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    stopRuntime(dir)
    rmSync(dir, { recursive: true, force: true })
  }
})

it("opens notes, carries changes after calls, and reports a person's change in the next answer", async () => {
  const state = mkdtempSync(join(tmpdir(), "demo-"))

  dirs.push(state)

  const entry = join(notesApp(join(state, "app")), "scripts/open.ts")
  const cli = (...args: string[]) => run(entry, ["--session", "S", ...args], "", state)
  const start = cli()

  expect(start.status, start.err).toBe(0)
  // The fixture carries the product's package, and so its version.
  expect(start.out).toContain(`demo ${(await Bun.file("skills/babavoss/package.json").json()).version}`)
  expect(start.out).toContain("notes.count: 0")
  expect(start.out).toContain("page: http://127.0.0.1:")

  const called = cli("/", "add", "text=hello")

  expect(called.status, called.err).toBe(0)
  expect(called.out).toContain("notes.count: 0 → 1")
  expect(cli("/notes").out).toContain('"hello"')
  expect(cli("/notes", "remove", "n=2").status).toBe(1)

  const endpoint = readJsonFile<Endpoint>(endpointFile(sessionDir(state)))!
  const response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "babavoss-service": endpoint.token },
    body: JSON.stringify({ handle: "add", args: { text: "from person" } }),
  })

  expect(response.ok).toBe(true)
  expect(cli("/notes").out).toContain('latest: "hello" → "from person"')
  expect(cli("/notes/1", "remind", "n=1", "seconds=0.2").status).toBe(0)
  expect(cli("wait", "2").out).toContain("due: 0 → 1")
})
