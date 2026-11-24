// The package's command, as a project uses it: init makes .baba/ and provisions, new makes a surface from the template,
// provision makes each harness the configuration enables aware, withdraws from the others and generates the root, and the
// hook makes a session aware.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { hookCommand } from "../../framework/core/harness/setup.ts"
import type { CodexHookReview } from "../../framework/core/harness/codex-hooks.ts"
import { VERSION } from "../../framework/core/update.ts"
import { poll } from "../support/poll.ts"

const checkout = fileURLToPath(new URL("../..", import.meta.url))
const project = realpathSync(mkdtempSync(join(tmpdir(), "baba-")))
const baba = join(project, ".baba")
const FOLDERS = [".claude/skills", ".agents/skills"]
const run = (args: string[], cwd = baba) => {
  const result = spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), ...args], { cwd, encoding: "utf8" })

  return { status: result.status, out: result.stdout, err: result.stderr }
}
const skill = (folder: string, name: string) => join(project, folder, name, "SKILL.md")

// The framework is this checkout, as files: a release is named the same way, by its tag.
beforeAll(() => {
  // Without a harness named, or with one that is none, it says which there are and makes nothing.
  for (const args of [["init"], ["init", "--from", `file:${checkout}`], ["init", "cursor"]]) {
    expect(run(args, project)).toMatchObject({ status: 2, err: expect.stringContaining("baba init claude codex antigravity") })
    expect(existsSync(baba)).toBe(false)
  }
  expect(run(["init", "cursor"], project).err).toContain("there is no harness cursor")

  const made = run(["init", "claude", "codex", "antigravity", "--from", `file:${checkout}`], project)

  expect(made.status, made.err).toBe(0)
}, 120_000)
// Removing the project, a whole install, can take longer than a hook's five seconds on a busy machine.
afterAll(() => rmSync(project, { recursive: true, force: true }), 60_000)

test("init makes .baba/ as a package that names the framework and provisions when installed, and baba is a skill beside it", () => {
  const pack = JSON.parse(readFileSync(join(baba, "package.json"), "utf8")) as { scripts: Record<string, string>; dependencies: Record<string, string> }

  expect(pack.dependencies).toEqual({ babavoss: `file:${checkout}` })
  expect(pack.scripts.postinstall).toBe("baba provision")
  expect(existsSync(join(baba, "node_modules/babavoss/package.json"))).toBe(true)
  for (const folder of FOLDERS) expect(readFileSync(skill(folder, "baba"), "utf8")).toBe(readFileSync(join(checkout, "skill/SKILL.md"), "utf8"))
  // Each harness is set up the same way: the skill, and baba's hook for each of its events in the harness's own project file.
  for (const [file, name] of [[".claude/settings.json", "claude"], [".codex/hooks.json", "codex"]]) {
    const hooks = (JSON.parse(readFileSync(join(project, file!), "utf8")) as { hooks: Record<string, { hooks: { command: string }[] }[]> }).hooks

    for (const groups of Object.values(hooks)) expect(groups.map((group) => group.hooks[0]!.command)).toEqual([hookCommand(name!)])
  }
  const agy = (JSON.parse(readFileSync(join(project, ".agents/hooks.json"), "utf8")) as { babavoss: Record<string, { command: string }[]> }).babavoss

  expect(Object.keys(agy)).toEqual(["SessionStart", "PreInvocation", "Stop"])
  for (const handlers of Object.values(agy)) expect(handlers.map((h) => h.command)).toEqual([hookCommand("antigravity")])
  // Nothing of the person's was there to keep a copy of.
  expect(existsSync(join(project, ".baba/.state/backups"))).toBe(false)
  // The harnesses named are the configuration's, so installing a clone sets up the same.
  expect(readFileSync(join(baba, "baba.config.ts"), "utf8")).toContain(
    "claude: { enable: true },\n    codex: { enable: true },\n    antigravity: { enable: true },"
  )
  expect(run(["init", "claude"], project)).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })
})

test("init sets up only the harness named: the others are not enabled, and a shared skill stays while either harness uses it", () => {
  const one = realpathSync(mkdtempSync(join(tmpdir(), "baba-one-")))

  try {
    const made = run(["init", "--from", `file:${checkout}`, "codex"], one)

    expect(made.status, made.err).toBe(0)
    expect(made.out).toContain("set up for Codex.")
    expect(readFileSync(join(one, ".baba/baba.config.ts"), "utf8")).toContain(
      "claude: { enable: false },\n    codex: { enable: true },\n    antigravity: { enable: false },"
    )
    expect(existsSync(join(one, ".codex/hooks.json"))).toBe(true)
    expect(existsSync(join(one, ".agents/skills/baba/SKILL.md"))).toBe(true)
    expect(existsSync(join(one, ".agents/hooks.json"))).toBe(false)
    expect(existsSync(join(one, ".claude"))).toBe(false)
    // Enabling antigravity and disabling codex keeps the shared .agents/skills/baba while swapping .codex/hooks.json for .agents/hooks.json.
    const file = join(one, ".baba/baba.config.ts")

    writeFileSync(file, readFileSync(file, "utf8").replace("codex: { enable: true }", "codex: { enable: false }").replace("antigravity: { enable: false }", "antigravity: { enable: true }"))
    expect(run(["provision"], join(one, ".baba")).status).toBe(0)
    expect(existsSync(join(one, ".codex"))).toBe(false)
    expect(existsSync(join(one, ".agents/skills/baba/SKILL.md"))).toBe(true)
    expect(existsSync(join(one, ".agents/hooks.json"))).toBe(true)
    // Switching to Claude Code withdraws Antigravity's hooks and the shared skill.
    writeFileSync(file, readFileSync(file, "utf8").replace("claude: { enable: false }", "claude: { enable: true }").replace("antigravity: { enable: true }", "antigravity: { enable: false }"))
    expect(run(["provision"], join(one, ".baba")).status).toBe(0)
    expect(existsSync(join(one, ".claude/settings.json"))).toBe(true)
    expect(existsSync(join(one, ".codex"))).toBe(false)
    expect(existsSync(join(one, ".agents"))).toBe(false)
  } finally {
    rmSync(one, { recursive: true, force: true })
  }
}, 120_000)

