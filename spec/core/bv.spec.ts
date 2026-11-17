// The standalone client and root door, exercised with isolated machine, bin and state directories.
import { notesRoot } from "../support/notes.ts"
import { poll } from "../support/poll.ts"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync, statSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import type { Subprocess } from "bun"
import { ACTOR_HEADER, CALL_HEADER, CALL_ID_HEADER, DEAF_MS, ENDPOINT_FILE, ownRun, SERVICE_HEADER, shaped, summed, under, VERSION } from "../../framework/core/bv/bv.ts"
import {
  ACTOR_HEADER as actorHeader,
  CALL_HEADER as callHeader,
  CALL_ID_HEADER as callIdHeader,
  DEAF_MS as deafMs,
  SERVICE_HEADER as serviceHeader,
  endpointFile,
} from "../../framework/core/runtime/service.ts"
import { HUSH_MS, QUIET_LINE } from "../../framework/core/runtime/turn.ts"

const client = resolve("framework/core/bv/bv.ts")
const roots: string[] = []

function setup(dev = false) {
  const root = mkdtempSync(join(tmpdir(), "bv-spec-"))

  roots.push(root)

  const entry = join(notesRoot(join(root, "root")), "scripts/open.ts")
  const bin = join(root, "bin")

  mkdirSync(bin)

  const env = {
    ...process.env,
    PATH: process.env.PATH,
    HOME: root,
    CLAUDE_CODE_SESSION_ID: "S",
    CODEX_THREAD_ID: "",
    BABAVOSS_HOME: root,
    BABAVOSS_BIN: bin,
    BABAVOSS_DEV: dev ? "1" : "0",
  }
  const run = (args: string[] = [], file = client, input = "") => {
    const result = spawnSync(process.execPath, [file, ...args], { env, input, encoding: "utf8", timeout: 15000 })

    return { status: result.status, out: result.stdout, err: result.stderr }
  }
  const open = () => run([], entry)
  const endpoint = () =>
    JSON.parse(readFileSync(join(env.BABAVOSS_HOME, "sessions/S/demo/service.json"), "utf8")) as { pid: number; port: number; token: string; instance: string }

  return { entry, root, bin, env, run, open, endpoint }
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    try {
      const endpoint = JSON.parse(readFileSync(join(root, "sessions/S/demo/service.json"), "utf8")) as { pid: number }

      process.kill(endpoint.pid, "SIGTERM")
    } catch {}
    // Let the resident process drain before removing its state.
    await Bun.sleep(100)
    rmSync(root, { recursive: true, force: true })
  }
})
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
  await Bun.sleep(HUSH_MS + 500)
  expect(s.run(["/notes"]).out).not.toContain(QUIET_LINE)
}, 30_000)
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
describe("changed code", () => {
  const edit = (s: ReturnType<typeof setup>) => {
    const source = join(s.root, "root/src/root.ts")

    writeFileSync(source, readFileSync(source, "utf8").replace('description: "Keep a note"', 'description: "Keep a note, as edited"'))
  }

  it("in dev mode restarts the runtime at once: the same address, the notes kept, the new code answering, a reminder under way cut and said", async () => {
    const s = setup(true)

    s.open()
    s.run(["/", "add", "text=Pharmacy"])
    s.run(["/notes/1", "remind", "seconds=60"])

    const before = s.endpoint()

    const answers: string[] = []

    edit(s)
    await poll(() => answers[answers.push(s.run(["/"]).out) - 1], { timeout: 10_000 }).toContain("Keep a note, as edited")
    // The first answer from the code as edited says what the restart cut, as the agent may have to do it again.
    expect(answers.at(-1)).toMatch(/^demo: its code changed \(.*root\.ts\) and it restarted; the restart cut remind by agent:S\n/)

    const after = s.endpoint()

    expect([after.port, after.instance === before.instance, after.pid === before.pid]).toEqual([before.port, false, false])
    expect(s.run(["/"]).out).toContain("Pharmacy")
    expect(s.run(["/"]).out).not.toContain("page:")
  })

  it("in normal mode runs the code it started with, says it changed, and runs it once restarted, which answers at once with nothing under way", async () => {
    const s = setup()

    s.open()

    const before = s.endpoint()

    edit(s)
    await poll(() => s.run(["/"]).out, { timeout: 10_000 }).toContain(`code: changed on disk since instance ${before.instance} started; it runs once restarted: demo restart`)
    expect(s.run(["/"]).out).not.toContain("as edited")

    const restarted = s.run(["restart"])

    expect(restarted.out).toBe(`demo: instance ${before.instance} restarts\ndemo: instance ${s.endpoint().instance} answers\n`)
    expect(s.endpoint().port).toBe(before.port)
    expect(s.run(["/"]).out).toContain("Keep a note, as edited")
    expect(s.run(["/"]).out).not.toContain("code: changed")
  })

  it("in normal mode drains a restart while work runs: the command exits at once naming the instance, and follow returns once its successor answers", async () => {
    const s = setup()

    s.open()
    s.run(["/", "add", "text=Pharmacy"])
    s.run(["/notes/1", "remind", "seconds=2"])

    const { instance } = s.endpoint()
    const asked = Date.now()
    const draining = s.run(["restart"])

    expect(Date.now() - asked).toBeLessThan(1500)
    expect(draining.out).toBe(
      `demo: instance ${instance} is draining to restart: it takes no new calls and restarts once remind by agent:S ended. Wait for it: demo follow ${instance}\n`,
    )
    expect(s.run(["/", "add", "text=Later"])).toMatchObject({ status: 1, out: expect.stringContaining("refused: demo: instance") })

    const followed = s.run(["follow", instance])

    expect(followed.status).toBe(0)
    expect(followed.out).toMatch(new RegExp(`^demo: instance ${instance} restarted; instance (?!${instance})[0-9a-f]+ answers\n$`))
    expect(Date.now() - asked).toBeGreaterThan(1500)
    expect(s.run(["/"]).out).toContain("due: 1")
    // Gone already: follow says so at once.
    expect(s.run(["follow", instance]).out).toMatch(new RegExp(`^demo: instance ${instance} is gone; instance [0-9a-f]+ answers\n$`))
  }, 20_000)
})
it("an open names the page each time, and calls it new only once", () => {
  const s = setup()

  expect(s.open().out).toContain(`page: http://127.0.0.1:${s.endpoint().port}  a new address\n`)

  const again = s.open().out

  expect(again).toContain(`page: http://127.0.0.1:${s.endpoint().port}\n`)
  expect(again).not.toContain("a new address")
})
it("takes another address where the session's last one is taken, and announces it", async () => {
  const s = setup()

  s.open()

  const port = s.endpoint().port

  s.run(["close"])
  await Bun.sleep(150)

  const squatter = Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } })

  try {
    expect(s.run(["/"]).out).toContain("  a new address\n")
    expect(s.endpoint().port).not.toBe(port)
  } finally {
    squatter.stop(true)
  }
})
it("runs a loop of calls", () => {
  const s = setup()

  s.open()
  expect(s.run(["-e", 'for(let i=0;i<3;i++) console.log(await root.call("/","add",{text:String(i)}))']).status).toBe(0)
  expect(s.run(["/"]).out).toContain("notes.count: 3")
})
it("returns a program refusal as data", () => {
  const s = setup()

  s.open()

  const answer = s.run(["-e", 'console.log(await root.call("/","add",{text:""}))'])

  expect(answer.status).toBe(0)
  expect(answer.out).toContain("A note needs text")
})
it("reads program code from stdin", () => {
  const s = setup()

  s.open()
  expect(s.run(["-e", "-"], client, 'console.log(await root.read("/"))').out).toContain("count: 0")
})
it("prints the full help", () => expect(setup().run(["help"]).out).toContain("A refusal ends the program unless it catches it"))
describe("the program door", () => {
  it("names the call's header as the runtime does", () => expect(CALL_ID_HEADER).toBe(callIdHeader))
  it("sums calls up: the same change once, its places together, past ten elided; each refusal with its inputs; what was heard once", () => {
    const calls = Array.from({ length: 12 }, (_, i) => ({ path: `/queue/issues/${i + 3}`, handle: "note", args: { text: "x" }, changed: '+ note: "x"\nnotices:\nheard once' }))

    expect(summed([...calls, { path: "/queue/issues/20", handle: "note", args: { text: "a long note, said in more words than forty" }, refused: "refused: issue 20 is done" }], true)).toBe(
      [
        "12 calls done, 1 refused",
        '/queue/issues/{3,4,5,6,7,8,9,10,…} note ×12: + note: "x"',
        'refused: /queue/issues/20 note text="a long note, said in more words than fo…": issue 20 is done',
        "the refusal ended the program: no call after it was made",
        "notices:",
        "heard once",
      ].join("\n"),
    )
    expect(summed([{ path: "/a", handle: "go", args: {}, changed: "" }, { path: "/b/c", handle: "go", args: {}, changed: "" }])).toBe("2 calls done\n/a /b/c go ×2: nothing changed")
  })
  it("reads a view as data: each action as its handle, its fixed args and its inputs, each input an object that can say more later", () => {
    expect(shaped({ n: 1, rows: [{ done: { kind: "handle", name: "done", args: { n: 1 }, open: { why: "string" }, description: "Mark it done" } }] })).toEqual({
      n: 1,
      rows: [{ done: { handle: "done", args: { n: 1 }, inputs: { why: { type: "string" } } } }],
    })
  })
  it("takes a relative path under the path given before -e", () => {
    expect([under("/queue", "issues/3"), under("/queue", "/notes"), under("/queue/issues", "../lanes"), under("/queue"), under("/", "./a/")]).toEqual([
      "/queue/issues/3",
      "/notes",
      "/queue/lanes",
      "/queue",
      "/a",
    ])
  })
  it("runs a program on standard input, under the path before -e, and answers what it printed, then one summary of its calls", () => {
    const s = setup()

    s.open()

    const program = `
      for (const text of ["a", "b", "c"]) await call("/", "add", { text })
      const view: { notes: { at: string; remind: { handle: string; args: object; inputs: object } }[] } = await read("notes")
      print(view.notes.length, view.notes[0].remind)
      for (const note of view.notes) await call(note.at, note.remind.handle, { seconds: 60 })
    `
    const answer = s.run(["/", "-e", "-"], client, program)

    expect(answer.status, answer.err).toBe(0)
    expect(answer.out).toContain('3 {"handle":"remind","args":{"n":1},"inputs":{"seconds":{"type":"number"}}}\n6 calls done\n')
    expect(answer.out).toMatch(/\n\/notes\/\{1,2,3\} remind ×3: .*due/)
    expect(answer.out).not.toContain("refused")
  })
  it("ends the program at a refusal: the calls before it stay done, and the summary says what was not", () => {
    const s = setup()

    s.open()

    const answer = s.run(["-e", "-"], client, 'await call("/", "add", { text: "a" })\nawait call("/", "add", { text: "" })\nawait call("/", "add", { text: "b" })')

    expect(answer.status).toBe(1)
    expect(answer.out).toContain('1 call done, 1 refused\n')
    expect(answer.out).toContain('refused: / add text="": A note needs text\nthe refusal ended the program: no call after it was made')
    expect(s.run(["/"]).out).toContain("notes.count: 1")
  })
  it("goes on past a refusal the program catches", () => {
    const s = setup()

    s.open()

    const answer = s.run(["-e", "-"], client, 'for (const text of ["a", "", "b"]) await call("/", "add", { text }).catch((e) => print(e.message))')

    expect(answer.status).toBe(0)
    expect(answer.out).toStartWith("refused: / add: A note needs text\n2 calls done, 1 refused\n")
    expect(answer.out).not.toContain("ended the program")
  })
  it("refuses a program that came as more than one word, saying why, and runs one that came as one", () => {
    const s = setup()

    s.open()

    const split = s.run(["-e", 'await call("/", "add", { text: "it', 's" })'])

    expect(split.status).toBe(2)
    expect(split.err).toContain("the program came as 2 words, not one: a quote inside it ended the shell's. Give it on standard input: demo -e - <<'EOF'")
    expect(s.run(["-e", 'await call("/", "add", { text: "one" })']).out).toBe("1 call done\n/ add: notes.count: 0 → 1; latest: null → \"one\"; + action clear\n")
    expect(s.run(["/", "add", "-e", "-"]).err).toContain("-e follows a path alone: demo / -e - <<'EOF' with the program")
    expect(s.run(["-e", `await call("/", "add", { text: "its })`]).err).toContain("a quote inside it may have ended the shell's")
  })
})
it("opens with the page and the command, and of the command's words only what the skill does not say; no pointer to a fuller guide", () => {
  const out = setup().open().out

  expect(out).toMatch(/^page: http:\/\/127\.0\.0\.1:\d+  a new address\ncommand: demo; demo wait \[SECONDS\] waits for the person, then tells what changed\n/)
  expect(out).not.toContain("help")
})
it("door installs bv", () => {
  const s = setup()

  // Put in place without a word of it: the answer names the command to call.
  expect(s.open().out).not.toContain("is now a command")
  expect(statSync(join(s.bin, "bv")).mode & 0o111).toBeTruthy()
})
it("installed bv runs as an extensionless command", () => {
  const s = setup()

  s.open()

  const result = spawnSync(join(s.bin, "bv"), ["/"], { env: s.env, encoding: "utf8" })

  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain("notes.count: 0")
})
it("door replaces an older bv", () => {
  const s = setup()

  writeFileSync(join(s.bin, "bv"), "export const VERSION = 0")
  s.open()
  expect(readFileSync(join(s.bin, "bv"), "utf8")).toContain(`export const VERSION = ${VERSION}`)
})
it("door leaves a current bv", () => {
  const s = setup()
  const text = `export const VERSION = ${VERSION}\n// preserved`

  writeFileSync(join(s.bin, "bv"), text)
  s.open()
  expect(readFileSync(join(s.bin, "bv"), "utf8")).toBe(text)
})
it("door works when bin cannot be written", () => {
  const s = setup()

  s.env.BABAVOSS_BIN = join(s.root, "missing/bin")

  const answer = s.open()

  expect(answer.status, answer.err).toBe(0)
  expect(answer.out).toContain("cannot put bv beside bun")
  expect(answer.out).toContain("allow writing there (under a sandbox, in the harness settings)")
  expect(answer.out).toContain(`command: bun '${s.entry}'`)
})
it("door takes a request", () => {
  const s = setup()

  expect(s.run(["/", "add", "text=door"], s.entry).status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("door")
})
it("duplicates the framework's constants exactly", () => {
  expect(SERVICE_HEADER).toBe(serviceHeader)
  expect(ACTOR_HEADER).toBe(actorHeader)
  expect(CALL_HEADER).toBe(callHeader)
  expect(DEAF_MS).toBe(deafMs)
  expect(endpointFile("state")).toBe(join("state", ENDPOINT_FILE))
})

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
  expect(answer.err.trim()).toBe("cannot register the root under ~/.babavoss; allow writing the registry (under a sandbox, in the harness settings)")
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
  expect(answer.stdout).toContain("add: demo / add")
})
it("keeps another command's word and uses bv NAME", () => {
  const s = setup()
  const occupied = join(s.bin, "demo")

  writeFileSync(occupied, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  s.env.PATH = `${s.bin}:${process.env.PATH}`
  expect(s.open().out).toContain("command: bv demo;")
  expect(readFileSync(occupied, "utf8")).toContain("exit 0")
  expect(s.run(["demo", "/"]).out).toContain("add: bv demo / add")
})


function secondRoot(s: ReturnType<typeof setup>) {
  const directory = notesRoot(join(s.root, "other"))
  const definition = join(directory, "src/root.ts")

  writeFileSync(definition, readFileSync(definition, "utf8").replace('name: "demo"', 'name: "other"'))
  expect(s.run([], join(directory, "scripts/open.ts")).status).toBe(0)
}
it("two roots answer under their words and printed handles run as printed", () => {
  const s = setup()

  s.open()
  secondRoot(s)
  try {
    for (const name of ["demo", "other"]) {
      const answer = spawnSync(join(s.bin, name), ["/"], { env: s.env, encoding: "utf8" })
      const line = answer.stdout.split("\n").find((line) => line.startsWith("add: "))!
      const command = line.slice("add: ".length).split("   ")[0]!.replace("text=string", `text=${name}`).split(" ")
      const called = spawnSync(join(s.bin, command[0]!), command.slice(1), { env: s.env, encoding: "utf8" })

      expect(called.status, called.stderr).toBe(0)
      expect(s.run([name, "/notes"]).out).toContain(name)
    }
    expect(s.run(["demo", "/notes"]).out).not.toContain('"other"')
  } finally {
    s.run(["other", "close"])
  }
})
it("bv alone lists both roots with their commands", () => {
  const s = setup()

  s.open()
  secondRoot(s)
  expect(s.run().out).toBe("demo: demo\nother: other\n")
  s.run(["other", "close"])
})
it("keeps state only under the root within its session", () => {
  const s = setup()

  s.open()
  expect(existsSync(join(s.root, "sessions/S/demo/model.json"))).toBe(true)
  expect(existsSync(join(s.root, "sessions/S/demo/session.json"))).toBe(true)
  expect(readdirSync(join(s.root, "sessions/S")).sort()).toEqual(["demo", "open.json"])
  expect(existsSync(join(s.root, "state"))).toBe(false)
})
it("two roots never share a runtime address", () => {
  const s = setup()

  s.open()
  secondRoot(s)

  const other = JSON.parse(readFileSync(join(s.root, "sessions/S/other/service.json"), "utf8"))

  expect(other.port).not.toBe(s.endpoint().port)
  expect(other.token).not.toBe(s.endpoint().token)
  s.run(["other", "close"])
})

// Installation fixtures isolate the person's home, project and Bun's own bin.
function installation(location = "project", configured = false) {
  const root = mkdtempSync(join(tmpdir(), "bv-install-"))
  const home = join(root, "home")
  const project = join(root, "project")
  const bin = join(root, "bin")
  const directory = join(location === "personal" ? home : project, location === "source" ? "demo" : ".baba/roots/demo")

  roots.push(root)
  for (const path of [home, project, bin]) mkdirSync(path, { recursive: true })
  notesRoot(directory)

  const env: Record<string, string | undefined> = { ...process.env, HOME: home, CLAUDE_CODE_SESSION_ID: "S", CODEX_THREAD_ID: "" }

  delete env.CLAUDE_CONFIG_DIR
  delete env.CODEX_HOME
  delete env.BABAVOSS_HOME
  delete env.BABAVOSS_BIN
  if (configured) env.BABAVOSS_BIN = bin

  const run = (file: string, args: string[] = []) => spawnSync(file, args, { cwd: project, env, encoding: "utf8", timeout: 15000 })
  const open = () => run(process.execPath, [join(directory, "scripts/open.ts")])
  const state = () => env.BABAVOSS_HOME ?? join(location === "personal" ? home : project, ".babavoss")
  const word = () => join(env.BABAVOSS_BIN ?? join(state(), "bin"), "demo")
  const close = () => run(word(), ["close"])

  return { root, home, project, bin, directory, env, run, open, state, word, close }
}

it("a person's agents install uses their home and configured bin", () => {
  const s = installation("personal", true)

  try {
    expect(s.open().status).toBe(0)
    expect(existsSync(join(s.home, ".babavoss/sessions/S/open.json"))).toBe(true)
    expect(s.run(s.word(), ["/"]).status).toBe(0)
    expect(existsSync(join(s.bin, "bv"))).toBe(true)
  } finally {
    s.close()
  }
})
it("a project's roots keep their home and words in the project", () => {
    const s = installation("project")

    try {
      expect(s.open().status).toBe(0)
      expect(readFileSync(join(s.state(), ".gitignore"), "utf8").trim()).toBe("*")
      expect(existsSync(join(s.state(), "bin/bv"))).toBe(true)
      expect(s.run(s.word(), ["/"]).status).toBe(0)
    } finally {
      s.close()
    }
  })
it("a root's door says when a later babavoss is out, after its answer", () => {
  const s = installation()

  s.env.BABAVOSS_LATEST = "99.0.0"
  try {
    const answer = s.open()

    expect(answer.status).toBe(0)
    expect(answer.stdout).toContain(`babavoss 99.0.0 is out`)
    expect(answer.stdout).toContain(`in ${realpathSync(join(s.project, ".baba"))}`)
    expect(answer.stdout.indexOf("notes.count")).toBeLessThan(answer.stdout.indexOf("babavoss 99.0.0"))
    s.env.BABAVOSS_LATEST = ""
    expect(s.open().stdout).not.toContain("is out")
  } finally {
    s.close()
  }
})
it("opening and calling a project root leaves git clean", () => {
  const s = installation()
  const git = (args: string[]) => spawnSync("git", args, { cwd: s.project, encoding: "utf8" })

  expect(git(["init"]).status).toBe(0)
  expect(git(["add", "."]).status).toBe(0)
  expect(git(["-c", "user.name=Spec", "-c", "user.email=spec@example.test", "commit", "-m", "Fixture"]).status).toBe(0)
  try {
    expect(s.open().status).toBe(0)
    expect(s.run(s.word(), ["/"]).status).toBe(0)
    expect(git(["status", "--porcelain"]).stdout).toBe("")
  } finally {
    s.close()
  }
})
it("a project root writes neither the person's home nor beside Bun", () => {
  const s = installation()
  const bun = join(s.bin, "bun")

  copyFileSync(process.execPath, bun)
  try {
    expect(s.run(bun, [join(s.directory, "scripts/open.ts")]).status).toBe(0)
    expect(s.run(s.word(), ["/"]).status).toBe(0)
    expect(existsSync(join(s.home, ".babavoss"))).toBe(false)
    expect(readdirSync(s.bin)).toEqual(["bun"])
  } finally {
    s.close()
  }
})
it("a project handle runs exactly as printed from the project root", () => {
  const s = installation()

  try {
    const answer = s.open()

    expect(answer.status).toBe(0)
    expect(answer.stdout).toContain("command: .babavoss/bin/demo, from the project's directory;")

    const line = answer.stdout.split("\n").find((line) => line.startsWith("add: "))!
    const command = line.slice(5).split("   ")[0]!.replace("text=string", "text=Printed").split(" ")
    const called = s.run(command[0]!, command.slice(1))

    expect(called.status, called.stderr).toBe(0)
    expect(s.run(s.word(), ["/notes"]).stdout).toContain("Printed")
  } finally {
    s.close()
  }
})
it("a root run from source uses the door's working directory", () => {
  const s = installation("source")

  try {
    expect(s.open().status).toBe(0)
    expect(existsSync(join(s.project, ".babavoss/sessions/S/open.json"))).toBe(true)
    expect(existsSync(join(s.directory, ".babavoss"))).toBe(false)
  } finally {
    s.close()
  }
})
for (const location of ["personal", "project"])
  it(`BABAVOSS_HOME wins for a ${location} install`, () => {
    const s = installation(location, true)

    s.env.BABAVOSS_HOME = join(s.root, "override")
    try {
      expect(s.open().status).toBe(0)
      expect(s.run(s.word(), ["/"]).status).toBe(0)
      expect(existsSync(join(s.state(), "sessions/S/open.json"))).toBe(true)
      expect(existsSync(join(s.project, ".babavoss"))).toBe(false)
      expect(existsSync(join(s.home, ".babavoss"))).toBe(false)
    } finally {
      s.close()
    }
  })

