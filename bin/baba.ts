#!/usr/bin/env bun
// baba, the package's command: makes a project's .baba/ directory, makes a surface in it from the template, and provisions:
// each harness made aware by its adapter, and the root. It works on the .baba/ it is run in, or the nearest one above.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig, sectionOf } from "../framework/core/config.ts"
import { ADAPTERS } from "../framework/core/harness/index.ts"
import { hookContext } from "../framework/core/hook.ts"
import { findBaba, NAME, provision, RESERVED, scaffold, SURFACES_DIR, ROOT_DIR, type Provisioned } from "../framework/core/provision.ts"
import { REPOSITORY, VERSION } from "../framework/core/update.ts"

const USAGE = `baba init [--from SPEC]   make .baba/ in this directory, install the framework and provision; SPEC names the framework, a release by default
baba new NAME             make the surface NAME from the template in .baba/surfaces/NAME, and provision
baba start [--session ID] start the shell of .baba/ for this session, or the session by-hand outside a harness: its version, its page's address, the surfaces and the open tabs
baba provision            make each harness .baba/baba.config.ts enables aware of the surfaces, withdraw from the others, and generate the root from the surfaces
baba hook [HARNESS]       what a harness's hook runs, claude by default: reads the hook's input, prints the context to add`
const TEMPLATE = fileURLToPath(new URL("../template", import.meta.url))

class Refusal extends Error {}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** The .baba/ directory the command works on: the one it is run in, or the nearest above. */
function found(): string {
  return findBaba(process.cwd()) ?? refuse("there is no .baba/ here or above: make one with `baba init`")
}

const refuse = (message: string): never => {
  throw new Refusal(message)
}
/** The root's door, which opens the root of a .baba/ in a session. */
const ROOT = fileURLToPath(new URL("../framework/shell/scripts/open.ts", import.meta.url))
/** Without a harness's session, as when the person starts it by hand, the session is this one. */
const BY_HAND = "by-hand"

const report = ({ written, withdrawn, said }: Provisioned) =>
  console.log([...written.map((path) => `provisioned ${path}`), ...withdrawn.map((path) => `withdrew ${path}`), ...said].join("\n"))

function init(args: string[]) {
  const baba = join(process.cwd(), ".baba")
  const from = args[0] === "--from" ? args[1] : undefined

  if (args.length && !from) throw new Refusal(USAGE)
  if (existsSync(join(baba, "package.json"))) throw new Refusal(`${baba} is there already: provision it with \`baba provision\``)
  mkdirSync(join(baba, SURFACES_DIR), { recursive: true })
  // The framework these surfaces run on is named here and nowhere else. Installing provisions, so a clone is ready.
  writeFileSync(
    join(baba, "package.json"),
    json({
      name: "surfaces",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: { postinstall: "baba provision" },
      dependencies: { babavoss: from ?? `github:${REPOSITORY}#v${VERSION}` },
    })
  )
  scaffold(baba)
  writeFileSync(join(baba, ".gitignore"), `node_modules\n${ROOT_DIR}\n`)

  const install = Bun.spawnSync([process.execPath, "install"], { cwd: baba, stdio: ["ignore", "inherit", "inherit"] })

  if (install.exitCode !== 0) throw new Refusal(`cannot install the framework; allow bun to reach github.com and the package registry, then run: cd '${baba}' && bun install`)
  console.log(
    `${baba} is made, with no surfaces yet. A new session of the harness starts its shell; outside one, \`bun run baba start\` there does. ` +
      "How a surface is made: node_modules/babavoss/skill/making-surfaces.md, there.",
  )
}

async function create(args: string[]) {
  const [name] = args
  const baba = found()

  if (!name || !NAME.test(name) || RESERVED.includes(name)) throw new Refusal(`a surface's name is lowercase kebab-case, such as month-close, and not ${RESERVED.join(" or ")}`)

  const dir = join(baba, SURFACES_DIR, name)

  if (existsSync(dir)) throw new Refusal(`${dir} is there already: name the surface otherwise`)
  // Only the template's own files: what a file manager leaves beside them, as .DS_Store, is no part of a surface.
  cpSync(TEMPLATE, dir, { recursive: true, filter: (from) => !basename(from).startsWith(".") })
  console.log(`made ${dir}`)
  report(await provision(baba))
}

/**
 * What a harness's hook runs: its adapter reads the input, and the context is printed as the harness takes it. Never in
 * the agent's way: a configuration that does not load, a harness it does not enable, an event it does not list, and
 * whatever fails here, and the hook says nothing.
 */
async function hook(args: string[]) {
  try {
    const adapter = ADAPTERS.find((a) => a.name === (args[0] ?? "claude"))
    const event = adapter?.hookEvent(JSON.parse(await Bun.stdin.text()))

    if (!adapter || !event) return

    const baba = found()
    const section = sectionOf(await loadConfig(baba), adapter)

    if (!section.enable || !section.events.includes(event.event)) return

    const context = await hookContext(event, baba, adapter.name)

    if (context) console.log(adapter.hookOutput(event, context))
  } catch {}
}

/** What keeps each harness the configuration enables from running baba's hook here, a line each; nothing where that cannot be read. */
async function blockedLines(): Promise<string[]> {
  try {
    const baba = findBaba(process.cwd())
    const config = baba ? await loadConfig(baba) : {}

    return ADAPTERS.flatMap((adapter) => (sectionOf(config, adapter).enable ? (adapter.blocked?.() ?? []) : []))
  } catch {
    return []
  }
}

/** The session a root's door is to work in: the harness's where there is one, else the one started by hand. */
const session = () => (process.env.CLAUDE_CODE_SESSION_ID || process.env.CODEX_THREAD_ID ? [] : ["--session", BY_HAND])

try {
  const [command, ...args] = process.argv.slice(2)

  if (command === "init") init(args)
  else if (command === "new") await create(args)
  else if (command === "start") {
    for (const line of await blockedLines()) console.error(line)
    process.exitCode = Bun.spawnSync([process.execPath, ROOT, ...(args.includes("--session") ? [] : session()), ...args], { stdio: ["inherit", "inherit", "inherit"] }).exitCode ?? 1
  }
  else if (command === "provision" && !args.length) report(await provision(found()))
  else if (command === "hook" && args.length <= 1) await hook(args)
  else throw new Refusal(USAGE)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(error instanceof Refusal ? 2 : 1)
}
