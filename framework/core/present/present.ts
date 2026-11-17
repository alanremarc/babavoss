// Present: a view as the agent reads it, whole or as what changed, as pure functions of views. Whole, a view is relative
// facts, lists of objects as tables, and its handles in one block, the command said once and a line per handle; the root's
// tabs are each one heading with its facts under it. A change is told as an event on a thing: a row of a list by its
// identity, not its index; a tab once, as its heading; standing prose and long texts by where to read
// them; a reorder by what moved; detail by how much of it there is, and where to read it. Who made a change is the
// caller's to say.
import { isDetail, meant, revealed, type Handle, type Json } from "../surface/view.ts"

/** The fields that name a row of a list, in order: the first every row has, unique in its list, is its identity; else its index. */
export const IDENTITY = ["at", "n", "id", "name", "key"]
/** The name of standing prose: how a surface is worked, told whole only in the whole present, since it holds whatever changes. */
export const STANDING = "how"
/** A text longer than this is told in a change cut, with where to read it whole. */
export const LONG = 200
/** The most lines one telling of changes takes; past it, how much more changed, and where. */
export const CAP = 40

const CUT = 100

/**
 * How handles are said: as the command that calls them at `path`; without a command, as their name and arguments. `opened`:
 * a tab the change opens is told whole, as the answer to the agent's own call that opened it; otherwise in one line.
 */
export type Say = { command?: string; path?: string; opened?: "whole" }
/**
 * One change: its line or lines; the keys of `entries` it covers, for who made it; where it is read whole; its tab's
 * heading; and `whole`, a tab told whole, never cut.
 */
export type Change = { line: string; keys: string[]; where: string; tab?: string; whole?: true }

type Row = { [key: string]: Json | undefined }

const isHandle = (v: Json | undefined): v is Handle => !!v && typeof v === "object" && !Array.isArray(v) && v.kind === "handle"
const isRow = (v: Json | undefined): v is Row => !!v && typeof v === "object" && !Array.isArray(v) && !isHandle(v)
const isScalar = (v: Json | undefined) => v === null || v === undefined || typeof v !== "object"
const rowsOf = (v: Json | undefined): Row[] | undefined => (Array.isArray(v) && v.every(isRow) ? (v as Row[]) : undefined)
/** A row as it reads through its mark of detail. */
const inner = (row: Row): Row => (isDetail(row as Json) ? ((isRow(row.value) ? row.value : {}) as Row) : row)
const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a) === JSON.stringify(b)
const join = (label: string, key: string) => (label ? `${label}.${key}` : key)

/**
 * A handle as the agent is offered it: its name, never the key a view holds it under; its fixed arguments as values; each
 * input as what it means; and what it does beyond its name, which may be nothing.
 */
type Act = { name: string; fixed: [string, string][]; open: [string, string][]; description: string }

const act = (h: Handle): Act => ({
  name: h.name,
  fixed: Object.entries(h.args).map(([k, v]) => [k, JSON.stringify(v)]),
  open: Object.entries(h.open).map(([k, input]) => [k, meant(input)]),
  description: h.description,
})
const pair = ([k, v]: [string, string]) => `${k}=${v}`

/**
 * A handle as plain data, as a block says it: its name; its fixed arguments, each as said after `name=`, a value as JSON or a
 * column's name in capitals where a pattern stands for many; its inputs as what they mean; what it does.
 */
export type Offer = { name: string; fixed: Record<string, string>; open: Record<string, string>; description: string }
/** The actions a tab offers at a path, as plain data the shell lists at /: `at` its whole path, a pattern where it names many. */
export type Offered = { at: string; offers: Offer[] }

const offer = (a: Act): Offer => ({ name: a.name, fixed: Object.fromEntries(a.fixed), open: Object.fromEntries(a.open), description: a.description })
const fromOffer = (o: Offer): Act => ({ name: o.name, fixed: Object.entries(o.fixed), open: Object.entries(o.open), description: o.description })

/** A view's handles as its block says them, as plain data: each offered once, a handle every row of a table has folded into one. */
export function offers(value: Json | undefined): Offer[] {
  const acts: Act[] = []

  said(value, { command: "" }, "", [], acts)

  return acts.map(offer)
}
/** Whether a value is the plain data of a tab's actions at its paths. */
const isOffered = (v: Json | undefined): v is Offered[] =>
  Array.isArray(v) && v.every((x) => isRow(x) && typeof x.at === "string" && Array.isArray(x.offers))
const tail = (description: string) => (description ? `   ${description}` : "")

/** What stands in a block's head for each handle's own arguments: the syntax of every one of them. */
export const OWN = "name=value…"

