// The activity of a session: its log of actions, for auditing, never replayed, since the surfaces hear a world that
// changes on its own. One entry per action: when, who, where, what was done and what came of it. Who is the person, an
// agent, or the world: an event a session command sent, named by what heard it, the command's kind; a run of them in a
// row from one hearer in one tab, silent, is one entry with a count. What a call started is the caller's, and an event of
// it is kept only where its surface said a line about it: the call is already in the log. What was done is the handle
// with its inputs, each whole up to BOUND and cut past it, saying how long it was; a value that reads as a credential is
// never kept. What came of it is done, or refused with why; and the surface's own lines about it where it gave any, its
// notices. A line may be a highlight, the one class of important entry: one the surface marked, or the agent's call of the
// shell's `highlight`; /activity/highlights is the entries that carry one. A quiet commit, the page's own bookkeeping, is
// none, and the person opening a drawer neither. Time is the message's own, stamped as it enters, a call by
// the run loop and a tab's event by the shell's run, so the update that keeps it stays pure. The model holds the last KEPT
// entries of each tab, and of the shell's own; on disk each tab's log is kept whole in its own file, up to a bound (keep.ts).
// `record` is the one place an entry is added, `activityView` the one where the held ones are read. An entry lives with the
// tab it is in: when the tab closes its entries leave the model with it, kept read only in the archive of closed tabs
// (archive.ts), and the shell's own line that it closed stays.
// Which highlights the person has opened is kept beside them, a mark per drawer the page sets as it opens one: a highlight
// is unopened until the drawer of the tab it is in, or home's, is opened after it, so a page opened later knows from the
// log itself which tabs to mark.
import { isPerson, type Args, type Call, type Json, type Notice, type View } from "../../core/index.ts"

/** Who did it: the person, an agent of the session, or the world, heard by a session command. */
export type Who = "person" | "agent" | "world"
/** A line the surface said about an action: its text, the place it is about where that is not the action's own, and whether it is a highlight. */
export type Said = { text: string; at?: string; highlight?: true }
/**
 * One action: its number in the session; `when`, in ms since the epoch, the last where it folds several; `who`, and `by`,
 * the world's hearer, the kind of the session command that heard it; the surface and `at`, the tab and the path, by tab
 * number; `did`, the handle called, or the kind of the event heard; `args`, its inputs, each whole or cut, and `cut`, the
 * whole length of each one cut; `refused`, why it was refused, where it was; `said`, the surface's own lines about it;
 * `times`, how many it folds, where more than one; `own` where it is the shell's opening or closing of a tab,
 * which is about the tab but not in it; `id` the name its call was given by its caller, where it was given one.
 */
export type Entry = {
  n: number
  when: number
  who: Who
  by?: string
  surface: string
  at: string
  did: string
  args?: Args
  cut?: Record<string, number>
  refused?: string
  said?: Said[]
  times?: number
  own?: true
  id?: string
}
/** An entry before it is numbered. */
export type Line = Omit<Entry, "n">
/** The highlights the person has opened: by drawer, a tab's number or HOME, the newest entry in it they opened it after. */
export type Opened = Record<string, number>

/** The tabs an entry can be in: the address the open tab numbered n stands at. */
export type Tabs = { at: (n: number) => string | undefined }

/** How many entries of each tab, and of the shell's own, the model holds; an older one of the same goes first. */
export const KEPT = 200
/** How many entries /activity shows at a time. */
export const PAGE = 50
/** How long an input is kept whole, in characters of its text; a longer one keeps this much, and says how long it was. */
export const BOUND = 200
/** Where the activity stands. */
export const ACTIVITY = "/activity"
/** Where the entries that carry a highlight stand; the person's opening of a drawer is called there, and is no activity itself. */
export const HIGHLIGHTS = `${ACTIVITY}/highlights`
/** The drawer of the entries in no tab, home's. */
export const HOME = "home"
/** What a credential is kept as. */
export const HIDDEN = "(hidden)"
/** What the shell calls itself where an entry is its own and about no tab. */
const SHELL = "baba"

