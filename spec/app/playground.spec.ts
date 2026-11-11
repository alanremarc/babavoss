// The playground util: the apps under a project found as its scopes; an app's scenarios, setups and presets read;
// its workspaces on disk, made from a preset, listed, their sessions' records, moved to the trash; as a surface over fake
// ports, workspaces created, opened and deleted, sessions started in them one live at a time, looked at and resumed, a
// scenario replacing its own last workspace, a restart read back from the disk; and its ports end to end against a real
// app runtime with Claude Code shimmed: a scenario in its own workspace, a hand session resumed, the workspace trashed.
import { poll } from "../support/poll.ts"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "bun:test"
import { SERVICE_HEADER, endpointFile, findService, readJsonFile, run, type Endpoint, type Ports, type Saved } from "babavoss/core/index.ts"
import { agents } from "../../skills/baba/src/utils/playground/index.ts"
import { discoverApps, type FoundApp } from "../../skills/baba/src/utils/playground/apps.ts"
import { emptyPreset, firstParagraph, loadScenario, parseSetups, scanScenarios, type Problem, type Scan } from "../../skills/baba/src/utils/playground/scenarios.ts"
import { contextOf, marked, appShare, surfaceOf, total } from "../../skills/baba/src/utils/playground/context.ts"
import { playgroundSurface, type Entry, type PlaygroundPorts, type PortEvent, type SessionRecord } from "../../skills/baba/src/utils/playground/surface.ts"
import {
  createWorkspace,
  listWorkspaces,
  appKey,
  readSession,
  readWorkspace,
  summaryOf,
  trashWorkspace,
  workspacesDir,
  writeSession,
  type WorkspaceSummary,
} from "../../skills/baba/src/utils/playground/workspaces.ts"

const dirs: string[] = []
const scratch = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix))

  dirs.push(dir)

  return dir
}
const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const memory = <M>(): Pick<Ports<M>, "load" | "save"> => {
  let kept: Saved | undefined

  return { load: () => kept, save: (saved) => void (kept = saved) }
}
const until = (read: () => unknown, match: object, timeout = 5000) => poll(read, { timeout }).toMatchObject(match)

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A skill's root text and optional package version. */
const skill = (dir: string, metadata: { name?: string; description?: string; version?: string }) => {
  write(join(dir, "SKILL.md"), `---\nname: ${metadata.name}\ndescription: ${metadata.description ?? ""}\n---\nOpen this app.\n`)
  write(join(dir, "package.json"), JSON.stringify({ version: metadata.version }))
}
/** An app: a skill with its door. */
const app = (dir: string, metadata: { name?: string; description?: string; version?: string }) => {
  skill(dir, metadata)
  write(join(dir, "scripts", "open.ts"), "")
}

describe("apps", () => {
  it("finds every app under the project, not inside one, never in skipped directories; counts its scenarios and presets", () => {
    const project = scratch("playground-apps-")

    app(join(project, "examples", "notes"), { name: "notes", version: "0.2.0", description: "Notes for the person" })
    write(join(project, "examples", "notes", "scenarios", "keep.ts"), "")
    write(join(project, "examples", "notes", "scenarios", "types.d.ts"), "")
    write(join(project, "examples", "notes", "scenarios", "setups.yaml"), "")
    write(join(project, "examples", "notes", "assets/presets", "groceries", "list.txt"), "milk")
    write(join(project, "examples", "notes", "assets/presets", "groceries.md"), "Some groceries")
    app(join(project, "examples", "notes", "inner"), { name: "inner" })
    app(join(project, "tools"), { name: "tools" })
    write(join(project, "half", "package.json"), "{}")
    // A skill with no door is a skill of some other kind: not listed, and looked into for an app further down.
    skill(join(project, "docs", "writing"), { name: "writing" })
    app(join(project, "docs", "writing", "helper"), { name: "helper" })
    for (const skipped of ["node_modules/x", "framework/x", ".git/x", ".claude/worktrees/x", ".local/x", ".state/x", "pkg/template", ".babavoss/installed"])
      app(join(project, skipped), { name: skipped })

    expect(discoverApps(project)).toEqual([
      {
        id: "docs-writing-helper",
        name: "helper",
        dir: "docs/writing/helper",
        path: join(project, "docs", "writing", "helper"),
        scenarios: 0,
        presets: 0,
      },
      {
        id: "examples-notes",
        name: "notes",
        version: "0.2.0",
        dir: "examples/notes",
        path: join(project, "examples", "notes"),
        description: "Notes for the person",
        scenarios: 1,
        presets: 1,
      },
      { id: "tools", name: "tools", dir: "tools", path: join(project, "tools"), scenarios: 0, presets: 0 },
    ])
  })

  it("finds the project itself as the one app, named by its skill; none in a project without one", () => {
    const project = scratch("playground-one-")

    expect(discoverApps(project)).toEqual([])
    app(project, { name: "my app" })
    app(join(project, "examples", "x"), { name: "x" })
    expect(discoverApps(project)).toEqual([{ id: "my-app", name: "my app", dir: ".", path: project, scenarios: 0, presets: 0 }])
  })

  it("finds this repository's apps", () => {
    const repository = fileURLToPath(new URL("../..", import.meta.url))

    expect(discoverApps(repository).map((p) => p.dir)).toEqual(["examples/payments", "skills/baba"])
  })
})