/** A handle as a line's value: the command that calls it and what it does, or its name and arguments. */
function call(h: Handle, say: Say): string {
  if (say.command === undefined)
    return [
      h.name,
      Object.keys(h.args).length ? ` ${JSON.stringify(h.args)}` : "",
      Object.keys(h.open).length ? ` + ${Object.entries(h.open).map(([k, input]) => `${k}:${meant(input)}`).join(", ")}` : "",
    ].join("")

  const a = act(h)

  return `${[say.command, say.path ?? "/", a.name, ...a.fixed.map(pair), ...a.open.map(pair)].join(" ")}${tail(a.description)}`
}

/**
 * A view's handles as one block: a head, `actions:` and the command once, with ACTION for a handle's name, the fixed
 * arguments every handle shares where there are several, and OWN where any has more; then a line per handle, its name, its own arguments and what
 * it does. A handle folded from a table's rows keeps its column on its own line, as no row's value is shared.
 */
function block(acts: Act[], say: Say): string[] {
  if (!acts.length) return []

  const common = acts.length < 2 ? [] : acts[0]!.fixed.filter(([k, v]) => acts.every((a) => a.fixed.some(([j, w]) => j === k && w === v)))
  const own = (a: Act) => [...a.fixed.filter(([k]) => !common.some(([j]) => j === k)), ...a.open]
  const more = acts.some((a) => own(a).length) ? [OWN] : []

  return [
    `actions: ${[say.command, say.path ?? "/", "ACTION", ...common.map(pair), ...more].join(" ")}`,
    ...acts.map((a) => `  ${[a.name, ...own(a).map(pair)].join(" ")}${tail(a.description)}`),
  ]
}

/** A value in one cell or after a label: a scalar as JSON, a list of scalars as one list, anything else as compact JSON. */
const cell = (v: Json | undefined, say: Say): string =>
  v === undefined
    ? ""
    : isHandle(v)
      ? call(v, say)
      : Array.isArray(v) && v.every(isScalar)
        ? `[${v.map((x) => JSON.stringify(x)).join(", ")}]`
        : JSON.stringify(v)
/** A table's cells are plain: scalars, or lists of them. */
const plain = (v: Json | undefined) => isScalar(v) || (Array.isArray(v) && v.every(isScalar))

/** A table of rows whose cells are all plain: a header of the fields in the order first seen, a line per row, a cell left empty where a row has none. */
function table(label: string, rows: Row[], say: Say): string | undefined {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((k) => row[k] !== undefined && !isHandle(row[k]))))]

  if (!keys.length || !rows.every((row) => keys.every((k) => plain(row[k])))) return undefined

  return `${label}: ${keys.join("\t")}\n${rows.map((row) => keys.map((k) => cell(row[k], say)).join("\t")).join("\n")}`
}

/**
 * One handle `k` that every row offers, with the same name and inputs, whose fixed arguments are each the row's value of a
 * column: as one handle with the column, in capitals, for the value, and the first row's description, its value so named.
 */
function column(rows: Row[], k: string, say: Say): Act | undefined {
  const hs = rows.map((row) => row[k])

  if (rows.length < 2 || !hs.every(isHandle) || say.command === undefined) return undefined

  const [first] = hs as Handle[]
  const fixed = Object.keys(first!.args)
  const cols = fixed.map((a) => Object.keys(rows[0]!).find((c) => !isHandle(rows[0]![c]) && rows.every((row, i) => same((hs[i] as Handle).args[a], row[c]))))
  const alike = (hs as Handle[]).every((h) => h.name === first!.name && same(h.open, first!.open) && same(Object.keys(h.args), fixed))

  if (!fixed.length || !alike || cols.some((c) => c === undefined)) return undefined

  let description = first!.description

  for (const [i, a] of fixed.entries()) description = description.split(String(first!.args[a])).join(cols[i]!.toUpperCase())

  return { ...act(first!), fixed: fixed.map((a, i) => [a, cols[i]!.toUpperCase()]), description }
}

/**
 * A view whole, relative to where it was read: one line per fact, a table per list of plain rows, then its handles in one
 * block; without a command, a line per handle where it stands.
 */
export function lines(value: Json | undefined, say: Say = {}, label = "", out: string[] = []): string[] {
  if (say.command === undefined) return said(value, say, label, out)

  const acts: Act[] = []

  said(value, say, label, out, acts)
  out.push(...block(acts, say))

  return out
}