export const whoOf = (actor: string): Who => (isPerson(actor) ? "person" : "agent")

/** The words of an input's name that say it holds a credential: api_key, apiKey, token, password. */
const SECRET = new Set(["key", "apikey", "token", "secret", "password", "passwd", "passphrase", "credential", "credentials", "auth", "cookie", "bearer"])
/** A run of letters and digits, both, 32 or longer: the shape of a key or a token, and of a hash, which goes with them. */
const TOKEN = /(?=[A-Za-z0-9+_]*\d)(?=[A-Za-z0-9+_]*[A-Za-z])[A-Za-z0-9+_]{32,}={0,2}/g

const secretName = (name: string) => name.split(/[_\-\s.]+|(?<=[a-z])(?=[A-Z])/).some((word) => SECRET.has(word.toLowerCase()))
/** A value with every credential in it hidden: each string, and the strings within. */
const unsecret = (value: Json): Json => {
  if (typeof value === "string") return value.replace(TOKEN, HIDDEN)
  if (Array.isArray(value)) return value.map(unsecret)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === undefined ? v : secretName(k) ? HIDDEN : unsecret(v)]))

  return value
}

/** A call's inputs as kept: a credential hidden, each whole up to BOUND, a longer one cut to its first BOUND characters. */
export function inputsOf(args: Args): { args?: Args; cut?: Record<string, number> } {
  const kept: Args = {}
  const cut: Record<string, number> = {}

  for (const [name, value] of Object.entries(args)) {
    const clean = secretName(name) ? HIDDEN : unsecret(value)
    const text = typeof clean === "string" ? clean : JSON.stringify(clean)

    if (text.length <= BOUND) kept[name] = clean
    else {
      kept[name] = text.slice(0, BOUND)
      cut[name] = text.length
    }
  }

  return { ...(Object.keys(kept).length && { args: kept }), ...(Object.keys(cut).length && { cut }) }
}

/** A value as an input is written: a plain word as is, anything else as JSON. */
const arg = (value: Json): string => (typeof value === "string" && /^[\w.:/@-]+$/.test(value) ? value : JSON.stringify(value))

/** What was done, as one line: the handle, then each input as `name=value`, one cut saying how long it was; or the event heard. */
export const didLine = (e: Pick<Entry, "did" | "args" | "cut">): string =>
  [
    e.did,
    ...Object.entries(e.args ?? {}).map(([k, v]) => (e.cut?.[k] === undefined ? `${k}=${arg(v)}` : `${k}=${JSON.stringify(`${String(v)}…`)}(${e.cut[k]} chars)`)),
  ]
    .filter(Boolean)
    .join(" ")

/**
 * The entries kept after `line`, the one place an entry is added: numbered on from the last, the newest KEPT of its tab, or
 * of the shell's own; the world's in a row folded.
 */
export function record(kept: Entry[], line: Line | undefined): Entry[] {
  if (!line) return kept

  const into = folds(kept, line)

  if (into) return kept.map((e) => (e === into ? { ...e, when: line.when, times: (e.times ?? 1) + 1 } : e))

  const tab = tabOfEntry(line)
  const next = [...kept, { n: (kept.at(-1)?.n ?? 0) + 1, ...line }]
  const same = next.filter((e) => tabOfEntry(e) === tab)

  return same.length > KEPT ? next.filter((e) => e !== same[0]) : next
}

/** The newest KEPT of each tab's entries, and of the shell's own, in order. */
export function held(entries: Entry[]): Entry[] {
  const count = new Map<number | undefined, number>()

  return entries
    .toReversed()
    .filter((e) => {
      const tab = tabOfEntry(e)
      const seen = (count.get(tab) ?? 0) + 1

      count.set(tab, seen)

      return seen <= KEPT
    })
    .reverse()
}

