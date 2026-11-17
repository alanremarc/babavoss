// The agent's text answers and session memory: what was heard since it was last told, told once with every answer, and the
// present as it was last told, with who changed what since, told at a boundary; JSON clients keep their own presentation.
import { join } from "node:path"
import { readJsonFile, writeJsonFile } from "../state/json-file.ts"
import { diff, entries, placeOf, rebase, tabAt, tabsIn, tell, whole, type Change } from "../present/present.ts"
import { handles, type Args, type Json } from "../surface/view.ts"
import type { Cause, Noticed, Running } from "../surface/run.ts"
import { isPerson } from "../session.ts"
import { heardRecord } from "./heard.ts"

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

/** A notice in one line: a highlight so marked, who says it and where, what happened, and by whom. */
export const noticeLine = (notice: Noticed, who: string) => {
  // A place at its surface's name says the surface already.
  const named = !!notice.from && !!notice.at && (notice.at === `/${notice.from}` || notice.at.startsWith(`/${notice.from}/`))
  const where = [!named && notice.from, notice.at].filter(Boolean).join(" ")

  return `${notice.highlight ? "highlight " : ""}${where && `${where}: `}${notice.text} (by ${BY[who] ?? who})`
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
 * agent's own calls changed or gave is never told back, their answers told it. What was heard is kept on disk until it is
 * told (heard.ts), so a runtime that starts again tells it, once; who changed what is kept beside it, for the same reason.
 *
 * What is told is cut to what the agent needs. A quiet commit, the page's own bookkeeping, is told in no way; nor is a
 * change of no one's, as code loaded again or a state restored makes. A notice stands for the changes of the commit that
 * gave it: they are not told again, unless a later commit with none changed them since. And a tab the agent is not working
 * in, one it neither read nor called in this turn or the one before, is told in one line, who changed it and to read it;
 * its notices are still told, a highlight first.
 */
export function textSession<M>(running: Running<M>, dir: string, actor: string, command: string) {
  const file = join(dir, "presented", "text.json")
  const byFile = join(dir, "presented", "by.json")
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
  const kept = readJsonFile<{ by?: Record<string, string[]>; plain?: string[] }>(byFile)
  // Who changed each fact since the session was last told the present, by the facts' keys by identity, so a row moved keeps
  // its own; and which of them a commit changed that gave no notice, so no notice stands for them.
  const by = new Map<string, Set<string>>(Object.entries(kept?.by ?? {}).map(([k, w]) => [k, new Set(w)]))
  const plain = new Set<string>(kept?.plain ?? [])
  const keep = () => writeJsonFile(byFile, { by: Object.fromEntries([...by].map(([k, w]) => [k, [...w]])), plain: [...plain] }, { own: true })
  // What was heard since it was last told; the places the person acted in, each heard once, and not where their notice was.
  const heard = heardRecord(dir)
  const place = (path: string) => {
    try {
      return placeOf(root(), path)
    } catch {
      return path
    }
  }
  /** The person's calls that changed / since the present was last told: what waits for the agent's next boundary. */
  let acts = 0
  /** Whether the commit about to be told of gave a notice: they are heard before its subscribers are told. */
  let noticed = false
  // The tabs the agent read or called in this turn, and in the one before: what it is working in.
  let touched = new Set<string>()
  let previous = new Set<string>()
  const touch = (path: string) => {
    const at = tabAt(last, path)

    if (at) touched.add(at)
  }

  running.notices((notice) => {
    const who = whoOf(notice.cause, actor)!

    noticed = true
    if (who === "person" && notice.cause.path !== undefined && !notice.cause.quiet) heard.acted(place(notice.cause.path), false)
    if (who !== "you") heard.notice(noticeLine(notice, who), notice.highlight === true)
  })

  running.subscribe(() => {
    if (running.version() === version) return
    version = running.version()

    const cause = running.cause()
    const view = read()
    const now = entries(view)
    // A quiet commit, the page's own, is no one's to tell, as one of no known cause is, as when code is loaded again.
    const who = cause?.quiet ? undefined : whoOf(cause, actor)
    const explained = noticed
    const changed = [...new Set([...now.keys(), ...marks.keys()])].filter((key) => now.get(key) !== marks.get(key))

    noticed = false
    for (const key of changed)
      if (who === "you") {
        by.delete(key)
        plain.delete(key)
      } else if (who) {
        by.set(key, (by.get(key) ?? new Set()).add(who))
        // A notice stands for the value its commit left; a later commit with none takes that back.
        if (explained) plain.delete(key)
        else plain.add(key)
      }
    if (who && changed.length) keep()
    // A call of the person's that changed / waits for the agent's next boundary.
    if (who === "person" && changed.length) acts += 1
    // What the agent's own call changed, it knows: the present as told takes it, so only what others change stays to be told.
    if (who === "you" && before !== undefined) {
      before = rebase(before, last, view)
      if (before !== undefined) writeJsonFile(file, before, { own: true })
    }
    // A tab the agent opened is one it works in.
    if (who === "you") for (const t of tabsIn(view)) if (!tabsIn(last).some((x) => same(x, t))) touched.add(t.at)
    // The person's call that gave no notice is still heard: in a tab, as where they acted, which the agent reads if it
    // matters; outside every tab, as the tabs they opened or closed.
    if (who === "person" && cause?.path !== undefined) {
      const tab = tabAt(view, cause.path) ?? tabAt(last, cause.path)

      if (tab || !tabsIn(view).length) heard.acted(place(cause.path), true)
      else {
        for (const t of tabsIn(view)) if (!tabsIn(last).some((x) => same(x, t))) heard.line(`the person opened ${placeOf(view, t.at)}`)
        for (const t of tabsIn(last)) if (!tabsIn(view).some((x) => same(x, t))) heard.line(`the person closed ${placeOf(last, t.at)}`)
      }
    }
    marks = now
    last = view
  })

  /** The keys of `by` a change covers: its own, and every one below them. */
  const under = (change: Change) =>
    [...by.keys()].filter((k) => change.keys.some((key) => k === key || k.startsWith(`${key}.`) || k.startsWith(`${key}[`) || k.startsWith(`${key}#`)))
  // Who made a change: everyone who changed a fact it covers. Unnamed where no one did, as when code is loaded again.
  const whose = (change: Change) => {
    const names = new Set(under(change).flatMap((k) => [...by.get(k)!]))

    return names.size ? names : undefined
  }
  const names = (who: Set<string>) => {
    const order = ["person", "surface", ...[...who].filter((w) => !BY[w]).sort(), "you"]
    const said = order.filter((w) => who.has(w)).map((w) => BY[w] ?? w)

    return said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said.at(-1)}` : said[0]!
  }
  /** Told: a change someone but the agent alone made, which no notice already stands for. */
  const told = (change: Change) => {
    const who = whose(change)

    return !!who && [...who].some((w) => w !== "you") && under(change).some((k) => plain.has(k))
  }
  const head = (change: Change) => `changed by ${names(whose(change)!)}:`
  // What changed of / since the session was last told it, that is to be told; the whole root where it was never told.
  const since = (now: Json | undefined): Change[] =>
    before === undefined ? whole(now, { command }).map((line) => ({ line, keys: [], where: "/" })) : diff(before, now, { command }).filter(told)
  /** The tabs the agent works in: those it read or called in this turn or the one before. */
  const working = () => new Set([...touched, ...previous])
  // The present told: what changes is counted from `now`.
  const seen = (now: Json | undefined) => {
    if (now !== undefined) writeJsonFile(file, now, { own: true })
    before = now
    by.clear()
    plain.clear()
    keep()
    acts = 0
  }
  // What was heard, under `notices:`, and forgotten.
  const notices = () => {
    const out = heard.take()

    return out.length ? ["notices:", ...out] : []
  }
  /** Changes as a boundary tells them: in full where the agent works, and a tab it does not work in as one line, who changed it. */
  const weighed = (changes: Change[], now: Json | undefined): string[] => {
    const at = working()
    const tabs = new Map(tabsIn(now).map((t) => [t.heading, t.at]))
    const full: Change[] = []
    const aside = new Map<string, Set<string>>()

    for (const change of changes) {
      const tab = change.tab === undefined ? undefined : tabs.get(change.tab)

      if (tab === undefined || at.has(tab)) full.push(change)
      else aside.set(change.tab!, new Set([...(aside.get(change.tab!) ?? []), ...whose(change)!]))
    }

    return [...tell(full, head), ...[...aside].map(([heading, who]) => `${heading}: changed by ${names(who)}; read it`)]
  }

  return {
    root,
    /** What a call changed at `path`, as its answer says it. */
    diff: (old: Json | undefined, now: Json | undefined, path: string) => tell(diff(old, now, { command, path })),
    /** How much was heard and waits to be told. */
    noticed: () => heard.size(),
    /** How many of the person's calls changed / since the present was last told: what waits for the agent's next boundary. */
    waiting: () => acts,
    /** What changed at / since the session was last told it, to be told. */
    changed: () => since(root()),
    /** The session was given / whole, as a program's read of it: what changes is counted from here. */
    seen: () => seen(root()),
    /** The agent read or called at `path`: the tab it is in is one it works in. */
    touch,
    /** A new turn began: what the agent worked in during the last one is still its work, and what it did before that is not. */
    turned() {
      previous = touched
      touched = new Set()
    },
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
        : [...notices(), ...(fresh && changes.length ? ["changed:", ...changes.map((c) => c.line)] : weighed(changes, now))]

      seen(now)

      return said.join("\n")
    },
  }
}

/** One tab in two versions of /: a tab is its path and its number, so one closed and another opened at its path are two. */
const same = (a: { at: string; n?: number }, b: { at: string; n?: number }) => a.at === b.at && a.n === b.n

