// A drawer's thread, worked out without a page: a tab's entries, read from the shell's activity, as a thread reads them.
// An entry the surface said lines about is a notice, its words, with what was done under it, standing out where it is a
// highlight; one refused, a quiet line with why; one that said nothing, mechanical, a run of them in a row by one author,
// or one hearer of the world, folded into one line; or a tab entry, the shell's opening or closing of a tab. A tab's
// thread is what is in it and the shell's lines about it; home's is the shell's own, each naming its surface. That a tab
// is broken is pinned at the thread's foot with its one action, as is what of the person's waits for the agent on home's.
// Each time the session's hooks were found not heard is kept in home's thread as the page's own highlight, saying what to
// do. Pure: drawer.tsx draws it.
import type { Unheard } from "./client.ts"
import { named } from "./commands.ts"

export type Who = "person" | "agent" | "world"
/**
 * An entry as /activity gives it (activity.ts): `when` UTC to the second; `by` the world's hearer; `surface` absent where
 * `at` names it; `at` null in the shell's
 * line about a tab now closed; `own` the shell's line about a tab; `did` the call, or the event heard, `times` in a row;
 * `refused` why; `said` the surface's lines, `saidAt` their place; `highlight` where one of them is a highlight.
 */
export type Row = {
  n: number
  when: string
  who: Who
  by?: string
  surface?: string
  at: string | null
  own?: true
  did?: string
  times?: number
  refused?: string
  said?: string[]
  saidAt?: string | null
  highlight?: true
  id?: string
}
/** What an entry is: a notice, the surface's lines; a refusal; a call or an event that said nothing; or the shell's own line about a tab. */
export type Kind = "notice" | "refused" | "call" | "tab"
/**
 * One line of a thread: a notice, a refusal, a tab entry, or calls in a row by one author, newest first, one or more;
 * `program` where they are one program's, every call of it, its refusal and its lines among them.
 */
export type Item =
  | { kind: "notice"; row: Row }
  | { kind: "refused"; row: Row }
  | { kind: "tab"; row: Row }
  | { kind: "calls"; who: Who; by?: string; rows: Row[]; program?: string }

/** The name a program gives each of its calls, as its client sends it (bv.ts): its entries share it. */
const PROGRAM = "program:"