test("init leaves .baba/ ready for shadcn's CLI: components.json puts components in components/ui, imported by @/, and names a css file the page never builds", () => {
  const components = JSON.parse(readFileSync(join(baba, "components.json"), "utf8")) as { style: string; tailwind: { css: string; config: string }; aliases: Record<string, string> }
  const tsconfig = () => JSON.parse(readFileSync(join(baba, "tsconfig.json"), "utf8")) as { compilerOptions: { paths?: Record<string, string[]>; strict: boolean } }

  expect(components.style).toBe(JSON.parse(readFileSync(join(checkout, "framework/kit/components.json"), "utf8")).style)
  expect(components.tailwind).toMatchObject({ config: "", css: "components/shadcn.css" })
  expect(components.aliases).toMatchObject({ components: "@/components", ui: "@/components/ui", utils: "@/lib/utils" })
  expect(tsconfig().compilerOptions.paths).toEqual({ "@/*": ["./*"] })
  // A .baba/ made by an older release gains the alias as it provisions, the rest of its configuration left as it was.
  const older = tsconfig()

  delete older.compilerOptions.paths
  writeFileSync(join(baba, "tsconfig.json"), JSON.stringify(older))
  rmSync(join(baba, "components.json"))
  expect(run(["provision"]).out).toContain("provisioned .baba/components.json")
  expect(tsconfig().compilerOptions).toMatchObject({ strict: true, paths: { "@/*": ["./*"] } })
  expect(existsSync(join(baba, "components.json"))).toBe(true)
  expect(run(["provision"]).out).not.toContain("tsconfig.json")
})

test("new makes a surface from the template, with a passing spec, and the root is generated with it; a surface gets no skill and no file of instructions", () => {
  expect(run(["new", "Month Close"])).toMatchObject({ status: 2, err: expect.stringContaining("kebab-case") })
  expect(run(["new", "baba"])).toMatchObject({ status: 2, err: expect.stringContaining("not baba") })
  // The shell's own paths are reserved, or a tab's address by its surface's name would stand on them.
  for (const name of ["tabs", "activity"]) expect(run(["new", name])).toMatchObject({ status: 2, err: expect.stringContaining(`or ${name}`) })

  const made = run(["new", "month-close"])

  expect(made.status, made.err).toBe(0)
  expect(readdirSync(join(baba, "surfaces/month-close")).sort()).toEqual(["spec", "src", "ui"])
  // The root is generated from the surfaces: each by name, and the page with each one's component.
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).toContain('"month-close": () => import("../surfaces/month-close/src/surface.ts")')
  expect(readFileSync(join(baba, ".root/main.tsx"), "utf8")).toContain('import * as p0 from "../surfaces/month-close/ui/index.tsx"')
  for (const folder of FOLDERS) expect(existsSync(join(project, folder, "month-close"))).toBe(false)
  expect(run(["new", "month-close"])).toMatchObject({ status: 2, err: expect.stringContaining("is there already") })

  const spec = spawnSync(process.execPath, ["test", "surfaces/month-close"], { cwd: baba, encoding: "utf8" })

  expect(spec.status, spec.stderr).toBe(0)
  expect(spec.stderr).toContain("3 pass")
})

