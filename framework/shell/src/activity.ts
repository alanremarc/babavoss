// The activity of a session: who did what across the tabs, kept by the shell with its state and read on demand at
// /activity. An entry is a notice, in the words its surface chose, and marked so: the person's notifications are these;
// or, for a call that committed and gave none, one mechanical line, the handle and its arguments, so nothing done goes
// unrecorded; or the shell's own opening, closing and pointing. A command's event gives entries only by its notices: what
// a surface does on its own is told where it chose to tell it. /activity/notices is the notices alone. Time is the
// message's own, stamped as it enters, a call by the run loop and a tab's event by the shell's run, so the update that
// keeps it stays pure. The last KEPT entries are kept; the agent is never fed them. What the person has seen of the
// notices is kept beside them, a mark the page sets, so a page opened later counts what is new from the log itself, and
// sees a tab's notices alone, one by one.
import { isPerson, type Args, type Call, type Json, type Notice, type View } from "../../core/index.ts"

/** Who did it: the person, an agent of the session, or a surface by a command's event. */
export type Who = "person" | "agent" | "surface"
/**
 * One line of activity: its number in the session, when in ms since the epoch, who, the surface and the place it is about,
 * and what; `notice` where a surface said it, absent where it is the mechanical line for a call or the shell's own; `own`
 * where it is the shell's own opening, closing or showing of a tab, which is about the tab but not in it; `id` the name
 * its call was given by its caller, where it was given one.
 */
export type Entry = { n: number; when: number; who: Who; surface: string; at: string; what: string; notice?: true; own?: true; id?: string }
/** An entry before it is numbered. */
export type Line = Omit<Entry, "n">
/** What the person has seen of the notices: every one up to `upto`, and those after it they looked at one by one, by their toast. */
export type Seen = { upto: number; looked: number[] }

/** How many entries are kept; an older one goes first. */
export const KEPT = 200
/** How many entries /activity shows at a time. */
export const PAGE = 50
/** Where the activity stands; the person's seen marks are called there, and are no activity themselves. */
export const ACTIVITY = "/activity"
/** Where the notices alone stand. */
export const NOTICES = `${ACTIVITY}/notices`
/** What the shell calls itself where an entry is its own and about no tab. */
const SHELL = "baba"
const CLIP = 60

export const whoOf = (actor: string): Who => (isPerson(actor) ? "person" : "agent")

/** A value as an argument is written: a plain word as is, anything else as JSON, clipped. */
const arg = (value: Json): string => {
  const text = typeof value === "string" && /^[\w.:/@-]+$/.test(value) ? value : JSON.stringify(value)

  return text.length > CLIP ? `${text.slice(0, CLIP - 1)}…` : text
}

/** A call as one readable line: its handle, then each argument as `name=value`. */
export const said = (handle: string, args: Args): string => [handle, ...Object.entries(args).map(([k, v]) => `${k}=${arg(v)}`)].join(" ")

/** The entries kept after `lines`: numbered on from the last, the newest KEPT. */
export function record(kept: Entry[], lines: Line[]): Entry[] {
  if (!lines.length) return kept

  const next = (kept.at(-1)?.n ?? 0) + 1

  return [...kept, ...lines.map((line, i) => ({ n: next + i, ...line }))].slice(-KEPT)
}

/** What the shell held before a message: its tabs, by number and surface, and the number the next one opened takes. */
type Held = { tabs: { n: number; surface: string }[]; next: number }
/** A notice as the shell gives it: its path whole, its surface named. */
type Given = { text: string; at?: string }

const given = (notice: Notice): Given => (typeof notice === "string" ? { text: notice } : notice)
const tabOf = (path: string) => /^\/tabs\/(\d+)(\/.*)?$/.exec(path)

/**
 * The lines of one committed message, from what the shell held before it and the notices the commit gave, already whole:
 * a tab's notices, or the call that gave none; the shell's own open, close and show. `when` is the message's time. A call
 * at /activity, the person marking what they have seen, gives none: it is how they read the log, not something done.
 */
export function linesOf(before: Held, message: Call | { kind: "tab"; n: number }, when: number, notices: Notice[] = []): Line[] {
  const lines = linesFor(before, message, when, notices)
  const id = message.kind === "call" ? message.id : undefined

  return id ? lines.map((line) => ({ ...line, id })) : lines
}

function linesFor(before: Held, message: Call | { kind: "tab"; n: number }, when: number, notices: Notice[]): Line[] {
  const told = notices.map(given)
  const tell = (who: Who, tab: { n: number; surface: string }) =>
    told.map((t): Line => ({ when, who, surface: tab.surface, at: t.at ?? `/tabs/${tab.n}`, what: t.text, notice: true }))

  if (message.kind !== "call") {
    const tab = before.tabs.find((t) => t.n === message.n)

    return tab ? tell("surface", tab) : []
  }
  if (message.path === ACTIVITY || message.path.startsWith(`${ACTIVITY}/`)) return []

  const who = whoOf(message.actor)
  const into = tabOf(message.path)

  if (into) {
    const tab = before.tabs.find((t) => t.n === Number(into[1]))

    if (!tab) return []

    return told.length ? tell(who, tab) : [{ when, who, surface: tab.surface, at: message.path.replace(/\/$/, ""), what: said(message.handle, message.args) }]
  }

  const { handle, args } = message

  if (handle === "open" && typeof args.surface === "string") return [{ when, who, surface: args.surface, at: `/tabs/${before.next}`, what: "opened", own: true }]

  const closed = handle === "close" ? before.tabs.find((t) => t.n === args.n) : undefined

  if (closed) return [{ when, who, surface: closed.surface, at: `/tabs/${closed.n}`, what: "closed", own: true }]

  const shown = handle === "show" && typeof args.at === "string" ? tabOf(args.at) : undefined
  const pointed = shown && before.tabs.find((t) => t.n === Number(shown[1]))

  if (pointed) return [{ when, who, surface: pointed.surface, at: (args.at as string).replace(/\/$/, ""), what: "shown to the person", own: true }]

  return [{ when, who, surface: SHELL, at: "/", what: said(handle, args) }]
}

