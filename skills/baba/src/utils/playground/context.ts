// What a session's context holds, call by call: how much each model call read, as the harness measured it, and what that
// was made of, estimated from the trace. The app's own part is its opened skill and what its cli answered. The harness's part is what the first call
// read beyond what came before it: its system prompt, tools and own reminders. What the estimate cannot place, thinking,
// the harness's later reminders and its slack, is the rest. A call that reads far less than the one before was compacted:
// what came before is counted no more, and its summary falls to the rest.
import type { Entry } from "./surface.ts"

/** The text an estimate is made from, in characters per token: about four for prose, fewer for code and JSON. */
export const CHARS_PER_TOKEN = 4

/** A call that reads less than this share of the one before it was compacted. */
const COMPACTED = 0.7

export type AppPart = "skills" | "calls"
export type Part = AppPart | "conversation" | "tools" | "harness" | "rest"
export type Parts = Record<Part, number>
/** One model call: when, what it read in all and of it from the cache where the harness said, and of what. */
export type Call = { n: number; at: number; tokens: number; cached?: number; parts: Parts; compacted?: true }
/** Something of the app's in context, by what it was: a skill or a cli answer. */
export type Contributor = { part: AppPart; title: string; times: number; tokens: number }
export type Context = {
  /** What the last call read, and the model's window, where the harness said. */
  tokens?: number
  window?: number
  /** The last call's parts; zero before the first call. */
  parts: Parts
  calls: Call[]
  /** What the app put in, largest first, since the last compaction. */
  contributors: Contributor[]
}
/** The app's skill name and directory. */
export type Known = { app: string; appDir: string }

export const estimate = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN)

const textOf = (value: unknown): string => (typeof value === "string" ? value : (JSON.stringify(value) ?? ""))
const empty = (): Parts => ({ skills: 0, calls: 0, conversation: 0, tools: 0, harness: 0, rest: 0 })

/** A step of the trace that is the app's: which of its parts, by what (a skill or its command), and its size. */
export type Mark = { part: AppPart; by: string; tokens: number }
/** A command to the app's cli, read back as what it asked of the surface: a view read, a handle called, a page shown. */
export type SurfaceCall = { verb: "open" | "read" | "call" | "wait" | "close" | "program"; path: string; handle?: string; input?: unknown; code?: string }
type SkillBody = Extract<Entry, { kind: "skill" }>
/** An entry of the trace with the app's part in it marked, and a cli command read back as its surface call. */
export type Marked = Entry & { mark?: Mark; surface?: SurfaceCall; skillBodies?: (Omit<SkillBody, "kind" | "at"> & { mark?: Mark })[] }

/** A command line's words, quotes taken off, up to where it pipes or chains into another. */
const words = (line: string): string[] => {
  const out: string[] = []
  let word = ""
  let quote: string | undefined
  let had = false

  for (const c of line) {
    if (quote) {
      if (c === quote) quote = undefined
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      had = true
    } else if (/\s/.test(c)) {
      if (word || had) out.push(word)
      word = ""
      had = false
    } else if ("|;&>".includes(c)) break
    else word += c
  }
  if (word || had) out.push(word)

  return out
}

/** What a call of the app's command asked of the surface, where it is one the command takes. */
export const surfaceOf = (command: string, cli: string): SurfaceCall | undefined => {
  const tokens = words(command)
  const args = tokens[0] === "bv" ? tokens.slice(1) : tokens[0] === "bun" && tokens[1] === cli.slice(4) ? tokens.slice(2) : undefined

  if (!args) return undefined

  const session = args.indexOf("--session")

  if (session !== -1) args.splice(session, 2)

  const [path, handle, ...values] = args

  if (!path) return { verb: "open", path: "/" }
  if (path === "wait" || path === "close") return { verb: path, path: "/" }
  if (path === "-e" && handle) return { verb: "program", path: "/", code: handle }
  if (!path.startsWith("/") || path.startsWith("//")) return undefined
  if (!handle) return { verb: "read", path }

  const input: Record<string, string> = {}

  for (const value of values) {
    const at = value.indexOf("=")

    if (at < 1) return undefined
    input[value.slice(0, at)] = value.slice(at + 1)
  }

  return { verb: "call", path, handle, input }
}