/** The facts' lines, with the handles gathered into `acts` where it is given, else a line each where it stands. */
function said(value: Json | undefined, say: Say, label: string, out: string[], acts?: Act[]): string[] {
  const rows = rowsOf(value)

  if (isHandle(value)) {
    if (acts) acts.push(act(value))
    else out.push(`${label.replace(/[^ .]*$/, value.name)}: ${call(value, say)}`)
  } else if (rows?.length) {
    const told = table(label, rows, say)

    if (told !== undefined) {
      out.push(told)
      // A row's handles join the block, each named as itself: its arguments say which row it is of; one handle every row
      // has, which differs only by a column's value, once, with that column for its argument.
      for (const k of [...new Set(rows.flatMap((row) => Object.keys(row).filter((k) => isHandle(row[k]))))]) {
        const shared = acts && column(rows, k, say)

        if (shared) acts!.push(shared)
        else for (const row of rows) if (isHandle(row[k])) said(row[k], say, k, out, acts)
      }
    } else {
      const id = identity([rows])

      for (const [i, row] of rows.entries()) said(row, say, `${label} ${id ? bare(row[id]) : `#${i}`}`.trim(), out, acts)
    }
  } else if (Array.isArray(value) && value.length && !value.every(isScalar)) for (const [i, v] of value.entries()) said(v, say, `${label}.${i}`, out, acts)
  else if (isRow(value) && Object.values(value).some((v) => v !== undefined)) {
    for (const [k, v] of Object.entries(value)) if (v !== undefined) said(v, say, join(label, k), out, acts)
  } else out.push(`${label}: ${isRow(value) ? "{}" : cell(value ?? null, say)}`)

  return out
}

/** The root at / looks like the shell's: tabs, each a row with its path under `at`, its facts under `facts`. */
type Tab = Row & { at: string; facts?: Json }
const tabsOf = (view: Json | undefined): Tab[] | undefined => {
  const tabs = isRow(view) ? rowsOf(view.tabs) : undefined

  return tabs?.every((t) => typeof t.at === "string") ? (tabs as Tab[]) : undefined
}
/** The root's own facts as the agent reads them: where the person was last pointed, by its place alone; the count is the page's. */
const own = (root: Row): Row => {
  const { tabs: _, pointed, ...rest } = root

  return { ...rest, ...(isRow(pointed) && typeof pointed.at === "string" ? { pointed: pointed.at } : pointed !== undefined && { pointed }) }
}

/** A list's rows by what names them across versions: their identity; undefined where it holds none. */
function namer(lists: Row[][]): ((row: Row) => string) | undefined {
  const id = identity(lists.filter((rows) => rows.length))

  return id ? (row) => JSON.stringify(inner(row)[id]) : undefined
}

/**
 * `known` with what changed from `was` to `now` made in it, and nothing else: what one party changed laid over what
 * another was last told, so that what others changed meanwhile stays to be told. Rows of a list by what names them; a
 * value of any other kind, as it is now.
 */
export function rebase(known: Json | undefined, was: Json | undefined, now: Json | undefined): Json | undefined {
  if (same(was, now)) return known
  if (same(known, was) || known === undefined || was === undefined || now === undefined) return now

  const rk = rowsOf(known)
  const rw = rowsOf(was)
  const rn = rowsOf(now)
  const name = rk && rw && rn ? namer([rk, rw, rn]) : undefined

  if (rk && rw && rn && name) {
    const k = new Map(rk.map((r) => [name(r), r]))
    const w = new Map(rw.map((r) => [name(r), r]))
    const rows = rn.flatMap((r) => (w.has(name(r)) && !k.has(name(r)) ? [] : [(k.has(name(r)) ? rebase(k.get(name(r)), w.get(name(r)), r) : r) as Row]))
    const kept = rk.filter((r) => !w.has(name(r)) && !rows.some((x) => name(x) === name(r)))

    return [...rows, ...kept] as Json
  }
  if (isRow(known) && isRow(was) && isRow(now) && !isHandle(now)) {
    const out: Row = {}

    for (const key of new Set([...Object.keys(known), ...Object.keys(now), ...Object.keys(was)])) {
      const v = rebase(known[key], was[key], now[key])

      if (v !== undefined) out[key] = v
    }

    return out as Json
  }

  return now
}

/** The root's open tabs, each by its path, its number and its heading; none where the view is not shaped as the shell's. */
export const tabsIn = (view: Json | undefined): { at: string; n?: number; heading: string }[] =>
  (tabsOf(view) ?? []).map((t) => ({ at: t.at, ...(typeof t.n === "number" && { n: t.n }), heading: heading(t) }))
/** The path of the open tab a path is in, by its address or its number; undefined where it is in none. */
export const tabAt = (view: Json | undefined, path: string): string | undefined => {
  const under = (at: string) => path === at || path.startsWith(`${at}/`)

  return tabsOf(view)?.find((t) => under(t.at) || (typeof t.n === "number" && under(`/tabs/${t.n}`)))?.at
}

/** Where in the root a path is: the open tab it is in, by its address or its number, said by its surface and address; else the path itself. */
export function placeOf(view: Json | undefined, path: string): string {
  const under = (at: string) => path === at || path.startsWith(`${at}/`)
  const tab = tabsOf(view)?.find((t) => under(t.at) || (typeof t.n === "number" && under(`/tabs/${t.n}`)))

  return tab ? (named(tab) ? tab.at : [typeof tab.surface === "string" && tab.surface, tab.at].filter(Boolean).join(" ")) : path
}

/** Whether a tab stands at its surface's name, /NAME, which then says its surface. */
const named = (tab: Tab) => typeof tab.surface === "string" && tab.at === `/${tab.surface}`

/**
 * A tab's one line: its path, its surface where the path does not say it, its title; and where it stands at its surface's
 * name, its number, so a tab opened again at the name reads as another.
 */
export const heading = (tab: Tab) =>
  [
    tab.at,
    !named(tab) && typeof tab.surface === "string" && tab.surface,
    typeof tab.title === "string" && JSON.stringify(tab.title),
    named(tab) && typeof tab.n === "number" && `(tab ${tab.n})`,
  ]
    .filter(Boolean)
    .join(" ")
const SAID = new Set(["at", "n", "surface", "title", "actions", "facts"])

/** What was left out as detail, by where: a list's label with how many of its rows, and each fact's label; and their keys. */
type Hid = { rows: Map<string, number>; facts: string[]; keys: string[] }

const hid = (): Hid => ({ rows: new Map(), facts: [], keys: [] })
/** How much detail was left out, in a few words: how many rows in which list, and which facts. */
const counted = (h: Hid, rows = "more in") =>
  [...[...h.rows].map(([label, n]) => `${n} ${rows} ${label || "the list"}`), ...(h.facts.length ? [`${[...new Set(h.facts)].join(", ")} in detail`] : [])].join(", ")
/** A view with its detail left out, as the present says it whole, and what was left out noted in `h`. */
function hidden(value: Json | undefined, h: Hid, label = ""): Json | undefined {
  if (Array.isArray(value)) {
    const kept = value.filter((v) => !isDetail(v))

    if (kept.length < value.length) h.rows.set(label, (h.rows.get(label) ?? 0) + value.length - kept.length)

    return kept.map((v) => hidden(v, h, label) ?? null)
  }
  if (!isRow(value)) return value

  const out: Row = {}

  for (const [k, v] of Object.entries(value))
    if (isDetail(v)) h.facts.push(join(label, k))
    else out[k] = hidden(v, h, join(label, k))

  return out as Json
}
/** A view's lines whole, its detail left out and counted in one line that says where it is read, then its handles' block. */
function told(value: Json | undefined, say: Say, where: string, label = "", out: string[] = []): string[] {
  const h = hid()
  const acts: Act[] = []

  said(hidden(value, h, label), say, label, out, say.command === undefined ? undefined : acts)
  if (h.rows.size || h.facts.length) out.push(`+${counted(h)}; read ${where}`)
  out.push(...block(acts, say))

  return out
}

/**
 * A tab under its heading, as the whole present says it: the rest of its row; its facts relative to it; its actions, a block
 * for each path they are offered at, its own and a pattern for its rows', each with its command, so acting needs no read;
 * then the root's handles its row offers, as the tab's close, in a block of their own.
 */
function tabLines(tab: Tab, say: Say): string[] {
  const out: string[] = []
  const acts: Act[] = []
  const gather = say.command === undefined ? undefined : acts

  for (const [k, v] of Object.entries(tab)) if (!SAID.has(k) && v !== undefined) said(revealed(v), say, k, out, gather)
  if (tab.facts !== undefined) told(tab.facts, say, tab.at, "", out)
  if (isOffered(tab.actions))
    for (const at of tab.actions)
      if (say.command === undefined) out.push(`actions at ${at.at}: ${at.offers.map((o) => o.name).join(", ")}`)
      else out.push(...block(at.offers.map(fromOffer), { ...say, path: at.at }))
  out.push(...block(acts, say))

  return out
}
/** The names of the actions a tab offers at its own path, for a line that tells it opened. */
const ownNames = (tab: Tab) => (isOffered(tab.actions) ? (tab.actions.find((a) => a.at === tab.at)?.offers.map((o) => o.name) ?? []) : [])

/**
 * The present whole: the root's own facts, then each open tab under its heading. A view not shaped as the shell's is told
 * as it is. Detail is left out, and how much of it there is said in one line with where to read it.
 */
export function whole(view: Json | undefined, say: Say = {}): string[] {
  const tabs = tabsOf(view)

  if (!tabs) return told(view, say, say.path ?? "/")

  return [...told(own(view as Row), say, "/"), ...tabs.flatMap((tab) => ["", heading(tab), ...tabLines(tab, say)])]
}

/** The identity of a list's rows across its versions: the first of IDENTITY that every row has, as a scalar, unique in each. */
function identity(lists: Row[][]): string | undefined {
  return IDENTITY.find((k) =>
    lists.every(
      (rows) =>
        rows.every((r) => typeof inner(r)[k] === "string" || typeof inner(r)[k] === "number") && new Set(rows.map((r) => inner(r)[k])).size === rows.length
    )
  )
}
/** A name as it reads after a label: bare where it is one word, quoted otherwise. */
const bare = (v: Json | undefined) => (typeof v === "number" || (typeof v === "string" && /^[\w./-]+$/.test(v)) ? String(v) : JSON.stringify(v))
const keyOf = (key: string, id: Json | undefined) => `${key}[${JSON.stringify(id)}]`

/**
 * The facts of a view by identity, for who changed what: a key per fact, where a row of a list is named by its identity, so a
 * row moved keeps its keys; and a key per list of rows for its order. A change covers the keys of `entries` below its own.
 */
export function entries(value: Json | undefined, key = "", out = new Map<string, string>()): Map<string, string> {
  if (!key) value = revealed(value)

  const rows = rowsOf(value)
  const id = rows?.length ? identity([rows]) : undefined

  if (isHandle(value)) out.set(key, call(value, {}))
  else if (rows?.length && id) {
    out.set(`${key}#order`, rows.map((r) => JSON.stringify(r[id])).join(","))
    for (const row of rows) entries(row, keyOf(key, row[id]), out)
  } else if (Array.isArray(value) && value.length && !value.every(isScalar)) for (const [i, v] of value.entries()) entries(v, `${key}[#${i}]`, out)
  else if (isRow(value) && Object.keys(value).length) {
    for (const [k, v] of Object.entries(value)) if (v !== undefined) entries(v, join(key, k), out)
  } else out.set(key, cell(value ?? null, {}))

  return out
}

/** Where a change is: how it is labelled, the key it covers, where it is read whole, its tab's heading. */
type At = { label: string; key: string; where: string; tab?: string; say: Say }

/** A long text cut, with how long it is and where it is read whole; any other value as a cell. */
const shown = (v: Json | undefined, at: At) =>
  typeof v === "string" && v.length > LONG ? `${JSON.stringify(v.slice(0, CUT))}… (${v.length} chars; read ${at.where})` : cell(v, at.say)
const long = (v: Json | undefined) => typeof v === "string" && v.length > LONG

/** One field's change, as it reads after a label: `a → b`, a long one as only its new value cut, standing prose as where to read it. */
function field(name: string, a: Json | undefined, b: Json | undefined, at: At): string {
  if (name.split(/[ .]/).at(-1) === STANDING)
    return a === undefined ? `+ ${name}; read ${at.where}` : b === undefined ? `- ${name}` : `${name} changed; read ${at.where}`
  if (a === undefined) return `+ ${name} ${shown(b, at)}`
  if (b === undefined) return `- ${name}`
  if (long(a) || long(b)) return `${name} → ${shown(b, at)}`

  return `${name} ${cell(a, at.say)} → ${cell(b, at.say)}`
}

/** What changed from `a` to `b`, at `at`, as changes on things. */
function walk(a: Json | undefined, b: Json | undefined, at: At, out: Change[]): Change[] {
  const push = (line: string, keys = [at.key], where = at.where) => out.push({ line, keys, where, ...(at.tab !== undefined && { tab: at.tab }) })
  const name = at.label.split(/[ .]/).at(-1)!

  if (same(a, b)) return out
  if (name === STANDING) {
    push(field(at.label, a, b, at))

    return out
  }
  // An action offered or withdrawn is told by its name: its command is read where it is offered.
  if (a === undefined) {
    if (isHandle(b)) push(`+ action ${b.name}`)
    else for (const line of lines(b, at.say, at.label)) push(`+ ${long(b) ? `${at.label}: ${shown(b, at)}` : line}`)

    return out
  }
  if (b === undefined) {
    push(isHandle(a) ? `- action ${a.name}` : `- ${at.label}`)

    return out
  }

  const ra = rowsOf(a)
  const rb = rowsOf(b)

  if (ra && rb && (ra.length || rb.length)) {
    const id = identity([ra, rb].filter((rows) => rows.length))

    if (id) return rowsChanged(ra, rb, id, at, out)
  }
  if (isHandle(b) || isHandle(a)) push(isHandle(a) && isHandle(b) ? `action ${b.name} changed; read ${at.where}` : `${at.label}: now ${isHandle(b) ? `action ${b.name}` : cell(b, at.say)}`)
  else if (isRow(a) && isRow(b)) {
    for (const k of [...Object.keys(b), ...Object.keys(a).filter((k) => !Object.hasOwn(b, k))])
      walk(a[k], b[k], { ...at, label: join(at.label, k), key: join(at.key, k) }, out)
  } else if (Array.isArray(a) && Array.isArray(b) && !(a.every(isScalar) && b.every(isScalar)))
    for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], { ...at, label: `${at.label}.${i}`, key: `${at.key}[#${i}]` }, out)
  else push(long(a) || long(b) ? `${at.label} → ${shown(b, at)}` : `${at.label}: ${cell(a, at.say)} → ${cell(b, at.say)}`)

  return out
}

