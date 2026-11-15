#!/usr/bin/env bun
// baba, the package's command: makes a project's .baba/ directory, makes a role in it from the template, and provisions
// the roles as skills. It works on the .baba/ it is run in, or the nearest one above.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { hookContext, hookOutput, type HookInput } from "../framework/core/hook.ts"
import { findBaba, provision, ROLES_DIR, taken } from "../framework/core/provision.ts"
import { REPOSITORY, VERSION } from "../framework/core/update.ts"

const USAGE = `baba init [--from SPEC]   make .baba/ in this directory, install the framework and provision; SPEC names the framework, a release by default
baba new NAME             make the role NAME from the template in .baba/roles/NAME, and provision
baba start [--session ID] start the root of .baba/ for this session, or the session by-hand outside a harness: its version, its page's address, the roles
baba provision            write the skills of baba and of every role, and the framework's hook, into the harnesses' configuration beside .baba/
baba hook                 what a harness's hook runs: reads the hook's input, prints the context to add`
const NAME = /^[a-z][a-z0-9-]*$/
const TEMPLATE = fileURLToPath(new URL("../template", import.meta.url))
/** The names the template stands in for the role's own. */
const PLACEHOLDERS = ["NAME", "my-role"]
/** The template's files that carry a placeholder. */
const NAMED = ["ROLE.md", "src/role.ts", "ui/index.html"]
const TSCONFIG = {
  compilerOptions: {
    lib: ["ESNext", "DOM", "DOM.Iterable"],
    target: "ESNext",
    module: "Preserve",
    moduleDetection: "force",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    erasableSyntaxOnly: true,
    noEmit: true,
    types: ["bun"],
    strict: true,
    skipLibCheck: true,
    noUncheckedIndexedAccess: true,
    jsx: "react-jsx",
  },
  include: [ROLES_DIR, "node_modules/babavoss/framework/shell/ui/css.d.ts"],
}

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
const ROOT = fileURLToPath(new URL("../framework/root/scripts/open.ts", import.meta.url))
/** Without a harness's session, as when the person starts it by hand, the session is this one. */
const BY_HAND = "by-hand"

function report({ written, removed }: ReturnType<typeof provision>) {
  for (const dir of removed) console.log(`removed ${dir}`)
  for (const dir of written) console.log(`provisioned ${dir}`)
}

function init(args: string[]) {
  const baba = join(process.cwd(), ".baba")
  const from = args[0] === "--from" ? args[1] : undefined

  if (args.length && !from) throw new Refusal(USAGE)
  if (existsSync(join(baba, "package.json"))) throw new Refusal(`${baba} is there already: provision it with \`baba provision\``)
  mkdirSync(join(baba, ROLES_DIR), { recursive: true })
  // The framework these roles run on is named here and nowhere else. Installing provisions, so a clone has its skills.
  writeFileSync(
    join(baba, "package.json"),
    json({
      name: "roles",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: { postinstall: "baba provision" },
      dependencies: { babavoss: from ?? `github:${REPOSITORY}#v${VERSION}` },
    })
  )
  writeFileSync(join(baba, "tsconfig.json"), json(TSCONFIG))
  writeFileSync(join(baba, ".gitignore"), "node_modules\n")

  const install = Bun.spawnSync([process.execPath, "install"], { cwd: baba, stdio: ["ignore", "inherit", "inherit"] })

  if (install.exitCode !== 0) throw new Refusal(`cannot install the framework; allow bun to reach github.com and the package registry, then run: cd '${baba}' && bun install`)
  console.log(`${baba} is made, and baba is a skill here: a new session of the harness finds it. Ask for a role with /baba`)
}

function create(args: string[]) {
  const [name] = args
  const baba = found()

  if (!name || !NAME.test(name) || name === "baba") throw new Refusal("a role's name is lowercase kebab-case, such as month-close, and not baba")

  const dir = join(baba, ROLES_DIR, name)

  if (existsSync(dir)) throw new Refusal(`${dir} is there already: name the role otherwise`)

  const other = taken(baba, name)

  if (other) throw new Refusal(`${other} exists already and was not provisioned from here: name the role otherwise, or remove what is there`)
  cpSync(TEMPLATE, dir, { recursive: true })
  for (const file of NAMED.map((named) => join(dir, named)))
    writeFileSync(file, PLACEHOLDERS.reduce((text, word) => text.replaceAll(word, name), readFileSync(file, "utf8")))
  console.log(`made ${dir}`)
  report(provision(baba))
}

try {
  const [command, ...args] = process.argv.slice(2)

  if (command === "init") init(args)
  else if (command === "new") create(args)
  else if (command === "start") {
    const harness = process.env.CLAUDE_CODE_SESSION_ID || process.env.CODEX_THREAD_ID
    const session = args.includes("--session") || harness ? [] : ["--session", BY_HAND]

    process.exitCode = Bun.spawnSync([process.execPath, ROOT, ...session, ...args], { stdio: ["inherit", "inherit", "inherit"] }).exitCode ?? 1
  } else if (command === "provision" && !args.length) report(provision(found()))
  else if (command === "hook") {
    // Never in the agent's way: whatever fails here, the hook says nothing.
    try {
      const input = JSON.parse(await Bun.stdin.text()) as HookInput
      const context = await hookContext(input, found())

      if (context) console.log(hookOutput(input, context))
    } catch {}
  }
  else throw new Refusal(USAGE)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(error instanceof Refusal ? 2 : 1)
}
