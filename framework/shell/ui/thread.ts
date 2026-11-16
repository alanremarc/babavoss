// A drawer's thread, worked out without a page: a tab's entries, read from the shell's activity, as a thread reads them.
// An entry is a notice, the surface's own words; a call that said nothing, mechanical, a run of them in a row by one
// author folded into one line; or a tab entry, the shell's opening, closing or showing of a tab. A tab's thread is what
// is in it and the shell's lines about it; home's is the shell's own, each naming its surface. What a tab needs, or that
// it is broken, is pinned at the thread's foot with its one action, as is what of the person's waits for the agent on
// home's. Pure: drawer.tsx draws it.
import { named } from "./commands.ts"

export type Who = "person" | "agent" | "surface"
/**
 * An entry as /activity gives it: `when` UTC to the second, `at` null in the shell's line about a tab now closed, `tab` the
 * tab it is in, absent for the shell's own; `kind` absent at /activity/notices, all notices.
 */
export type Row = { n: number; when: string; who: Who; kind?: "notice" | "call"; surface: string; at: string | null; tab?: string; what: string }
/** What an entry is: a notice, a call that said nothing, or the shell's own line about a tab. */
export type Kind = "notice" | "call" | "tab"
/** One line of a thread: a notice, a tab entry, or calls in a row by one author, newest first, one or more. */
export type Item = { kind: "notice"; row: Row } | { kind: "tab"; row: Row } | { kind: "calls"; who: Who; rows: Row[] }

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

/**
 * What an entry is: in a tab, a notice where it is marked so, else a call; in none, the shell's line about a tab, or a call
 * made on the shell itself, at its /.
 */
export const kindOf = (row: Row): Kind => (row.tab === undefined ? (row.at === "/" ? "call" : "tab") : row.kind === "call" ? "call" : "notice")

/** Whether `at` is the tab at `address`, or a place in it. */
const inside = (at: string | null, address: string): boolean => at !== null && (at === address || at.startsWith(`${address}/`))

/** The entries of the tab at `address`, as given, newest first: those in it, and the shell's own lines about it. */
export const entriesIn = (rows: readonly Row[], address: string): Row[] => rows.filter((r) => r.tab === address || (r.tab === undefined && inside(r.at, address)))

/** The shell's own entries, home's thread: those in no tab. */
export const shellEntries = (rows: readonly Row[]): Row[] => rows.filter((r) => r.tab === undefined)

/** The entries as a thread's lines, newest first as given: calls in a row by one author are one line. */
export function itemsOf(rows: readonly Row[]): Item[] {
  const items: Item[] = []

  for (const row of rows) {
    const kind = kindOf(row)
    const last = items.at(-1)

    if (kind !== "call") items.push({ kind, row })
    else if (last?.kind === "calls" && last.who === row.who) last.rows.push(row)
    else items.push({ kind: "calls", who: row.who, rows: [row] })
  }

  return items
}

/** A line's key, steady as entries arrive: its newest entry's number. */
export const keyOf = (item: Item): number => (item.kind === "calls" ? item.rows[0]!.n : item.row.n)

/** Who said or did it, as a notice is headed: the person, the agent, or the surface by the tab's name. */
export const authorOf = (who: Who, surface: string): string => (who === "person" ? "You" : who === "agent" ? "Agent" : surface)

/** Who did it, after a tab entry's verb. */
const BY: Record<Who, string> = { person: "by you", agent: "by the agent", surface: "by the surface" }
const DONE: Record<string, string> = { opened: "opened", closed: "closed", "shown to the person": "shown to you" }

/**
 * A tab entry as its line says it: "Opened by the agent" in the tab's own thread; in home's, naming its surface, "Queue
 * opened by the agent".
 */
export function tabLine(row: Row, home = false): string {
  const done = `${DONE[row.what] ?? row.what} ${BY[row.who]}`

  return home ? `${named(row.surface)} ${done}` : done.charAt(0).toUpperCase() + done.slice(1)
}

/** Calls folded into one line: "Agent made 4 calls", "You made 1 call". */
export const callsLine = (item: Extract<Item, { kind: "calls" }>, surface: string): string =>
  `${authorOf(item.who, surface)} made ${item.rows.length} ${item.rows.length === 1 ? "call" : "calls"}`

/** Where an entry happened, within its tab, as a click on it goes: "/tabs/2/issues/12" in /tabs/2 is /issues/12; none outside the tab. */
export function placeIn(row: Row, address: string): string | undefined {
  if (!inside(row.at, address)) return undefined

  return row.at!.slice(address.length) || "/"
}

/** The tab a place is in: "/tabs/2/issues/12" is in /tabs/2, "/queue/issues/12" in /queue; anything else is in none. */
export const tabIn = (at: string | undefined): string | undefined => (at && /^(?:\/tabs\/\d+|\/(?!(?:tabs|activity)(?:\/|$))[a-z][a-z0-9-]*)/.exec(at)?.[0]) || undefined

/** Why a tab needs the person, as a line: "to approve or drop 1 draft" reads "Approve or drop 1 draft". */
export const needLine = (why: string): string => {
  const line = why.replace(/^to\s+/i, "")

  return line.charAt(0).toUpperCase() + line.slice(1)
}

/**
 * What is pinned at a thread's foot, the one thing that explains the tab's mark, the strongest first: that it is broken,
 * with Reload; that the person is needed, or an ask waits for them, with Go there; that it needs the agent, with nothing to
 * do; else nothing. `ask` is the first ask the tab offers, by its label and where it is.
 */
export type Pinned = { tone: "broken" | "person" | "agent"; text: string; detail?: string; does?: { label: "Reload" } | { label: "Go there"; at: string } }

export function pinnedOf({ broken, needs = [], ask }: { broken?: string; needs?: { who: "person" | "agent"; why: string }[]; ask?: { label: string; at: string } }): Pinned | undefined {
  const person = needs.find((n) => n.who === "person")
  const agent = needs.find((n) => n.who === "agent")

  if (broken !== undefined) return { tone: "broken", text: "This tab is broken", detail: broken, does: { label: "Reload" } }
  if (person) return { tone: "person", text: needLine(person.why), does: { label: "Go there", at: ask?.at ?? "/" } }
  if (ask) return { tone: "person", text: `${ask.label.replace(/…$/, "")} waits for you`, does: { label: "Go there", at: ask.at } }
  if (agent) return { tone: "agent", text: `Waits for the agent: ${needLine(agent.why).replace(/^./, (c) => c.toLowerCase())}` }

  return undefined
}

/**
 * The person's latest calls, as many as the agent has not been told of: what it is told with their next message, newest
 * first; a call that gave a notice is that notice. Read from all activity, where every row has its kind.
 */
export const waitingRows = (rows: readonly Row[], waiting: number): Row[] => rows.filter((r) => r.who === "person" && r.kind !== undefined).slice(0, Math.max(0, waiting))

/** The notices of `rows` the person has not seen, by number, of those the shell names. */
export const freshIn = (rows: readonly Row[], fresh: readonly number[]): number[] => rows.filter((r) => kindOf(r) === "notice" && fresh.includes(r.n)).map((r) => r.n)
