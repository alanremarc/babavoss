// Present: a view as the agent reads it, whole or as what changed, as pure functions of views. Whole, a view is relative
// facts, lists of objects as tables and each handle as the command that calls it; the root's tabs are each one heading
// with its facts under it. A change is told as an event on a thing: a row of a list by its identity, not its index; a
// tab once, as its heading; standing prose and long texts by where to read them. Who made a change is the caller's to say.
import type { Handle, Json } from "../surface/view.ts"

/** The fields that name a row of a list, in order: the first every row has, unique in its list, is its identity; else its index. */
export const IDENTITY = ["at", "n", "id", "name", "key"]
/** The name of standing prose: how a surface is worked, told whole only in the whole present, since it holds whatever changes. */
export const STANDING = "how"
/** A text longer than this is told in a change cut, with where to read it whole. */
export const LONG = 200
/** The most lines one telling of changes takes; past it, how much more changed, and where. */
export const CAP = 40

const CUT = 100

/** How handles are said: as the command that calls them at `path`; without a command, as their name and arguments. */
export type Say = { command?: string; path?: string }
/** One change: its line or lines; the keys of `entries` it covers, for who made it; where it is read whole; and its tab's heading. */
export type Change = { line: string; keys: string[]; where: string; tab?: string }

type Row = { [key: string]: Json | undefined }

const isHandle = (v: Json | undefined): v is Handle => !!v && typeof v === "object" && !Array.isArray(v) && v.kind === "handle"
const isRow = (v: Json | undefined): v is Row => !!v && typeof v === "object" && !Array.isArray(v) && !isHandle(v)
const isScalar = (v: Json | undefined) => v === null || v === undefined || typeof v !== "object"
const rowsOf = (v: Json | undefined): Row[] | undefined => (Array.isArray(v) && v.every(isRow) ? (v as Row[]) : undefined)
const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a) === JSON.stringify(b)
const join = (label: string, key: string) => (label ? `${label}.${key}` : key)