const isEntry = (e: unknown): e is Entry => {
  const x = e as Partial<Entry> | null

  return (
    !!x &&
    typeof x.n === "number" &&
    typeof x.when === "number" &&
    (x.who === "person" || x.who === "agent" || x.who === "surface") &&
    typeof x.surface === "string" &&
    typeof x.at === "string" &&
    typeof x.what === "string"
  )
}

/**
 * The entries kept from before: none where state kept before activity has none, and only what reads as an entry. One kept
 * before entries were marked is a notice where a surface did it, since a command's event gives entries only by its
 * notices; one by the person or an agent reads as the line for a call, since which of those were notices was not kept.
 */
export const restored = (kept: unknown): Entry[] =>
  Array.isArray(kept)
    ? kept
        .filter(isEntry)
        .slice(-KEPT)
        .map(({ notice, own, ...e }): Entry => ({
          ...e,
          ...((notice === true || (notice === undefined && e.who === "surface")) && { notice: true as const }),
          ...(own === true && { own: true as const }),
        }))
    : []

/** The seen mark kept from before; where there is none, as in state kept before it, everything kept so far counts as seen. */
export function seenFrom(kept: unknown, entries: Entry[]): Seen {
  const x = kept as Partial<Seen> | null | undefined

  if (!x || typeof x.upto !== "number" || !Array.isArray(x.looked)) return { upto: entries.at(-1)?.n ?? 0, looked: [] }

  const upto = x.upto

  return { upto, looked: x.looked.filter((n): n is number => typeof n === "number" && n > upto) }
}

/** The mark after the person saw every notice up to `n`, as on opening their notifications. */
export function seeUpto(seen: Seen, n: number): Seen {
  const upto = Math.max(seen.upto, n)

  return { upto, looked: seen.looked.filter((m) => m > upto) }
}

/** The mark after the person looked at notice `n` alone, as by clicking its toast. */
export const lookAt = (seen: Seen, n: number): Seen => (n <= seen.upto || seen.looked.includes(n) ? seen : { ...seen, looked: [...seen.looked, n] })

/** The notices `who` has not seen, by number, oldest first: newer than the mark, not looked at one by one, and caused by someone else. */
export const unseenIn = (entries: Entry[], seen: Seen, who: Who = "person"): number[] =>
  entries.filter((e) => e.notice && e.who !== who && e.n > seen.upto && !seen.looked.includes(e.n)).map((e) => e.n)

/** How many notices `who` has not seen. */
export const unseenOf = (entries: Entry[], seen: Seen, who: Who = "person"): number => unseenIn(entries, seen, who).length

/** A time as /activity gives it: UTC to the second. */
export const stamp = (when: number): string => new Date(when).toISOString().replace(/\.\d{3}Z$/, "Z")

/**
 * /activity, newest first, PAGE at a time, or with `notices` the notices alone, at /activity/notices: `upto` the number
 * of the newest entry shown, the newest by default; `earlier` names the page before where there is one. `kind` is notice
 * where a surface said it, call for the mechanical line; `at` is null where the entry's tab is closed; `tab` is the tab an
 * entry is in, closed or not, absent for the shell's own. An entry keeps its place by tab number; `open` gives the address
 * an open tab stands at now, which the entry's place and tab are said by; a closed tab is said by its number.
 */
export function activityView(all: Entry[], open: (n: number) => string | undefined, upto?: number, notices = false): View | undefined {
  if (upto !== undefined && (!Number.isInteger(upto) || upto < 1)) return undefined

  const base = notices ? NOTICES : ACTIVITY
  const entries = notices ? all.filter((e) => e.notice) : all
  const shown = entries.filter((e) => upto === undefined || e.n <= upto).slice(-PAGE).reverse()
  const oldest = shown.at(-1)
  const more = !!oldest && entries[0]!.n < oldest.n
  const live = (at: string) => {
    const m = /^\/tabs\/(\d+)(.*)$/.exec(at)
    const address = m && open(Number(m[1]))

    return !m ? at : address ? address + m[2] : null
  }
  const tab = (e: Entry) => {
    const m = e.own ? undefined : /^\/tabs\/(\d+)/.exec(e.at)

    return m ? (open(Number(m[1])) ?? m[0]) : undefined
  }
  const row = (e: Entry) => {
    const t = tab(e)

    return { n: e.n, when: stamp(e.when), who: e.who, ...(!notices && { kind: e.notice ? "notice" : "call" }), surface: e.surface, at: live(e.at), ...(t && { tab: t }), what: e.what, ...(e.id && { id: e.id }) }
  }

  return {
    at: upto === undefined ? base : `${base}/${upto}`,
    about: notices
      ? "what the surfaces chose to say in this session, newest first, by who caused it; tab is the tab it is in, at null where that is closed"
      : "who did what in this session, newest first: the person, an agent, or a surface by itself; kind is notice where a surface said it, " +
        "call where a call said nothing; tab is the tab it is in, absent for the shell's own, at null where the tab is closed; id is the " +
        "name a call's caller gave it, where it gave one",
    kept: entries.length,
    ...(!shown.length ? { entries: "none yet" } : { entries: shown.map(row) }),
    ...(more && { earlier: { at: `${base}/${oldest!.n - 1}` } }),
    ...(!notices && upto === undefined && { notices: { at: NOTICES } }),
  }
}
