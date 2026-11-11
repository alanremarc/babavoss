// What the build util does outside its model: reads the briefs kept in the project's apps, writes one back, and makes an
// app from the template and the framework this authoring app carries. A project's own apps live in skills/NAME and are
// installed in that project by links to them from the harness's skill folders.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { SKILL_FOLDERS } from "#babavoss/core/skill-folders.ts"
import { discoverApps } from "../playground/apps.ts"
import type { Brief, BuildPorts, Entry } from "./surface.ts"

export const BRIEF_FILE = "brief.json"
/** Where a project's own apps live. */
export const APPS_DIR = "skills"
/** The skill folders the harnesses read in a project: each holds a link to an app made here, which installs it there. */
export const HARNESS_SKILLS = SKILL_FOLDERS.filter((folder) => folder.linked).map((folder) => folder.project)
/** The names the template stands in for the app's own. */
const PLACEHOLDERS = ["NAME", "my-app"]
/** The template's files that carry a placeholder. */
const NAMED = ["SKILL.md", "README.md", "CHANGELOG.md", "package.json", "src/app.ts", "ui/index.html"]
const carried = fileURLToPath(new URL("../../../", import.meta.url))

/** Whether anything stands at the path, a link that leads nowhere included. */
const stands = (path: string) => {
  try {
    lstatSync(path)

    return true
  } catch {
    return false
  }
}
const write = (file: string, brief: Brief) => {
  const temporary = `${file}.tmp`

  writeFileSync(temporary, `${JSON.stringify(brief, null, 2)}\n`)
  renameSync(temporary, file)
}

export function buildPorts(
  project: string,
  source: { template: string; framework: string } = { template: join(carried, "assets/template"), framework: join(carried, "framework") }
): BuildPorts {
  // One write at a time for a file, in the order asked, so a later brief is never overwritten by an earlier one.
  const writes = new Map<string, Promise<void>>()

  return {
    project,
    async load() {
      return discoverApps(project).flatMap((app): Entry[] => {
        const file = join(app.path, BRIEF_FILE)

        if (!existsSync(file)) return []

        return [{ ...(JSON.parse(readFileSync(file, "utf8")) as Brief), dir: app.dir }]
      })
    },
    save(dir, brief) {
      const file = join(project, dir, BRIEF_FILE)
      const next = (writes.get(file) ?? Promise.resolve()).catch(() => {}).then(() => write(file, brief))

      writes.set(file, next)

      return next
    },
    async create(brief) {
      const dir = join(project, APPS_DIR, brief.name)
      const links = HARNESS_SKILLS.map((folder) => join(project, folder, brief.name))
      const taken = [dir, ...links].find(stands)

      if (taken) throw new Error(`${relative(project, taken)} exists already: name the app otherwise, or remove what is there`)
      mkdirSync(dir, { recursive: true })
      try {
        cpSync(source.template, dir, { recursive: true })
        cpSync(source.framework, join(dir, "framework"), { recursive: true })
        for (const name of NAMED) {
          const file = join(dir, name)

          if (existsSync(file)) writeFileSync(file, PLACEHOLDERS.reduce((text, word) => text.replaceAll(word, brief.name), readFileSync(file, "utf8")))
        }
        write(join(dir, BRIEF_FILE), brief)
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
