// Provisioning: a project's roles are code in its .baba/ directory, and each is given to the harnesses as a skill in the
// directory .baba/ is in. A provisioned skill is one generated file, SKILL.md: the role's own description and know-how
// from its ROLE.md, around the part that is the same for every role, how to open it and how to operate it. baba, the
// skill that maintains .baba/, is provisioned with them, from this package, so it is always the one for this framework.
// The framework's hook is provisioned too, where the harness has hooks: it tells the agent what it did not ask for.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readJsonFile, writeJsonFile } from "./state/json-file.ts"

/** Where the harnesses read skills, relative to a project or to the person's home: Claude Code, and Codex with the rest. */
export const SKILL_FOLDERS = [".claude/skills", ".agents/skills"]
export const ROLES_DIR = "roles"
/** The harness events the framework's hook is provisioned for: it adds context there and blocks nothing. */
export const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse"]
/** Claude Code's settings beside .baba/: the person's too, so only the framework's own hooks in it are written. */
const SETTINGS = ".claude/settings.json"
/** How the framework's hooks are told from the person's: by the command they run. */
const HOOK = '/.baba/node_modules/babavoss/bin/baba.ts" hook'
/** What was provisioned last, kept in .baba/: skills no role stands behind any more are removed, and no other skill is touched. */
const RECORD = "provisioned.json"
const NAME = /^[a-z][a-z0-9-]*$/
const BABA = fileURLToPath(new URL("../../skill/SKILL.md", import.meta.url))

/** How every role is operated: what the agent knows before its first command. */
export const OPERATING = `## Operating it

- An answer shows everything that is true now. Do not look for it in the role's code or in what it keeps on disk, and never change either to get something done.
- A line that ends in a description is an action offered now, printed as the exact command. Copy it and give a value where it says \`name=string\`. An action that is not printed is not offered.
- A fact named \`at\` is a path with more behind it: read it with the command for its detail and the actions offered there. Where the role has tabs, a tab's actions are offered at the tab's path, not at \`/\`.
- Every answer says what changed since you last looked, including what the person did on the page.
- A refusal gives its reason. Read again and act on what is offered; do not repeat the call.
- The person watches and acts on the page. Whenever the role names a new address, open it in the harness's browser if it has one, and otherwise give the address to the person.
- For more than a few calls of one kind, write one program with the command's \`-e\`: \`role.read(path)\`, \`role.call(path, handle, args)\` and \`role.wait(seconds)\`. Print each result and stop at the first refusal.`

/** .baba/ as a skill reaches it: every skill folder is two directories under the one .baba/ is in. */
const FROM_SKILL = "<the directory this file is in>/../../../.baba"

const opening = (name: string) => `Run \`bun ${FROM_SKILL}/${ROLES_DIR}/${name}/scripts/open.ts\` from the project's directory. Its answer is the role.

If \`bun\` is missing, tell the person to install it with \`curl -fsSL https://bun.sh/install | bash\`. If it cannot find the package babavoss, run \`bun install\` in ${FROM_SKILL} and open the role again. If the door says something must be allowed, pass that line to the person.`

/** A role's ROLE.md: its description, and under the frontmatter its own know-how. */
function readRole(file: string): { description: string; body: string } {
  const text = readFileSync(file, "utf8")
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  const description = /^description:\s*(.+)$/m.exec(front?.[1] ?? "")?.[1]?.trim()

  if (!description) throw new Error(`${file} has no description: start it with\n---\ndescription: what the role does. Use when ...\n---`)

  return { description, body: text.slice(front![0].length).trim() }
}

/** The roles in a .baba/ directory, by name: each directory under roles/ with a ROLE.md and a door. */
export function roles(baba: string): string[] {
  const dir = join(baba, ROLES_DIR)

  return (existsSync(dir) ? readdirSync(dir).sort() : []).filter(
    (name) => existsSync(join(dir, name, "ROLE.md")) && existsSync(join(dir, name, "scripts/open.ts"))
  )
}

export type Described = { name: string; description: string }