/** A list of rows changed: each row removed, added or changed told once by its identity, and a new order in one line. */
function rowsChanged(a: Row[], b: Row[], id: string, at: At, out: Change[]): Change[] {
  const before = new Map(a.map((r) => [JSON.stringify(r[id]), r]))
  const now = new Map(b.map((r) => [JSON.stringify(r[id]), r]))
  const label = (r: Row) => (id === "at" ? String(r.at) : `${at.label} ${bare(r[id])}`)
  const where = (r: Row) => (typeof r.at === "string" ? r.at : at.where)
  const push = (line: string, keys: string[], here = at.where) => out.push({ line, keys, where: here, ...(at.tab !== undefined && { tab: at.tab }) })
  const added = b.filter((r) => !before.has(JSON.stringify(r[id])))

  for (const r of a.filter((r) => !now.has(JSON.stringify(r[id])))) {
    const named = Object.entries(r).find(([k, v]) => k !== id && typeof v === "string" && k !== "at")

    push(`- ${label(r)}${named ? ` ${JSON.stringify(String(named[1]).slice(0, 60))}` : ""}`, [keyOf(at.key, r[id])], where(r))
  }

  const several = added.length > 1 ? table(`+ ${at.label}`, added, at.say) : undefined

  if (several !== undefined) {
    push(several, added.map((r) => keyOf(at.key, r[id])))
    for (const r of added) for (const [k, v] of Object.entries(r)) if (isHandle(v)) push(`+ action ${call(v, at.say)}`, [`${keyOf(at.key, r[id])}.${k}`])
  } else
    for (const r of added) {
      const key = keyOf(at.key, r[id])
      const here: At = { ...at, key, where: where(r), label: label(r) }
      const flat = Object.entries(r).filter(([k, v]) => k !== id && v !== undefined && plain(v))

      const said = flat.map(([k, v]) => `${k} ${k === STANDING ? `read ${here.where}` : shown(v, here)}`).join(", ")

      push(`+ ${label(r)}${said ? `: ${said}` : ""}`, [key], here.where)
      for (const [k, v] of Object.entries(r))
        if (v !== undefined && !plain(v)) walk(undefined, v, { ...here, label: isHandle(v) ? k : `${here.label} ${k}`, key: `${key}.${k}` }, out)
    }
  for (const r of b) {
    const old = before.get(JSON.stringify(r[id]))

    if (!old || same(old, r)) continue

    const key = keyOf(at.key, r[id])
    const here: At = { ...at, key, where: where(r), label: label(r) }
    const fields = [...Object.keys(r), ...Object.keys(old).filter((k) => !Object.hasOwn(r, k))].filter((k) => !same(old[k], r[k]))
    const inline = fields.filter((k) => (old[k] === undefined || plain(old[k])) && (r[k] === undefined || plain(r[k])))

    if (inline.length) push(`${label(r)}: ${inline.map((k) => field(k, old[k], r[k], here)).join(", ")}`, inline.map((k) => `${key}.${k}`), here.where)
    for (const k of fields.filter((k) => !inline.includes(k)))
      walk(old[k], r[k], { ...here, label: isHandle(r[k]) || isHandle(old[k]) ? k : `${here.label} ${k}`, key: `${key}.${k}` }, out)
  }

  const kept = (rows: Row[], other: Map<string, Row>) => rows.map((r) => JSON.stringify(r[id])).filter((k) => other.has(k))
  const was = kept(a, now)
  const order = kept(b, before)

  // A reorder by what moved: the rows outside the longest run kept in order, each one line, or how many where many moved.
  if (!same(was, order)) {
    const stayed = longestKept(was, order)
    const moved = order.filter((k) => !stayed.has(k))
    const where = (k: string) => {
      const to = order.indexOf(k)

      return to === 0 ? "to the top" : to === order.length - 1 ? "to the end" : to < was.indexOf(k) ? "up" : "down"
    }

    if (moved.length > MOVED) push(`${at.label}: ${moved.length} rows moved; read ${at.where} for the order`, [`${at.key}#order`])
    else for (const k of moved) push(`${label(now.get(k)!)} moved ${where(k)}`, [`${at.key}#order`])
  }

  return out
}