/** A handle as a line's value: the command that calls it and what it does, or its name and arguments. */
function call(h: Handle, say: Say): string {
  if (say.command === undefined)
    return [
      h.name,
      Object.keys(h.args).length ? ` ${JSON.stringify(h.args)}` : "",
      Object.keys(h.open).length ? ` + ${Object.entries(h.open).map(([k, t]) => `${k}:${t}`).join(", ")}` : "",
    ].join("")

  const args = [...Object.entries(h.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`), ...Object.entries(h.open).map(([k, t]) => `${k}=${t}`)]

  return `${[say.command, say.path ?? "/", h.name, ...args].join(" ")}   ${h.description}`
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

/** A view whole, relative to where it was read: one line per fact, a table per list of plain rows, a line per handle. */
export function lines(value: Json | undefined, say: Say = {}, label = "", out: string[] = []): string[] {
  const rows = rowsOf(value)

  if (isHandle(value)) out.push(`${label || value.name}: ${call(value, say)}`)
  else if (rows?.length) {
    const told = table(label, rows, say)

    if (told !== undefined) {
      out.push(told)
      // A row's handles follow its table, each named as itself: the command's arguments say which row it is of.
      for (const row of rows) for (const [k, v] of Object.entries(row)) if (isHandle(v)) out.push(`${k}: ${call(v, say)}`)
    } else {
      const id = identity([rows])

      for (const [i, row] of rows.entries()) lines(row, say, `${label} ${id ? bare(row[id]) : `#${i}`}`.trim(), out)
    }
  } else if (Array.isArray(value) && value.length && !value.every(isScalar)) for (const [i, v] of value.entries()) lines(v, say, `${label}.${i}`, out)
  else if (isRow(value) && Object.values(value).some((v) => v !== undefined)) {
    for (const [k, v] of Object.entries(value)) if (v !== undefined) lines(v, say, join(label, k), out)
  } else out.push(`${label}: ${isRow(value) ? "{}" : cell(value ?? null, say)}`)

  return out
}

/** The root at / looks like the shell's: tabs, each a row with its path under `at`, its facts under `facts`. */
type Tab = Row & { at: string; facts?: Json }
const tabsOf = (view: Json | undefined): Tab[] | undefined => {
  const tabs = isRow(view) ? rowsOf(view.tabs) : undefined

  return tabs?.every((t) => typeof t.at === "string") ? (tabs as Tab[]) : undefined
}
/** A tab's one line: its path, its surface and its title. */
export const heading = (tab: Tab) =>
  [tab.at, typeof tab.surface === "string" && tab.surface, typeof tab.title === "string" && JSON.stringify(tab.title)].filter(Boolean).join(" ")
const names = (v: Json | undefined) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ") : "")
const SAID = new Set(["at", "n", "surface", "title", "actions", "facts"])

/** A tab under its heading, as the whole present says it: its actions by name, the rest of its row, then its facts relative to it. */
function tabLines(tab: Tab, say: Say): string[] {
  const out: string[] = []

  if (Array.isArray(tab.actions) && tab.actions.length) out.push(`actions: ${names(tab.actions)}   each one's command is at ${tab.at}`)
  for (const [k, v] of Object.entries(tab)) if (!SAID.has(k) && v !== undefined) lines(v, say, k, out)
  if (tab.facts !== undefined) lines(tab.facts, say, "", out)

  return out
}

/** The present whole: the root's own facts, then each open tab under its heading. A view not shaped as the shell's is told as it is. */
export function whole(view: Json | undefined, say: Say = {}): string[] {
  const tabs = tabsOf(view)

  if (!tabs) return lines(view, say)

  const { tabs: _, ...rest } = view as Row

  return [...lines(rest, say), ...tabs.flatMap((tab) => ["", heading(tab), ...tabLines(tab, say)])]
}

/** The identity of a list's rows across its versions: the first of IDENTITY that every row has, as a scalar, unique in each. */
function identity(lists: Row[][]): string | undefined {
  return IDENTITY.find((k) =>
    lists.every((rows) => rows.every((r) => typeof r[k] === "string" || typeof r[k] === "number") && new Set(rows.map((r) => r[k])).size === rows.length)
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
  if (a === undefined) {
    for (const line of lines(b, at.say, at.label)) push(`+ ${long(b) ? `${at.label}: ${shown(b, at)}` : line}`)

    return out
  }
  if (b === undefined) {
    push(`- ${at.label}`)

    return out
  }

  const ra = rowsOf(a)
  const rb = rowsOf(b)

  if (ra && rb && (ra.length || rb.length)) {
    const id = identity([ra, rb].filter((rows) => rows.length))

    if (id) return rowsChanged(ra, rb, id, at, out)
  }
  if (isHandle(b)) push(`${at.label}: ${call(b, at.say)}`)
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
  const short = (r: Row) => bare(r.n ?? r.id ?? r.name ?? r.key ?? (id === "at" ? String(r.at).split("/").at(-1) : r[id]))
  const added = b.filter((r) => !before.has(JSON.stringify(r[id])))

  for (const r of a.filter((r) => !now.has(JSON.stringify(r[id])))) {
    const named = Object.entries(r).find(([k, v]) => k !== id && typeof v === "string" && k !== "at")

    push(`- ${label(r)}${named ? ` ${JSON.stringify(String(named[1]).slice(0, 60))}` : ""}`, [keyOf(at.key, r[id])], where(r))
  }

  const several = added.length > 1 ? table(`+ ${at.label}`, added, at.say) : undefined

  if (several !== undefined) {
    push(several, added.map((r) => keyOf(at.key, r[id])))
    for (const r of added) for (const [k, v] of Object.entries(r)) if (isHandle(v)) push(`+ ${k}: ${call(v, at.say)}`, [`${keyOf(at.key, r[id])}.${k}`])
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
  const order = kept(b, before)

  if (!same(kept(a, now), order)) {
    const ids = b.map(short)

    push(`${at.label}: order now ${ids.length > 20 ? `${ids.slice(0, 20).join(", ")}, …` : ids.join(", ")}`, [`${at.key}#order`])
  }

  return out
}

/**
 * A tab changed: opened, whole under its heading, its standing prose with it, since the agent has not read it; closed, in
 * one line; otherwise its row's changes, and its facts' relative to it.
 */
function tabsChanged(a: Tab[], b: Tab[], say: Say, out: Change[]): Change[] {
  const before = new Map(a.map((t) => [t.at, t]))
  const now = new Set(b.map((t) => t.at))

  for (const t of a.filter((t) => !now.has(t.at))) out.push({ line: `- ${heading(t)} closed`, keys: [keyOf("tabs", t.at)], where: "/" })
  for (const t of b) {
    const old = before.get(t.at)
    const key = keyOf("tabs", t.at)

    if (!old) {
      for (const line of tabLines(t, say)) out.push({ line, keys: [key], where: t.at, tab: `+ ${heading(t)}` })
      continue
    }
    if (same(old, t)) continue

    const at: At = { label: "", key, where: t.at, tab: heading(t), say }

    for (const k of [...Object.keys(t), ...Object.keys(old).filter((k) => !Object.hasOwn(t, k))]) {
      if (k === "facts" || same(old[k], t[k])) continue
      if (k === "actions" && Array.isArray(old[k]) && Array.isArray(t[k])) {
        const was = (old[k] as Json[]).map(String)
        const is = (t[k] as Json[]).map(String)
        const moved = [...is.filter((x) => !was.includes(x)).map((x) => `+ ${x}`), ...was.filter((x) => !is.includes(x)).map((x) => `- ${x}`)]

        out.push({ line: `actions: ${moved.join(", ") || `order now ${is.join(", ")}`}`, keys: [`${key}.${k}`], where: t.at, tab: at.tab! })
      } else walk(old[k], t[k], { ...at, label: k, key: `${key}.${k}` }, out)
    }
    walk(old.facts, t.facts, { ...at, key: `${key}.facts` }, out)
  }

  return out
}

/** What changed from `before` to `now`, two views at one path, as changes on things; the root's tabs each under its heading. */
export function diff(before: Json | undefined, now: Json | undefined, say: Say = {}): Change[] {
  const ta = tabsOf(before)
  const tb = tabsOf(now)

  if (!ta || !tb) return walk(before, now, { label: "", key: "", where: say.path ?? "/", say }, [])

  const { tabs: _a, ...a } = before as Row
  const { tabs: _b, ...b } = now as Row
  const out = walk(a, b, { label: "", key: "", where: "/", say }, [])

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

        if (room && out.length + take.length <= cap) {
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
