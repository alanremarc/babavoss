// What an app keeps for the playground: scenarios/<name>.ts, each a module whose default export is a Scenario;
// scenarios/setups.yaml naming which agent a run is; assets/presets/<name>/, what a workspace's files are made from, described by
// assets/presets/<name>.md beside it. Setups parse purely; the scan imports each scenario afresh.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { parse as parseYaml } from "yaml"
import type { AgentHarness, Scenario } from "babavoss/core/index.ts"

export type Setup = {
  name: string
  harness: AgentHarness
  model?: string
  effort?: string
  /** The harness's shell sandbox, on by default. */
  sandbox: boolean
}
/** A preset as scanned: its description, the first paragraph of assets/presets/<name>.md, and what its directory holds. */
export type Preset = { name: string; description?: string; files: number; bytes: number; updated?: string }
/** A scenario as scanned: what its module says of itself, where it is, and its text. */
export type ScenarioFile = { name: string; description?: string; setup?: string; preset?: string; file: string; source: string }
/** What could not be read, by the file it is in, relative to the app. */
export type Problem = { file: string; message: string }
/** `skills`: the app's skills by name, with what triggers each: what the person may call by name in a session. */
export type Scan = {
  dir: string | null
  setups: Setup[]
  presets: Preset[]
  scenarios: ScenarioFile[]
  problems: Problem[]
  skills?: { name: string; description: string }[]
}

export const SCENARIOS_DIR = "scenarios"
export const SETUPS_FILE = "setups.yaml"
export const PRESETS_DIR = "assets/presets"
/** The built-in preset, always there and the default: a workspace with nothing in it. */
export const EMPTY = "empty"
export const emptyPreset = (): Preset => ({ name: EMPTY, description: "Nothing: an empty directory", files: 0, bytes: 0 })

/**
 * The setups a yaml text names; each a map from name to its fields. A field a setup no longer holds, `home`, since the
 * agent's home is always its workspace's, is a problem, not a failure.
 */
export function parseSetups(text: string, problems: Problem[] = []): Setup[] {
  const doc = (parseYaml(text) ?? {}) as Record<string, Record<string, unknown>>

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error(`${SETUPS_FILE} maps names to setups`)

  return Object.entries(doc).map(([name, s]) => {
    if (!s || typeof s !== "object") throw new Error(`setup ${name}: needs a harness`)
    if (s.harness !== "claude-code" && s.harness !== "codex") throw new Error(`setup ${name}: harness is claude-code or codex`)
    if ("home" in s)
      problems.push({
        file: `${SCENARIOS_DIR}/${SETUPS_FILE}`,
        message: `setup ${name}: home is no longer a setup's; the agent's home is always its workspace's home/, so remove it`,
      })

    return {
      name,
      harness: s.harness,
      ...(typeof s.model === "string" && { model: s.model }),
      ...(typeof s.effort === "string" && { effort: s.effort }),
      sandbox: s.sandbox !== false,
    }
  })
}

/** One setup per harness, when the app names none. */
export const defaultSetups = (): Setup[] => [
  { name: "claude-code", harness: "claude-code", sandbox: true },
  { name: "codex", harness: "codex", sandbox: true },
]

/**
 * A scenario module, imported afresh: the file may have just been edited. Bun keeps a module by its path whatever query the
 * import adds, and by its real path, so the module is taken out of its cache by that path first. Throws on a shape it cannot run.
 */
export async function loadScenario(file: string): Promise<Scenario> {
  const path = realpathSync(resolve(file))

  delete require.cache[path]

  const module = (await import(path)) as { default?: Partial<Scenario> }
  const s = module.default

  if (!s || typeof s !== "object" || typeof s.run !== "function") throw new Error("the default export is a Scenario, with run(user)")

  for (const key of ["description", "setup", "preset"] as const) if (s[key] !== undefined && typeof s[key] !== "string") throw new Error(`${key} is a string`)

  return s as Scenario
}

