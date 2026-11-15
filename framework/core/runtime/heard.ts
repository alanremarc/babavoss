// What was heard and not yet told to the agent: the notices others gave, the places the person acted in, and the tabs
// they opened or closed. It is kept on disk beside the present as told, so a runtime that starts again, after it slept or
// gave way to changed code, still tells each line once. Only the newest FOLD notices are kept as lines: an older one is
// counted, and the count is told as one line that says where the notices are read whole.
import { join } from "node:path"
import { readJsonFile, writeJsonFile } from "../state/json-file.ts"

/** How many notices are told as lines at once; older ones are told as a count. */
export const FOLD = 20
/** Where the notices are read whole: the shell's log of them. */
export const NOTICES_AT = "/activity/notices"

/** A line heard, in the order heard; `notice` where a surface said it, absent where it says where the person acted. */
type Line = { line: string; notice?: true }
/** `folded`: the notices older than the lines, counted; `acted`: the places the person acted in, each heard once. */
type Kept = { lines: Line[]; folded: number; acted: string[] }

const empty = (): Kept => ({ lines: [], folded: 0, acted: [] })
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

/** What was kept, or nothing where there is none or it does not read as what was heard. */
const restored = (file: string): Kept => {
  try {
    const kept = readJsonFile<Partial<Kept>>(file)

    if (!kept || !Array.isArray(kept.lines)) return empty()

    const lines = kept.lines.filter((l): l is Line => !!l && typeof l.line === "string").map((l) => (l.notice ? { line: l.line, notice: true as const } : { line: l.line }))

    return { lines, folded: typeof kept.folded === "number" && kept.folded > 0 ? kept.folded : 0, acted: strings(kept.acted) }
  } catch {
    return empty()
  }
}

/** The session's record of what was heard and not yet told, under its state directory `dir`. */
export function heardRecord(dir: string) {
  const file = join(dir, "presented", "heard.json")
  let kept = restored(file)
  const save = () => writeJsonFile(file, kept)

  return {
    /** A notice heard: kept as a line, and the oldest counted once more than FOLD wait. */
    notice(line: string) {
      kept.lines.push({ line, notice: true })

      const notices = kept.lines.filter((l) => l.notice).length

      if (notices > FOLD) {
        kept.lines.splice(kept.lines.findIndex((l) => l.notice), 1)
        kept.folded += 1
      }
      save()
    },
    /** The person acted in `place`: heard once, as a line where `said`, else only marked, as where their notice told it. */
    acted(place: string, said: boolean) {
      if (kept.acted.includes(place)) return
      kept.acted.push(place)
      if (said) kept.lines.push({ line: `the person acted on ${place}` })
      save()
    },
    /** A line of what the person did that is not a notice, as a tab opened or closed: heard once, as said. */
    line(line: string) {
      if (kept.lines.some((l) => l.line === line)) return
      kept.lines.push({ line })
      save()
    },
    /** How many lines wait to be told. */
    size: () => kept.lines.length + (kept.folded ? 1 : 0),
    /** What waits, in the order heard, the count of older notices first; and then it is told, and forgotten. */
    take(): string[] {
      const { lines, folded } = kept
      const out = [...(folded ? [`${folded} earlier notice${folded === 1 ? "" : "s"}; read ${NOTICES_AT}`] : []), ...lines.map((l) => l.line)]

      if (out.length || kept.acted.length) {
        kept = empty()
        save()
      }

      return out
    },
  }
}