describe("scenarios", () => {
  it("loads a scenario as it is now, after it was edited in the same process", async () => {
    const file = join(scratch("playground-reload-"), "edited.ts")

    writeFileSync(file, 'export default { description: "first", async run() {} }')
    expect((await loadScenario(file)).description).toBe("first")
    writeFileSync(file, 'export default { description: "second", async run() {} }')
    expect((await loadScenario(file)).description).toBe("second")
    writeFileSync(file, 'export default { description: "third", async run() {} }')
    expect((await loadScenario(file)).description).toBe("third")
  })

  it("scans scenarios/: each module's description, setup and preset, its text, the setups named; what does not load is a problem by its file", async () => {
    const plug = scratch("playground-scan-")
    const dir = join(plug, "scenarios")

    expect(await scanScenarios(plug)).toEqual({
      dir: null,
      setups: [expect.objectContaining({ name: "claude-code" }), expect.objectContaining({ name: "codex" })],
      presets: [emptyPreset()],
      scenarios: [],
      problems: [],
    })
    write(join(dir, "setups.yaml"), "claude: { harness: claude-code, model: sonnet, effort: low }\ncodex: { harness: codex, home: fresh }\n")
    write(join(dir, "keep.ts"), 'export default { description: "Keep one", setup: "codex", preset: "groceries", async run(user) { await user.say("hi") } }\n')
    write(join(dir, "plain.ts"), "export default { async run() {} }\n")
    write(join(dir, "shapeless.ts"), 'export default { description: "no run" }\n')
    write(join(dir, "broken.ts"), "export default {\n")
    write(join(dir, "elsewhere.ts"), 'export default { setup: "nowhere", preset: "attic", async run() {} }\n')
    write(join(plug, "assets/presets", "groceries", "list.txt"), "milk\n")

    const scan = await scanScenarios(plug)

    expect(scan).toMatchObject({
      dir,
      setups: [
        { name: "claude", harness: "claude-code", model: "sonnet", effort: "low", sandbox: true },
        { name: "codex", harness: "codex", sandbox: true },
      ],
      presets: [{ name: "empty" }, { name: "groceries" }],
      scenarios: [
        { name: "elsewhere", setup: "nowhere", preset: "attic" },
        { name: "keep", description: "Keep one", setup: "codex", preset: "groceries", file: join(dir, "keep.ts"), source: expect.stringContaining("Keep one") },
        { name: "plain" },
      ],
    })
    expect(scan.setups[1]).not.toHaveProperty("home")
    // A setup kept from when a setup chose the home is read, and says what to remove.
    expect(scan.problems).toEqual([
      { file: "scenarios/broken.ts", message: expect.any(String) },
      { file: "scenarios/setups.yaml", message: expect.stringContaining("setup codex: home is no longer a setup's") },
      { file: "scenarios/shapeless.ts", message: "the default export is a Scenario, with run(user)" },
      { file: "scenarios/elsewhere.ts", message: "setup nowhere is not one of claude, codex" },
      { file: "scenarios/elsewhere.ts", message: "preset attic is not one of empty, groceries" },
    ])
    expect(() => parseSetups("x: { harness: tui }")).toThrow("harness is claude-code or codex")
  })

  it("scans assets/presets/: the built-in empty first, each directory's files, bytes and last change, its description from <name>.md", async () => {
    const plug = scratch("playground-presets-")
    const presets = join(plug, "assets/presets")

    write(join(presets, "groceries", "list.txt"), "milk\nbread\n")
    write(join(presets, "groceries", "nested", "more.txt"), "eggs")
    write(join(presets, "groceries.md"), "# groceries\n\nA shopping list\nand a nested file.\n\nMore about it.\n")
    write(join(presets, "bare", ".keep"), "")
    write(join(presets, "orphan.md"), "No directory")
    write(join(presets, "empty", "x.txt"), "x")

    const scan = await scanScenarios(plug)

    expect(scan.presets).toEqual([
      { name: "empty", description: "Nothing: an empty directory", files: 0, bytes: 0 },
      { name: "bare", files: 1, bytes: 0, updated: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
      { name: "groceries", description: "A shopping list and a nested file.", files: 2, bytes: 15, updated: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
    ])
    expect(scan.problems).toEqual([
      { file: "assets/presets/empty", message: "empty is the built-in preset; name this one otherwise" },
      { file: "assets/presets/orphan.md", message: "describes no preset: there is no assets/presets/orphan/ beside it" },
    ])
    expect(firstParagraph("---\nname: x\n---\n\nFirst  line\nsecond.\n")).toBe("First line second.")
  })
})

const DEMO = { id: "demo", name: "demo", version: "0.1.0", dir: "examples/demo" }
const record = (workspace: string, n: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  workspace,
  n,
  setup: "claude",
  harness: "claude-code",
  app: DEMO,
  preset: "notes",
  status: "exited",
  startedAt: 1,
  endedAt: 2,
  transcript: [{ at: 1, kind: "turn", costUsd: 0.25 }],
  ...extra,
})

describe("workspaces", () => {
  it("makes a workspace from a preset: its files copied, a home, a state and sessions, its record; lists an app's newest first and none of another's", () => {
    const base = scratch("playground-base-")
    const plug = scratch("playground-plug-")
    const preset = join(plug, "assets/presets", "notes")

    write(join(preset, "a.txt"), "a")
    write(join(preset, "docs", "b.md"), "b")

    const first = createWorkspace(base, { app: plug, preset: "notes", from: preset, now: new Date("2026-11-01T10:00:00Z") })
    const second = createWorkspace(base, { app: plug, preset: "empty", scenario: "keep", now: new Date("2026-11-02T10:00:00Z") })

    createWorkspace(base, { app: join(plug, "other"), preset: "empty" })
    expect(first).toEqual({
      id: expect.stringMatching(/^20261101-100000-[0-9a-f]{4}$/),
      name: "notes",
      app: plug,
      preset: "notes",
      created: "2026-11-01T10:00:00.000Z",
      kind: "local",
      dir: join(workspacesDir(base, plug), first.id),
      sessions: [],
    })
    expect(second).toMatchObject({ name: "keep", scenario: "keep", preset: "empty" })
    expect(readdirSync(first.dir).sort()).toEqual(["files", "home", "sessions", "state", "workspace.json"])
    expect(readdirSync(join(first.dir, "files")).sort()).toEqual(["a.txt", "docs"])
    expect(readFileSync(join(first.dir, "files", "docs", "b.md"), "utf8")).toBe("b")
    expect(readdirSync(join(second.dir, "files"))).toEqual([])
    expect(listWorkspaces(base, plug).map((w) => w.id)).toEqual([second.id, first.id])
    expect(appKey(plug)).not.toBe(appKey(join(plug, "other")))
    expect(listWorkspaces(base, join(plug, "nowhere"))).toEqual([])
  })

  it("writes and reads each session's record; lists them without their traces, with their cost; writes nothing into a workspace gone", () => {
    const base = scratch("playground-base-")
    const w = createWorkspace(base, { app: "/p", preset: "empty" })

    writeSession(w.dir, record(w.id, 2))
    writeSession(w.dir, record(w.id, 1, { status: "idle", session: "s1" }))
    write(join(w.dir, "sessions", "junk.json"), "{")
    expect(readSession(w.dir, 1)).toEqual(record(w.id, 1, { status: "idle", session: "s1" }))
    expect(readSession(w.dir, 9)).toBeUndefined()
    expect(readWorkspace(base, "/p", w.id)?.sessions.map((s) => s.n)).toEqual([1, 2])
    expect(listWorkspaces(base, "/p")[0]!.sessions).toEqual([summaryOf(record(w.id, 1, { status: "idle", session: "s1" })), summaryOf(record(w.id, 2))])
    expect(listWorkspaces(base, "/p")[0]!.sessions[0]).toMatchObject({ n: 1, costUsd: 0.25 })
    expect(listWorkspaces(base, "/p")[0]!.sessions[0]).not.toHaveProperty("transcript")

    const gone = join(base, "elsewhere")

    writeSession(gone, record("x", 1))
    expect(existsSync(gone)).toBe(false)
  })

  it("moves a workspace to the trash, every file and link with it, never deleting; a second of the same name beside it; the XDG trash with its info", () => {
    const base = scratch("playground-base-")
    const trash = scratch("playground-trash-")
    const w = createWorkspace(base, { app: "/p", preset: "empty" })

    write(join(w.dir, "files", "kept.txt"), "kept")
    symlinkSync("/nowhere", join(w.dir, "home", "link"))

    const to = trashWorkspace(w, trash, "macos")

    expect(to).toBe(join(trash, `babavoss workspace empty ${w.id}`))
    expect(existsSync(w.dir)).toBe(false)
    expect(readFileSync(join(to, "files", "kept.txt"), "utf8")).toBe("kept")
    expect(require("node:fs").readlinkSync(join(to, "home", "link"))).toBe("/nowhere")
    expect(listWorkspaces(base, "/p")).toEqual([])

    mkdirSync(w.dir, { recursive: true })
    expect(trashWorkspace(w, trash, "macos")).toBe(join(trash, `babavoss workspace empty ${w.id} 2`))

    const xdg = scratch("playground-xdg-")
    const v = createWorkspace(base, { app: "/p", preset: "empty" })
    const moved = trashWorkspace(v, xdg, "xdg")

    expect(moved).toBe(join(xdg, "files", `babavoss workspace empty ${v.id}`))
    expect(readFileSync(join(xdg, "info", `babavoss workspace empty ${v.id}.trashinfo`), "utf8")).toContain(`Path=${encodeURI(v.dir)}`)
  })
})

const ref = (id: string, dir: string, extra: Partial<FoundApp> = {}): FoundApp => ({
  id,
  name: id,
  dir,
  path: `/project/${dir}`,
  scenarios: 2,
  presets: 1,
  ...extra,
})
const demo = ref("demo", "examples/demo", { version: "0.1.0", description: "Notes" })
const other = ref("other", "other")
const scanned: Scan = {
  dir: "/project/examples/demo/scenarios",
  setups: parseSetups("claude: { harness: claude-code, model: sonnet, effort: low }\ncodex: { harness: codex }"),
  presets: [emptyPreset(), { name: "notes", description: "A few notes", files: 2, bytes: 30, updated: "2026-11-01T00:00:00.000Z" }],
  scenarios: [
    { name: "keep", description: "Keep a note", file: "/project/examples/demo/scenarios/keep.ts", source: "export default {}" },
    { name: "elsewhere", setup: "codex", preset: "notes", file: "/project/examples/demo/scenarios/elsewhere.ts", source: "export default {}" },
    { name: "lost", preset: "attic", file: "/project/examples/demo/scenarios/lost.ts", source: "export default {}" },
  ],
  problems: [
    { file: "scenarios/broken.ts", message: "Unexpected end of input" },
    { file: "scenarios/lost.ts", message: "preset attic is not one of empty, notes" },
  ] satisfies Problem[],
}
/** Ports over a disk in memory: workspaces w1, w2, ... made at a day each, their records kept as written. */
const fake = (apps: FoundApp[] = [demo, other]) => {
  const listeners = new Map<string, (e: PortEvent) => void>()
  const log: string[] = []
  const disk = new Map<string, { w: Omit<WorkspaceSummary, "sessions">; records: Map<number, SessionRecord> }>()
  let made = 0
  const ports: PlaygroundPorts & { tell: (key: string, ...events: PortEvent[]) => void } = {
    discover: async () => apps,
    scan: async (path) => (
      log.push(`scan ${path}`),
      path === demo.path ? scanned : { ...scanned, dir: null, scenarios: [], presets: [emptyPreset()], problems: [] }
    ),
    workspaces: async (path) =>
      [...disk.values()]
        .filter(({ w }) => w.app === path)
        .map(({ w, records }) => ({ ...w, sessions: [...records.values()].sort((a, b) => a.n - b.n).map(summaryOf) }))
        .reverse(),
    create: async (path, preset, scenario) => {
      const id = `w${++made}`
      const w = {
        id,
        name: scenario ?? preset,
        app: path,
        preset,
        created: new Date(Date.UTC(2026, 10, made)).toISOString(),
        kind: "local" as const,
        ...(scenario && { scenario }),
        dir: `/ws/${id}`,
      }

      log.push(`create ${id} ${preset} ${scenario ?? "-"}`)
      disk.set(id, { w, records: new Map() })

      return { ...w, sessions: [] }
    },
    trash: async (_path, id) => {
      log.push(`trash ${id}`)
      disk.delete(id)
    },
    session: async (_path, id, n) => disk.get(id)?.records.get(n),
    record: (_dir, session) => disk.get(session.workspace)?.records.set(session.n, session),
    start: (key, options, onEvent, provision) => {
      log.push(
        `start ${key} ${options.harness} ${options.cwd} ${options.home} ${options.resume ?? "-"} ${options.model ?? "-"} ${provision.state} ${provision.scenario?.name ?? "-"}`
      )
      listeners.set(key, onEvent)
      setTimeout(() => {
        onEvent({ kind: "page", url: `http://127.0.0.1:1000` })
        onEvent({ kind: "view", view: { notes: 0 } })
      }, 5)
    },
    tell: (key, ...events) => setTimeout(() => events.forEach((e) => listeners.get(key)!(e)), 5),
    tune: (key, tuning) => void log.push(`tune ${key} ${tuning.model ?? "-"} ${tuning.effort ?? "-"}`),
    send: (key, text) => {
      log.push(`send ${key} ${text}`)
      ports.tell(
        key,
        { kind: "started", session: `s-${key}`, model: "m" },
        { kind: "thinking", durationMs: 12 },
        { kind: "tool", id: "t1", name: "Bash", input: { command: "ls" } },
        { kind: "result", id: "t1", output: "a.txt" },
        { kind: "text", text: `echo ${text}` },
        { kind: "turn-done", durationMs: 7, costUsd: 0.01, tokens: { input: 10, output: 2, cached: 8 } }
      )
    },
    stop: (key) => {
      log.push(`stop ${key}`)
      ports.tell(key, { kind: "exited", code: 0 })
    },
  }

  return { ports, log, disk }
}

type Read = { read(path: string, actor?: string): unknown }

const status = (r: Read) => (r.read("/session") as { status?: string } | undefined)?.status

describe("playground", () => {
  it("lists the apps until one is selected; opens it with its apps, setups, presets, scenarios and workspaces; back and select stop a live session and close the workspace", async () => {
    const { ports, log } = fake()
    const r = run(playgroundSurface(ports, { project: "/project" }), memory())

    await until(() => r.read("/"), {
      title: "Playground",
      project: "/project",
      app: null,
      apps: [
        {
          id: "demo",
          name: "demo",
          version: "0.1.0",
          dir: "examples/demo",
          at: "/apps/demo",
          description: "Notes",
          scenarios: 2,
          presets: 1,
          select: { name: "select", args: { app: "demo" } },
        },
        { id: "other", dir: "other", select: { name: "select" } },
      ],
      rescan: { name: "rescan" },
    })
    expect(r.read("/")).not.toHaveProperty("apps.0.path")
    expect(r.read("/")).not.toHaveProperty("session")
    expect(await r.call("/", "create", { preset: "" }, "agent")).toMatchObject({ outcome: "refused" })
    expect(await r.call("/", "select", { app: "nope" }, "agent")).toMatchObject({
      outcome: "refused",
      reason: expect.stringContaining('select {"app":"other"}'),
    })
    expect(await r.call("/apps/demo", "select", { app: "demo" }, "person")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), {
      app: DEMO,
      apps: [{ id: "demo", at: "/apps/demo", select: { name: "select" } }, { id: "other" }],
      back: { name: "back" },
      setups: [{ name: "claude", model: "sonnet" }, { name: "codex" }],
      setup: "claude",
      presets: [
        { name: "empty", files: 0, builtin: true },
        { name: "notes", description: "A few notes", files: 2, bytes: 30, updated: "2026-11-01T00:00:00.000Z" },
      ],
      preset: "empty",
      pick: { name: "pick" },
      scenarios: [
        { at: "/scenarios/keep", name: "keep", description: "Keep a note", run: { name: "run", args: { name: "keep" }, open: { workspace: "string" } } },
        { name: "elsewhere", setup: "codex", preset: "notes" },
        { name: "lost", preset: "attic" },
      ],
      problems: [
        { file: "scenarios/broken.ts", message: "Unexpected end of input" },
        { file: "scenarios/lost.ts", message: "preset attic is not one of empty, notes" },
      ],
      workspaces: [],
      workspace: null,
      create: { name: "create", open: { preset: "string" } },
      session: null,
    })
    expect(r.read("/")).not.toHaveProperty("presets.1.builtin")
    // Nothing to start in until a workspace is open.
    expect(r.read("/")).not.toHaveProperty("start")
    expect(await r.call("/", "start", { setup: "" }, "agent")).toMatchObject({ outcome: "refused" })
    expect(log).toEqual(["scan /project/examples/demo"])

    expect(await r.call("/", "create", { preset: "attic" }, "agent")).toMatchObject({ outcome: "refused", reason: "preset is one of: empty, notes" })
    expect(await r.call("/", "create", { preset: "notes" }, "agent")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), { workspace: "w1", start: { name: "start" }, workspaces: [{ id: "w1", preset: "notes", live: false }] })
    expect(await r.call("/", "start", { setup: "" }, "agent")).toMatchObject({
      outcome: "written",
      view: { session: { status: "new", n: 1, workspace: { id: "w1", live: true } } },
    })

    // Back to the list stops the live session and closes the workspace; selecting the app again shows it, nothing open.
    expect(await r.call("/", "back", {}, "person")).toMatchObject({ outcome: "written", view: { app: null, apps: [{ id: "demo" }, { id: "other" }] } })
    expect(log.slice(-2)).toEqual(["start w1/1 claude-code /ws/w1/files /ws/w1/home - sonnet /ws/w1/state -", "stop w1/1"])
    expect(await r.call("/", "back", {}, "person")).toMatchObject({ outcome: "refused" })
    await r.call("/", "select", { app: "demo" }, "person")
    await until(() => r.read("/"), { app: DEMO, workspace: null, session: null, workspaces: [{ id: "w1", sessions: 1, live: false }] })
    expect(r.read("/workspaces/w1")).toMatchObject({ sessions: [{ n: 1, status: "exited" }] })

    // Another app: the live session is stopped and not kept; what it says after is not heard.
    await r.call("/workspaces/w1", "open", { workspace: "w1" }, "person")
    await r.call("/", "start", { setup: "" }, "agent")
    expect(await r.call("/apps/other", "select", { app: "other" }, "agent")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), { app: { id: "other", dir: "other" }, session: null, scenarios: [], workspaces: [], workspace: null })
    expect(log.slice(-2)).toEqual(["stop w1/2", "scan /project/other"])
    ports.tell("w1/2", { kind: "text", text: "late" })
    await r.stop()
  })

  it("chooses the one app found from the start, without back; with none, there is nothing to create", async () => {
    const one = run(playgroundSurface(fake([demo]).ports, { project: "/project" }), memory())

    await until(() => one.read("/"), { app: DEMO, setup: "claude" })
    expect(one.read("/")).not.toHaveProperty("back")
    await one.stop()

    const none = run(playgroundSurface(fake([]).ports, { project: "/project" }), memory())

    await until(() => none.read("/"), { app: null, apps: [] })
    expect(await none.call("/", "create", { preset: "" }, "agent")).toMatchObject({ outcome: "refused" })
    await none.stop()
  })

  it("starts a session under a setup and offers what its harness says to pick a model and an effort from; a pick tunes the session where it runs and seeds its setup's next; the app's skills complete as the harness takes them, only those it loaded", async () => {
    const { ports, log } = fake([demo])
    const models = [
      { id: "big", name: "Big", efforts: ["low", "high"], effort: "high", default: true },
      { id: "sonnet", name: "Sonnet", efforts: ["low", "high"] },
      { id: "plain", name: "Plain", efforts: [] },
    ]
    const asked: string[] = []
    const r = run(
      playgroundSurface(
        {
          ...ports,
          scan: async () => ({
            ...scanned,
            skills: [
              { name: "note", description: "Keep a note" },
              { name: "gone", description: "Not loaded" },
            ],
          }),
          models: async (harness) => {
            asked.push(harness)
            if (harness === "codex") throw new Error("not logged in")

            return models
          },
        },
        { project: "/project" }
      ),
      memory()
    )

    // Each harness the setups name is asked once; the setups are listed as a session would start under them.
    await until(() => r.read("/"), { setups: [{ name: "claude", model: "sonnet", effort: "low" }, { name: "codex" }] })
    await poll(() => asked.length).toBe(2)
    expect(asked.sort()).toEqual(["claude-code", "codex"])
    expect(await r.call("/", "create", { preset: "" }, "person")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), { workspace: "w1" })
    expect(await r.call("/", "start", { setup: "nope" }, "person")).toMatchObject({ outcome: "refused", reason: "setup is one of: claude, codex" })
    expect(await r.call("/", "start", { setup: "claude" }, "person")).toMatchObject({ outcome: "written" })
    await until(() => log, expect.arrayContaining([expect.stringMatching(/^start w1\/1 claude-code .* sonnet /)]))
    await until(() => r.read("/session"), {
      model: "sonnet",
      effort: "low",
      models: [{ id: "big" }, { id: "sonnet" }, { id: "plain" }],
      efforts: ["low", "high"],
      setModel: { name: "model" },
      setEffort: { name: "effort" },
    })

    // Only what is offered is taken; a pick tunes the running agent and is noted in its trace.
    expect(await r.call("/session", "model", { model: "nope" }, "person")).toMatchObject({ outcome: "refused", reason: "model is one of: big, sonnet, plain" })
    expect(await r.call("/session", "effort", { effort: "max" }, "person")).toMatchObject({ outcome: "refused", reason: "effort is one of: low, high" })
    expect(await r.call("/session", "model", { model: "big" }, "person")).toMatchObject({ outcome: "written" })
    expect(await r.call("/session", "effort", { effort: "high" }, "agent")).toMatchObject({ outcome: "written" })
    expect(log.slice(-2)).toEqual(["tune w1/1 big -", "tune w1/1 - high"])
    expect(r.read("/session")).toMatchObject({
      model: "big",
      effort: "high",
      unasked: "high",
      transcript: [{ kind: "note", text: "from here on big · low" }, { kind: "note" }],
    })
    expect(r.read("/")).toMatchObject({ setups: [{ name: "claude", model: "big", effort: "high" }, { name: "codex" }] })

    // The app's skills, written as the harness takes them; once the harness says what it loaded, only those.
    expect(r.read("/commands")).toMatchObject({
      commands: [
        { name: "demo:note", description: "Keep a note", insert: "/demo:note " },
        { name: "demo:gone", insert: "/demo:gone " },
      ],
    })
    ports.tell("w1/1", { kind: "started", session: "s", commands: ["compact", "demo:note"] })
    await until(() => r.read("/commands"), { commands: [{ name: "demo:note" }] })
    expect((r.read("/commands") as { commands: unknown[] }).commands).toHaveLength(1)

    // A model that takes no effort leaves the effort behind; the setup's next session starts under the picks.
    expect(await r.call("/session", "model", { model: "plain" }, "person")).toMatchObject({ outcome: "written" })
    expect(r.read("/session")).toMatchObject({ model: "plain", efforts: [] })
    expect(r.read("/session")).not.toHaveProperty("effort")
    expect(await r.call("/", "start", { setup: "" }, "person")).toMatchObject({ outcome: "written" })
    expect(log.at(-1)).toMatch(/^start w1\/2 claude-code .* plain /)

    // Under another setup, a harness that could not say what it offers says why.
    expect(await r.call("/", "start", { setup: "codex" }, "person")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/session"), { n: 3, harness: "codex", offersError: "not logged in" })
    expect(r.read("/session")).not.toHaveProperty("models")
    expect(r.read("/")).toMatchObject({ setup: "codex" })
    await r.stop()
  })

  it("counts the opened skill and cli answers as the app's share of each model call", () => {
    const transcript: Entry[] = [
      { at: 1, kind: "you", text: "hello", by: "person" },
      { at: 2, kind: "context", tokens: 1000 },
      { at: 3, kind: "tool", id: "s", name: "Skill", input: { skill: "demo" }, output: "", skillBodies: [{ title: "demo", text: "x".repeat(80) }] },
      { at: 4, kind: "tool", id: "c", name: "command", input: "bun /p/scripts/open.ts", output: "x".repeat(120) },
      { at: 5, kind: "context", tokens: 1200, window: 200000 },
      { at: 6, kind: "context", tokens: 700 },
    ]
    const context = contextOf(transcript, { app: "demo", appDir: "/p" })

    expect(appShare(context.calls[0]!.parts)).toBe(0)
    expect(context.calls[1]!.parts).toMatchObject({ skills: 20, calls: 30 })
    expect(appShare(context.calls[1]!.parts)).toBe(50)
    expect(total(context.calls[1]!.parts)).toBe(1200)
    expect(context.calls[2]).toMatchObject({ compacted: true, parts: { skills: 0, calls: 0 } })
    expect(context.window).toBe(200000)
  })

  it("marks the opened app skill and each cli command as a surface call with its path", () => {
    const cli = "bun /p/scripts/open.ts"
    const transcript: Entry[] = [
      { at: 1, kind: "skill", title: "demo", text: "# demo" },
      { at: 2, kind: "tool", id: "r", name: "Read", input: { file_path: "/p/SKILL.md" }, output: "# demo" },
      { at: 3, kind: "tool", id: "s", name: "command", input: "cat /p/SKILL.md", output: "# demo" },
      { at: 4, kind: "skill", title: "other", text: "# other" },
      ...["bun /p/scripts/open.ts", "bv /notes", "bv /notes add 'text=buy milk'", "bv wait", "bv close", `bv -e 'console.log(await app.read("/"))'`].map(
        (command, n): Entry => ({ at: n + 5, kind: "tool", id: String(n), name: "Bash", input: { command }, output: "answer" })
      ),
    ]
    const entries = marked(transcript, "demo", "/p")

    for (const entry of entries.slice(0, 3)) expect(entry.mark).toMatchObject({ part: "skills", tokens: 2 })
    expect(entries[3]).not.toHaveProperty("mark")
    for (const [n, verb] of ["open", "read", "call", "wait", "close", "program"].entries())
      expect(entries[n + 4]).toMatchObject({ mark: { part: "calls", tokens: 2 }, surface: { verb } })
    expect(entries[6]?.surface).toEqual({ verb: "call", path: "/notes", handle: "add", input: { text: "buy milk" } })
    expect(entries[9]?.surface).toMatchObject({ code: 'console.log(await app.read("/"))' })
    expect(surfaceOf("bun /other/scripts/open.ts", cli)).toBeUndefined()
    expect(surfaceOf("echo bv /", cli)).toBeUndefined()
    expect(surfaceOf("bv /notes --session s", cli)).toEqual({ verb: "read", path: "/notes" })
    expect(appShare(contextOf([...transcript, { at: 20, kind: "context", tokens: 1000 }], { app: "demo", appDir: "/p" }).parts)).toBe(18)
    for (const home of [".claude", ".codex"]) {
      const skillDir = `/workspace/home/${home}/skills/demo`

      expect(
        marked(
          [
            { at: 1, kind: "tool", id: "s", name: "command", input: `cat ${skillDir}/SKILL.md`, output: "# demo" },
            { at: 2, kind: "tool", id: "c", name: "command", input: `bun ${skillDir}/scripts/open.ts`, output: "view" },
          ],
          "demo",
          "/p"
        )
      ).toMatchObject([{ mark: { part: "skills" } }, { surface: { verb: "open", path: "/" } }])
    }
  })

  it("creates, opens and deletes workspaces: sessions start in the open one, one live at a time; deleting stops the live one there and closes it", async () => {
    const { ports, log, disk } = fake([demo])
    const r = run(playgroundSurface(ports, { project: "/project" }), memory())

    await until(() => r.read("/"), { setup: "claude" })
    expect(await r.call("/", "pick", { preset: "notes" }, "agent")).toMatchObject({ outcome: "written", view: { preset: "notes" } })
    expect(await r.call("/", "create", { preset: "" }, "person")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), {
      workspace: "w1",
      workspaces: [{ at: "/workspaces/w1", id: "w1", name: "notes", preset: "notes", kind: "local", dir: "/ws/w1" }],
    })
    expect(r.read("/workspaces/w1")).toMatchObject({
      at: "/workspaces/w1",
      id: "w1",
      dir: "/ws/w1",
      sessions: [],
      open: { name: "open", args: { workspace: "w1" } },
      delete: { name: "delete", args: { workspace: "w1" } },
      start: { name: "start" },
    })

    expect(await r.call("/", "start", { setup: "" }, "agent")).toMatchObject({
      outcome: "written",
      view: { session: { at: "/session", status: "new", setup: "claude", n: 1, workspace: { id: "w1", dir: "/ws/w1", sessions: 1, live: true }, stop: {} } },
    })
    expect(r.read("/session")).not.toHaveProperty("resume")
    expect(disk.get("w1")!.records.get(1)).toMatchObject({ workspace: "w1", n: 1, status: "new" })
    await until(() => r.read("/session"), { page: "http://127.0.0.1:1000", view: { notes: 0 } })
    expect(await r.call("/session", "send", { text: " " }, "person")).toMatchObject({ outcome: "refused" })
    expect(await r.call("/session", "send", { text: "hi" }, "person")).toMatchObject({ outcome: "written", view: { status: "busy" } })
    expect(r.read("/session")).not.toHaveProperty("send")
    await until(() => r.read("/session"), {
      status: "idle",
      session: "s-w1/1",
      model: "sonnet",
      ran: "m",
      costUsd: 0.01,
      // Of what was read, what came from the cache, summed over the turns.
      tokens: { input: 10, output: 2, cached: 8 },
      transcript: [
        { kind: "you", text: "hi", by: "person" },
        { kind: "thinking", durationMs: 12 },
        { kind: "tool", id: "t1", name: "Bash", output: "a.txt" },
        { kind: "text", text: "echo hi" },
        { kind: "turn", durationMs: 7, costUsd: 0.01 },
      ],
    })
    // The record is written at the turn's end, trace and all.
    expect(disk.get("w1")!.records.get(1)).toMatchObject({ status: "idle", session: "s-w1/1", transcript: [{ kind: "you" }, {}, {}, {}, { kind: "turn" }] })

    // A second session in the same workspace replaces the first: it is stopped, recorded as exited, and not heard after.
    expect(await r.call("/workspaces/w1", "start", { setup: "" }, "agent")).toMatchObject({ outcome: "written" })
    expect(log.slice(-2)).toEqual(["stop w1/1", "start w1/2 claude-code /ws/w1/files /ws/w1/home - sonnet /ws/w1/state -"])
    expect(disk.get("w1")!.records.get(1)).toMatchObject({
      status: "exited",
      transcript: expect.arrayContaining([{ at: expect.any(Number), kind: "note", text: "stopped: another session started" }]),
    })
    ports.tell("w1/1", { kind: "text", text: "late" })
    await until(() => r.read("/workspaces/w1"), {
      sessions: [
        { n: 1, status: "exited" },
        { n: 2, status: "new" },
      ],
    })
    expect(r.read("/session")).toMatchObject({ n: 2, transcript: [] })

    // Making and opening another does not stop the live one; starting there does.
    await r.call("/", "create", { preset: "empty" }, "person")
    await until(() => r.read("/"), {
      workspace: "w2",
      workspaces: [
        { id: "w2", live: false },
        { id: "w1", live: true },
      ],
    })
    expect(r.read("/session")).toMatchObject({ status: "new", workspace: { id: "w1" } })
    expect(await r.call("/workspaces/w1", "open", { workspace: "w1" }, "agent")).toMatchObject({ outcome: "written" })
    expect(r.read("/")).toMatchObject({ workspace: "w1" })
    expect(r.read("/workspaces/w2")).not.toHaveProperty("start")

    // Deleting the workspace of the live session lets it go and closes it; the disk is read again.
    expect(await r.call("/workspaces/w1", "delete", { workspace: "w1" }, "person")).toMatchObject({ outcome: "written" })
    expect(r.read("/")).toMatchObject({ workspace: null, session: null })
    await until(() => r.read("/"), { workspaces: [{ id: "w2" }] })
    expect(log.at(-1)).toBe("trash w1")
    expect(r.read("/workspaces/w1")).toBeUndefined()
    expect(await r.call("/workspaces/w1", "open", { workspace: "w1" }, "person")).toMatchObject({ outcome: "refused" })
    await r.stop()
  })

  it("looks at a stopped session while another is live, and resumes only an exited one, in its own workspace, its trace going on", async () => {
    const { ports, log } = fake([demo])
    const r = run(playgroundSurface(ports, { project: "/project" }), memory())

    await until(() => r.read("/"), { setup: "claude" })
    await r.call("/", "create", { preset: "notes" }, "person")
    await until(() => r.read("/"), { workspace: "w1" })
    await r.call("/", "start", { setup: "" }, "person")
    // Never prompted: the harness never had it, so there is nothing to resume.
    await r.call("/session", "stop", {}, "person")
    await poll(() => status(r)).toBe("exited")
    expect(r.read("/session")).not.toHaveProperty("resume")
    expect(r.read("/workspaces/w1")).not.toHaveProperty("sessions.0.resume")

    await r.call("/", "start", { setup: "" }, "person")
    await r.call("/session", "send", { text: "remember milk" }, "person")
    await until(() => r.read("/session"), { n: 2, status: "idle", session: "s-w1/2" })
    expect(r.read("/workspaces/w1")).not.toHaveProperty("sessions.1.resume")
    expect(await r.call("/workspaces/w1", "resume", { session: 2 }, "agent")).toMatchObject({ outcome: "refused" })
    await r.call("/session", "stop", {}, "person")
    await poll(() => status(r)).toBe("exited")
    await until(() => r.read("/workspaces/w1"), {
      sessions: [
        { at: "/workspaces/w1/sessions/1", n: 1, look: { name: "look", args: { session: 1 } } },
        { n: 2, status: "exited", costUsd: 0.01, resume: { args: { session: 2 } } },
      ],
    })
    expect(r.read("/session")).toMatchObject({ n: 2, resume: { name: "resume", args: { session: 2 } } })

    // A third goes live; the second, looked at, is read from its record, with resume and without send or stop.
    await r.call("/", "start", { setup: "" }, "person")
    expect(await r.call("/workspaces/w1", "look", { session: 2 }, "person")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/session"), {
      n: 2,
      status: "exited",
      resume: {},
      transcript: expect.arrayContaining([expect.objectContaining({ kind: "you", text: "remember milk" })]),
    })
    expect(r.read("/session")).not.toHaveProperty("send")
    expect(r.read("/session")).not.toHaveProperty("stop")
    expect(r.read("/")).toMatchObject({ workspaces: [{ live: true }] })
    // Looking at the live one puts it back in view.
    await r.call("/workspaces/w1", "look", { session: 3 }, "person")
    expect(r.read("/session")).toMatchObject({ n: 3, stop: {} })

    // Resuming stops the live one and goes on with the harness's own session, in the same workspace.
    expect(await r.call("/workspaces/w1", "resume", { session: 2 }, "person")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/session"), { n: 2, status: "idle", stop: {}, send: {} })
    expect(log.slice(-2)).toEqual(["stop w1/3", "start w1/2 claude-code /ws/w1/files /ws/w1/home s-w1/2 sonnet /ws/w1/state -"])
    expect(r.read("/session")).not.toHaveProperty("resume")
    await r.call("/session", "send", { text: "what did I say?" }, "person")
    await until(() => r.read("/session"), { status: "idle", costUsd: 0.02 })

    const said = (r.read("/session") as { transcript: { kind: string; text?: string }[] }).transcript
      .filter((e) => e.kind === "you" || e.kind === "note")
      .map((e) => e.text)

    expect(said).toEqual(["remember milk", "exited (0)", "resumed under claude", "what did I say?"])
    // The third was stopped for the resume before it was ever prompted: nothing of it to go on with.
    expect(r.read("/workspaces/w1/sessions/3")).toMatchObject({ n: 3, status: "exited", look: {} })
    expect(r.read("/workspaces/w1/sessions/3")).not.toHaveProperty("resume")
    await r.stop()
  })

  it("runs a scenario in a workspace of its own in place of the one its last run made, others left alone; or in a workspace picked", async () => {
    const { ports, log } = fake([demo])
    const r = run(playgroundSurface(ports, { project: "/project" }), memory())

    await until(() => r.read("/"), { setup: "claude" })
    expect(await r.call("/", "run", { name: "nope", workspace: "" }, "agent")).toMatchObject({ outcome: "refused" })
    expect(await r.call("/", "run", { name: "lost", workspace: "" }, "agent")).toMatchObject({ outcome: "refused", reason: "preset is one of: empty, notes" })
    expect(r.read("/scenarios/keep")).toMatchObject({
      name: "keep",
      file: "/project/examples/demo/scenarios/keep.ts",
      source: "export default {}",
      run: { name: "run" },
    })

    await r.call("/", "create", { preset: "empty" }, "person")
    await until(() => r.read("/"), { workspace: "w1" })
    expect(await r.call("/scenarios/elsewhere", "run", { name: "elsewhere", workspace: "" }, "agent")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), {
      workspace: "w2",
      workspaces: [{ id: "w2", name: "elsewhere", scenario: "elsewhere", preset: "notes", live: true }, { id: "w1" }],
      session: { setup: "codex", preset: "notes", workspace: { id: "w2" }, n: 1, scenario: { name: "elsewhere", state: "running" } },
    })

    const runs = () => log.filter((line) => !line.startsWith("scan"))

    expect(runs()).toEqual(["create w1 empty -", "create w2 notes elsewhere", "start w2/1 codex /ws/w2/files /ws/w2/home - - /ws/w2/state elsewhere"])

    // Again: the last run's workspace goes to the trash first, its session stopped; the hand-made one stays.
    expect(await r.call("/", "run", { name: "elsewhere", workspace: "" }, "agent")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), { workspace: "w3", workspaces: [{ id: "w3", scenario: "elsewhere" }, { id: "w1" }] })
    expect((r.read("/") as { workspaces: unknown[] }).workspaces).toHaveLength(2)
    expect(runs().slice(3)).toEqual([
      "stop w2/1",
      "trash w2",
      "create w3 notes elsewhere",
      "start w3/1 codex /ws/w3/files /ws/w3/home - - /ws/w3/state elsewhere",
    ])

    // In a workspace picked: no new one, the next session there, under the selected setup and its own preset ignored.
    expect(await r.call("/", "run", { name: "keep", workspace: "nope" }, "agent")).toMatchObject({ outcome: "refused" })
    expect(await r.call("/", "run", { name: "keep", workspace: "w1" }, "agent")).toMatchObject({
      outcome: "written",
      view: { workspace: "w1", session: { status: "new", setup: "claude", workspace: { id: "w1" }, n: 1, scenario: { name: "keep", state: "running" } } },
    })
    expect(log.at(-2)).toBe("start w1/1 claude-code /ws/w1/files /ws/w1/home - sonnet /ws/w1/state keep")
    expect(r.read("/session")).not.toHaveProperty("send")
    ports.tell(
      "w1/1",
      { kind: "call", by: "scenario", path: "/", handle: "add", input: { text: "milk" }, result: { notes: 1 } },
      { kind: "note", text: "one by hand" },
      { kind: "you", text: "Keep a note: bread" },
      { kind: "started", session: "s2" },
      { kind: "text", text: "kept" },
      { kind: "turn-done" },
      { kind: "read", path: "/", view: { notes: 2 } },
      { kind: "call", by: "scenario", path: "/notes/9", handle: "remove", input: { n: 9 }, refused: "No note 9" },
      { kind: "call", by: "person", path: "/notes/1", handle: "remove", input: { n: 1 } },
      { kind: "scenario", state: "failed", error: "on purpose" }
    )
    await until(() => r.read("/session"), {
      status: "idle",
      scenario: { name: "keep", state: "failed", error: "on purpose" },
      send: { name: "send" },
      transcript: [
        { kind: "call", by: "scenario", path: "/", handle: "add", input: { text: "milk" }, result: { notes: 1 } },
        { kind: "note", text: "one by hand" },
        { kind: "you", text: "Keep a note: bread", by: "scenario" },
        { kind: "text", text: "kept" },
        { kind: "turn" },
        { kind: "read", path: "/", view: { notes: 2 } },
        { kind: "call", path: "/notes/9", refused: "No note 9" },
        { kind: "call", by: "person", path: "/notes/1", handle: "remove" },
        { kind: "note", text: "scenario failed: on purpose" },
      ],
    })
    expect(r.read("/workspaces/w1")).toMatchObject({ sessions: [{ n: 1, scenario: { name: "keep", state: "failed" } }] })
    expect(r.read("/workspaces/w1")).not.toHaveProperty("sessions.0.scenario.error")
    await r.stop()
  })

  it("runs a scenario where it belongs: naming no preset, in the open workspace; naming one or with none open, in its own; fresh, always its own", async () => {
    const { ports, log } = fake([demo])
    const r = run(playgroundSurface(ports, { project: "/project" }), memory())

    await until(() => r.read("/"), { setup: "claude" })
    expect(r.read("/scenarios/keep")).toMatchObject({ run: { name: "run" }, fresh: { name: "fresh", args: { name: "keep" } } })

    // None open: one of its own, from the selected preset.
    expect(await r.call("/", "run", { name: "keep", workspace: "" }, "agent")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), { workspace: "w1", workspaces: [{ id: "w1", scenario: "keep", preset: "empty" }] })

    // One open: the next session there, what the last left in place.
    expect(await r.call("/", "run", { name: "keep", workspace: "" }, "agent")).toMatchObject({
      outcome: "written",
      view: { workspace: "w1", session: { workspace: { id: "w1" }, n: 2, scenario: { name: "keep", state: "running" } } },
    })

    // Fresh: one of its own again, in place of the one its last run made.
    expect(await r.call("/scenarios/keep", "fresh", { name: "keep" }, "agent")).toMatchObject({ outcome: "written" })
    await until(() => r.read("/"), { workspace: "w2", workspaces: [{ id: "w2", scenario: "keep" }] })
    expect(log.filter((line) => line.startsWith("create") || line.startsWith("trash"))).toEqual(["create w1 empty keep", "trash w1", "create w2 empty keep"])
    await r.stop()
  })

  it("restores after a runtime restart from the disk: the live session exited and recorded so, resumable; the selection and open workspace kept", async () => {
    const { ports, disk } = fake([demo])
    const kept = memory<unknown>()
    const first = run(playgroundSurface(ports, { project: "/project" }), kept)

    await until(() => first.read("/"), { setup: "claude" })
    await first.call("/", "pick", { preset: "notes" }, "person")
    await first.call("/", "create", { preset: "" }, "person")
    await until(() => first.read("/"), { workspace: "w1" })
    await first.call("/scenarios/keep", "run", { name: "keep", workspace: "w1" }, "agent")
    ports.tell("w1/1", { kind: "started", session: "s1" }, { kind: "you", text: "hello" })
    await until(() => first.read("/session"), { status: "busy", session: "s1" })
    await first.stop()
    expect(disk.get("w1")!.records.get(1)).toMatchObject({ status: "new", session: "s1" })

    const restarted = run(playgroundSurface(ports, { project: "/project" }), kept)

    expect(restarted.read("/session")).toMatchObject({
      status: "exited",
      app: DEMO,
      preset: "notes",
      scenario: { name: "keep", state: "failed", error: "the runtime restarted; this session's process is gone" },
      transcript: [{ kind: "you" }, { kind: "note", text: "the runtime restarted; this session's process is gone" }],
    })
    expect(restarted.read("/session")).not.toHaveProperty("page")
    expect(restarted.read("/session")).not.toHaveProperty("view")
    await until(() => restarted.read("/"), { app: DEMO, preset: "notes", workspace: "w1", workspaces: [{ id: "w1", live: false, sessions: 1 }] })
    expect(disk.get("w1")!.records.get(1)).toMatchObject({ status: "exited" })
    expect(restarted.read("/workspaces/w1")).toMatchObject({ sessions: [{ n: 1, status: "exited", resume: {} }] })
    await restarted.stop()

    // A record left running by a process gone, the disk read without a model kept, is shown exited.
    disk.get("w1")!.records.set(1, { ...disk.get("w1")!.records.get(1)!, status: "busy" })

    const fresh = run(playgroundSurface(ports, { project: "/project" }), memory())

    await until(() => fresh.read("/workspaces/w1"), { sessions: [{ n: 1, status: "exited", resume: {} }] })
    await fresh.stop()

    // A model kept from before workspaces keeps only the selection.
    const old = memory<unknown>()

    old.save({ version: 1, model: { app: "demo", next: 3, session: { n: 2, workspace: "/w", status: "idle", transcript: [] } } } as unknown as Saved)

    const restored = run(playgroundSurface(fake([demo]).ports, { project: "/project" }), old)

    expect(restored.read("/session")).toBeUndefined()
    await restored.stop()
  })
})