/** The program an entry's call was one of, by the name its calls share; none for a call made alone. */
export const programOf = (row: Row): string | undefined => (row.id?.startsWith(PROGRAM) ? row.id : undefined)

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** How long ago, as a line says it: now, minutes, hours up to six, then the clock time. */
export function agoOf(when: Date, now: Date): string {
  const ago = now.getTime() - when.getTime()

  if (ago < MINUTE) return "now"
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`
  if (ago < 6 * HOUR) return `${Math.floor(ago / HOUR)}h`

  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/** What an entry is: the shell's line about a tab; a notice where the surface said lines; a refusal; else a call or an event. */
export const kindOf = (row: Row): Kind => (row.own ? "tab" : row.said?.length ? "notice" : row.refused !== undefined ? "refused" : "call")

/** Whether `at` is the tab at `address`, or a place in it. */
const inside = (at: string | null, address: string): boolean => at !== null && (at === address || at.startsWith(`${address}/`))

/** The tab an entry is in: none for the shell's own, about a tab or at its /. */
const tabOfRow = (row: Row): string | undefined => (row.own ? undefined : tabIn(row.at ?? undefined))

/** The entries of the tab at `address`, as given, newest first: those in it, and the shell's own lines about it. */
export const entriesIn = (rows: readonly Row[], address: string): Row[] => rows.filter((r) => (r.own ? inside(r.at, address) : tabOfRow(r) === address))

/** The shell's own entries, home's thread: those in no tab. */
export const shellEntries = (rows: readonly Row[]): Row[] => rows.filter((r) => tabOfRow(r) === undefined)

/** The entries as a thread's lines, newest first as given: calls in a row by one author are one line. */
export function itemsOf(rows: readonly Row[]): Item[] {
  const items: Item[] = []

  for (const row of rows) {
    const kind = kindOf(row)
    const last = items.at(-1)
    const program = programOf(row)

    // One program's entries in a row are one move, whatever each is: a call, a refusal, the lines a call gave; but a
    // highlight, which a surface marked for the person, stands as its own.
    if (program && !row.highlight) {
      if (last?.kind === "calls" && last.program === program) last.rows.push(row)
      else items.push({ kind: "calls", who: row.who, rows: [row], program })
    } else if (kind !== "call") items.push({ kind, row })
    else if (last?.kind === "calls" && !last.program && last.who === row.who && last.by === row.by) last.rows.push(row)
    else items.push({ kind: "calls", who: row.who, ...(row.by !== undefined && { by: row.by }), rows: [row] })
  }

  return items
}

/** A line's key, steady as entries arrive: its newest entry's number. */
export const keyOf = (item: Item): number => (item.kind === "calls" ? item.rows[0]!.n : item.row.n)

/** Who did it, as a notice is headed: the person, the agent, or the world, named by what heard it; where nothing is named, the surface that tells it. */
export const authorOf = (who: Who, by?: string, surface = "World"): string => (who === "person" ? "You" : who === "agent" ? "Agent" : by ? `World · ${by}` : surface)

/** What was done, as one line: the call or the event, and how many in a row. */
export const didOf = (row: Row): string => `${row.did ?? ""}${(row.times ?? 1) > 1 ? ` ×${row.times}` : ""}`.trim()

/** What an entry says in one line: the surface's lines where it said any, else what was done. */
export const lineOf = (row: Row): string => (row.said?.length ? row.said.join(" ") : didOf(row))

/** A refusal as its quiet line: "Agent: draft n=3 refused, not offered here". */
export const refusedLine = (row: Row): string => `${authorOf(row.who, row.by)}: ${didOf(row)} refused, ${row.refused}`

/** Who did it, after a tab entry's verb. */
const BY: Record<Who, string> = { person: "by you", agent: "by the agent", world: "by the world" }
const DONE: Record<string, string> = { open: "opened", close: "closed", show: "shown to you" }

/**
 * A tab entry as its line says it: "Opened by the agent" in the tab's own thread; in home's, naming its surface, "Queue
 * opened by the agent".
 */
export function tabLine(row: Row, home = false): string {
  const handle = row.did?.split(" ")[0] ?? ""
  const done = `${DONE[handle] ?? didOf(row)} ${BY[row.who]}`

  return home ? `${named(row.surface ?? "")} ${done}` : done.charAt(0).toUpperCase() + done.slice(1)
}

/**
 * Calls folded into one line: "Agent made 4 calls", "You made 1 call"; the world's events, "World · watch heard 7 events";
 * a program's, "Agent made 12 calls in one command", and where one was refused, which: "…, the 12th refused", where it stopped.
 */
export function callsLine(item: Extract<Item, { kind: "calls" }>): string {
  if (item.program) {
    const count = item.rows.length
    const refused = [...item.rows].reverse().flatMap((row, i) => (row.refused === undefined ? [] : [i + 1]))
    const at = !refused.length ? "" : refused.length === 1 ? `, the ${ordinal(refused[0]!)} refused` : `, ${refused.length} refused`

    return `${authorOf(item.who)} made ${count} call${count === 1 ? "" : "s"} in one command${at}`
  }

  const count = item.who === "world" ? item.rows.reduce((sum, row) => sum + (row.times ?? 1), 0) : item.rows.length
  const what = item.who === "world" ? ["heard", "event"] : ["made", "call"]

  return `${authorOf(item.who, item.by)} ${what[0]} ${count} ${what[1]}${count === 1 ? "" : "s"}`
}

/** A number as a place in a row: 1st, 2nd, 3rd, 11th, 22nd. */
const ordinal = (n: number): string => `${n}${[11, 12, 13].includes(n % 100) ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`

/** One entry of a program as its folded line lists it: the call, and why it was refused or what the surface said of it. */
export const programRowOf = (row: Row): string =>
  [didOf(row), row.refused !== undefined ? `refused, ${row.refused}` : row.said?.length ? row.said.join(" ") : ""].filter(Boolean).join(": ")

/** Where an entry happened, within its tab, as a click on it goes: "/tabs/2/issues/12" in /tabs/2 is /issues/12; none outside the tab. */
export function placeIn(row: Row, address: string): string | undefined {
  if (!inside(row.at, address)) return undefined

  return row.at!.slice(address.length) || "/"
}

/** The tab a place is in: "/tabs/2/issues/12" is in /tabs/2, "/queue/issues/12" in /queue; anything else is in none. */
export const tabIn = (at: string | undefined): string | undefined => (at && /^(?:\/tabs\/\d+|\/(?!(?:tabs|activity)(?:\/|$))[a-z][a-z0-9-]*)/.exec(at)?.[0]) || undefined

/** What is pinned at a thread's foot: that its tab is broken, with Reload. */
export type Pinned = { tone: "broken"; text: string; detail?: string; does?: { label: "Reload" } }

export const pinnedOf = ({ broken }: { broken?: string }): Pinned | undefined =>
  broken === undefined ? undefined : { tone: "broken", text: "This tab is broken", detail: broken, does: { label: "Reload" } }

/**
 * The person's latest calls, as many as the agent has not been told of: what it is told with their next message, newest
 * first; a refusal changed nothing, and is none of them.
 */
export const waitingRows = (rows: readonly Row[], waiting: number): Row[] => rows.filter((r) => r.who === "person" && r.refused === undefined).slice(0, Math.max(0, waiting))

/** What the person is told as the session's hooks are found not heard: never heard, or heard and gone quiet; and what to do. */
export const UNHEARD = "This session's agent is not told of changes; it sees them only when it reads"
const NEVER = "Start the session in a harness set up for this project, from its folder."

/** The highlight that the hooks are not heard, as its bubble and its entry in home's thread say it. */
export const unheardLine = (unheard: Unheard): string =>
  `${UNHEARD}. ${unheard.ever ? "Its hooks went quiet: start a new session to get them back." : NEVER}`

/** The stretches of silence the page has known, with one more where `unheard` is new: the same list where it is known or there is none. */
export const knownAfter = (known: readonly Unheard[], unheard: Unheard | undefined): readonly Unheard[] =>
  !unheard || known.some((k) => k.since === unheard.since) ? known : [...known, unheard]

/**
 * Home's entries with the page's own highlights among them, one for each stretch of silence it has known, by its time: newest
 * first as given, each before the first entry older than it. Numbered below every entry's, so their keys never meet.
 */
export function withUnheard(rows: readonly Row[], known: readonly Unheard[]): Row[] {
  const all = [...rows]

  for (const unheard of [...known].sort((a, b) => a.since - b.since)) {
    const when = new Date(unheard.since).toISOString().replace(/\.\d{3}Z$/, "Z")
    const older = all.findIndex((r) => Date.parse(r.when) < Date.parse(when))
    const row: Row = { n: -unheard.since, when, who: "world", surface: "baba", at: null, said: [unheardLine(unheard)], highlight: true }

    all.splice(older < 0 ? all.length : older, 0, row)
  }

  return all
}

/** The highlights of `rows` the person has not opened, by number, of those the shell names. */
export const unopenedOf = (rows: readonly Row[], unopened: readonly number[]): number[] =>
  rows.filter((r) => r.highlight && unopened.includes(r.n)).map((r) => r.n)
