// How a harness is set up in a project (framework/core/harness/setup.ts), by what it promises of the person's files:
// nothing of theirs changes, a file that is not valid is not written, every change is preceded by a copy, a write lands
// whole or not at all, and doing it again does nothing. Then the two adapters, set up and withdrawn the same way.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { ADAPTERS, claude, codex } from "../../framework/core/harness/index.ts"
import { BACKUPS, backup, editHooks, hookCommand, replace, Unsafe, without, type Group, type Hooks } from "../../framework/core/harness/setup.ts"

let project: string
let file: string

beforeEach(() => {
  project = realpathSync(mkdtempSync(join(tmpdir(), "setup-")))
  file = join(project, ".claude/settings.json")
  mkdirSync(dirname(file), { recursive: true })
})
afterEach(() => {
  // A folder a spec made read-only is opened again, so it can go.
  if (existsSync(dirname(file))) chmodSync(dirname(file), 0o755)
  rmSync(project, { recursive: true, force: true })
})

const OURS: Record<string, Group> = {
  SessionStart: { hooks: [{ type: "command", command: hookCommand("claude") }] },
  Stop: { hooks: [{ type: "command", command: hookCommand("claude"), timeout: 3 }] },
}
/** What older releases wrote: each is baba's, by the command it runs. */
const OLDER = [
  'bun "${CLAUDE_PROJECT_DIR}/.baba/node_modules/babavoss/bin/baba.ts" hook 2>/dev/null || true',
  'd="$PWD"; until [ -f "$d/.baba/node_modules/babavoss/bin/baba.ts" ] || [ "$d" = / ]; do d="$(dirname "$d")"; done; bun "$d/.baba/node_modules/babavoss/bin/baba.ts" hook codex 2>/dev/null || true',
]
const mine = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }
const text = () => readFileSync(file, "utf8")
const json = () => JSON.parse(text()) as Record<string, unknown> & { hooks?: Hooks }
const backups = () => (existsSync(join(project, BACKUPS)) ? readdirSync(join(project, BACKUPS)).sort() : [])
/** What is beside the file: only it, and never a file half-written. */
const beside = () => readdirSync(dirname(file))
const put = (value: unknown, indent: string | number = 2) => writeFileSync(file, `${JSON.stringify(value, null, indent)}\n`)
/** Baba's groups as a hooks file holds them: a list at each event. */
const SET = Object.fromEntries(Object.entries(OURS).map(([event, group]) => [event, [group]]))
/** A file's object with baba's hooks out of it. */
const theirs = (value: Record<string, unknown> & { hooks?: Hooks }) => {
  const { hooks, ...rest } = value
  const left = without(hooks ?? {})

  return Object.keys(left).length ? { ...value, hooks: left } : rest
}