/**
 * The entry a silent event of the world folds into: the last of its tab, where the same hearer heard the same kind and
 * nothing was refused. It stays where it is, its number kept, so what the person has seen of it stays seen.
 */
function folds(kept: Entry[], line: Line): Entry | undefined {
  if (line.who !== "world" || line.said || line.refused !== undefined) return undefined

  const tab = tabOfEntry(line)
  const last = tab === undefined ? undefined : kept.findLast((e) => tabOfEntry(e) === tab)

  return last && last.who === "world" && last.by === line.by && last.did === line.did && last.refused === undefined ? last : undefined
}

/** The tab an entry is in, by its number: none for the shell's own, which is about a tab but not in it. */
export const tabOfEntry = (e: Pick<Entry, "own" | "at">): number | undefined => {
  const m = e.own ? undefined : /^\/tabs\/(\d+)/.exec(e.at)

  return m ? Number(m[1]) : undefined
}

/** The entries left once the tabs numbered `gone` are closed: what was in them goes with them; the shell's own lines stay. */
export const without = (entries: Entry[], gone: (n: number) => boolean): Entry[] =>
  entries.filter((e) => {
    const n = tabOfEntry(e)

    return n === undefined || !gone(n)
  })

/** What the shell held before a message: its tabs, by number and surface, and the number the next one opened takes. */
type Held = { tabs: { n: number; surface: string }[]; next: number }
/** A tab's event as the shell keeps it: who started the work it reports, or what of the world heard it. */
export type Heard = { kind: "tab"; n: number; event: { kind: string }; actor?: string; heard?: string }

const tabOf = (path: string) => /^\/tabs\/(\d+)(\/.*)?$/.exec(path)
const trimmed = (path: string) => (path === "/" ? path : path.replace(/\/$/, ""))
const isActivity = (path: string) => path === ACTIVITY || path.startsWith(`${ACTIVITY}/`)

/** The lines a commit gave, each with its place where that is not `at`. */
const saidOf = (notices: Notice[], at: string): Said[] | undefined => {
  const said = notices
    .map((n) => (typeof n === "string" ? { text: n } : n))
    .filter((n) => typeof n.text === "string" && n.text.trim())
    .map(
      ({ text, at: there, highlight }): Said => ({
        text: text.trim(),
        ...(typeof there === "string" && trimmed(there) !== at && { at: trimmed(there) }),
        ...(highlight === true && { highlight: true as const }),
      })
    )

  return said.length ? said : undefined
}

/** A call as an entry, before what came of it: who, where, the handle and its inputs; none for a read of the activity itself. */
function called(before: Held, call: Call, when: number): Line | undefined {
  if (isActivity(call.path)) return undefined

  const who = whoOf(call.actor)
  const base = { when, who, did: call.handle, ...inputsOf(call.args), ...(call.id && { id: call.id }) }
  const into = tabOf(call.path)

  if (into) {
    const tab = before.tabs.find((t) => t.n === Number(into[1]))

    // A call into a tab not open was refused before it reached one: the shell's, about where it was aimed.
    return tab ? { ...base, surface: tab.surface, at: trimmed(call.path) } : { ...base, surface: SHELL, at: trimmed(call.path), own: true }
  }

  const { handle, args } = call

  if (handle === "open" && typeof args.surface === "string")
    return { ...base, surface: args.surface, at: `/tabs/${before.next}`, own: true }

  const closed = handle === "close" ? before.tabs.find((t) => t.n === args.n) : undefined

  if (closed) return { ...base, surface: closed.surface, at: `/tabs/${closed.n}`, own: true }

  // The agent's highlight is in the tab of the place it marks, as a surface's own would be.
  const marked = handle === "highlight" && typeof args.at === "string" ? tabOf(args.at) : undefined
  const there = marked && before.tabs.find((t) => t.n === Number(marked[1]))

  if (there) return { ...base, surface: there.surface, at: trimmed(args.at as string) }

  return { ...base, surface: SHELL, at: "/" }
}

