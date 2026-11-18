// The standalone client and root door, exercised with isolated machine, bin and state directories: where an install keeps its state, bin and words.
import { notesRoot } from "../support/notes.ts"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, mkdirSync, existsSync, readdirSync, readlinkSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { printed, roots, setup, cleanup } from "../support/word.ts"

afterEach(cleanup)

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
      const command = printed(answer.stdout, "add").replace("text=line", `text=${name}`).split(" ")
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
  // In the .baba/ the root is of, .baba/.state; a root run from source, of no .baba/, keeps it the same way under the directory it was run in.
  const state = () => env.BABAVOSS_HOME ?? join(location === "personal" ? home : project, ".baba/.state")
  const word = () => join(env.BABAVOSS_BIN ?? join(state(), "bin"), "demo")
  const close = () => run(word(), ["close"])

  return { root, home, project, bin, directory, env, run, open, state, word, close }
}

it("a person's agents install uses their home and configured bin", () => {
  const s = installation("personal", true)

  try {
    expect(s.open().status).toBe(0)
    expect(existsSync(join(s.home, ".baba/.state/sessions/S/open.json"))).toBe(true)
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
    expect(existsSync(join(s.project, ".babavoss"))).toBe(false)
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
    expect(answer.stdout).toContain("command: .baba/.state/bin/demo, from the project's directory;")

    const command = printed(answer.stdout, "add").replace("text=line", "text=Printed").split(" ")
    const called = s.run(command[0]!, command.slice(1))

    expect(called.status, called.stderr).toBe(0)
    expect(s.run(s.word(), ["/notes"]).stdout).toContain("Printed")
  } finally {
    s.close()
  }
})
it("what an older release kept beside .baba/, as .babavoss/, is moved into it once, and its command's link, which led there, is made again", () => {
  const s = installation()
  const older = join(s.project, ".babavoss")

  mkdirSync(join(older, "bin"), { recursive: true })
  mkdirSync(join(older, "sessions/earlier"), { recursive: true })
  writeFileSync(join(older, "sessions/earlier/kept.json"), "{}\n")
  symlinkSync(join(older, "bin/bv"), join(older, "bin/demo"))
  try {
    const answer = s.open()

    expect(answer.status, answer.stderr).toBe(0)
    expect(answer.stdout).toContain("command: .baba/.state/bin/demo, from the project's directory;")
    expect(existsSync(older)).toBe(false)
    expect(readFileSync(join(s.state(), "sessions/earlier/kept.json"), "utf8")).toBe("{}\n")
    expect(readlinkSync(join(s.state(), "bin/demo"))).toBe("bv")
    expect(s.run(s.word(), ["/"]).status).toBe(0)
    // Both there, as a session of the older release may have left: neither is touched.
    mkdirSync(older)
    expect(s.run(s.word(), ["/"]).status).toBe(0)
    expect(readdirSync(older)).toEqual([])
  } finally {
    s.close()
  }
})
it("a root run from source uses the door's working directory", () => {
  const s = installation("source")

  try {
    expect(s.open().status).toBe(0)
    expect(existsSync(join(s.project, ".baba/.state/sessions/S/open.json"))).toBe(true)
    expect(existsSync(join(s.directory, ".baba"))).toBe(false)
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
      for (const at of [s.project, s.home]) for (const name of [".babavoss", ".baba/.state"]) expect(existsSync(join(at, name))).toBe(false)
    } finally {
      s.close()
    }
  })
