// The agent's text answers and session memory: what was heard since it was last told, told once with every answer, and the
// present as it was last told, with who changed what since, told at a boundary; JSON clients keep their own presentation.
import { join } from "node:path"
import { readJsonFile, writeJsonFile } from "../state/json-file.ts"
import { diff, entries, placeOf, rebase, tell, whole, type Change } from "../present/present.ts"
import { handles, type Args, type Json } from "../surface/view.ts"
import type { Cause, Noticed, Running } from "../surface/run.ts"
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

/** Who a commit's cause is, for the agent `actor`: the surface where a command's event made it, else the caller, `you` where it is the agent. */
export const whoOf = (cause: Cause | undefined, actor: string): string | undefined =>
  !cause ? undefined : !cause.call ? "surface" : cause.actor === actor ? "you" : isPerson(cause.actor) ? "person" : cause.actor

/** A notice in one line: who says it and where, what happened, and by whom. */
export const noticeLine = (notice: Noticed, who: string) => {
  const where = [notice.from, notice.at].filter(Boolean).join(" ")

  return `${where && `${where}: `}${notice.text} (by ${BY[who] ?? who})`
}

/** A view as the agent reads it at `path`: the present whole at /, any other path whole relative to it; handles as commands. */
export const textView = (view: Json | undefined, path: string, command: string): string[] => whole(view, { command, path })

/**
 * The agent's text session, two records kept apart. What was heard and not yet told: the notices, and that the person acted
 * in a place, once however often, and not where a notice of theirs already told it; told with every text answer, once. And the present as
 * the session was last told it, with who changed each fact of / since: told whole at a read of /, and as what changed at a
 * boundary, the person's message or a wait; a call's answer and a read of any other path leave it, so what the person and
 * the surfaces change while the agent works waits for the next boundary. A change is the person's when their call made it,
 * the agent's when its own did, through the word or a program, and the surface's when a command's event did; what only the
 * agent's own calls changed or gave is never told back, their answers told it. What was heard is held in memory alone.
 */
export function textSession<M>(running: Running<M>, dir: string, actor: string, command: string) {
  const file = join(dir, "presented", "text.json")
  let before = readJsonFile<Json>(file)
  const root = () => running.read("/", actor)
  const read = () => {
    try {
      return root()
    } catch {
      return undefined
    }
  }
  let last = read()
  let marks = entries(last)
  let version = running.version()
  // Who changed each fact since the session was last told the present, by the facts' keys by identity, so a row moved keeps its own.
  const by = new Map<string, Set<string>>()
  let heard: string[] = []
  // The places the person acted in since what was heard was told: each is heard once, and not where their notice was.
  const acted = new Set<string>()
  const place = (path: string) => {
    try {
      return placeOf(root(), path)
    } catch {
      return path
    }
  }

  running.notices((notice) => {
    const who = whoOf(notice.cause, actor)!

    if (who === "person" && notice.cause.path !== undefined) acted.add(place(notice.cause.path))
    if (who !== "you") heard.push(noticeLine(notice, who))
  })

  running.subscribe(() => {
    if (running.version() === version) return
    version = running.version()

    const cause = running.cause()
    const view = read()
    const now = entries(view)
    const who = whoOf(cause, actor)

    for (const key of new Set([...now.keys(), ...marks.keys()]))
      if (now.get(key) === marks.get(key)) continue
      // A commit of no known cause, as when code is loaded again, and the agent's own, which its answer told: no one's to tell.
      else if (!who || who === "you") by.delete(key)
      else by.set(key, (by.get(key) ?? new Set()).add(who))
    // What the agent's own call changed, it knows: the present as told takes it, so only what others change stays to be told.
    if (who === "you" && before !== undefined) {
      before = rebase(before, last, view)
      if (before !== undefined) writeJsonFile(file, before)
    }
    marks = now
    last = view
    // The person's call that gave no notice is still heard, as where they acted: the agent reads there if it matters.
    const where = who === "person" && cause?.path !== undefined ? place(cause.path) : undefined

    if (where !== undefined && !acted.has(where)) {
      acted.add(where)
      heard.push(`the person acted on ${where}`)
    }
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
  // What changed of / since the session was last told it, that not only the agent's own calls changed; the whole root where it was never told.
  const since = (now: Json | undefined): Change[] =>
    before === undefined ? whole(now, { command }).map((line) => ({ line, keys: [], where: "/" })) : diff(before, now, { command }).filter(others)
  // The present told: what changes is counted from `now`.
  const seen = (now: Json | undefined) => {
    if (now !== undefined) writeJsonFile(file, now)
    before = now
    by.clear()
  }
  // What was heard, under `notices:`, and forgotten.
  const notices = () => {
    const out = heard.length ? ["notices:", ...heard] : []

    heard = []
    acted.clear()

    return out
  }

  return {
    root,
    /** What a call changed at `path`, as its answer says it. */
    diff: (old: Json | undefined, now: Json | undefined, path: string) => tell(diff(old, now, { command, path })),
    /** How much was heard and waits to be told. */
    noticed: () => heard.length,
    /** What changed at / since the session was last told it, by others than the agent alone. */
    changed: () => since(root()),
    /** The session was given / whole, as a program's read of it: what changes is counted from here. */
    seen: () => seen(root()),
    /** An answer to a call or a read: its own lines, then what was heard since. The present is left for a boundary. */
    answer: (lines: string[]) => [...lines, ...notices()].join("\n"),
    /** What was heard since, alone, as after a tool call. */
    heard: () => notices().join("\n"),
    /**
     * A boundary: what was heard, then what changed at / since the session was last told it, by who; or, `whole`, the lines
     * are / itself, before what was heard. The present is told from here.
     */
    tell(lines: string[] = [], whole = false) {
      const now = root()
      const fresh = before === undefined
      const changes = whole ? [] : since(now)
      const said = whole
        ? [...lines, ...notices()]
        : [...notices(), ...(fresh && changes.length ? ["changed:", ...changes.map((c) => c.line)] : tell(changes, head))]

      seen(now)

      return said.join("\n")
    },
  }
}