test("a project imports the framework by its entries alone: a new surface's types check, the root's page builds with its styles, and a path not exported does not resolve", () => {
  const out = mkdtempSync(join(tmpdir(), "baba-page-"))
  const page = join(baba, "surfaces/entries/ui/index.tsx")
  const check = () => spawnSync(process.execPath, ["check"], { cwd: baba, encoding: "utf8" })
  const build = () => spawnSync(process.execPath, ["node_modules/babavoss/framework/shell/scripts/build.ts", ".root", out], { cwd: baba, encoding: "utf8" })

  try {
    expect(run(["new", "entries"]).status).toBe(0)
    expect(check().status, check().stdout).toBe(0)

    const built = build()

    expect(built.status, built.stderr).toBe(0)
    expect(readdirSync(out).some((name) => name.endsWith(".css"))).toBe(true)
    writeFileSync(page, `${readFileSync(page, "utf8")}\nimport { cn } from "babavoss/kit/cn.ts"\nexport const merged = cn("a")\n`)
    expect(check().status).not.toBe(0)
    expect(build().stderr).toContain('Could not resolve: "babavoss/kit/cn.ts"')
  } finally {
    rmSync(join(baba, "surfaces/entries"), { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
    run(["provision"])
  }
}, 60_000)

test("provision generates the root from the surfaces that are there, from anywhere in the project", () => {
  expect(run(["new", "reel-maker"]).status).toBe(0)
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).toContain('"reel-maker": () => import(')
  rmSync(join(baba, "surfaces/reel-maker"), { recursive: true })
  expect(run(["provision"], project).status).toBe(0)
  expect(readFileSync(join(baba, ".root/surfaces.ts"), "utf8")).not.toContain("reel-maker")
  for (const folder of FOLDERS) expect(existsSync(skill(folder, "baba"))).toBe(true)
})

test("a project's own home, .baba/home.tsx, takes the desktop's place in the root's page, and leaves it when it goes", () => {
  const main = () => readFileSync(join(baba, ".root/main.tsx"), "utf8")

  expect(main()).not.toContain("home.tsx")
  writeFileSync(
    join(baba, "home.tsx"),
    'import type { HomeProps } from "babavoss/shell/ui/index.tsx"\n\nexport default function Home({ title, foot }: HomeProps) {\n  return <main>{title}{foot}</main>\n}\n'
  )
  expect(run(["provision"]).status).toBe(0)
  expect(main()).toContain('import Home from "../home.tsx"')
  expect(main()).toContain(" home={Home} />")
  rmSync(join(baba, "home.tsx"))
  expect(run(["provision"]).status).toBe(0)
  expect(main()).not.toContain("home={Home}")
})

test("a surface's own stylesheet joins the root's page after the shell's, scoped to its tabs, and one whose braces do not balance is left out", () => {
  expect(run(["new", "lane-board"]).status).toBe(0)
  expect(run(["new", "ledger"]).status).toBe(0)

  const styles = () => readFileSync(join(baba, ".root/styles.css"), "utf8")

  expect(styles()).not.toContain("@scope")
  writeFileSync(join(baba, "surfaces/lane-board/ui/styles.css"), ':scope {\n  --lane-idle: var(--border);\n}\n.lane { content: "}"; }\n')
  writeFileSync(join(baba, "surfaces/ledger/ui/styles.css"), ".row { color: red; } } body { color: red; }\n")
  expect(run(["provision"]).status).toBe(0)

  const css = styles()

  expect(css.indexOf('@import "babavoss/shell/ui/styles.css"')).toBeLessThan(css.indexOf("@scope"))
  // Tailwind scans the whole of .baba/, the project's own components beside the surfaces.
  expect(css).toContain('@source "..";')
  expect(css).toContain('@scope ([data-surface="lane-board"]) {\n:scope {\n  --lane-idle: var(--border);\n}\n.lane { content: "}"; }\n}\n')
  expect(css).toContain("surfaces/ledger/ui/styles.css is left out")
  expect(css).not.toContain("body { color: red; }")
  // A @source line, which Tailwind takes only outside a scope, is lifted above the scopes, its path from the root's directory.
  writeFileSync(join(baba, "surfaces/lane-board/ui/styles.css"), '@source "../../../node_modules/lanes";\n/* @source "commented"; */\n.lane { color: var(--primary); }\n')
  expect(run(["provision"]).status).toBe(0)
  expect(styles()).toContain('@source "..";\n@source "../node_modules/lanes";\n')
  expect(styles()).toContain('@scope ([data-surface="lane-board"]) {\n/* @source "commented"; */\n.lane { color: var(--primary); }\n}\n')
  for (const name of ["lane-board", "ledger"]) rmSync(join(baba, "surfaces", name), { recursive: true })
  expect(run(["provision"]).status).toBe(0)
  expect(styles()).not.toContain("@scope")
})

test("outside any .baba/, the command says to make one", () => {
  expect(run(["provision"], tmpdir())).toMatchObject({ status: 2, err: expect.stringContaining("baba init") })
  expect(run([])).toMatchObject({ status: 2, err: expect.stringContaining("baba new NAME") })
})

const config = (text: string) => writeFileSync(join(baba, "baba.config.ts"), `import { config } from "babavoss/core/config.ts"\n\nexport default config(${text})\n`)

test("provision sets Claude Code up as Codex: what an older release left, a link to the package's plugin or a copy of it, is replaced, and the person's settings are kept", () => {
  const file = join(project, ".claude/settings.json")
  const dir = join(project, ".claude/skills/baba")
  const older = { hooks: [{ type: "command", command: 'bun "${CLAUDE_PROJECT_DIR}/.baba/node_modules/babavoss/bin/baba.ts" hook 2>/dev/null || true' }] }
  const ours = { hooks: [{ type: "command", command: hookCommand("claude") }] }
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }
  const words = readFileSync(join(checkout, "skill/SKILL.md"), "utf8")

  // As the release before left it: a link into the package's plugin.
  rmSync(dir, { recursive: true })
  symlinkSync("../../.baba/node_modules/babavoss/plugin/claude", dir)
  expect(run(["provision"]).out).toContain("provisioned .claude/skills/baba\n")
  expect(lstatSync(dir).isDirectory()).toBe(true)
  expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe(words)

  // As a copy of that plugin, where no link could be made: its manifest and hooks go, which Claude Code would still load.
  mkdirSync(join(dir, ".claude-plugin"))
  mkdirSync(join(dir, "hooks"))
  writeFileSync(join(dir, "hooks/hooks.json"), "{}")
  writeFileSync(join(dir, "SKILL.md"), "---\nname: baba\ndescription: older words\n---\n\nOlder.\n")
  // And an older release's hook in the settings, among the person's: replaced by today's, theirs as they were.
  writeFileSync(file, JSON.stringify({ attribution: { commit: "" }, hooks: { PostToolUse: [theirs, older], Notification: [theirs] }, model: "haiku" }, null, 2))

  const provisioned = run(["provision"])

  expect(provisioned.out).toContain("provisioned .claude/skills/baba\nprovisioned .claude/settings.json\n")
  expect(provisioned.out).toMatch(/\.claude\/settings\.json as it was is kept at \.baba\/\.state\/backups\/\.claude__settings\.json\.\d{8}T\d{6}Z/)
  expect(readdirSync(dir)).toEqual(["SKILL.md"])
  expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe(words)

  const now = JSON.parse(readFileSync(file, "utf8")) as { hooks: Record<string, unknown[]> }

  expect(Object.keys(now)).toEqual(["attribution", "hooks", "model"])
  expect(now.hooks.PostToolUse).toEqual([theirs, ours])
  expect(now.hooks.Notification).toEqual([theirs])
  expect(now.hooks.SessionStart).toEqual([ours])
  // Provisioned again, nothing is written and no copy is made.
  expect(run(["provision"]).out).not.toContain(".claude/")
  expect(readdirSync(join(project, ".baba/.state/backups"))).toHaveLength(1)

  // Settings that are not valid are not written over: it stops, says why, and the file is as it was.
  writeFileSync(file, "{ not json")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining(".claude/settings.json is not JSON") })
  expect(readFileSync(file, "utf8")).toBe("{ not json")
  rmSync(file)

  // A skill of the person's under the name is not taken.
  rmSync(dir, { recursive: true })
  mkdirSync(dir)
  writeFileSync(join(dir, "notes.md"), "mine\n")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining("is not baba's") })
  rmSync(dir, { recursive: true })
  expect(run(["provision"]).status).toBe(0)
  expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe(words)
})

