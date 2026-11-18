// The standalone client and root door, exercised with isolated machine, bin and state directories: the word's runs, sessions and answers.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { ownRun, SERVICE_HEADER } from "../../framework/core/bv/bv.ts"
import { HUSH_MS, QUIET_LINE } from "../../framework/core/runtime/turn.ts"
import { client, setup, cleanup } from "../support/word.ts"

afterEach(cleanup)

for (const variable of ["CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID"] as const)
  it(`uses ${variable}`, () => {
    const s = setup()

    s.env.CLAUDE_CODE_SESSION_ID = ""
    s.env.CODEX_THREAD_ID = ""
    s.env[variable] = "S"
    expect(s.run().status).toBe(0)
  })
it("rejects both session variables", () => {
  const s = setup()

  s.env.CODEX_THREAD_ID = "C"
  expect(s.run()).toMatchObject({ status: 2 })
  expect(s.run().err).toContain("CLAUDE_CODE_SESSION_ID and CODEX_THREAD_ID")
})
it("rejects neither session variable", () => {
  const s = setup()

  s.env.CLAUDE_CODE_SESSION_ID = ""
  expect(s.run().status).toBe(2)
  expect(s.run().err).toContain("agent's shell")
})
it("accepts --session over both variables", () => {
  const s = setup()

  s.env.CODEX_THREAD_ID = "C"
  expect(s.run(["--session", "S"]).status).toBe(0)
})
it("says nothing is open", () => expect(setup().run().out).toContain("nothing is open in this session"))
it("opens one root with client usage", () => {
  const s = setup()

  expect(s.open().status).toBe(0)

  const answer = s.run()

  expect(answer.status, answer.err).toBe(0)
  expect(answer.out).toContain("demo: demo")
  expect(s.run(["demo", "/"]).out).toContain("notes.count: 0")
})
it("lists two roots and requires a name", () => {
  const s = setup()

  s.open()

  const file = join(s.root, "sessions/S/open.json")
  const roots = JSON.parse(readFileSync(file, "utf8"))

  writeFileSync(file, JSON.stringify({ ...roots, other: roots.demo }))
  expect(s.run().out).toBe("demo: demo\nother: demo\n")
  expect(s.run(["/"]).status).toBe(2)
  expect(s.run(["demo", "/"]).status).toBe(0)
})
it("reads a path", () => {
  const s = setup()

  s.open()
  expect(s.run(["/notes"]).status).toBe(0)
})
it("calls with name=value", () => {
  const s = setup()

  s.open()
  expect(s.run(["/", "add", "text=Pharmacy"]).status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("Pharmacy")
})
it("reads stdin containing an apostrophe", () => {
  const s = setup()

  s.open()
  expect(s.run(["/", "add", "text=@-"], client, "person's note").status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("person's note")
})
it("reads a value @PATH from its file, refuses one with no file, and keeps other text that begins with @", () => {
  const s = setup()
  const note = join(s.root, "note.md")

  writeFileSync(note, "# From a file\n")
  s.open()
  expect(s.run(["/", "add", `text=@${note}`]).status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("From a file")

  const missing = s.run(["/", "add", `text=@${join(s.root, "none.md")}`])

  expect(missing.status).toBe(2)
  expect(missing.err).toContain(`no file at ${join(s.root, "none.md")}`)
  expect(s.run(["/", "add", "text=@alice says hi"]).status).toBe(0)
  expect(s.run(["/", "add", "text=@-"], client, "@/not/a/file").status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("@alice says hi")
  expect(s.run(["/notes"]).out).toContain("@/not/a/file")
})
it("returns exit 1 for refusal", () => {
  const s = setup()

  s.open()
  expect(s.run(["/", "add", "text= "]).status).toBe(1)
})
it("returns exit 1 for missing path", () => {
  const s = setup()

  s.open()
  expect(s.run(["/missing"]).status).toBe(1)
})
it("returns exit 2 for usage", () => {
  const s = setup()

  s.open()
  expect(s.run(["/", "add", "bad"]).status).toBe(2)
})
it("wait is released by a person's call", async () => {
  const s = setup()

  s.open()

  const waiting = Bun.spawn([process.execPath, client, "wait", "3"], { env: s.env, stdout: "pipe" })
  const e = s.endpoint()

  await fetch(`http://127.0.0.1:${e.port}/`, {
    method: "POST",
    headers: { accept: "application/json", [SERVICE_HEADER]: e.token },
    body: JSON.stringify({ handle: "add", args: { text: "person" } }),
  })
  expect(await new Response(waiting.stdout).text()).toContain("person")
  expect(await waiting.exited).toBe(0)
})
it("finds the hooks quiet only where the session's own agent went unheard: a run by --session from another session, or none, is not its", async () => {
  const s = setup()
  // The silence is a quarter of a second here, where it is ten in use: the runtime is started with it.
  const hush = 250

  s.env.BABAVOSS_HUSH_MS = String(hush)
  s.open()

  const e = s.endpoint()
  const hook = () => fetch(`http://127.0.0.1:${e.port}/_/turn`, { method: "POST", headers: { accept: "text/plain", [SERVICE_HEADER]: e.token }, body: "working" })
  const by = (session: string) => spawnSync(process.execPath, [client, "--session", "S", "/notes"], { env: { ...s.env, CLAUDE_CODE_SESSION_ID: session }, encoding: "utf8" }).stdout

  // A run is the agent's own where its harness's session is the one it runs in, as the environment says.
  expect(ownRun("S", { CLAUDE_CODE_SESSION_ID: "S" })).toBe(true)
  expect(ownRun("S", { CODEX_THREAD_ID: "S" })).toBe(true)
  expect(ownRun("S", { CLAUDE_CODE_SESSION_ID: "another" })).toBe(false)
  expect(ownRun("S", {})).toBe(false)
  // The agent's run, its hook heard after it; then a lane's worker posts in the session's name from its own session, and a
  // script from none; the agent's next run, long after, follows only its own hook.
  expect(s.run(["/notes"]).out).not.toContain(QUIET_LINE)
  await hook()
  expect(by("another")).not.toContain(QUIET_LINE)
  expect(by("")).not.toContain(QUIET_LINE)
  await Bun.sleep(hush + 250)
  expect(s.run(["/notes"]).out).not.toContain(QUIET_LINE)
  // And the silence is real: that run had no hook after it, so its next, as long after, finds them quiet.
  await Bun.sleep(hush + 250)
  expect(s.run(["/notes"]).out).toContain(QUIET_LINE)
  expect(HUSH_MS).toBe(10_000)
})
it("sleep then call, at once, wakes the runtime at the address the session had, so nothing is announced; close is sleep's old name", async () => {
  const s = setup()

  s.open()

  const port = s.endpoint().port
  const slept = s.run(["sleep"])

  expect(slept.out).toContain("asleep; any call wakes it")
  expect(slept.out).not.toContain("page:")
  expect(s.run(["/"]).status).toBe(0)
  expect(s.run(["close"]).out).toContain("asleep; any call wakes it")
  // No pause: the runtime before it may still be letting go of the session, and the call waits that out.
  expect(s.run(["/"])).toMatchObject({ status: 0, out: expect.not.stringContaining("page:") })
  expect(s.endpoint().port).toBe(port)
})
it("keeps its address after an unannounced runtime death", async () => {
  const s = setup()

  s.open()

  const port = s.endpoint().port

  process.kill(s.endpoint().pid, "SIGKILL")
  await Bun.sleep(100)
  expect(s.run(["/"]).out).not.toContain("a new address")
  expect(s.endpoint().port).toBe(port)
})
