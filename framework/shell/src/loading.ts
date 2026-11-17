// The project's surfaces as the shell is made from them: each loaded on its own, so one whose code does not load, by a
// syntax error, an import that is not there or a throw as its module runs, leaves the others, and is named with why. Its
// code is still the runtime's to watch (scripts/open.ts), so the shell is made again when it is mended.
import type { AnySurface } from "../../core/surface/surface.ts"

/** A surface by name, as .root/surfaces.ts names it: loaded when asked. */
export type Loaders = Record<string, () => Promise<{ default: AnySurface }>>
/** The surfaces that loaded, by name, and why each other did not. */
export type Loaded = { surfaces: Record<string, AnySurface>; broken: Record<string, string> }

/** Where an error was raised: the file, line and column bun gives for code that does not build, else its first frame on disk. */
const where = (error: unknown): string | undefined => {
  const position = error && typeof error === "object" ? (error as { position?: { file?: string; line?: number; column?: number } | null }).position : undefined

  if (position?.file) return `${position.file}:${position.line ?? 0}:${position.column ?? 0}`

  return /\(?(\/[^\s()]+:\d+:\d+)\)?/.exec(error instanceof Error ? (error.stack ?? "") : "")?.[1]
}

/** Why a surface's code did not load, in one line: the error and where it is, a path under `from` relative to it. */
export const whyNot = (error: unknown, from?: string): string => {
  const said = error && typeof error === "object" && "message" in error ? String(error.message) : String(error)
  const text = said.split("\n")[0] ?? said
  const at = where(error)
  const line = at && !text.includes(at) ? `${text}, at ${at}` : text

  return from ? line.replaceAll(`${from}/`, "") : line
}

/** Each surface loaded on its own; one whose module exports no surface as its default is broken too. Paths are told from `from`. */
export async function loadSurfaces(loaders: Loaders, from?: string): Promise<Loaded> {
  const surfaces: Record<string, AnySurface> = {}
  const broken: Record<string, string> = {}

  for (const [name, load] of Object.entries(loaders)) {
    try {
      const s = (await load()).default

      if (s && typeof s.init === "function" && typeof s.view === "function") surfaces[name] = s
      else broken[name] = "src/surface.ts exports no surface as its default"
    } catch (error) {
      broken[name] = whyNot(error, from)
    }
  }

  return { surfaces, broken }
}