/** The roles in a .baba/ directory with their descriptions; one whose ROLE.md has none says so in its place. */
export const describedRoles = (baba: string): Described[] =>
  roles(baba).map((name) => {
    try {
      return { name, description: readRole(join(baba, ROLES_DIR, name, "ROLE.md")).description }
    } catch {
      return { name, description: "ROLE.md has no description yet" }
    }
  })

/** The .baba/ directory of a directory: the one it is, or the nearest in it or above; undefined where there is none. */
export function findBaba(from: string): string | undefined {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const baba = basename(dir) === ".baba" ? dir : join(dir, ".baba")

    if (existsSync(join(baba, "package.json"))) return baba
    if (dir === dirname(dir)) return undefined
  }
}

/** The skill of a role, as provisioned. */
export function roleSkill(baba: string, name: string): string {
  const { description, body } = readRole(join(baba, ROLES_DIR, name, "ROLE.md"))

  return `---\nname: ${name}\ndescription: ${description}\ncompatibility: Requires Bun 1.4 or later\n---\n\n${opening(name)}\n\n${OPERATING}\n${body && `\n${body}\n`}`
}

type Handler = { type?: string; command?: string }
type Group = { matcher?: string; hooks?: Handler[] }
type Settings = { hooks?: Record<string, Group[]> } & Record<string, unknown>

/**
 * Writes the framework's hook into Claude Code's settings beside `baba`, for each of its events, and leaves everything
 * else in the file as it is: the person's settings and their own hooks.
 */
export function provisionHooks(baba: string) {
  const root = dirname(baba)
  const file = join(root, SETTINGS)
  let settings: Settings

  try {
    settings = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Settings) : {}
  } catch {
    throw new Error(`${file} is not JSON: correct it, and provision again`)
  }

  // Under a project the harness names its root; under the person's home, the home is it. Silent where bun or the package is missing.
  const dir = root === realpathSync(homedir()) ? "$HOME" : "${CLAUDE_PROJECT_DIR}"
  const ours: Group = { hooks: [{ type: "command", command: `bun "${dir}${HOOK} 2>/dev/null || true` }] }
  const hooks: Record<string, Group[]> = {}

  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const kept = groups
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((handler) => !handler.command?.includes(HOOK)) }))
      .filter((group) => group.hooks.length)

    if (kept.length) hooks[event] = kept
  }
  for (const event of HOOK_EVENTS) hooks[event] = [...(hooks[event] ?? []), ours]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`)
}

/** A skill of this name beside `baba` that provisioning did not make, and so will not write over; undefined where there is none. */
export function taken(baba: string, name: string): string | undefined {
  const before = readJsonFile<string[]>(join(baba, RECORD)) ?? []

  return SKILL_FOLDERS.map((folder) => join(folder, name)).find((dir) => existsSync(join(dirname(baba), dir)) && !before.includes(dir))
}

/**
 * Writes the skills of `baba`, a .baba/ directory, into the harnesses' skill folders beside it: baba itself and one per
 * role. Answers with what it wrote and removed, relative to the directory .baba/ is in.
 */
export function provision(baba: string): { written: string[]; removed: string[] } {
  const root = dirname(baba)
  const record = join(baba, RECORD)
  const before = readJsonFile<string[]>(record) ?? []
  const skills = new Map<string, string>([["baba", readFileSync(BABA, "utf8")]])

  for (const name of roles(baba)) {
    if (!NAME.test(name) || name === "baba") throw new Error(`${join(baba, ROLES_DIR, name)}: a role's name is lowercase kebab-case, and not baba`)
    skills.set(name, roleSkill(baba, name))
  }

  const files = SKILL_FOLDERS.flatMap((folder) => [...skills].map(([name, text]) => ({ file: join(root, folder, name, "SKILL.md"), text })))

  for (const name of skills.keys()) {
    const other = taken(baba, name)

    if (other) throw new Error(`${other} exists already and was not provisioned from here: name the role otherwise, or remove what is there`)
  }

  const now = files.map(({ file }) => relative(root, dirname(file)))
  const removed = before.filter((dir) => !now.includes(dir))

  for (const dir of removed) rmSync(join(root, dir), { recursive: true, force: true })
  for (const { file, text } of files) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  writeJsonFile(record, now)
  provisionHooks(baba)

  return { written: now, removed }
}
