// The authoring app opened and operated through its cli.
import { poll } from "../support/poll.ts"
import { spawnSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "bun:test"
import { endpointFile, findService, readJsonFile, type Endpoint } from "#babavoss/core/index.ts"

const src = fileURLToPath(new URL("../../skills/babavoss/", import.meta.url))
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
    const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "babavoss")))

    try {
      if (endpoint) process.kill(endpoint.pid, "SIGTERM")
    } catch {
      // Already ended.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

it("presents its utils, opens agent-config as a tab through its command, and reads what the agents load", async () => {
  const state = mkdtempSync(join(tmpdir(), "author-"))

  dirs.push(state)

  const start = run("scripts/open.ts", ["--session", "S"], "", state)

  expect(start.status, start.err).toBe(0)
  expect(start.out).toContain("babavoss 0.1.0")
  expect(start.out).toContain('"agent-config"\t')
  expect(start.out).toContain('utils.0.open: babavoss / open util="agent-config"')
  expect(start.out).toContain('"playground"\t')
  expect(start.out).not.toContain("utils.2.")
  expect(start.out).toContain("page: http://127.0.0.1:")

  const opened = run("scripts/open.ts", ["--session", "S", "/", "open", "util=agent-config"], "", state)

  expect(opened.status, opened.err).toBe(0)
  expect(opened.out).toContain('"/tabs/1"')
  expect(opened.out).toContain('"agent-config"')
  // The repository's apps are its scopes, listed until one is selected.
  await poll(() => run("scripts/open.ts", ["--session", "S", "/tabs/1"], "", state).out, { timeout: 15_000 }).toContain('"payments"')
})

it("works on the session's directory, whoever wakes its runtime and from wherever: a subagent's worktree, its command there", async () => {
  const scratch = () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "author-")))

    dirs.push(dir)

    return dir
  }
  const [state, project, worktree] = [scratch(), scratch(), scratch()]
  const restart = async () => {
    process.kill(readJsonFile<Endpoint>(endpointFile(join(state, "sessions", "S", "babavoss")))!.pid, "SIGKILL")
    await poll(() => findService(join(state, "sessions", "S", "babavoss"))).toBeUndefined()
  }

  expect(run("scripts/open.ts", ["--session", "S"], "", state, project).status).toBe(0)
  await restart()

  const subagent = run("scripts/open.ts", ["--session", "S"], "", state, worktree)

  expect(subagent.status, subagent.err).toBe(0)
  expect(subagent.out).toContain("babavoss 0.1.0")
  await restart()

  const cli = (...args: string[]) => run("scripts/open.ts", ["--session", "S", ...args], "", state, worktree).out

  cli("/", "open", "util=playground")
  expect(cli("/tabs/1")).toContain(`project: ${JSON.stringify(project)}`)
})