test("provision writes the framework's hook into Codex's project hooks for each of its events, once, among the person's, and opens the network only where asked", () => {
  const file = join(project, ".codex/hooks.json")
  const toml = join(project, ".codex/config.toml")
  const hooks = () => (JSON.parse(readFileSync(file, "utf8")) as { hooks: Record<string, { hooks: { command: string; timeout?: number }[] }[]> }).hooks
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }

  expect(Object.keys(hooks())).toEqual(["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "Interrupt", "SessionEnd"])
  for (const [event, groups] of Object.entries(hooks())) {
    expect(groups).toHaveLength(1)
    expect(groups[0]!.hooks[0]!.command).toEndWith('/.baba/node_modules/babavoss/bin/baba.ts" hook codex 2>/dev/null || true')
    expect(groups[0]!.hooks[0]!.timeout).toBe(event === "SessionEnd" ? 3 : undefined)
  }
  writeFileSync(file, JSON.stringify({ hooks: { Stop: [theirs], PreToolUse: [theirs] } }))

  const provisioned = run(["provision"])

  expect(provisioned.out).toContain("provisioned .codex/hooks.json\n")
  expect(provisioned.out).toContain("Codex asks you to review these hooks once")
  expect(run(["provision"]).out).not.toContain(".codex/hooks.json")
  expect(hooks().Stop).toEqual([theirs, expect.objectContaining({ hooks: [expect.objectContaining({ type: "command" })] })])
  expect(hooks().PreToolUse).toEqual([theirs])
  expect(existsSync(toml)).toBe(false)

  // The network, asked for: added where config.toml does not say, left where it does, and taken out again when not asked.
  writeFileSync(toml, 'model = "o3"\n\n[sandbox_workspace_write]\nwritable_roots = ["/tmp"]\n')
  config('{ harnesses: { codex: { enable: true, network: true } } }')
  expect(run(["provision"]).out).toContain(".codex/config.toml: network_access = true added to [sandbox_workspace_write]")
  expect(readFileSync(toml, "utf8")).toStartWith('model = "o3"\n\n[sandbox_workspace_write]\nnetwork_access = true # babavoss:')
  expect(run(["provision"]).out).not.toContain("config.toml")
  config('{ harnesses: { codex: { enable: true } } }')
  expect(run(["provision"]).out).toContain("provisioned .codex/config.toml")
  expect(readFileSync(toml, "utf8")).toBe('model = "o3"\n\n[sandbox_workspace_write]\nwritable_roots = ["/tmp"]\n')
  config('{ harnesses: { codex: { enable: true, network: true } } }')
  writeFileSync(toml, "[sandbox_workspace_write]\nnetwork_access = false\n")
  expect(run(["provision"]).out).toContain("already says whether the sandbox has the network: left as it is")
  expect(readFileSync(toml, "utf8")).toBe("[sandbox_workspace_write]\nnetwork_access = false\n")
  rmSync(toml)
  expect(run(["provision"]).status).toBe(0)
  expect(readFileSync(toml, "utf8")).toContain("[sandbox_workspace_write] # babavoss")
  config('{ harnesses: { codex: { enable: true } } }')
  expect(run(["provision"]).out).toContain("provisioned .codex/config.toml")
  expect(existsSync(toml)).toBe(false)
  rmSync(join(baba, "baba.config.ts"))
})

test("a harness the configuration does not enable is withdrawn, exactly what baba wrote; one that does not load stops provisioning, and changes nothing", () => {
  const settings = join(project, ".claude/settings.json")
  const hooks = join(project, ".codex/hooks.json")
  const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }
  const before = () => ({ claude: readFileSync(settings, "utf8"), codex: readFileSync(hooks, "utf8"), skills: FOLDERS.map((folder) => existsSync(skill(folder, "baba"))) })

  writeFileSync(settings, '{\n    "model": "haiku"\n}\n')
  writeFileSync(hooks, JSON.stringify({ hooks: { Stop: [theirs] } }))
  expect(run(["provision"]).status).toBe(0)

  const was = before()

  for (const broken of ['{ harnesses: { claude: { enable: "yes" } } }', "{ harnesses: { cursor: { enable: true } } }", '{ harnesses: { claude: { enable: true, events: ["Notification"] } } }', "{ harnesses: { codex: { enable: true, colour: 1 } } }"]) {
    config(broken)
    expect(run(["provision"]), broken).toMatchObject({ status: 1, err: expect.stringContaining(".baba/baba.config.ts: ") })
  }
  writeFileSync(join(baba, "baba.config.ts"), "export default {\n")
  expect(run(["provision"])).toMatchObject({ status: 1, err: expect.stringContaining(".baba/baba.config.ts does not load") })
  expect(before()).toEqual(was)

  config("{ harnesses: { claude: { enable: false }, codex: { enable: false }, antigravity: { enable: false } } }")

  const withdrawn = run(["provision"])

  expect(withdrawn.out).toContain(
    "withdrew .claude/skills/baba\nwithdrew .claude/settings.json\nwithdrew .agents/skills/baba\nwithdrew .codex/hooks.json\nwithdrew .agents/hooks.json\n"
  )
  expect(existsSync(join(project, ".claude/skills"))).toBe(false)
  expect(existsSync(join(project, ".agents"))).toBe(false)
  // What is left is the person's alone, laid out as they had it.
  expect(readFileSync(settings, "utf8")).toBe('{\n    "model": "haiku"\n}\n')
  expect(JSON.parse(readFileSync(hooks, "utf8"))).toEqual({ hooks: { Stop: [theirs] } })
  expect(run(["provision"]).out).toBe("provisioned .baba/.root\n")
  rmSync(join(baba, "baba.config.ts"))
  rmSync(settings)
  rmSync(hooks)
  expect(run(["provision"]).out).toContain(
    "provisioned .claude/skills/baba\nprovisioned .claude/settings.json\nprovisioned .agents/skills/baba\nprovisioned .codex/hooks.json\nprovisioned .agents/hooks.json\n"
  )
})

