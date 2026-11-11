// The standalone client and app door, exercised with isolated machine, bin and state directories.
import { notesApp } from "../support/notes.ts"
import { poll } from "../support/poll.ts"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync, statSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { ACTOR_HEADER, ENDPOINT_FILE, SERVICE_HEADER, VERSION, reloads } from "../../skills/babavoss/framework/core/bv/bv.ts"
import { ACTOR_HEADER as actorHeader, SERVICE_HEADER as serviceHeader, endpointFile } from "../../skills/babavoss/framework/core/runtime/service.ts"
import { installedIn, SKILL_FOLDERS } from "../../skills/babavoss/framework/core/skill-folders.ts"

const client = resolve("skills/babavoss/framework/core/bv/bv.ts")
const roots: string[] = []

function setup() {
  const root = mkdtempSync(join(tmpdir(), "bv-spec-"))

  roots.push(root)

  const entry = join(notesApp(join(root, "app")), "scripts/open.ts")
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
  }
  const run = (args: string[] = [], file = client, input = "") => {
    const result = spawnSync(process.execPath, [file, ...args], { env, input, encoding: "utf8", timeout: 15000 })

    return { status: result.status, out: result.stdout, err: result.stderr }
  }
  const open = () => run([], entry)
  const endpoint = () =>
    JSON.parse(readFileSync(join(env.BABAVOSS_HOME, "sessions/S/demo/service.json"), "utf8")) as { pid: number; port: number; token: string }

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
it("opens one app with client usage", () => {
  const s = setup()

  expect(s.open().status).toBe(0)

  const answer = s.run()

  expect(answer.status, answer.err).toBe(0)
  expect(answer.out).toContain("demo: demo")
  expect(s.run(["demo", "/"]).out).toContain("notes.count: 0")
})
it("lists two apps and requires a name", () => {
  const s = setup()

  s.open()

  const file = join(s.root, "sessions/S/open.json")
  const apps = JSON.parse(readFileSync(file, "utf8"))

  writeFileSync(file, JSON.stringify({ ...apps, other: apps.demo }))
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
it("close then call, at once, wakes the runtime at the address the session had, so nothing is announced", async () => {
  const s = setup()

  s.open()

  const port = s.endpoint().port

  expect(s.run(["close"]).out).not.toContain("page:")
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
it("loads an edit of the app's code into the running runtime: the same process and address, the notes kept, the new code answering", async () => {
  const s = setup()

  s.open()
  s.run(["/", "add", "text=Pharmacy"])

  const before = s.endpoint()
  const source = join(s.root, "app/src/app.ts")

  writeFileSync(source, readFileSync(source, "utf8").replace('description: "Keep a note"', 'description: "Keep a note, as edited"'))
  await poll(() => s.run(["/"]).out, { timeout: 10_000 }).toContain("Keep a note, as edited")
  expect(s.endpoint()).toEqual(before)
  expect(s.run(["/"]).out).toContain("Pharmacy")
  expect(s.run(["/"]).out).not.toContain("page:")
})
it("an open names the page each time, and calls it new only once", () => {
  const s = setup()

  expect(s.open().out).toContain("a new address: give it to the person")

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
    expect(s.run(["/"]).out).toContain("a new address: give it to the person")
    expect(s.endpoint().port).not.toBe(port)
  } finally {
    squatter.stop(true)
  }
})
it("runs a loop of calls", () => {
  const s = setup()

  s.open()
  expect(s.run(["-e", 'for(let i=0;i<3;i++) console.log(await app.call("/","add",{text:String(i)}))']).status).toBe(0)
  expect(s.run(["/"]).out).toContain("notes.count: 3")
})
it("returns a program refusal as data", () => {
  const s = setup()

  s.open()

  const answer = s.run(["-e", 'console.log(await app.call("/","add",{text:""}))'])

  expect(answer.status).toBe(0)
  expect(answer.out).toContain("A note needs text")
})
it("reads program code from stdin", () => {
  const s = setup()

  s.open()
  expect(s.run(["-e", "-"], client, 'console.log(await app.read("/"))').out).toContain("count: 0")
})
it("prints the full help", () => expect(setup().run(["help"]).out).toContain("Stop at the first refusal"))
it("opens with the commands and no pointer to a fuller guide: what an agent is pointed to, it reads", () => {
  const out = setup().open().out

  expect(out).toContain("wait for changes")
  expect(out).not.toContain("help")
})
it("says once that an app opened at a newer version than last time, and where its changes are written", () => {
  const s = setup()
  const app = join(s.root, "app")
  const version = (v: string) => writeFileSync(join(app, "package.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(app, "package.json"), "utf8")), version: v }))

  version("0.1.0")
  expect(s.open().out).not.toContain("was updated")
  version("0.2.0")
  writeFileSync(join(app, "CHANGELOG.md"), "# Changelog\n")
  expect(s.open().out).toContain(`demo was updated from 0.1.0 to 0.2.0; what changed is in ${join(realpathSync(app), "CHANGELOG.md")}`)
  expect(s.open().out).not.toContain("was updated")
  // An older version than last time is taken as it is, without a word.
  version("0.1.5")
  expect(s.open().out).not.toContain("was updated")
})
it("door installs bv", () => {
  const s = setup()

  expect(s.open().out).toContain("bv is now a command on this machine")
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
  expect(answer.out).toContain(`bun '${s.entry}' PATH`)
})
it("door takes a request", () => {
  const s = setup()

  expect(s.run(["/", "add", "text=door"], s.entry).status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("door")
})
it("duplicates the framework's constants exactly", () => {
  expect(SERVICE_HEADER).toBe(serviceHeader)
  expect(ACTOR_HEADER).toBe(actorHeader)
  expect(endpointFile("state")).toBe(join("state", ENDPOINT_FILE))
})

it("refused registry names what the harness must allow", () => {
  const s = setup()

  s.env.BABAVOSS_HOME = join(s.root, "file")
  writeFileSync(s.env.BABAVOSS_HOME, "occupied")

  const answer = s.open()

  expect(answer.status).toBe(1)
  expect(answer.err.trim()).toBe("cannot register the app under ~/.babavoss; allow writing the registry (under a sandbox, in the harness settings)")
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

it("makes an app's word and uses it", () => {
  const s = setup()

  expect(s.open().out).toContain("demo is now a command")
  const answer = spawnSync(join(s.bin, "demo"), ["/"], { env: s.env, encoding: "utf8" })

  expect(answer.status, answer.stderr).toBe(0)
  expect(answer.stdout).toContain("add: demo / add")
})
it("keeps another command's word and uses bv NAME", () => {
  const s = setup()
  const occupied = join(s.bin, "demo")

  writeFileSync(occupied, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  s.env.PATH = `${s.bin}:${process.env.PATH}`
  expect(s.open().out).toContain("bv demo PATH")
  expect(readFileSync(occupied, "utf8")).toContain("exit 0")
  expect(s.run(["demo", "/"]).out).toContain("add: bv demo / add")
})


function secondApp(s: ReturnType<typeof setup>) {
  const directory = notesApp(join(s.root, "other"))
  const definition = join(directory, "src/app.ts")

  writeFileSync(definition, readFileSync(definition, "utf8").replace('name: "demo"', 'name: "other"'))
  expect(s.run([], join(directory, "scripts/open.ts")).status).toBe(0)
}
it("two apps answer under their words and printed handles run as printed", () => {
  const s = setup()

  s.open()
  secondApp(s)
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
it("bv alone lists both apps with their commands", () => {
  const s = setup()

  s.open()
  secondApp(s)
  expect(s.run().out).toBe("demo: demo\nother: other\n")
  s.run(["other", "close"])
})
it("keeps state only under the app within its session", () => {
  const s = setup()

  s.open()
  expect(existsSync(join(s.root, "sessions/S/demo/model.json"))).toBe(true)
  expect(existsSync(join(s.root, "sessions/S/demo/session.json"))).toBe(true)
  expect(readdirSync(join(s.root, "sessions/S")).sort()).toEqual(["demo", "open.json"])
  expect(existsSync(join(s.root, "state"))).toBe(false)
})
it("two apps never share a runtime address", () => {
  const s = setup()

  s.open()
  secondApp(s)

  const other = JSON.parse(readFileSync(join(s.root, "sessions/S/other/service.json"), "utf8"))

  expect(other.port).not.toBe(s.endpoint().port)
  expect(other.token).not.toBe(s.endpoint().token)
  s.run(["other", "close"])
})

// Installation fixtures isolate the person's home, project and Bun's own bin.
function installation(location = "project", harness = ".agents", configured = false) {
  const root = mkdtempSync(join(tmpdir(), "bv-install-"))
  const home = join(root, "home")
  const project = join(root, "project")
  const bin = join(root, "bin")
  const directory = location === "personal" ? join(home, harness, "skills/demo") :
    location === "source" ? join(project, "demo") : join(project, harness, "skills/demo")

  roots.push(root)
  for (const path of [home, project, bin]) mkdirSync(path, { recursive: true })
  notesApp(directory)

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
  const s = installation("personal", ".agents", true)

  try {
    expect(s.open().status).toBe(0)
    expect(existsSync(join(s.home, ".babavoss/sessions/S/open.json"))).toBe(true)
    expect(s.run(s.word(), ["/"]).status).toBe(0)
    expect(existsSync(join(s.bin, "bv"))).toBe(true)
  } finally {
    s.close()
  }
})
for (const harness of [".agents", ".claude", ".codex"])
  it(`a project's ${harness} install keeps its home and words in the project`, () => {
    const s = installation("project", harness)

    try {
      expect(s.open().status).toBe(0)
      expect(readFileSync(join(s.state(), ".gitignore"), "utf8").trim()).toBe("*")
      expect(existsSync(join(s.state(), "bin/bv"))).toBe(true)
      expect(s.run(s.word(), ["/"]).status).toBe(0)
    } finally {
      s.close()
    }
  })
it("opening and calling a project app leaves git clean", () => {
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
it("a project app writes neither the person's home nor beside Bun", () => {
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
    expect(answer.stdout).toContain("call it as .babavoss/bin/demo, from the project directory")

    const line = answer.stdout.split("\n").find((line) => line.startsWith("add: "))!
    const command = line.slice(5).split("   ")[0]!.replace("text=string", "text=Printed").split(" ")
    const called = s.run(command[0]!, command.slice(1))

    expect(called.status, called.stderr).toBe(0)
    expect(s.run(s.word(), ["/notes"]).stdout).toContain("Printed")
  } finally {
    s.close()
  }
})
it("an app run from source uses the door's working directory", () => {
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
    const s = installation(location, ".agents", true)

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

it("tells the project an app is installed in by the harness skill folder that holds it", () => {
  expect(installedIn("/work/shop/.agents/skills/payments")).toBe("/work/shop")
  expect(installedIn("/work/shop/.claude/skills/payments/scripts")).toBe("/work/shop")
  expect(installedIn("/work/shop/.codex/skills/payments")).toBe("/work/shop")
  // The innermost project, where one sits inside a folder that is itself among skills.
  expect(installedIn("/home/.agents/skills/outer/.claude/skills/inner")).toBe("/home/.agents/skills/outer")
  expect(installedIn("/work/shop/skills/payments")).toBeUndefined()
  expect(SKILL_FOLDERS.filter((folder) => folder.linked).map((folder) => folder.project)).toEqual([".agents/skills", ".claude/skills"])
})

it("wakes an app under hot reload only where its framework loads changed code in place, from 0.2.0", () => {
  const root = mkdtempSync(join(tmpdir(), "bv-spec-"))

  roots.push(root)

  const held = (version?: string) => {
    const app = join(root, version ?? "none")

    mkdirSync(join(app, "scripts"), { recursive: true })
    if (version) {
      mkdirSync(join(app, "framework"))
      writeFileSync(join(app, "framework/VERSION"), `${version}\n`)
    }

    return join(app, "scripts/open.ts")
  }

  expect(reloads(held("0.2.0"))).toBe(true)
  expect(reloads(held("1.0.0"))).toBe(true)
  expect(reloads(held("0.1.0"))).toBe(false)
  expect(reloads(held())).toBe(false)
})
