// The activity of a session: who did what across the tabs, kept by the shell with its state and read on demand at
// /activity. An entry is a notice, in the words its surface chose; or, for a call that committed and gave none, one
// mechanical line, the handle and its arguments, so nothing done goes unrecorded; or the shell's own opening, closing
// and pointing. A command's event gives entries only by its notices: what a surface does on its own is told where it
// chose to tell it. Time is the message's own, stamped as it enters, a call by the run loop and a tab's event by the
// shell's run, so the update that keeps it stays pure. The last KEPT entries are kept; the agent is never fed them.
import { isPerson, type Args, type Call, type Json, type Notice, type View } from "../../core/index.ts"

/** Who did it: the person, an agent of the session, or a surface by a command's event. */
export type Who = "person" | "agent" | "surface"
/** One line of activity: its number in the session, when in ms since the epoch, who, the surface and the place it is about, and what. */
export type Entry = { n: number; when: number; who: Who; surface: string; at: string; what: string }
/** An entry before it is numbered. */
export type Line = Omit<Entry, "n">

/** How many entries are kept; an older one goes first. */
export const KEPT = 200
/** How many entries /activity shows at a time. */
export const PAGE = 50
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
 * a tab's notices, or the call that gave none; the shell's own open, close and show. `when` is the message's time.
 */
export function linesOf(before: Held, message: Call | { kind: "tab"; n: number }, when: number, notices: Notice[] = []): Line[] {
  const told = notices.map(given)
  const tell = (who: Who, tab: { n: number; surface: string }) => told.map((t) => ({ when, who, surface: tab.surface, at: t.at ?? `/tabs/${tab.n}`, what: t.text }))

  if (message.kind !== "call") {
    const tab = before.tabs.find((t) => t.n === message.n)

    return tab ? tell("surface", tab) : []
  }

  const who = whoOf(message.actor)
  const into = tabOf(message.path)

  if (into) {
    const tab = before.tabs.find((t) => t.n === Number(into[1]))

    if (!tab) return []

    return told.length ? tell(who, tab) : [{ when, who, surface: tab.surface, at: message.path.replace(/\/$/, ""), what: said(message.handle, message.args) }]
  }

  const { handle, args } = message

  if (handle === "open" && typeof args.surface === "string") return [{ when, who, surface: args.surface, at: `/tabs/${before.next}`, what: "opened" }]

  const closed = handle === "close" ? before.tabs.find((t) => t.n === args.n) : undefined

  if (closed) return [{ when, who, surface: closed.surface, at: `/tabs/${closed.n}`, what: "closed" }]

  const shown = handle === "show" && typeof args.at === "string" ? tabOf(args.at) : undefined
  const pointed = shown && before.tabs.find((t) => t.n === Number(shown[1]))

  if (pointed) return [{ when, who, surface: pointed.surface, at: (args.at as string).replace(/\/$/, ""), what: "shown to the person" }]

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

/** The entries kept from before: none where state kept before activity has none, and only what reads as an entry. */
export const restored = (kept: unknown): Entry[] => (Array.isArray(kept) ? kept.filter(isEntry).slice(-KEPT) : [])

/** A time as /activity gives it: UTC to the second. */
export const stamp = (when: number): string => new Date(when).toISOString().replace(/\.\d{3}Z$/, "Z")

/**
 * /activity, newest first, PAGE at a time: `upto` the number of the newest entry shown, the newest by default; `earlier`
 * names the page before where there is one. `at` is null where the entry's tab is closed. `open` is the tab numbers open now.
 */
export function activityView(entries: Entry[], open: Set<number>, upto?: number): View | undefined {
  if (upto !== undefined && (!Number.isInteger(upto) || upto < 1)) return undefined

  const shown = entries.filter((e) => upto === undefined || e.n <= upto).slice(-PAGE).reverse()
  const oldest = shown.at(-1)
  const more = !!oldest && entries[0]!.n < oldest.n
  const live = (at: string) => {
    const m = /^\/tabs\/(\d+)/.exec(at)

    return !m || open.has(Number(m[1])) ? at : null
  }

  return {
    at: upto === undefined ? "/activity" : `/activity/${upto}`,
    about: "who did what in this session, newest first: the person, an agent, or a surface by itself; at is null where the tab is closed",
    kept: entries.length,
    ...(!shown.length ? { entries: "none yet" } : { entries: shown.map((e) => ({ n: e.n, when: stamp(e.when), who: e.who, surface: e.surface, at: live(e.at), what: e.what })) }),
    ...(more && { earlier: { at: `/activity/${oldest!.n - 1}` } }),
  }
}
