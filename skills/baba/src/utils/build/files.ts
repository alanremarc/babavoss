// What the build util does outside its model: finds the project's apps, and makes one from the template. A project's own
// apps live in skills/NAME and are installed in that project by links to them from the harness's skill folders. An app
// holds no framework and names none: it runs on this skill's.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { SKILL_FOLDERS } from "babavoss/core/skill-folders.ts"
import type { BuildPorts, Made } from "./surface.ts"

/** Where a project's own apps live. */
export const APPS_DIR = "skills"
/** The skill folders the harnesses read in a project: each holds a link to an app made here, which installs it there. */
export const HARNESS_SKILLS = SKILL_FOLDERS.filter((folder) => folder.linked).map((folder) => folder.project)
/** The names the template stands in for the app's own. */
const PLACEHOLDERS = ["NAME", "my-app"]
/** The template's files that carry a placeholder. */
const NAMED = ["SKILL.md", "README.md", "package.json", "src/app.ts", "ui/index.html"]
const carried = fileURLToPath(new URL("../../../", import.meta.url))

/** Whether anything stands at the path, a link that leads nowhere included. */
const stands = (path: string) => lstatSync(path, { throwIfNoEntry: false }) !== undefined

export function buildPorts(project: string, template: string = join(carried, "assets/template")): BuildPorts {
  return {
    project,
    // An app is a skill with a door; a skill without one is a skill of some other kind.
    async load() {
      const dir = join(project, APPS_DIR)
      const names = existsSync(dir) ? readdirSync(dir).sort() : []

      return names.flatMap((name): Made[] => {
        const skill = join(dir, name, "SKILL.md")

        if (!existsSync(skill) || !existsSync(join(dir, name, "scripts/open.ts"))) return []

        const description = /^description:\s*(.+)$/m.exec(readFileSync(skill, "utf8"))?.[1]

        return [{ name, dir: join(APPS_DIR, name), ...(description && { description }) }]
      })
    },
    async create(name) {
      const dir = join(project, APPS_DIR, name)
      const links = HARNESS_SKILLS.map((folder) => join(project, folder, name))
      const taken = [dir, ...links].find(stands)

      if (taken) throw new Error(`${relative(project, taken)} exists already: name the app otherwise, or remove what is there`)
      mkdirSync(dir, { recursive: true })
      try {
        cpSync(template, dir, { recursive: true })
        for (const file of NAMED.map((named) => join(dir, named)))
          if (existsSync(file)) writeFileSync(file, PLACEHOLDERS.reduce((text, word) => text.replaceAll(word, name), readFileSync(file, "utf8")))
        for (const link of links) {
          mkdirSync(dirname(link), { recursive: true })
          symlinkSync(relative(dirname(link), dir), link)
        }
      } catch (error) {
        for (const link of links) rmSync(link, { force: true })
        rmSync(dir, { recursive: true, force: true })
        throw error
      }

      return relative(project, dir)
    },
  }
}