/** How many rows moved are told one by one; more are told as how many. */
const MOVED = 3

/** The identities of the longest run that two orders share, in order: what stayed while the rest moved. */
function longestKept(a: string[], b: string[]): Set<string> {
  const run = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))

  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) run[i]![j] = a[i] === b[j] ? run[i + 1]![j + 1]! + 1 : Math.max(run[i + 1]![j]!, run[i]![j + 1]!)

  const out = new Set<string>()

  for (let i = 0, j = 0; i < a.length && j < b.length; )
    if (a[i] === b[j]) {
      out.add(a[i]!)
      i++
      j++
    } else if (run[i + 1]![j]! >= run[i]![j + 1]!) i++
    else j++

  return out
}

/**
 * Two versions of a value with their detail made plain where it is detail in only one, so that a row which became detail
 * is told as what changed in it; and left out of both where it is detail in each, or came or went as detail, noted in `h`
 * where it changed, under `key` as `entries` names it.
 */
function paired(a: Json | undefined, b: Json | undefined, h: Hid, key: string, label = "", row = false): [Json | undefined, Json | undefined] {
  const da = isDetail(a)
  const db = isDetail(b)

  if ((da || a === undefined) && (db || b === undefined) && (da || db)) {
    if (!same(a, b)) {
      if (row) h.rows.set(label, (h.rows.get(label) ?? 0) + 1)
      else h.facts.push(label)
      h.keys.push(key)
    }

    return [undefined, undefined]
  }
  if (da || db) return paired(da ? a.value : a, db ? b.value : b, h, key, label)

  const ra = a === undefined ? [] : rowsOf(a)
  const rb = b === undefined ? [] : rowsOf(b)

  if (ra && rb && (Array.isArray(a) || Array.isArray(b))) {
    const id = identity([ra, rb].filter((rows) => rows.length))

    if (!id) return [revealed(a), revealed(b)]

    const named = (rows: Row[]) => new Map(rows.map((r) => [JSON.stringify(inner(r)[id]), r]))
    const ma = named(ra)
    const mb = named(rb)
    const pairs = new Map([...new Set([...ma.keys(), ...mb.keys()])].map((k) => [k, paired(ma.get(k), mb.get(k), h, keyOf(key, JSON.parse(k)), label, true)]))
    const side = (rows: Row[], i: 0 | 1) => rows.flatMap((r) => (pairs.get(JSON.stringify(inner(r)[id]))![i] === undefined ? [] : [pairs.get(JSON.stringify(inner(r)[id]))![i]!]))

    return [a === undefined ? undefined : side(ra, 0), b === undefined ? undefined : side(rb, 1)]
  }
  if ((isRow(a) || a === undefined) && (isRow(b) || b === undefined)) {
    const oa: Row = {}
    const ob: Row = {}

    for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
      const [x, y] = paired((a as Row | undefined)?.[k], (b as Row | undefined)?.[k], h, join(key, k), join(label, k))

      if (x !== undefined) oa[k] = x
      if (y !== undefined) ob[k] = y
    }

    return [a === undefined ? undefined : (oa as Json), b === undefined ? undefined : (ob as Json)]
  }

  return [revealed(a), revealed(b)]
}

