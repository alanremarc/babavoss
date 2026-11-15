#!/usr/bin/env bun
// baba, the package's command: makes a project's .baba/ directory, makes a role in it from the template, and provisions
// the roles as skills. It works on the .baba/ it is run in, or the nearest one above.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { provision, ROLES_DIR } from "../framework/core/provision.ts"
import { REPOSITORY, VERSION } from "../framework/core/update.ts"

const USAGE = `baba init [--from SPEC]   make .baba/ in this directory, install the framework and provision; SPEC names the framework, a release by default
baba new NAME             make the role NAME from the template in .baba/roles/NAME, and provision
baba provision            write the skills of baba and of every role into the harnesses' skill folders beside .baba/`
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
  for (let dir = resolve(process.cwd()); ; dir = dirname(dir)) {
    const baba = basename(dir) === ".baba" ? dir : join(dir, ".baba")

    if (existsSync(join(baba, "package.json"))) return baba
    if (dir === dirname(dir)) throw new Refusal("there is no .baba/ here or above: make one with `baba init`")
  }
}

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
  else if (command === "provision" && !args.length) report(provision(found()))
  else throw new Refusal(USAGE)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(error instanceof Refusal ? 2 : 1)
}
