// The standalone client and root door, exercised with isolated machine, bin and state directories: a runtime alive with nothing at its port, and roots side by side.
import { poll } from "../support/poll.ts"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import type { Subprocess } from "bun"
import { client, setup, cleanup } from "../support/word.ts"

afterEach(cleanup)

describe("a runtime alive with nothing listening at its port", () => {
  const fakes: Subprocess[] = []
  /**
   * A process that holds the session's lock and service file, as its runtime does. `deaf` listens on nothing, having said it
   * began closing a minute ago, as a runtime whose close hangs does; `holding` answers a probe at once and the rest late, as a
   * runtime holding requests while changed code loads does. Its command line is the session's runtime's unless `as` says another.
   */
  const fake = async (s: ReturnType<typeof setup>, mode: "deaf" | "holding", as = [s.entry, "--serve", "S"]) => {
    const script = join(s.root, "fake.ts")
    const service = resolve("framework/core/runtime/service.ts")

    writeFileSync(
      script,
      `// A session's runtime as its client finds it, without the runtime.
import { createServer } from "node:http"
import { ownService } from ${JSON.stringify(service)}
const [dir, mode] = process.argv.slice(-2)
const owner = ownService(dir)!
const server = createServer((req, res) => {
  res.setHeader("babavoss-service", owner.identity.token)
  if (req.headers["babavoss-probe"]) return res.end("{}")
  setTimeout(() => res.end("held answer"), 1500)
})
await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()))
const port = (server.address() as { port: number }).port
if (mode === "deaf") await new Promise<void>((done) => server.close(() => done()))
owner.publish(port, mode === "deaf" ? Date.now() - 60_000 : undefined)
console.log("ready")
setInterval(() => {}, 60_000)
`,
    )

    const state = join(s.root, "sessions/S/demo")
    const child = Bun.spawn([process.execPath, script, ...as, state, mode], { stdout: "pipe", stderr: "inherit" })

    const reader = child.stdout.getReader()

    fakes.push(child)
    await reader.read()
    reader.releaseLock()

    return child
  }
  const settle = async (s: ReturnType<typeof setup>) => {
    s.open()
    expect(s.run(["/", "add", "text=Pharmacy"]).status).toBe(0)

    const { pid } = s.endpoint()

    s.run(["close"])
    await poll(() => existsSync(join(s.root, "sessions/S/demo/service.json"))).toBe(false)
    await poll(() => {
      try {
        process.kill(pid, 0)

        return true
      } catch {
        return false
      }
    }).toBe(false)
  }
  const alive = (child: Subprocess) => child.exitCode === null && child.signalCode === null

  afterEach(() => {
    for (const child of fakes.splice(0)) child.kill("SIGKILL")
  })

  it("is ended, once it refuses past the time a runtime takes to close, and a fresh one answers with the state kept, saying so", async () => {
    const s = setup()

    await settle(s)

    const deaf = await fake(s, "deaf")
    // Run apart, so this process reaps the fake it started once the client ends it, as the system reaps a runtime.
    const command = Bun.spawn([process.execPath, client, "/notes"], { env: s.env, stdout: "pipe", stderr: "pipe" })
    const [out, err] = await Promise.all([new Response(command.stdout).text(), new Response(command.stderr).text()])

    expect(await command.exited, err).toBe(0)
    expect(out).toStartWith("demo: the runtime had stopped answering and was started again; its state is kept\n")
    expect(out).toContain("Pharmacy")
    await deaf.exited
    expect(s.endpoint().pid).not.toBe(deaf.pid)
    // Replaced once: the next command finds the fresh one, and says nothing of it.
    expect(s.run(["/notes"]).out).not.toContain("stopped answering")
  })

  it("is never signalled where its command line is not this session's runtime of this root: the command fails as before", async () => {
    const s = setup()

    await settle(s)

    const other = await fake(s, "deaf", [s.entry, "--serve", "another"])
    const answer = s.run(["/notes"])

    expect(answer.status).toBe(1)
    expect(answer.err).toContain("cannot listen on or reach this machine’s runtime")
    expect(alive(other)).toBe(true)
  })

  it("is left alone while it listens, however long it holds a request", async () => {
    const s = setup()

    await settle(s)

    const holding = await fake(s, "holding")
    const answer = s.run(["/notes"])

    expect(answer.out).toContain("held answer")
    expect(answer.out).not.toContain("stopped answering")
    expect(alive(holding)).toBe(true)
  })
})

it("refused registry names what the harness must allow", () => {
  const s = setup()

  s.env.BABAVOSS_HOME = join(s.root, "file")
  writeFileSync(s.env.BABAVOSS_HOME, "occupied")

  const answer = s.open()

  expect(answer.status).toBe(1)
  expect(answer.err.trim()).toBe("cannot register the root in its state folder; allow writing the registry (under a sandbox, in the harness settings)")
})
it("refused runtime names what the harness must allow", () => {
  const s = setup()
  const dead = join(s.root, "dead.ts")

  writeFileSync(dead, "// A runtime refused by its machine.\nprocess.exit(1)\n")
  mkdirSync(join(s.root, "sessions/S"), { recursive: true })
  mkdirSync(s.env.BABAVOSS_HOME, { recursive: true })
  writeFileSync(join(s.root, "sessions/S/open.json"), JSON.stringify({ dead: { entry: dead, directory: s.root, state: s.env.BABAVOSS_HOME } }))

  const answer = s.run(["dead", "/"])

  expect(answer.status).toBe(1)
  expect(answer.err.trim()).toBe(
    `cannot listen on or reach this machine’s runtime; allow resident processes and loopback listening and connections (under a sandbox, in the harness settings); see ${join(s.env.BABAVOSS_HOME, "service.log")}`
  )
})

it("makes a root's word and uses it", () => {
  const s = setup()

  expect(s.open().out).toContain("command: demo;")
  const answer = spawnSync(join(s.bin, "demo"), ["/"], { env: s.env, encoding: "utf8" })

  expect(answer.status, answer.stderr).toBe(0)
  expect(answer.stdout).toContain("actions: demo / ACTION")
})
it("keeps another command's word and uses bv NAME", () => {
  const s = setup()
  const occupied = join(s.bin, "demo")

  writeFileSync(occupied, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  s.env.PATH = `${s.bin}:${process.env.PATH}`
  expect(s.open().out).toContain("command: bv demo;")
  expect(readFileSync(occupied, "utf8")).toContain("exit 0")
  expect(s.run(["demo", "/"]).out).toContain("actions: bv demo / ACTION")
})