/** Files a person may have, each valid: what is theirs in each must come through every change as it was. */
const THEIRS: Record<string, unknown> = {
  "no hooks, other settings": { model: "opus", permissions: { allow: ["Bash(ls:*)"], deny: [] }, env: { A: "1" } },
  "hooks at other events": { hooks: { PreToolUse: [mine], Notification: [mine, mine] }, model: "haiku" },
  "hooks at baba's events": { hooks: { Stop: [mine], SessionStart: [{ hooks: [{ type: "command", command: "echo start", timeout: 10 }] }] } },
  "hooks first, keys after": { hooks: { Stop: [mine] }, zeta: 1, alpha: [1, 2, { b: null }], nested: { deep: { deeper: [true, false] } } },
  "an empty object": {},
  "groups of shapes baba does not know": { hooks: { Stop: ["a string", 7, null, { matcher: "x" }, { hooks: "not a list" }, { hooks: [null, "s", { type: "prompt", prompt: "p" }] }] } },
  "text in other scripts, and a command that names baba without being its hook": { name: "проект 日本 é", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo babavoss baba.ts hook" }] }] } },
}

describe("nothing of the person's changes", () => {
  for (const [name, value] of Object.entries(THEIRS)) {
    test(`${name}: set, set again, and taken out`, () => {
      put(value)

      const before = text()

      expect(editHooks(project, file, OURS).changed).toBe(true)
      // Theirs is what it was, key for key and in the same order, and baba's is after theirs at each event.
      expect(JSON.stringify(theirs(json()))).toBe(JSON.stringify(theirs(value as Record<string, unknown>)))
      for (const [event, group] of Object.entries(OURS)) expect(json().hooks![event]!.at(-1)).toEqual(group)

      const set = text()

      // Again, nothing is written.
      expect(editHooks(project, file, OURS)).toEqual({ changed: false })
      expect(text()).toBe(set)
      // Taken out, the file is what it was to the byte, or gone where it held nothing of theirs.
      expect(editHooks(project, file, undefined).changed).toBe(true)
      if (Object.keys(theirs(value as Record<string, unknown>)).length) expect(text()).toBe(before)
      else expect(existsSync(file)).toBe(false)
    })
  }

  test("what says nothing to a harness may go, and nothing else: an event with no groups, hooks with no events", () => {
    put({ model: "opus", hooks: { PreToolUse: [], Stop: [mine] } })
    editHooks(project, file, OURS)
    editHooks(project, file, undefined)
    expect(json()).toEqual({ model: "opus", hooks: { Stop: [mine] } })
    put({ hooks: {}, model: "opus" })
    editHooks(project, file, OURS)
    editHooks(project, file, undefined)
    expect(json()).toEqual({ model: "opus" })
  })

  test("a group that holds a handler of theirs beside baba's keeps theirs, and baba's is set as a group of its own", () => {
    const also = { type: "command", command: "echo also" }

    put({ hooks: { Stop: [{ matcher: "*", hooks: [also, { type: "command", command: OLDER[0] }] }] } })
    editHooks(project, file, OURS)
    expect(json().hooks!.Stop).toEqual([{ matcher: "*", hooks: [also] }, OURS.Stop!])
    editHooks(project, file, undefined)
    expect(json()).toEqual({ hooks: { Stop: [{ matcher: "*", hooks: [also] }] } })
  })

  test("what an older release wrote is replaced, never doubled, whichever command it ran", () => {
    for (const command of OLDER) {
      put({ hooks: { Stop: [mine, { hooks: [{ type: "command", command }] }], SessionEnd: [{ hooks: [{ type: "command", command }] }] } })
      editHooks(project, file, OURS)
      expect(json().hooks).toEqual({ Stop: [mine, OURS.Stop!], SessionStart: [OURS.SessionStart!] })
    }
  })

  test("the file keeps how it is laid out: its indent, its line ends, a byte-order mark, and whether it ends with a newline", () => {
    const forms: [string, string][] = [
      ["four spaces", '{\n    "model": "opus"\n}\n'],
      ["a tab", '{\n\t"model": "opus"\n}\n'],
      ["no last newline", '{\n  "model": "opus"\n}'],
      ["Windows line ends", '{\r\n  "model": "opus"\r\n}\r\n'],
      ["a byte-order mark", '﻿{\n  "model": "opus"\n}\n'],
    ]

    for (const [name, before] of forms) {
      writeFileSync(file, before)
      editHooks(project, file, OURS)
      expect(text().slice(0, before.indexOf('"model"') + 15), name).toBe(before.slice(0, before.indexOf('"model"') + 15))
      expect(/\n\s*$/.test(text()), name).toBe(/\n\s*$/.test(before))
      expect(text().includes("\r\n"), name).toBe(before.includes("\r\n"))
      expect(text().replaceAll("\r\n", "\n").includes("\r"), name).toBe(false)
      editHooks(project, file, undefined)
      expect(text(), name).toBe(before)
    }
  })

  test("a file with nothing of baba's in it is not read to take baba's out, whatever state it is in", () => {
    for (const before of ["{ not json", "[]", '{"model":1.0}', ""]) {
      writeFileSync(file, before)
      expect(editHooks(project, file, undefined)).toEqual({ changed: false })
      expect(text()).toBe(before)
    }
    rmSync(file)
    expect(editHooks(project, file, undefined)).toEqual({ changed: false })
    expect(existsSync(file)).toBe(false)
    expect(backups()).toEqual([])
  })
})

describe("a file that is not valid is not written", () => {
  const INVALID: [string, string, string][] = [
    ["not JSON", '{ "model": "opus", ', "is not JSON"],
    ["JSON with a comment", '{\n  // mine\n  "model": "opus"\n}\n', "is not JSON"],
    ["a trailing comma", '{ "model": "opus", }', "is not JSON"],
    ["a list", "[1, 2]", "does not hold a JSON object"],
    ["a string", '"settings"', "does not hold a JSON object"],
    ["null", "null", "does not hold a JSON object"],
    ["hooks that is a list", '{ "hooks": [] }', '"hooks" that is not an object'],
    ["hooks that is a string", '{ "hooks": "none" }', '"hooks" that is not an object'],
    ["an event that is not a list", '{ "hooks": { "Stop": { "hooks": [] } } }', '"hooks.Stop" that is not a list'],
    ["a number written as 1.0", '{ "ratio": 1.0 }', "cannot be written back exactly"],
    ["a number too large to hold", '{ "id": 12345678901234567890 }', "cannot be written back exactly"],
    ["an exponent", '{ "n": 1e3 }', "cannot be written back exactly"],
    ["a key given twice", '{ "model": "a", "model": "b" }', "cannot be written back exactly"],
    ["an escaped character", '{ "name": "caf\\u00e9" }', "cannot be written back exactly"],
  ]

  for (const [name, before, why] of INVALID) {
    test(`${name}: it throws, says why, and the file is as it was, with no copy made and nothing left beside it`, () => {
      writeFileSync(file, before)
      for (const ours of [OURS, undefined]) {
        // Taking baba's out reads the file only where baba is in it.
        if (!ours) writeFileSync(file, `${before}\n${hookCommand("claude")}`)

        const was = text()
        let thrown: unknown

        try {
          editHooks(project, file, ours)
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(Unsafe)
        expect((thrown as Error).message).toContain(file)
        if (ours) expect((thrown as Error).message).toContain(why)
        expect((thrown as Error).message).toContain("nothing was changed")
        expect(text()).toBe(was)
        expect(backups()).toEqual([])
        expect(beside()).toEqual(["settings.json"])
      }
    })
  }

  test("a file that is empty, or only space, is taken as holding nothing yet", () => {
    for (const before of ["", "  \n"]) {
      writeFileSync(file, before)
      expect(editHooks(project, file, OURS).changed).toBe(true)
      expect(json()).toEqual({ hooks: SET })
    }
  })

  test("what is written is read back and checked before it takes the file's place: a check that fails leaves the file, and nothing beside it", () => {
    put({ model: "opus" })

    const before = text()

    expect(() =>
      replace(project, file, "not what was meant", () => {
        throw new Error("not valid")
      })
    ).toThrow("not valid")
    expect(text()).toBe(before)
    expect(beside()).toEqual(["settings.json"])
  })

  test("where the folder cannot be written the file is as it was", () => {
    put({ model: "opus" })

    const before = text()

    chmodSync(dirname(file), 0o555)
    // Whoever may write anywhere is not stopped by a folder's mode: there is nothing to see then.
    if (process.getuid?.() === 0) return
    expect(() => editHooks(project, file, OURS)).toThrow()
    chmodSync(dirname(file), 0o755)
    expect(text()).toBe(before)
    expect(beside()).toEqual(["settings.json"])
  })
})

describe("every change is preceded by a copy", () => {
  const at = (second: number) => new Date(Date.UTC(2026, 10, 18, 12, 0, second))

  test("the copy is the file as it was, with its mode, named for its path and the moment; a new file has none", () => {
    expect(editHooks(project, file, OURS)).toEqual({ changed: true, backup: undefined })
    expect(backups()).toEqual([])
    rmSync(file)
    put({ model: "opus" }, 4)
    chmodSync(file, 0o600)

    const before = text()
    const done = editHooks(project, file, OURS, at(5))

    expect(done).toEqual({ changed: true, backup: ".babavoss/backups/.claude__settings.json.20261118T120005Z" })
    expect(readFileSync(join(project, done.backup!), "utf8")).toBe(before)
    expect(statSync(join(project, done.backup!)).mode & 0o777).toBe(0o600)
    // The file keeps its own mode too.
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  test("nothing changed, no copy; removed, the copy is what was removed", () => {
    put({ hooks: { Stop: [OURS.Stop!] } })
    expect(editHooks(project, file, { Stop: OURS.Stop! })).toEqual({ changed: false })
    expect(backups()).toEqual([])

    const before = text()
    const done = editHooks(project, file, undefined, at(1))

    expect(existsSync(file)).toBe(false)
    expect(readFileSync(join(project, done.backup!), "utf8")).toBe(before)
  })

  test("two within a second are both kept, the newest few of a file stay, and another file's copies are not counted or removed", () => {
    put({ model: "opus" })

    const other = join(project, ".codex/hooks.json")

    mkdirSync(dirname(other))
    writeFileSync(other, "{}\n")

    const others = backup(project, other, at(0))

    expect(backup(project, file, at(1))).toBe(".babavoss/backups/.claude__settings.json.20261118T120001Z")
    expect(backup(project, file, at(1))).toBe(".babavoss/backups/.claude__settings.json.20261118T120001Z.1")
    for (let second = 2; second < 20; second++) backup(project, file, at(second))

    const kept = backups().filter((name) => name.startsWith(".claude__"))

    expect(kept).toHaveLength(10)
    expect(kept.at(-1)).toBe(".claude__settings.json.20261118T120019Z")
    expect(kept).not.toContain(".claude__settings.json.20261118T120001Z")
    expect(existsSync(join(project, others))).toBe(true)
  })
})

describe("a write lands whole, in the file's own place", () => {
  test("a link is written through: it stays a link, and the file it names holds the change", () => {
    const real = join(project, "real-settings.json")

    writeFileSync(real, '{\n  "model": "opus"\n}\n')
    symlinkSync(real, file)
    expect(editHooks(project, file, OURS).changed).toBe(true)
    expect(lstatSync(file).isSymbolicLink()).toBe(true)
    expect(JSON.parse(readFileSync(real, "utf8"))).toEqual({ model: "opus", hooks: SET })
    expect(readdirSync(project).filter((name) => name.includes(".tmp"))).toEqual([])
  })

  test("a folder where the file should be is left, and said", () => {
    mkdirSync(file)
    expect(() => replace(project, file, "{}\n")).toThrow(Unsafe)
    expect(lstatSync(file).isDirectory()).toBe(true)
  })

  test("a file that does not exist is made, with the folders above it", () => {
    const fresh = join(project, ".codex/deep/hooks.json")

    expect(editHooks(project, fresh, OURS)).toEqual({ changed: true, backup: undefined })
    expect(JSON.parse(readFileSync(fresh, "utf8"))).toEqual({ hooks: SET })
    expect(readFileSync(fresh, "utf8")).toEndWith("}\n")
  })
})

describe("the adapters set a harness up the same way", () => {
  const FILES = { claude: { skill: ".claude/skills/baba", hooks: ".claude/settings.json" }, codex: { skill: ".agents/skills/baba", hooks: ".codex/hooks.json" } }
  const words = readFileSync(new URL("../../skill/SKILL.md", import.meta.url), "utf8")

  for (const adapter of ADAPTERS) {
    const at = FILES[adapter.name as keyof typeof FILES]

    test(`${adapter.name}: the skill and a hook for each event, once; withdrawn, only what the person had is left`, () => {
      const hooks = join(project, at.hooks)
      const read = () => (JSON.parse(readFileSync(hooks, "utf8")) as { hooks: Record<string, Group[]> }).hooks

      mkdirSync(dirname(hooks), { recursive: true })
      writeFileSync(hooks, `${JSON.stringify({ keep: true, hooks: { Stop: [mine] } }, null, 2)}\n`)

      const before = readFileSync(hooks, "utf8")
      const set = adapter.provision(project, adapter.defaults)

      expect(set.paths).toEqual([at.skill, at.hooks])
      expect(set.said).toContain(`${at.hooks} as it was is kept at ${BACKUPS}/`)
      expect(readFileSync(join(project, at.skill, "SKILL.md"), "utf8")).toBe(words)
      expect(Object.keys(read())).toEqual(["Stop", ...adapter.events.filter((event) => event !== "Stop")])
      for (const event of adapter.events) expect(read()[event]!.at(-1)!.hooks![0]).toMatchObject({ type: "command", command: hookCommand(adapter.name) })
      expect(read().Stop![0]).toEqual(mine)
      // Again: nothing to do.
      expect(adapter.provision(project, adapter.defaults).paths).toEqual([])

      // A note the person keeps beside the skill is theirs, and stays when baba's goes.
      writeFileSync(join(project, at.skill, "notes.md"), "mine\n")
      expect(adapter.withdraw(project).paths).toEqual([at.skill, at.hooks])
      expect(readFileSync(hooks, "utf8")).toBe(before)
      expect(readdirSync(join(project, at.skill))).toEqual(["notes.md"])
      expect(adapter.withdraw(project).paths).toEqual([])
    })

    test(`${adapter.name}: a skill folder that is not baba's stops it before the person's hooks file is touched`, () => {
      mkdirSync(join(project, at.skill), { recursive: true })
      writeFileSync(join(project, at.skill, "SKILL.md"), "---\nname: other\ndescription: mine\n---\n")
      expect(() => adapter.provision(project, adapter.defaults)).toThrow("is not baba's")
      expect(existsSync(join(project, at.hooks))).toBe(false)
      // Withdrawing leaves it too.
      expect(adapter.withdraw(project).paths).toEqual([])
      expect(readdirSync(join(project, at.skill))).toEqual(["SKILL.md"])
    })
  }

  test("the hook's command is one for every harness but its name, and finds the nearest .baba/ up from the project", () => {
    expect(hookCommand("codex")).toBe(hookCommand("claude").replace("hook claude", "hook codex"))

    const bin = join(project, ".baba/node_modules/babavoss/bin")
    const deep = join(project, "packages/app")
    const found = (env: Record<string, string>, cwd: string) =>
      Bun.spawnSync(["sh", "-c", hookCommand("claude").replace(/bun "\$d([^"]*)" hook claude.*/, 'echo "$d"')], { cwd, env: { PATH: process.env.PATH ?? "", ...env } }).stdout.toString().trim()

    mkdirSync(bin, { recursive: true })
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(bin, "baba.ts"), "")
    expect(found({}, deep)).toBe(project)
    expect(found({ CLAUDE_PROJECT_DIR: deep }, tmpdir())).toBe(project)
    // Where there is none it ends at the root, and the hook says nothing.
    expect(Bun.spawnSync(["sh", "-c", hookCommand("claude")], { cwd: tmpdir(), env: { PATH: process.env.PATH ?? "" } }).exitCode).toBe(0)
  })

  test("Codex's config.toml is the person's too: a change is preceded by a copy, and one that would not be TOML is not written", () => {
    const toml = join(project, ".codex/config.toml")

    mkdirSync(dirname(toml), { recursive: true })
    writeFileSync(toml, 'model = "o3"\n')

    const set = codex.provision(project, { ...codex.defaults, network: true })

    expect(set.said).toContain(`.codex/config.toml as it was is kept at ${BACKUPS}/.codex__config.toml.`)
    expect(Bun.TOML.parse(readFileSync(toml, "utf8"))).toEqual({ model: "o3", sandbox_workspace_write: { network_access: true } })
    codex.provision(project, codex.defaults)
    expect(readFileSync(toml, "utf8")).toBe('model = "o3"\n')
    writeFileSync(toml, 'model = "o3\n')
    expect(() => codex.provision(project, { ...codex.defaults, network: true })).toThrow()
    expect(readFileSync(toml, "utf8")).toBe('model = "o3\n')
    expect(readdirSync(dirname(toml)).filter((name) => name.includes(".tmp"))).toEqual([])
  })

  test("Claude Code: where settings are not valid, it stops before anything of the skill is written over them", () => {
    writeFileSync(file, "{ nope")
    expect(() => claude.provision(project, claude.defaults)).toThrow(Unsafe)
    expect(text()).toBe("{ nope")
  })
})