/**
 * The entry of one committed message, from what the shell held before it and the notices the commit gave, their places
 * already whole: a call, with the lines it gave; a tab's event, the world's, or the caller's where its surface said a line
 * about it. `when` is the message's time.
 */
export function entryOf(before: Held, message: Call | Heard, when: number, notices: Notice[] = []): Line | undefined {
  if (message.kind === "call") {
    const line = called(before, message, when)
    const said = line && saidOf(notices, line.at)

    return line && { ...line, ...(said && { said }) }
  }

  const tab = before.tabs.find((t) => t.n === message.n)

  if (!tab) return undefined

  const at = `/tabs/${tab.n}`
  const said = saidOf(notices, at)
  const base = { when, surface: tab.surface, at, did: message.event.kind, ...(said && { said }) }

  if (message.actor !== undefined) return said && { ...base, who: whoOf(message.actor) }

  return { ...base, who: "world", ...(message.heard && { by: message.heard }) }
}

/** The entry of a call refused, with why: none for the activity's own. */
export function refusalOf(before: Held, call: Call, when: number, reason: string): Line | undefined {
  const line = called(before, call, when)

  // A refused open makes no tab: it is the shell's, at its /.
  return line && (line.own && call.handle === "open" ? { ...line, surface: SHELL, at: "/", own: undefined, refused: reason } : { ...line, refused: reason })
}

const WHO = new Set(["person", "agent", "world", "surface"])
const OWN: Record<string, string> = { opened: "open", closed: "close", "shown to the person": "show" }

/** An entry kept in this shape, or in the one before, where an entry was a line of text: what read as neither is dropped. */
function entryFrom(e: unknown): Entry | undefined {
  const x = e as (Omit<Partial<Entry>, "who"> & { what?: unknown; notice?: unknown; who?: unknown }) | null

  if (!x || typeof x.n !== "number" || typeof x.when !== "number" || !WHO.has(x.who as string) || typeof x.surface !== "string" || typeof x.at !== "string") return undefined

  const who: Who = x.who === "surface" ? "world" : (x.who as Who)
  const own = x.own === true ? { own: true as const } : {}
  const id = typeof x.id === "string" ? { id: x.id } : {}

  if (typeof x.did === "string") {
    const { what: _, notice: __, ...rest } = x

    return { ...(rest as Omit<Entry, "who">), who, ...own }
  }
  if (typeof x.what !== "string") return undefined
  // Before, a notice stood in place of its call, which was not kept; a call's line was its handle and inputs; the shell's own, a word.
  if (x.notice === true || (x.notice === undefined && x.who === "surface")) return { n: x.n, when: x.when, who, surface: x.surface, at: x.at, did: "", said: [{ text: x.what }], ...own, ...id }

  return { n: x.n, when: x.when, who, surface: x.surface, at: x.at, did: (own.own && OWN[x.what]) || x.what, ...own, ...id }
}

/** What reads as an entry of those kept, in either shape, all of them: as a closed tab's log is read whole. */
export const entriesFrom = (kept: unknown): Entry[] => (Array.isArray(kept) ? kept.map(entryFrom).filter((e): e is Entry => !!e) : [])

/** The entries kept from before: none where state kept before activity has none, and only what reads as an entry, the newest KEPT of each tab. */
export const restored = (kept: unknown): Entry[] => held(entriesFrom(kept))

/** Whether an entry carries a highlight. */
export const highlighted = (e: Pick<Entry, "said">): boolean => !!e.said?.some((s) => s.highlight)

/** The drawer an entry is in: its tab's number, or HOME for the shell's own. */
export const drawerOf = (e: Pick<Entry, "own" | "at">): string => String(tabOfEntry(e) ?? HOME)

/** The opened marks kept from before, each a drawer and a number; none where there are none, as in state kept before them. */
export function openedFrom(kept: unknown): Opened {
  if (!kept || typeof kept !== "object" || Array.isArray(kept)) return {}

  return Object.fromEntries(Object.entries(kept).filter((e): e is [string, number] => typeof e[1] === "number"))
}