/**
 * A tab changed: opened, in one line, its heading and its actions by name, and where to read it; closed, in one line;
 * otherwise its row's changes, and its facts' relative to it, where detail that stays detail is only counted.
 */
function tabsChanged(a: Tab[], b: Tab[], say: Say, out: Change[]): Change[] {
  // A tab is its path and its number: one closed and another opened at the same path are two.
  const id = (t: Tab) => `${t.at} ${String(t.n)}`
  const before = new Map(a.map((t) => [id(t), t]))
  const now = new Set(b.map(id))

  for (const t of a.filter((t) => !now.has(id(t)))) out.push({ line: `- ${heading(t)} closed`, keys: [keyOf("tabs", t.at)], where: "/" })
  for (const t of b) {
    const old = before.get(id(t))
    const key = keyOf("tabs", t.at)

    if (!old) {
      if (say.opened === "whole") {
        out.push({ line: [`+ ${heading(t)}`, ...tabLines(t, say)].join("\n"), keys: [key], where: t.at, whole: true })
        continue
      }

      const actions = ownNames(t).length ? `, actions: ${ownNames(t).join(", ")}` : ""

      out.push({ line: `+ ${heading(t)}${actions}; read ${t.at}`, keys: [key], where: t.at })
      continue
    }
    if (same(old, t)) continue

    const at: At = { label: "", key, where: t.at, tab: heading(t), say }

    for (const k of [...Object.keys(t), ...Object.keys(old).filter((k) => !Object.hasOwn(t, k))]) {
      if (k === "facts" || same(old[k], t[k])) continue
      if (k === "actions" && isOffered(old[k]) && isOffered(t[k])) {
        const was = old[k] as Offered[]

        for (const place of t[k] as Offered[]) {
          const before = was.find((p) => p.at === place.at)?.offers ?? []

          // An action offered now, or changed, is told with its command, so acting on it needs no read; one withdrawn, by its name.
          const fresh = place.offers.filter((o) => !before.some((b) => same(b as Json, o as Json)))
          const gone = before.filter((b) => !place.offers.some((o) => o.name === b.name)).map((b) => `- ${b.name}`)
          const lines = [...(gone.length ? [`actions at ${place.at}: ${gone.join(", ")}`] : []), ...block(fresh.map(fromOffer), { ...say, path: place.at })]

          if (lines.length) out.push({ line: lines.join("\n"), keys: [`${key}.${k}`], where: t.at, tab: at.tab! })
        }
        for (const place of was.filter((p) => !(t[k] as Offered[]).some((x) => x.at === p.at)))
          out.push({ line: `actions at ${place.at}: none now`, keys: [`${key}.${k}`], where: t.at, tab: at.tab! })
      } else walk(old[k], t[k], { ...at, label: k, key: `${key}.${k}` }, out)
    }

    const h = hid()
    const [fa, fb] = paired(old.facts, t.facts, h, `${key}.facts`)

    walk(fa, fb, { ...at, key: `${key}.facts` }, out)
    if (h.keys.length) out.push({ line: `detail changed: ${counted(h, "in")}; read ${t.at}`, keys: h.keys, where: t.at, tab: at.tab! })
  }

  return out
}