const modules = fileURLToPath(new URL("../../node_modules", import.meta.url))
const APP = `import { action, defineApp, surface, view, type Update } from "babavoss/core/index.ts"

type Model = { items: string[] }
const add = action({ name: "add", description: "Keep a note", subject: {}, inputs: { text: "string" },
  update: (m: Model, { text }): Update<Model, never> => ({ model: { items: [...m.items, text] } }) })
const remove = action({ name: "remove", description: "Forget a note", subject: { n: "number" }, inputs: {},
  update: (m: Model, { n }): Update<Model, never> => (m.items[n - 1] === undefined ? { refused: \`No note \${n}\` } : { model: { items: m.items.filter((_, i) => i !== n - 1) } }) })
const pages = view([add, remove], {
  "/": (m) => ({ notes: m.items.length, add: add.bind({}) }),
  "/notes/:n": (m, { n }) => (m.items[Number(n) - 1] === undefined ? undefined : { text: m.items[Number(n) - 1]!, remove: remove.bind({ n: Number(n) }) }),
})

export default defineApp({
  name: "notes",
  ui: new URL("../ui/", import.meta.url),
  surface: surface<Model, never, never>({ description: "notes", init: () => ({ items: [] }), update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : { model: m }), view: pages.view }),
})
`
// Claude Code as the playground runs it: a session id given or resumed, prompts on stdin; it calls the app's cli for
// "Keep a note: x", says which files it sees and what it was told before, and records its conversation under its HOME
// so a resume finds it.
const shim = (cli: string) => `#!/usr/bin/env bun
const { execFileSync } = require("node:child_process")
const { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } = require("node:fs")
const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const session = flag("--resume") ?? flag("--session-id")
const said = process.env.HOME + "/.claude/said-" + session + ".txt"
if (flag("--resume") && !existsSync(said)) { process.stderr.write("No conversation found with session ID: " + session); process.exit(1) }
mkdirSync(process.env.HOME + "/.claude", { recursive: true })
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
let started = false
const lines = require("node:readline").createInterface({ input: process.stdin })
lines.on("line", (line) => {
  const text = JSON.parse(line).message.content
  const before = existsSync(said) ? readFileSync(said, "utf8").trim().split("\\n").join("|") : ""
  appendFileSync(said, text + "\\n")
  if (!started) out({ type: "system", subtype: "init", session_id: session, model: "shim", cwd: process.cwd() })
  started = true
  const keep = /^Keep a note: (.*)$/.exec(text)
  if (keep) {
    out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "cli call / add" } }] } })
    execFileSync(process.execPath, [${JSON.stringify(cli)}, "--session", session, "/", "add", "text=" + keep[1]])
    out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "kept" }] } })
  }
  out({ type: "assistant", message: { content: [{ type: "text", text: "files: " + readdirSync(process.cwd()).sort().join(",") + "; before: " + before }] } })
  out({ type: "result", duration_ms: 5, total_cost_usd: 0.01, usage: { input_tokens: 3, output_tokens: 1 } })
})
lines.on("close", () => process.exit(0))
`

