// The root opened through its cli: answers carry the agent's own changes and what was heard, a wait the person's changes, and come from the code on disk however it was
// changed under the running root.
import { notesRoot } from "../support/notes.ts"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, expect, it } from "bun:test"
import { endpointFile, readJsonFile, type Endpoint } from "babavoss/core/index.ts"

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

  const entry = join(notesRoot(join(state, "root")), "scripts/open.ts")
  const cli = (...args: string[]) => run(entry, ["--session", "S", ...args], "", state)
  const start = cli()

  expect(start.status, start.err).toBe(0)
  // The fixture carries the product's package, and so its version.
  expect(start.out).toContain("demo 0.1.0")
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
  // Heard with the next answer, in one line; what it changed, at the next boundary.
  expect(cli("/notes").out).toEndWith("notices:\nthe person acted on /\n")
  expect(cli("wait", "0").out).toContain('latest: "hello" → "from person"')
  expect(cli("/notes/1", "remind", "n=1", "seconds=0.2").status).toBe(0)
  // A reminder due is a fact the surface changed by itself: it ends no wait, which tells it when it ends.
  expect(cli("wait", "1").out).toContain("due: 0 → 1")
})

it("answers with the code on disk after it is replaced, deleted and made again, or broken and then mended", async () => {
  const state = mkdtempSync(join(tmpdir(), "demo-"))

  dirs.push(state)

  const root = notesRoot(join(state, "root"))
  const entry = join(root, "scripts/open.ts")
  const source = join(root, "src/root.ts")
  const original = readFileSync(source, "utf8")
  const opener = readFileSync(entry, "utf8")
  // The agent calls through the standalone client, which loads none of the root's code: only the runtime does.
  const bv = (...args: string[]) => run(join(process.cwd(), "framework/core/bv/bv.ts"), ["--session", "S", "demo", ...args], "", state)
  const edition = (name: string) => original.replace("due: m.items.filter", `edition: "${name}",\n    due: m.items.filter`)

  expect(run(entry, ["--session", "S"], "", state).status).toBe(0)
  expect(bv("/", "add", "text=kept").status).toBe(0)

  // Written to a temporary file and renamed over the source, as editors and agents' tools write.
  writeFileSync(`${source}.tmp`, edition("renamed"))
  renameSync(`${source}.tmp`, source)
  expect(bv("/").out).toContain('edition: "renamed"')

  // Gone for a moment, the entry with it, as a checkout leaves them: the hot reload in between fails on the missing files.
  rmSync(source)
  rmSync(entry)
  await sleep(400)
  writeFileSync(entry, opener)
  writeFileSync(source, edition("checked out"))

  const after = bv("/")

  expect(after.out).toContain("its runtime started again with the code as it is")
  expect(after.out).toContain('edition: "checked out"')
  expect(after.out).toContain('latest: "kept"')

  // Broken code is said in the answer, with the file it is in; mended, the next answer is from it.
  writeFileSync(source, `${original}\nexport const broken = (`)

  const broken = bv("/")

  expect(broken.status).toBe(1)
  expect(broken.err).toContain("demo's runtime did not start; it said:")
  expect(broken.err).toContain(`${source}:`)
  writeFileSync(source, edition("mended"))
  expect(bv("/").out).toContain('edition: "mended"')
}, 30_000)