/** What changed from `before` to `now`, two views at one path, as changes on things; the root's tabs each under its heading. */
export function diff(before: Json | undefined, now: Json | undefined, say: Say = {}): Change[] {
  const ta = tabsOf(before)
  const tb = tabsOf(now)

  if (!ta || !tb) {
    const h = hid()
    const [a, b] = paired(before, now, h, "")
    const out = walk(a, b, { label: "", key: "", where: say.path ?? "/", say }, [])

    if (h.keys.length) out.push({ line: `detail changed: ${counted(h, "in")}; read ${say.path ?? "/"}`, keys: h.keys, where: say.path ?? "/" })

    return out
  }

  // The root's own actions are the shell's standing ones, told whole: one offered once a tab is open is no event.
  const unhandled = (row: Row) => Object.fromEntries(Object.entries(row).filter(([, v]) => !isHandle(v))) as Row
  const out = walk(unhandled(own(before as Row)), unhandled(own(now as Row)), { label: "", key: "", where: "/", say }, [])

  return tabsChanged(ta, tb, say, out)
}

/**
 * Changes told: in groups by who made them, each group's head its own line, where `group` names one; in a group, the root's
 * own changes first, then each tab's under its heading, once. Past `cap` lines, how many more changed, in which tab, and
 * where to read them.
 */
