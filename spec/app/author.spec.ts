// The authoring app opened and operated through its cli.
import { poll } from "../support/poll.ts"
import { spawnSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "bun:test"
import { endpointFile, findService, readJsonFile, type Endpoint } from "babavoss/core/index.ts"

const src = fileURLToPath(new URL("../../skills/baba/", import.meta.url))
const dirs: string[] = []
const run = (file: string, args: string[], input: string, state: string, cwd = fileURLToPath(new URL("../..", import.meta.url))) => {
  const result = spawnSync(process.execPath, [join(src, file), ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, BABAVOSS_HOME: state, BABAVOSS_BIN: state },
    cwd,
  })

  return { out: result.stdout, err: result.stderr, status: result.status }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "baba")))

    try {
      if (endpoint) process.kill(endpoint.pid, "SIGTERM")
    } catch {
      // Already ended.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

it("opens on the build tab, presents its utils, opens promptware as a tab through its command, and reads what the agents load", async () => {
  const state = mkdtempSync(join(tmpdir(), "author-"))

  dirs.push(state)

  const start = run("scripts/open.ts", ["--session", "S"], "", state)

  expect(start.status, start.err).toBe(0)
  expect(start.out).toContain("baba 0.20.0")
  expect(start.out).toContain('"promptware"\t')
  expect(start.out).toContain('utils.1.open: baba / open util="promptware"')
  expect(start.out).toContain('"playground"\t')
  expect(start.out).not.toContain("utils.3.")
  expect(start.out).toContain("page: http://127.0.0.1:")
  // Build is always open: its tab is there from the start, never offered to open, and says what to do first.
  expect(start.out).not.toContain("utils.0.open")
  expect(start.out).toContain('tabs.0.util: "build"')
  await poll(() => run("scripts/open.ts", ["--session", "S", "/"], "", state).out + start.out, { timeout: 15_000 }).toContain("before any code")

  const opened = run("scripts/open.ts", ["--session", "S", "/", "open", "util=promptware"], "", state)

  expect(opened.status, opened.err).toBe(0)
  expect(opened.out).toContain('"/tabs/2"')
  expect(opened.out).toContain('"promptware"')
  // The repository's apps are its scopes, listed until one is selected.
  await poll(() => run("scripts/open.ts", ["--session", "S", "/tabs/2"], "", state).out, { timeout: 15_000 }).toContain('"payments"')
})

it("works on the session's directory, whoever wakes its runtime and from wherever: a subagent's worktree, its command there", async () => {
  const scratch = () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "author-")))

    dirs.push(dir)

    return dir
  }
  const [state, project, worktree] = [scratch(), scratch(), scratch()]
  const restart = async () => {
    process.kill(readJsonFile<Endpoint>(endpointFile(join(state, "sessions", "S", "baba")))!.pid, "SIGKILL")
    await poll(() => findService(join(state, "sessions", "S", "baba"))).toBeUndefined()
  }

  expect(run("scripts/open.ts", ["--session", "S"], "", state, project).status).toBe(0)
  await restart()

  const subagent = run("scripts/open.ts", ["--session", "S"], "", state, worktree)

  expect(subagent.status, subagent.err).toBe(0)
  expect(subagent.out).toContain("baba 0.20.0")
  await restart()

  const cli = (...args: string[]) => run("scripts/open.ts", ["--session", "S", ...args], "", state, worktree).out

  cli("/", "open", "util=playground")
  expect(cli("/tabs/1")).toContain(`project: ${JSON.stringify(project)}`)
})
