// The agent's text answers and session memory, with who changed what since it was last answered; JSON clients keep their own presentation.
import { join } from "node:path"
import { readJsonFile, writeJsonFile } from "../state/json-file.ts"
import { diff, entries, tell, whole, type Change } from "../present/present.ts"
import { handles, type Args, type Json } from "../surface/view.ts"
import type { Running } from "../surface/run.ts"
import { isPerson } from "../session.ts"

/** Convert text at the boundary, leaving admission and fixed-argument matching to the surface. */
export function textArgs(view: Json | undefined, name: string, input: unknown): Args {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("args must be a JSON object")

  const offered = handles(view).filter((h) => h.name === name)
  const args: Args = {}

  for (const [key, value] of Object.entries(input)) {
    const types = offered.map((h) => h.open[key] ?? (Object.hasOwn(h.args, key) ? typeof h.args[key] : undefined)).filter(Boolean)
    const type = types[0] ?? "string"

    if (typeof value !== "string") throw new Error(`${key} must be text for ${type}`)
    if (type === "number") {
      if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${key} must be a number`)
      args[key] = Number(value)
    } else if (type === "boolean") {
      if (value !== "true" && value !== "false") throw new Error(`${key} must be a boolean`)
      args[key] = value === "true"
    } else args[key] = value
  }
  if (offered.length === 1) return { ...offered[0]!.args, ...args }

  return args
}

/** Who made a change, in the words the agent is told: the person, this session's agent, the surface by itself, another actor. */
const BY: Record<string, string> = { person: "the person", you: "you", surface: "the surface" }

/** A view as the agent reads it at `path`: the present whole at /, any other path whole relative to it; handles as commands. */
export const textView = (view: Json | undefined, path: string, command: string): string[] => whole(view, { command, path })

/**
 * The agent's text session: what it was last told, and since then who changed each fact of /. A change is the person's when
 * their call made it, the agent's when its own did, through the word or a program, and the surface's when a command's event
 * did. What only the agent's own calls changed is not told again: their answers told it.
 */
export function textSession<M>(running: Running<M>, dir: string, actor: string, command: string) {
  const file = join(dir, "presented", "text.json")
  let before = readJsonFile<Json>(file)
  const root = () => running.read("/", actor)
  const flat = () => {
    try {
      return entries(root())
    } catch {
      return new Map<string, string>()
    }
  }
  let marks = flat()
  let version = running.version()
  // Who changed each fact since the session was last told, by the facts' keys by identity, so a row moved keeps its own.
  const by = new Map<string, Set<string>>()

  running.subscribe(() => {
    if (running.version() === version) return
    version = running.version()

    const now = flat()
    const cause = running.cause()
    const who = !cause ? undefined : !cause.call ? "surface" : cause.actor === actor ? "you" : isPerson(cause.actor) ? "person" : cause.actor

    for (const key of new Set([...now.keys(), ...marks.keys()]))
      if (now.get(key) === marks.get(key)) continue
      // A commit of no known cause, as when code is loaded again: what it changed is told without a name.
      else if (!who) by.delete(key)
      else by.set(key, (by.get(key) ?? new Set()).add(who))
    marks = now
  })

  // Who made a change: everyone who changed a fact it covers. Unnamed where the change came before this runtime, or from code loaded again.
  const whose = (change: Change) => {
    const names = new Set<string>()
    let known = true

    for (const key of change.keys) {
      let found = false

      for (const [k, who] of by)
        if (k === key || k.startsWith(`${key}.`) || k.startsWith(`${key}[`) || k.startsWith(`${key}#`)) {
          found = true
          for (const w of who) names.add(w)
        }
      if (!found) known = false
    }

    return known ? names : names.size ? new Set([...names, "unknown"]) : undefined
  }
  const others = (change: Change) => [...(whose(change) ?? ["unknown"])].some((w) => w !== "you")
  const head = (change: Change) => {
    const who = whose(change)
    const order = ["person", "surface", ...[...(who ?? [])].filter((w) => !BY[w] && w !== "unknown").sort(), "you"]
    const names = who ? order.filter((w) => who.has(w)).map((w) => BY[w] ?? w) : []

    return names.length ? `changed by ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}:` : "changed:"
  }
  // What changed of / since the session was last told, that not only the agent's own calls changed; the whole root where it was never told.
  // Groups the agent is told before these changes, as who is needed, go before them here.
  const since = (now: Json | undefined): Change[] =>
    before === undefined ? whole(now, { command }).map((line) => ({ line, keys: [], where: "/" })) : diff(before, now, { command }).filter(others)
  const told = (now: Json | undefined) => {
    if (now !== undefined) writeJsonFile(file, now)
    before = now
    by.clear()
  }

  return {
    root,
    /** What a call changed at `path`, as its answer says it. */
    diff: (old: Json | undefined, now: Json | undefined, path: string) => tell(diff(old, now, { command, path })),
    changed: () => since(root()),
    /** The session was given / whole, as a program's read of it: what changes is counted from here. */
    seen: () => told(root()),
    /**
     * An answer: its own lines, then what else changed at / since the session was last told. `whole`, the answer is / itself
     * and nothing follows it. `read` is the path the answer showed whole: what changed under it is in the answer already.
     */
    answer(lines: string[], whole = false, read?: string) {
      const now = root()
      const fresh = before === undefined
      const extra = whole
        ? []
        : since(now).filter(
            (change) =>
              !lines.includes(change.line) && !(read !== undefined && read !== "/" && (change.where === read || change.where.startsWith(`${read}/`)))
          )
      const said = [...lines, ...(fresh && extra.length ? ["changed:", ...extra.map((c) => c.line)] : tell(extra, head))].join("\n")

      told(now)

      return said
    },
  }
}