export function tell(changes: Change[], group: (change: Change) => string | undefined = () => undefined, cap = CAP): string[] {
  const groups = new Map<string | undefined, Change[]>()

  for (const change of changes) groups.set(group(change), [...(groups.get(group(change)) ?? []), change])

  const out: string[] = []
  const left = new Map<string, number>()
  let room = true

  for (const [head, list] of groups) {
    const tabs = new Map<string | undefined, Change[]>([[undefined, []]])

    for (const change of list) tabs.set(change.tab, [...(tabs.get(change.tab) ?? []), change])

    let headed = false

    for (const [tab, items] of tabs)
      for (const [i, change] of items.entries()) {
        const take = [...(!headed && head !== undefined ? [head] : []), ...(i === 0 && tab !== undefined ? [tab] : []), change.line].join("\n").split("\n")

        if (change.whole || (room && out.length + take.length <= cap)) {
          out.push(...take)
          headed = true
        } else {
          room = false

          const place = tab === undefined ? "/" : tab.replace(/^\+ /, "").split(" ")[0]!

          left.set(place, (left.get(place) ?? 0) + 1)
        }
      }
  }
  if (left.size) {
    const more = [...left.values()].reduce((s, n) => s + n, 0)

    out.push(`… and ${more} more changes: ${[...left].map(([place, n]) => `${n} at ${place}`).join(", ")}; read there for them`)
  }

  return out
}