test("the hook reads the configuration as it runs: an event not listed tells nothing, nor a harness not enabled, nor a configuration that does not load, which the shell's answer says", () => {
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "configured", CODEX_THREAD_ID: "", ANTIGRAVITY_CONVERSATION_ID: "" }
  const hook = (harness: string[], input: Record<string, unknown>) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook", ...harness], { cwd: project, encoding: "utf8", env, input: JSON.stringify(input) })
  const start = { session_id: "configured", hook_event_name: "SessionStart", source: "startup" }

  try {
    config('{ harnesses: { claude: { enable: true, events: ["Stop"] }, codex: { enable: false } } }')
    expect(hook([], start)).toMatchObject({ status: 0, stdout: "" })
    expect(hook(["codex"], start)).toMatchObject({ status: 0, stdout: "" })
    expect(hook(["cursor"], start)).toMatchObject({ status: 0, stdout: "" })
    writeFileSync(join(baba, "baba.config.ts"), "export default {\n")
    expect(hook([], start)).toMatchObject({ status: 0, stdout: "" })

    const answer = spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env })

    expect(answer.stdout).toContain(".baba/baba.config.ts does not load")
    expect(answer.stdout).toContain("The harnesses' hooks say nothing until it loads")
  } finally {
    rmSync(join(baba, "baba.config.ts"), { force: true })
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", "close"], { cwd: project, encoding: "utf8", env })
  }
}, 60_000)

test("provision and start say in one line where an organisation's managed settings keep Claude Code from running baba's hook; a harness not enabled is not read for", () => {
  const managed = mkdtempSync(join(tmpdir(), "managed-"))
  const env = { ...process.env, BABAVOSS_MANAGED: managed, CLAUDE_CODE_SESSION_ID: "managed", CODEX_THREAD_ID: "", ANTIGRAVITY_CONVERSATION_ID: "" }
  const baba_ = (args: string[]) => spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), ...args], { cwd: baba, encoding: "utf8", env })
  const line = `baba: Claude Code's managed settings (${join(managed, "managed-settings.json")}) disable every hook (disableAllHooks), baba's among them;`

  try {
    expect(baba_(["provision"]).stdout).not.toContain("managed settings")
    writeFileSync(join(managed, "managed-settings.json"), JSON.stringify({ disableAllHooks: true }))
    expect(baba_(["provision"]).stdout).toContain(line)

    const started = baba_(["start"])

    expect(started.status, started.stderr).toBe(0)
    expect(started.stderr.split("\n").filter((l) => l.startsWith("baba: "))).toEqual([expect.stringContaining(line)])
    expect(started.stdout).toContain("page: ")
    config("{ harnesses: { claude: { enable: false } } }")
    expect(baba_(["start"]).stderr).not.toContain("managed settings")
  } finally {
    rmSync(join(baba, "baba.config.ts"), { force: true })
    baba_(["provision"])
    baba_(["start", "close"])
    rmSync(managed, { recursive: true, force: true })
  }
}, 60_000)

test("setup gives a Settings link before the first hook, and approval rejects agent calls and stale reviews", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "baba-codex-review-"))
  const state = join(fixture, "approved.json")
  const hookFile = join(project, ".codex/hooks.json")
  const command = hookCommand("codex")
  const hash = `sha256:${"1".repeat(64)}`
  const key = `${hookFile}:session_start:0:0`
  const hook = { key, sourcePath: hookFile, source: "project", enabled: true, handlerType: "command", eventName: "sessionStart", command, currentHash: hash }
  const executable = join(fixture, "codex")

  writeFileSync(executable, `#!${process.execPath}
    import { existsSync, writeFileSync } from "node:fs"
    const hook = ${JSON.stringify(hook)}
    const state = ${JSON.stringify(state)}
    for await (const line of console) {
      const { id, method, params } = JSON.parse(line)
      if (method === "initialized") continue
      let result = {}
      if (method === "initialize") result = { userAgent: "T3 Code/0.172.0 (test)" }
      if (method === "hooks/list") {
        const trustStatus = existsSync(state) ? "trusted" : "untrusted"
        const other = { ...hook, key: hook.key + "-other", command: hook.command + " extra", trustStatus: "untrusted" }
        result = { data: [{ hooks: [{ ...hook, trustStatus }, other] }] }
      }
      if (method === "config/batchWrite") writeFileSync(state, JSON.stringify(params.edits))
      console.log(JSON.stringify({ id, result }))
    }
  `, { mode: 0o755 })
  const env = { ...process.env, PATH: `${fixture}:${process.env.PATH}`, BABAVOSS_HOME: join(fixture, "state") }
  const run = (...args: string[]) => spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", "--session", "review", ...args], {
    cwd: project, encoding: "utf8", env,
  })

  try {
    const started = run("--setup")

    expect(started.status, started.stderr).toBe(0)
    expect(started.stdout).toMatch(/Settings: http:\/\/127\.0\.0\.1:\d+\/settings\/general#codex-hooks/)

    const page = new URL(/Settings: (\S+)/.exec(started.stdout)![1]!)
    const html = await fetch(page, { headers: { accept: "text/html" } })

    expect(html.status, await html.text()).toBe(200)
    expect(run("--setup").stdout).toContain(`Settings: ${page.href}`)

    const endpoint = new URL("/_/codex-hooks", page)
    const site = { "sec-fetch-site": "same-origin" }
    const listed = await fetch(endpoint, { headers: site })
    const review = await listed.json() as CodexHookReview

    expect(review).toMatchObject({ status: "review", hooks: [{ eventName: "sessionStart", command, sourcePath: hookFile }] })
    if (review.status !== "review" || !review.review) throw new Error("expected a review that can be approved")
    expect(review.hooks).toHaveLength(1)

    const headers = { ...site, origin: page.origin, "sec-fetch-user": "?1", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }
    const post = (headers: Record<string, string>, fingerprint = review.review) =>
      fetch(`${endpoint}?review=${fingerprint}`, { method: "POST", headers, redirect: "manual" })

    for (const refused of [await post(site), await post({ ...headers, "sec-fetch-user": "?0" }), await post({ ...headers, "babavoss-service": "agent" })]) {
      expect(refused.status).toBe(403)
      await refused.body?.cancel()
    }

    const stale = await post(headers, "0".repeat(64))

    expect(stale.status).toBe(303)
    expect(stale.headers.get("location")).toStartWith("/settings/general?codexHookError=")
    expect(existsSync(state)).toBe(false)

    const approved = await post(headers)

    expect(approved.status).toBe(303)
    expect(approved.headers.get("location")).toBe("/settings/general#codex-hooks")
    expect(await fetch(endpoint, { headers: site }).then((answer) => answer.json())).toEqual({ status: "approved" })
    expect(JSON.parse(readFileSync(state, "utf8"))).toEqual([{ keyPath: "hooks.state", mergeStrategy: "upsert", value: { [key]: { trusted_hash: hash } } }])
  } finally {
    run("close")
    rmSync(fixture, { recursive: true, force: true })
  }
})