/** The first paragraph of a Markdown text that is not a heading, on one line. */
export const firstParagraph = (text: string): string | undefined =>
  text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#"))
    ?.replaceAll(/\s+/g, " ")

/** Files, bytes and the latest change under a directory; links are counted as files, never followed. */
export function measure(dir: string): { files: number; bytes: number; updated: number } {
  const at = lstatSync(dir)
  let files = 0
  let bytes = 0
  let updated = at.mtimeMs

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      const inner = measure(path)

      files += inner.files
      bytes += inner.bytes
      updated = Math.max(updated, inner.updated)
    } else {
      const stat = lstatSync(path)

      files += 1
      bytes += stat.size
      updated = Math.max(updated, stat.mtimeMs)
    }
  }

  return { files, bytes, updated }
}

/** The presets under an app, the built-in one first; a description with no directory, or one named as the built-in, is a problem. */
export function scanPresets(appDir: string): { presets: Preset[]; problems: Problem[] } {
  const dir = join(appDir, PRESETS_DIR)
  const presets = [emptyPreset()]
  const problems: Problem[] = []

  if (!existsSync(dir)) return { presets, problems }

  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const dirs = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))

  for (const entry of entries) {
    const file = `${PRESETS_DIR}/${entry.name}`

    try {
      if (entry.isDirectory()) {
        if (entry.name === EMPTY) {
          problems.push({ file, message: `${EMPTY} is the built-in preset; name this one otherwise` })
          continue
        }

        const md = join(dir, `${entry.name}.md`)
        const description = existsSync(md) ? firstParagraph(readFileSync(md, "utf8")) : undefined
        const { files, bytes, updated } = measure(join(dir, entry.name))

        presets.push({ name: entry.name, ...(description && { description }), files, bytes, updated: new Date(updated).toISOString() })
      } else if (entry.name.endsWith(".md") && !dirs.has(basename(entry.name, ".md")))
        problems.push({ file, message: `describes no preset: there is no ${PRESETS_DIR}/${basename(entry.name, ".md")}/ beside it` })
    } catch (error) {
      problems.push({ file, message: error instanceof Error ? error.message : String(error) })
    }
  }

  return { presets, problems }
}

/** What the app keeps for the playground now; a file that cannot be loaded becomes a problem, not a scenario. */
export async function scanScenarios(appDir: string): Promise<Scan> {
  const dir = join(appDir, SCENARIOS_DIR)
  const { presets, problems } = scanPresets(appDir)
  const scan: Scan = { dir: null, setups: defaultSetups(), presets, scenarios: [], problems: [] }

  if (existsSync(dir)) {
    scan.dir = dir
    for (const entry of readdirSync(dir).sort()) {
      const file = join(dir, entry)

      try {
        if (entry === SETUPS_FILE) scan.setups = parseSetups(readFileSync(file, "utf8"), scan.problems)
        else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
          const source = readFileSync(file, "utf8")
          const s = await loadScenario(file)

          scan.scenarios.push({
            name: basename(entry, ".ts"),
            ...(s.description && { description: s.description }),
            ...(s.setup && { setup: s.setup }),
            ...(s.preset && { preset: s.preset }),
            file,
            source,
          })
        }
      } catch (error) {
        scan.problems.push({ file: `${SCENARIOS_DIR}/${entry}`, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  for (const s of scan.scenarios) {
    const file = `${SCENARIOS_DIR}/${s.name}.ts`

    if (s.setup && !scan.setups.some((x) => x.name === s.setup))
      scan.problems.push({ file, message: `setup ${s.setup} is not one of ${scan.setups.map((x) => x.name).join(", ")}` })
    if (s.preset && !scan.presets.some((x) => x.name === s.preset))
      scan.problems.push({ file, message: `preset ${s.preset} is not one of ${scan.presets.map((x) => x.name).join(", ")}` })
  }
  scan.problems.push(...problems)

  return scan
}