/** The app's opened skill and cli calls, read back as surface calls. */
export function marked(transcript: Entry[], app: string, appDir: string): Marked[] {
  const own = (skill: string) => skill === app
  const appPath = (path: unknown, file: string) =>
    typeof path === "string" && (path === `${appDir}/${file}` || [".claude", ".codex"].some((home) => path.endsWith(`/${home}/skills/${app}/${file}`)))
  const body = (a: { title: string; text: string }): Mark | undefined => (own(a.title) ? { part: "skills", by: a.title, tokens: estimate(a.text) } : undefined)

  return transcript.map((entry): Marked => {
    if (entry.kind === "skill") {
      const mark = body(entry)

      return { ...entry, ...(mark && { mark }) }
    }
    if (entry.kind !== "tool") return entry

    const input = entry.input as { command?: unknown; skill?: unknown; file_path?: unknown } | null
    const command = typeof entry.input === "string" ? entry.input : typeof input?.command === "string" ? input.command : ""
    const [bin, script, ...args] = words(command)
    const surface = bin === "bv" || (bin === "bun" && appPath(script, "scripts/open.ts")) ? surfaceOf(command, `bun ${script}`) : undefined
    const skill = entry.name === "Skill" && typeof input?.skill === "string" && own(input.skill)
    const skillRead =
      (entry.name === "Read" && appPath(input?.file_path, "SKILL.md")) ||
      (["cat", "head", "sed"].includes(bin ?? "") && [script, ...args].some((word) => appPath(word, "SKILL.md")))
    const mark: Mark | undefined = surface
      ? { part: "calls", by: "cli", tokens: estimate(entry.output ?? "") }
      : skillRead
        ? { part: "skills", by: app, tokens: estimate(entry.output ?? "") }
        : skill
          ? { part: "skills", by: app, tokens: 0 }
          : undefined
    const skillBodies = entry.skillBodies?.map((a) => {
      const mark = body(a)

      return { ...a, ...(mark && { mark }) }
    })

    return { ...entry, ...(mark && { mark }), ...(surface && { surface }), ...(skillBodies && { skillBodies }) }
  })
}

export function contextOf(transcript: Entry[], known: Known): Context {
  let counted = empty()
  let contributors = new Map<string, Contributor>()
  let harness: number | undefined
  let window: number | undefined
  const calls: Call[] = []

  const add = (part: Part, tokens: number, by?: string) => {
    counted[part] += tokens
    if (by === undefined || part === "conversation" || part === "tools" || part === "harness" || part === "rest") return

    const key = `${part} ${by}`
    const c = contributors.get(key) ?? { part, title: by, times: 0, tokens: 0 }

    contributors.set(key, { ...c, times: c.times + 1, tokens: c.tokens + tokens })
  }
  /** Skill text belongs to the app where marked, otherwise to other tools. */
  const skillBodies = (a: { text: string; mark?: Mark }) => {
    if (a.mark) add(a.mark.part, a.mark.tokens, a.mark.by)
    else add("tools", estimate(a.text))
  }

  for (const entry of marked(transcript, known.app, known.appDir)) {
    switch (entry.kind) {
      case "you":
      case "text":
        add("conversation", estimate(entry.text))
        break
      case "tool":
        if (entry.mark) add(entry.mark.part, entry.mark.tokens, entry.mark.by)
        else add("tools", estimate(textOf(entry.input)) + estimate(entry.output ?? ""))
        for (const a of entry.skillBodies ?? []) skillBodies(a)
        break
      case "skill":
        skillBodies(entry)
        break
      case "turn":
        window = entry.window ?? window
        break
      case "context": {
        window = entry.window ?? window

        const before = calls.at(-1)
        const compacted = before !== undefined && entry.tokens < before.tokens * COMPACTED

        // What came before a compaction is gone but for its summary, which the rest takes.
        if (compacted) {
          counted = empty()
          contributors = new Map()
        }
        // The first call reads the harness's own prompt and listings besides what the trace holds.
        harness ??= Math.max(0, entry.tokens - total(counted))

        const placed = { ...counted, harness }
        const sum = total(placed)
        // An estimate past what was measured is scaled down to it; what it falls short of is the rest.
        const scale = sum > entry.tokens && sum > 0 ? entry.tokens / sum : 1
        const parts = Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, Math.round(v * scale)])) as Parts

        parts.rest += Math.max(0, entry.tokens - total(parts))
        calls.push({
          n: calls.length + 1,
          at: entry.at,
          tokens: entry.tokens,
          ...(entry.cached !== undefined && { cached: entry.cached }),
          parts,
          ...(compacted && { compacted: true as const }),
        })
        break
      }
    }
  }

  const last = calls.at(-1)

  return {
    ...(last && { tokens: last.tokens }),
    ...(window && { window }),
    parts: last?.parts ?? empty(),
    calls,
    contributors: [...contributors.values()].filter((c) => c.tokens > 0).sort((a, b) => b.tokens - a.tokens),
  }
}

export const total = (parts: Parts): number => Object.values(parts).reduce((n, v) => n + v, 0)
export const appShare = (parts: Parts): number => parts.skills + parts.calls