/** The app runtimes recorded anywhere under a directory: their service files' pids. */
const runtimePids = (root: string): number[] => {
  const pids: number[] = []
  const visit = (dir: string) => {
    for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
      const path = join(dir, entry.name)

      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (existsSync(endpointFile(path))) {
          const endpoint = readJsonFile<Endpoint>(endpointFile(path))

          if (endpoint) pids.push(endpoint.pid)
        }
        visit(path)
      }
    }
  }

  visit(root)

  return pids
}
const running = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

describe("playground ports", () => {
  const roots: string[] = []

  // Every app runtime a test woke is stopped, wherever its workspace went.
  afterEach(() => {
    for (const root of roots.splice(0)) for (const pid of runtimePids(root).filter(running)) process.kill(pid, "SIGTERM")
  })

  it("runs a scenario in a workspace from its preset against the app's runtime; resumes a hand session with the harness's own record and the app's state; trashes the workspace with what runs there stopped", async () => {
    const root = scratch("playground-e2e-")
    const project = join(root, "project")
    const plug = join(project, "app")
    const bin = join(root, "bin")
    const base = join(root, "data")
    const trash = join(root, "trash")

    roots.push(root)
    for (const dir of [join(plug, "src"), join(plug, "scripts"), join(plug, "ui"), bin]) mkdirSync(dir, { recursive: true })
    symlinkSync(modules, join(plug, "node_modules"))
    write(join(plug, "SKILL.md"), "---\nname: notes\ndescription: Keep notes\n---\nOpen notes")
    writeFileSync(join(plug, "package.json"), JSON.stringify({ version: "0.1.0", type: "module", dependencies: { babavoss: "0.0.0" } }))
    writeFileSync(join(plug, "ui", "index.html"), "<!doctype html><title>notes</title>")
    writeFileSync(join(plug, "src", "app.ts"), APP)
    writeFileSync(
      join(plug, "scripts/open.ts"),
      '// The fixture door.\nimport { main } from "babavoss/core/bv/door.ts"\nimport app from "../src/app.ts"\nawait main(app)\n'
    )
    write(join(plug, "assets/presets", "fx", "seed.txt"), "seed")
    write(join(plug, "assets/presets", "fx", "docs", "a.md"), "a")
    write(join(plug, "assets/presets", "fx.md"), "A seed and a doc.\n")
    write(
      join(plug, "scenarios", "keep.ts"),
      `import type { Scenario } from "babavoss/core/index.ts"

export default {
  description: "One note by hand, one by chat, a refusal, a throw",
  preset: "fx",
  async run(user) {
    await user.call("/", "add", { text: "call mom" })
    user.note("one by hand")
    await user.say("Keep a note: buy milk")
    const view = await user.read("/")
    if (view?.notes !== 2) throw new Error("expected two notes")
    const refused = await user.call("/notes/9", "remove", { n: 9 })
    if (refused.outcome !== "refused") throw new Error("expected a refusal")
    throw new Error("on purpose")
  },
} satisfies Scenario
`
    )
    writeFileSync(join(bin, "claude"), shim(join(plug, "scripts/open.ts")))
    chmodSync(join(bin, "claude"), 0o755)

    const path = process.env.PATH
    const state = process.env.BABAVOSS_HOME

    process.env.PATH = `${bin}:${path}`
    delete process.env.BABAVOSS_HOME
    try {
      const r = run(playgroundSurface(agents({ name: "babavoss" }, project, { base, trash }), { project }), memory())

      await until(() => r.read("/"), {
        app: { id: "app", name: "notes", version: "0.1.0", dir: "app" },
        presets: [
          { name: "empty", builtin: true },
          { name: "fx", description: "A seed and a doc.", files: 2, bytes: 5 },
        ],
        scenarios: [{ name: "keep", description: "One note by hand, one by chat, a refusal, a throw", preset: "fx" }],
        workspaces: [],
      })
      expect(await r.call("/", "run", { name: "keep", workspace: "" }, "agent")).toMatchObject({ outcome: "written" })
      await until(
        () => r.read("/session"),
        {
          status: "idle",
          n: 1,
          session: expect.any(String),
          page: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
          view: { notes: 2 },
          scenario: { name: "keep", state: "failed", error: "on purpose" },
          send: { name: "send" },
          transcript: [
            { kind: "call", by: "scenario", path: "/", handle: "add", input: { text: "call mom" }, result: { notes: 1 } },
            { kind: "note", text: "one by hand" },
            { kind: "you", text: "Keep a note: buy milk", by: "scenario" },
            { kind: "tool", name: "Bash", output: "kept" },
            { kind: "text", text: "files: docs,seed.txt; before: " },
            { kind: "turn", costUsd: 0.01 },
            { kind: "read", path: "/", view: { notes: 2 } },
            { kind: "call", by: "scenario", path: "/notes/9", handle: "remove", refused: "nothing at /notes/9" },
            { kind: "note", text: "scenario failed: on purpose" },
          ],
        },
        20_000
      )

      const made = (r.read("/") as { workspaces: { id: string; dir: string; scenario?: string }[] }).workspaces

      expect(made).toEqual([expect.objectContaining({ scenario: "keep", dir: join(workspacesDir(base, plug), made[0]!.id) })])

      const ws = made[0]!.dir
      const session = (r.read("/session") as { session: string }).session

      // The workspace owns everything: the harness's record under home/, the app's state under state/, the files the
      // agent saw, the session's record; the project is untouched.
      expect(existsSync(join(ws, "home", ".claude", `said-${session}.txt`))).toBe(true)
      expect(existsSync(join(ws, "state", "sessions", session, "notes"))).toBe(true)
      expect(readdirSync(join(ws, "files")).sort()).toEqual(["docs", "seed.txt"])
      expect(readSession(ws, 1)).toMatchObject({ n: 1, session, status: "idle", scenario: { name: "keep", state: "failed" } })
      expect(readdirSync(project)).toEqual(["app"])

      // A click on the app's page is a call as the person, straight to its runtime; the trace hears it.
      const endpoint = (await findService(join(ws, "state", "sessions", session, "notes")))!
      const clicked = await fetch(`http://127.0.0.1:${endpoint.port}/notes/1`, {
        method: "POST",
        headers: { [SERVICE_HEADER]: endpoint.token, "content-type": "application/json" },
        body: JSON.stringify({ handle: "remove", args: { n: 1 } }),
      })

      expect(clicked.status).toBe(200)
      await until(() => (r.read("/session") as { transcript: unknown[] }).transcript.at(-1), {
        kind: "call",
        by: "person",
        path: "/notes/1",
        handle: "remove",
        input: { n: 1 },
      })
      await until(() => r.read("/session"), { view: { notes: 1 } })

      // Stopped, then resumed: the harness's own session goes on in the same home, the app's state with it.
      expect(await r.call("/session", "stop", {}, "person")).toMatchObject({ outcome: "written" })
      await poll(() => status(r), { timeout: 10_000 }).toBe("exited")
      expect(await r.call("/session", "resume", { session: 1 }, "person")).toMatchObject({ outcome: "written" })
      expect(await r.call("/session", "send", { text: "Keep a note: eggs" }, "person")).toMatchObject({ outcome: "written" })
      await until(
        () => r.read("/session"),
        {
          status: "idle",
          session,
          view: { notes: 2 },
          transcript: expect.arrayContaining([{ at: expect.any(Number), kind: "text", text: "files: docs,seed.txt; before: Keep a note: buy milk" }]),
        },
        20_000
      )

      // Another run of the scenario replaces this workspace: to the trash, with its runtime stopped first.
      const pids = runtimePids(ws)

      expect(pids.length).toBeGreaterThan(0)
      expect(await r.call("/", "run", { name: "keep", workspace: "" }, "agent")).toMatchObject({ outcome: "written" })
      await until(() => r.read("/"), { workspaces: [{ scenario: "keep" }] }, 20_000)
      await poll(() => existsSync(ws), { timeout: 20_000 }).toBe(false)
      expect(pids.filter(running)).toEqual([])
      expect(readdirSync(trash)).toEqual([`babavoss workspace keep ${made[0]!.id}`])
      expect(readFileSync(join(trash, readdirSync(trash)[0]!, "files", "seed.txt"), "utf8")).toBe("seed")
      expect(readSession(join(trash, readdirSync(trash)[0]!), 1)).toMatchObject({ session, status: "exited" })

      // Deleting the new one, live, moves it too; nothing is left running under the scratch directory.
      const next = (r.read("/") as { workspaces: { id: string; dir: string }[] }).workspaces[0]!

      await until(() => r.read("/session"), { workspace: { id: next.id }, status: "idle" }, 20_000)
      expect(await r.call(`/workspaces/${next.id}`, "delete", { workspace: next.id }, "person")).toMatchObject({ outcome: "written" })
      await poll(() => existsSync(next.dir), { timeout: 20_000 }).toBe(false)
      await until(() => r.read("/"), { workspaces: [], workspace: null, session: null })
      expect(readdirSync(trash)).toHaveLength(2)
      await r.stop()
      expect(runtimePids(root).filter(running)).toEqual([])
    } finally {
      process.env.PATH = path
      if (state !== undefined) process.env.BABAVOSS_HOME = state
    }
  }, 60_000)
})
