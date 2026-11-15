// Discover apps by their root skill and their door, reading metadata without importing their code. A skill with no door
// is a skill of some other kind, and no app.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { frontmatter } from "../promptware/promptware.ts"

/** An app by name: `id` is url-safe, from `dir`, its directory relative to the project ("." for the project itself). */
export type AppRef = { id: string; name: string; version?: string; dir: string }
/** An app as found: where it is. */
export type FoundApp = AppRef & { path: string; description?: string }

/** Dependencies, installed apps, state and templates are outside discovery. */
const SKIPPED = new Set(["node_modules", "framework", ".git", ".babavoss", ".claude", ".codex", ".agents", ".local", ".state", "template"])
const skipped = (name: string) => SKIPPED.has(name)
const isApp = (dir: string) => existsSync(join(dir, "SKILL.md")) && existsSync(join(dir, "scripts", "open.ts"))

const slug = (text: string) => text.replaceAll(/[^A-Za-z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "app"

/** Every app under the project, in path order; not descended into once found, links never followed. */
export function discoverApps(project: string): FoundApp[] {
  const found: FoundApp[] = []
  const ids = new Set<string>()
  const visit = (dir: string) => {
    if (isApp(dir)) {
      const { fields } = frontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"))
      let version: unknown

      try {
        version = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version?: unknown }).version
      } catch {
        /* An app may have no package metadata. */
      }

      const rel = relative(project, dir) || "."
      const name = typeof fields.name === "string" && fields.name ? fields.name : basename(dir)
      let id = slug(rel === "." ? name : rel)

      for (let n = 2; ids.has(id); n++) id = `${slug(rel === "." ? name : rel)}-${n}`
      ids.add(id)
      found.push({
        id,
        name,
        ...(typeof version === "string" && { version: version }),
        dir: rel,
        path: dir,
        ...(fields.description && { description: fields.description }),
      })

      return
    }

    let entries

    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) if (entry.isDirectory() && !skipped(entry.name)) visit(join(dir, entry.name))
  }

  visit(project)

  return found
}