test("a session's start gives operating guidance and starts the root; a surface teaches by itself alone; the hook tells what changed there", async () => {
  expect(run(["new", "desk"]).status).toBe(0)

  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "hooked", CODEX_THREAD_ID: "", ANTIGRAVITY_CONVERSATION_ID: "" }
  const command = (...args: string[]) => spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), ...args], { cwd: project, encoding: "utf8", env })
  const hook = (event: string, more: Record<string, unknown> = {}) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], {
      cwd: project,
      encoding: "utf8",
      env,
      input: JSON.stringify({ session_id: "hooked", hook_event_name: event, ...more }),
    })
  const body = readFileSync(join(checkout, "framework/core/session-start.md"), "utf8").trim()
  const started = hook("SessionStart", { source: "startup" })

  try {
    // The operating guidance, then the root's answer: its version, its page's address and how to show it, the surfaces.
    expect(started.status).toBe(0)
    expect(started.stdout).toStartWith(`${body}\n\nThe shell of .baba/ was started for this session, and answered:\n`)
    expect(started.stdout).not.toContain("# Making surfaces")
    expect(started.stdout).toContain(`baba ${VERSION}\n`)
    expect(started.stdout).toMatch(/answered:\npage: http:\/\/127\.0\.0\.1:\d+  a new address\ncommand: \.baba\/\.state\/bin\/baba, from the project's directory; /)
    // Where the command was put is no part of it: the answer names the command.
    expect(started.stdout).not.toContain("is now a command")

    // By hand it is the same runtime, at the same address, wherever in the project it is started from.
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(started.stdout)![0]

    expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env }).stdout).toContain(`page: ${address}\n`)
    expect(existsSync(join(project, ".babavoss"))).toBe(false)

    // The shell lists the surface at / with what it says it is for, and offers to open it, to the agent and to the person.
    const word = join(project, ".baba/.state/bin/baba")
    const call = (...args: string[]) => spawnSync(word, args, { cwd: project, encoding: "utf8", env })

    expect(started.stdout).toContain('"desk"\t"The greeting in use, and one proposed in its place. Use when the greeting is read or changed."')
    // Two surfaces, one open action: its argument is the table's name column.
    expect(started.stdout).toContain("actions: .baba/.state/bin/baba / ACTION name=value…\n  open surface=NAME   in a new tab, unless its surface keeps one")

    // The person opens it on the page: the agent is told with their next message, and how the surface is worked with it.
    const endpoint = JSON.parse(readFileSync(join(project, ".baba/.state/sessions/hooked/baba/service.json"), "utf8")) as { port: number; token: string }
    const person = (path: string, handle: string, args: Record<string, string>) =>
      fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "babavoss-service": endpoint.token, "babavoss-actor": "person" },
        body: JSON.stringify({ handle, args }),
      })

    // Whose move it is, as the page is told it: the hooks say it, a stop adds nothing for the agent and tells nothing away.
    const turn = async () => {
      const ctrl = new AbortController()
      const stream = await fetch(`http://127.0.0.1:${endpoint.port}/`, { headers: { accept: "text/event-stream", "babavoss-service": endpoint.token }, signal: ctrl.signal })
      const reader = stream.body!.getReader()
      let text = ""

      while (!/event: turn\ndata: .*\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
      ctrl.abort()

      return JSON.parse(/event: turn\ndata: (.*)\n/.exec(text)![1]!) as { agent: string; waiting: number }
    }

    expect(await turn()).toMatchObject({ agent: "idle", waiting: 0 })
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "working" })
    expect(hook("Stop", { stop_hook_active: false, last_assistant_message: "done" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle" })
    expect((await person("/", "open", { surface: "desk" })).status).toBe(200)
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle", waiting: 1 })

    const opened = hook("UserPromptSubmit").stdout

    // A tab the person opened is told in one line, its heading, its actions by name and where to read it, which the agent does.
    expect(opened).toMatch(
      /^In the shell of .baba\/: what was heard, then what changed at \/ since you were last told it, by who changed it:\nnotices:\nthe person opened \/desk\nchanged by the person:\n\+ \/desk "Greeting" \(tab \d+\), actions: propose; read \/desk\n?$/
    )

    const tab = /\+ (\/desk) "Greeting"/.exec(opened)![1]!

    expect(call(tab).stdout).toContain('how: "The greeting in use, and one proposed, if any')
    expect(call(tab).stdout).toContain('greeting: "hello"')

    // The tab's own path offers its actions, the command once and a line each, an input as what it means.
    expect(call(tab).stdout).toContain(`actions: .baba/.state/bin/baba ${tab} ACTION name=value…\n  propose text=line   stands beside the greeting in use until accepted or declined`)

    // The page holds the surface's component in its tab.
    // At its bare address: no link, no key, no cookie.
    const html = await (await fetch(address, { headers: { accept: "text/html" } })).text()
    const script = /\/_\/[^"]*\.js/.exec(html)![0]

    expect(await (await fetch(address + script)).text()).toContain("A greeting proposed shows here")
    expect(hook("UserPromptSubmit")).toMatchObject({ status: 0, stdout: "" })

    // The person proposes there: a call the agent did not make.
    expect((await person(tab, "propose", { text: "good morning" })).status).toBe(200)

    // After a tool call, what was heard alone, one line: the surface's highlight; it stands for what the call changed.
    expect(JSON.parse(hook("PostToolUse").stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Heard in the shell of .baba/ while you worked:\nnotices:\nhighlight ${tab}: "good morning" is proposed, to accept or decline (by the person)`,
      },
    })
    // With the person's message, nothing more: the highlight told what changed.
    expect(call(tab).stdout).toContain("good morning")
    // Told once: the session has now been answered.
    expect(hook("UserPromptSubmit").stdout).toBe("")
    expect(hook("PostToolUse").stdout).toBe("")
    expect(hook("Stop")).toMatchObject({ status: 0, stdout: "" })
    expect(hook("StopFailure", { error: "rate_limit" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "idle", waiting: 0 })
    expect(hook("SessionEnd", { reason: "other" })).toMatchObject({ status: 0, stdout: "" })
    expect(await turn()).toMatchObject({ agent: "unknown" })

    // A session resumed, compacted or forked lost what it held: it is given the same as a start, the words and the present
    // whole, every tab's actions with their commands among it; once a boundary, so a compaction at once after a resume is
    // given nothing again, and one after a message is given them.
    for (const source of ["resume", "compact", "fork"]) {
      const again = hook("SessionStart", { source }).stdout

      expect(again).toStartWith(`${body}\n\nThe shell of .baba/ was started for this session, and answered:\npage: `)
      expect(again).toContain(`${tab} "Greeting" (tab `)
      expect(again).toContain(`actions: .baba/.state/bin/baba ${tab} ACTION`)
      expect(hook("SessionStart", { source: "compact" })).toMatchObject({ status: 0, stdout: "" })
      hook("UserPromptSubmit")
      // The same present a start gives at the same moment.
      expect(hook("SessionStart", { source: "clear" }).stdout).toBe(again)
      hook("UserPromptSubmit")
    }

    // The agent's own calls, through a program, are not told back to it: the program's answers told it.
    expect(call("-e", `console.log(await root.call(${JSON.stringify(tab)}, "propose", { text: "good evening" }))`).status).toBe(0)
    expect(hook("PostToolUse").stdout).toBe("")

    // Fully from the surface: what its code says it is for is what the shell lists, once the shell runs that code; and a
    // surface made by hand is in the root once it runs. Nothing is provisioned for either. In normal mode, the default, the
    // shell runs the code it started with, says when it changed, and runs it once restarted.
    const code = join(baba, "surfaces/desk/src/surface.ts")
    const restarted = () => {
      const answer = call("restart")

      expect(answer.stdout, answer.stderr).toMatch(/^baba: instance [0-9a-f]+ restarts\nbaba: instance [0-9a-f]+ answers\n$/)
    }

    writeFileSync(code, readFileSync(code, "utf8").replace("The greeting in use, and one proposed in its place.", "Keep the house greeting."))
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain("code: changed on disk since instance ")
    expect(call("/").stdout).not.toContain("Keep the house greeting.")
    restarted()
    expect(call("/").stdout).toContain("Keep the house greeting.")
    expect(call("/").stdout).not.toContain("code: changed on disk")
    cpSync(join(baba, "surfaces/desk"), join(baba, "surfaces/by-hand"), { recursive: true })
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain("code: changed on disk since instance ")
    restarted()
    expect(call("/").stdout).toContain('"by-hand"')

    // surfaces/ made anew, as a checkout may leave it: the root follows the new one, and once restarted runs the code there.
    cpSync(join(baba, "surfaces"), join(baba, "surfaces.new"), { recursive: true })
    rmSync(join(baba, "surfaces"), { recursive: true })
    renameSync(join(baba, "surfaces.new"), join(baba, "surfaces"))
    cpSync(join(baba, "surfaces/desk"), join(baba, "surfaces/after-checkout"), { recursive: true })
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain("code: changed on disk since instance ")
    restarted()
    expect(call("/").stdout).toContain('"after-checkout"')
  } finally {
    command("start", "close")
  }
  expect(spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook"], { cwd: project, encoding: "utf8", env, input: "not json" })).toMatchObject({ status: 0, stdout: "" })
}, 60_000)

test("in dev mode the root starts with the surfaces that load, lists one that does not as broken, and keeps its tabs until its code loads again", async () => {
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "broken", CODEX_THREAD_ID: "", ANTIGRAVITY_CONVERSATION_ID: "", BABAVOSS_DEV: "1" }
  const word = join(project, ".baba/.state/bin/baba")
  const call = (...args: string[]) => spawnSync(word, args, { cwd: project, encoding: "utf8", env })
  const code = join(baba, "surfaces/by-hand/src/surface.ts")
  const missing = join(baba, "surfaces/by-hand/src/later.ts")
  const mended = readFileSync(code, "utf8")

  writeFileSync(code, `${mended}\nthrow new Error("not configured")\n`)
  try {
    const started = spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start"], { cwd: baba, encoding: "utf8", env })

    expect(started.status, started.stderr).toBe(0)
    expect(started.stdout).toContain('"by-hand"\t\t"the by-hand surface does not load (not configured, at .baba/surfaces/by-hand/src/surface.ts:')
    expect(started.stdout).toContain('"desk"\t"Keep the house greeting.')
    expect(call("/", "open", "surface=desk").stdout).toMatch(/\+ \/desk "Greeting" \(tab 1\)/)

    // Mended, it is opened; broken again while its tab is open, the tab says why and keeps what it holds.
    writeFileSync(code, mended)
    await poll(() => call("/").stdout, { timeout: 20_000 }).toContain('"by-hand"\t"Keep the house greeting.')
    expect(call("/", "open", "surface=by-hand").status).toBe(0)
    expect(call("/tabs/2", "propose", "text=kept").status).toBe(0)
    writeFileSync(code, `${mended}\nexport const broken = (\n`)
    await poll(() => call("/tabs/2").stdout, { timeout: 20_000 }).toContain("tab 2 is broken: the by-hand surface does not load (Unexpected end of file")
    expect(call("/tabs/1").stdout).toContain('greeting: "hello"')
    writeFileSync(code, mended)
    await poll(() => call("/tabs/2").stdout, { timeout: 20_000 }).toContain('proposed: "kept"')

    // Broken by an import of a file that is not there, it loads again once the file is made, its own code left as it is.
    writeFileSync(code, `import { later } from "./later.ts"\n${mended}\nlater()\n`)
    await poll(() => call("/tabs/2").stdout, { timeout: 20_000 }).toContain("./later.ts")
    writeFileSync(missing, "// Made after the surface that imports it.\nexport const later = () => {}\n")
    await poll(() => call("/tabs/2").stdout, { timeout: 20_000 }).toContain('proposed: "kept"')
  } finally {
    rmSync(missing, { force: true })
    writeFileSync(code, mended)
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", "close"], { cwd: project, encoding: "utf8", env })
  }
}, 60_000)

test("Antigravity's hooks run from .agents/, start the shell in the project's cwd, and inject via injectSteps.systemMessage across SessionStart, PreInvocation and Stop", async () => {
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: "", CODEX_THREAD_ID: "", ANTIGRAVITY_CONVERSATION_ID: "agy-session" }
  const agents = join(project, ".agents")
  const hook = (payload: Record<string, unknown>) =>
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "hook", "antigravity"], {
      cwd: agents,
      encoding: "utf8",
      env,
      input: JSON.stringify({ conversationId: "agy-session", cwd: project, workspacePaths: [project], ...payload }),
    })

  try {
    const started = hook({ hookEventName: "SessionStart" })

    expect(started.status).toBe(0)

    const startOut = JSON.parse(started.stdout) as { injectSteps: { systemMessage: { systemMessage: string } }[] }

    expect(startOut.injectSteps[0]!.systemMessage.systemMessage).toContain("The shell of .baba/ was started for this session, and answered:")
    // The session's registered directory is the project root, not .agents/ where the hook ran.
    const open = JSON.parse(readFileSync(join(project, ".baba/.state/sessions/agy-session/open.json"), "utf8")) as { baba: { directory: string } }

    expect(open.baba.directory).toBe(project)
    // Nothing changed yet: PreInvocation and Stop return valid empty JSON {}.
    expect(JSON.parse(hook({ hookEventName: "PreInvocation", invocationNum: 0 }).stdout)).toEqual({})
    expect(JSON.parse(hook({ hookEventName: "Stop", executionNum: 1, terminationReason: "NO_TOOL_CALL", fullyIdle: true }).stdout)).toEqual({})

    // The person opens a tab on the page: PreInvocation (invocationNum 0) injects the diff, and a mid-turn notice arrives on invocationNum 1.
    const endpoint = JSON.parse(readFileSync(join(project, ".baba/.state/sessions/agy-session/baba/service.json"), "utf8")) as { port: number; token: string }
    const person = (path: string, handle: string, args: Record<string, string>) =>
      fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "babavoss-service": endpoint.token, "babavoss-actor": "person" },
        body: JSON.stringify({ handle, args }),
      })

    expect((await person("/", "open", { surface: "desk" })).status).toBe(200)

    const turnStart = JSON.parse(hook({ hookEventName: "PreInvocation", invocationNum: 0 }).stdout) as { injectSteps: { systemMessage: { systemMessage: string } }[] }

    expect(turnStart.injectSteps[0]!.systemMessage.systemMessage).toContain('the person opened /desk')
    expect((await person("/desk", "propose", { text: "from antigravity" })).status).toBe(200)

    const midTurn = JSON.parse(hook({ hookEventName: "PreInvocation", invocationNum: 1 }).stdout) as { injectSteps: { systemMessage: { systemMessage: string } }[] }

    expect(midTurn.injectSteps[0]!.systemMessage.systemMessage).toContain('Heard in the shell of .baba/ while you worked:')
    expect(midTurn.injectSteps[0]!.systemMessage.systemMessage).toContain('from antigravity')
  } finally {
    spawnSync(process.execPath, [join(checkout, "bin/baba.ts"), "start", "close"], { cwd: project, encoding: "utf8", env })
  }
}, 60_000)
