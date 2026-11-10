// Discover apps by their root skill, reading metadata without importing their code.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { frontmatter } from "../agent-config/promptware.ts"
import { PRESETS_DIR, SCENARIOS_DIR, EMPTY } from "./scenarios.ts"

/** An app as the playground names it: `id` is url-safe, from `dir`, its directory relative to the project ("." for the project itself). */
export type AppRef = { id: string; name: string; version?: string; dir: string }
/** An app as found: where it is, and its counts of scenarios and of its own presets, the built-in one aside. */
export type FoundApp = AppRef & { path: string; description?: string; scenarios: number; presets: number }

/** Dependencies, installed apps, state and templates are outside discovery. */
const SKIPPED = new Set(["node_modules", "framework", ".git", ".babavoss", ".claude", ".codex", ".agents", ".local", ".state", "template"])
const skipped = (name: string) => SKIPPED.has(name)
const isApp = (dir: string) => existsSync(join(dir, "SKILL.md"))

const count = (dir: string, keep: (entry: { name: string; isDirectory(): boolean }) => boolean) =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(keep).length : 0

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
        scenarios: count(join(dir, SCENARIOS_DIR), (e) => !e.isDirectory() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")),
        presets: count(join(dir, PRESETS_DIR), (e) => e.isDirectory() && e.name !== EMPTY),
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