/** The marks after the person opened the drawer entry `n` is in: every highlight there up to it is opened. */
export function openUpto(opened: Opened, entries: Entry[], n: number): Opened {
  const e = entries.find((x) => x.n === n)

  if (!e) return opened

  const drawer = drawerOf(e)

  return (opened[drawer] ?? 0) >= n ? opened : { ...opened, [drawer]: n }
}

/** The highlights the person has not opened, by number, oldest first: newer than their drawer's mark, and not their own. */
export const unopenedIn = (entries: Entry[], opened: Opened): number[] =>
  entries.filter((e) => highlighted(e) && e.who !== "person" && e.n > (opened[drawerOf(e)] ?? 0)).map((e) => e.n)

/** A time as /activity gives it: UTC to the second. */
export const stamp = (when: number): string => new Date(when).toISOString().replace(/\.\d{3}Z$/, "Z")

/**
 * /activity, newest first, PAGE at a time, or with `highlights` only the entries that carry a highlight, at
 * /activity/highlights: `upto` the number of the newest entry shown, the newest by default; `earlier` names the page before
 * where there is one. An entry keeps its place by tab number; `tabs` gives the address an open tab stands at now, which
 * its place is said by; `at` is null in the shell's own line about a tab now closed, whose entries went with it.
 */
export function activityView(all: Entry[], tabs: Tabs, upto?: number, highlights = false): View | undefined {
  if (upto !== undefined && (!Number.isInteger(upto) || upto < 1)) return undefined

  const base = highlights ? HIGHLIGHTS : ACTIVITY
  const entries = highlights ? all.filter(highlighted) : all
  const shown = entries.filter((e) => upto === undefined || e.n <= upto).slice(-PAGE).reverse()
  const oldest = shown.at(-1)
  const more = !!oldest && entries[0]!.n < oldest.n
  const live = (at: string) => {
    const m = /^\/tabs\/(\d+)(.*)$/.exec(at)
    const address = m && tabs.at(Number(m[1]))

    return !m ? at : address ? address + m[2] : null
  }
  const row = (e: Entry) => {
    const did = didLine(e)
    const there = e.said?.find((s) => s.at !== undefined)?.at
    const at = live(e.at)
    // A tab's address names its surface, where it holds its name: the surface is said only where it does not.
    const named = !e.own && at !== null && (at === `/${e.surface}` || at.startsWith(`/${e.surface}/`))

    return {
      n: e.n,
      when: stamp(e.when),
      who: e.who,
      ...(e.by && { by: e.by }),
      ...(!named && { surface: e.surface }),
      at,
      ...(e.own && { own: true }),
      ...(did && { did }),
      ...(e.times && { times: e.times }),
      ...(e.refused !== undefined && { refused: e.refused }),
      ...(e.said && { said: e.said.map((s) => s.text) }),
      ...(there && { saidAt: live(there) }),
      ...(highlighted(e) && { highlight: true }),
      ...(e.id && { id: e.id }),
    }
  }

  return {
    at: upto === undefined ? base : `${base}/${upto}`,
    about: highlights
      ? "the highlights of this session's open tabs, what the agent or a surface marked important to the person, newest first"
      : "what was done in this session, newest first: who, the person, an agent, or the world heard by the command in by; did, a call with its " +
        "inputs or the event heard, times in a row; refused, why; said, the surface's lines, saidAt their place, highlight where one is; " +
        "surface, where at does not name it; own, the shell's line about a tab, at null once it closed with its entries; id, the caller's name for a call",
    kept: entries.length,
    ...(!shown.length ? { entries: "none yet" } : { entries: shown.map(row) }),
    ...(more && { earlier: { at: `${base}/${oldest!.n - 1}` } }),
    ...(!highlights && upto === undefined && { highlights: { at: HIGHLIGHTS } }),
  }
}
