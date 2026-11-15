// Provisioning: a project's roles are code in its .baba/ directory, and each is given to the harnesses as a skill in the
// directory .baba/ is in. A provisioned skill is one generated file, SKILL.md: the role's own description and know-how
// from its ROLE.md, around the part that is the same for every role, how to open it and how to operate it. baba, the
// skill that maintains .baba/, is provisioned with them, from this package, so it is always the one for this framework.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { readJsonFile, writeJsonFile } from "./state/json-file.ts"

/** Where the harnesses read skills, relative to a project or to the person's home: Claude Code, and Codex with the rest. */
export const SKILL_FOLDERS = [".claude/skills", ".agents/skills"]
export const ROLES_DIR = "roles"
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
- The person watches and acts on the page. Give them its address whenever the role names a new one.
- For more than a few calls of one kind, write one program with the command's \`-e\`: \`app.read(path)\`, \`app.call(path, handle, args)\` and \`app.wait(seconds)\`. Print each result and stop at the first refusal.`

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

/** The skill of a role, as provisioned. */
export function roleSkill(baba: string, name: string): string {
  const { description, body } = readRole(join(baba, ROLES_DIR, name, "ROLE.md"))

  return `---\nname: ${name}\ndescription: ${description}\ncompatibility: Requires Bun 1.4 or later\n---\n\n${opening(name)}\n\n${OPERATING}\n${body && `\n${body}\n`}`
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
  const taken = files.find(({ file }) => existsSync(dirname(file)) && !before.includes(relative(root, dirname(file))))

  if (taken) throw new Error(`${dirname(taken.file)} exists already and was not provisioned from here: name the role otherwise, or remove what is there`)

  const now = files.map(({ file }) => relative(root, dirname(file)))
  const removed = before.filter((dir) => !now.includes(dir))

  for (const dir of removed) rmSync(join(root, dir), { recursive: true, force: true })
  for (const { file, text } of files) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  writeJsonFile(record, now)

  return { written: now, removed }
}
