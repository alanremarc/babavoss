// How the shell's model is kept in its root's state directory: not as one file but as the shell's own part and a folder
// per open tab, so a commit writes only what it changed and a tab's log is appended, never rewritten.
//
//   shell.json            the shell's own: the open tabs, each without its state, the next number, the opened marks, the
//                         closed tabs it remembers; written whole, only when it changed
//   log.jsonl             the shell's own entries, one a line, appended
//   tabs/N/about.json     what the tab is: its surface, when it opened; written once, as it opens
//   tabs/N/state.json     the tab's model, written whole when it changed, and only then
//   tabs/N/log.jsonl      the tab's entries, one a line, appended
//   closed/N/             a closed tab, moved here whole as it closes, read only (archive.ts)
//
// A file written whole is written to a temporary one, flushed and renamed over it; a line is appended, and a line a crash
// cut is skipped when read, and ended before the next is appended. An entry folded again, as the world's in a row are, is
// appended again under its number, and read as its last line. A log past LOG_BYTES is moved aside to log.1.jsonl, the one
// before it dropped: a tab keeps at most twice that. The model holds the newest KEPT entries of each tab (activity.ts); the
// rest are on disk, for the archive to read once the tab closed. The writes go in this order, so a crash between two
// loses nothing: the tabs' states, the logs, a closed tab moved, and last the shell's own; a tab's folder that shell.json does
// not list, left by a crash as it opened, is moved to the archive as it loads. Every folder made is 0700, every file 0600.
// A session kept from before, in one model.json, is read once and written out so, then that file is removed (`migrate`).
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { readJsonFile, writeJsonFile, writeTextFile } from "../../core/state/json-file.ts"
import type { Ports } from "../../core/surface/run.ts"
import { KEPT, tabOfEntry, type Entry } from "./activity.ts"
import type { ShellModel, Tab } from "./surface.ts"

export const SHELL_FILE = "shell.json"
/** The one file a session's shell was kept in before. */
export const OLD_FILE = "model.json"
export const LOG = "log.jsonl"
export const OLDER = "log.1.jsonl"
export const ABOUT = "about.json"
export const STATE = "state.json"
/** How long a log grows before it is moved aside, the one before it dropped. */
export const LOG_BYTES = 1_000_000

/** What a tab's folder says of it: its number and surface, whether it held its surface's name, and when it opened. */
export type TabAbout = { n: number; surface: string; named?: true; opened?: number }

export const tabsDir = (dir: string) => join(dir, "tabs")
export const tabDir = (dir: string, n: number) => join(tabsDir(dir), String(n))

const own = { own: true }
/** What a folder holds, by name; nothing where it is not there. */
export const listed = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** A log's entries as written, oldest first: its older part, then its own; a line that does not read is skipped, and an entry written again is its last line. */
export function readLog(dir: string): { n: number }[] {
  const byN = new Map<number, { n: number }>()

  for (const file of [OLDER, LOG]) {
    let text: string

    try {
      text = readFileSync(join(dir, file), "utf8")
    } catch {
      continue
    }
    for (const line of text.split("\n")) {
      if (!line) continue
      try {
        const e = JSON.parse(line) as { n?: unknown }

        if (e && typeof e.n === "number") byN.set(e.n, e as { n: number })
      } catch {}
    }
  }

  return [...byN.values()].sort((a, b) => a.n - b.n)
}

/** Ends a log whose last line a crash cut, so the next line appended is a line of its own. */
function mend(file: string): void {
  let fd: number | undefined

  try {
    const size = statSync(file).size

    if (!size) return
    fd = openSync(file, "r")

    const last = Buffer.alloc(1)

    readSync(fd, last, 0, 1, size - 1)
    if (last[0] !== 0x0a) appendFileSync(file, "\n")
  } catch {
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** Appends lines to the log in `dir`, moving it aside first where it has grown past `bound`. */
function append(dir: string, lines: string, bound: number): void {
  const file = join(dir, LOG)

  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) >= bound) renameSync(file, join(dir, OLDER))
  appendFileSync(file, lines, { mode: 0o600 })
}

/**
 * Moves an open tab's folder to the archive of closed tabs, with what is known of how it closed added to its about.json:
 * a folder that is gone already is left so.
 */
export function archiveTab(dir: string, n: number, closing: Record<string, unknown>): void {
  const from = tabDir(dir, n)

  if (!existsSync(from)) return

  const about = (() => {
    try {
      return readJsonFile<Record<string, unknown>>(join(from, ABOUT)) ?? {}
    } catch {
      return {}
    }
  })()

  writeJsonFile(join(from, ABOUT), { ...about, ...closing, n }, own)
  mkdirSync(join(dir, "closed"), { recursive: true, mode: 0o700 })

  const to = join(dir, "closed", String(n))

  renameSync(from, existsSync(to) ? `${to}-${Date.now()}` : to)
}

/** The shell's own part of its model: the tabs without their state, and no entries. */
const ownPart = (model: ShellModel) => {
  const { activity: _, tabs, ...rest } = model

  return { ...rest, tabs: tabs.map(({ model: __, ...tab }) => tab) }
}

/** What is known of how tab n closed, from the shell's memory of it; that the shell let it go, where it remembers none. */
const closingOf = (model: ShellModel, n: number, now: number): Record<string, unknown> => {
  const was = model.closed?.findLast((c) => c.n === n)

  if (!was) return { closed: now, by: "shell" }

  const { n: _, named: __, ...rest } = was

  return { ...rest, closed: was.closed ?? now }
}

/**
 * Writes a session kept in the one file of before out in this layout, and removes that file once all of it is written: each
 * tab's state and entries in its folder, the shell's own in its part. What a crash leaves half done is done again from the
 * file, which is removed last.
 */
export function migrate(dir: string): void {
  const file = join(dir, OLD_FILE)
  const saved = readJsonFile<{ model?: Record<string, unknown> }>(file)
  const model = saved?.model
  const tabs = Array.isArray(model?.tabs) ? (model.tabs as { n?: unknown; surface?: unknown; util?: unknown; named?: unknown; model?: unknown }[]) : []
  const entries = Array.isArray(model?.activity) ? (model.activity as { n?: unknown; own?: true; at?: unknown }[]) : []
  const logs = new Map<number | undefined, string[]>()

  for (const e of entries) {
    if (!e || typeof e.n !== "number" || typeof e.at !== "string") continue

    const tab = tabOfEntry({ own: e.own, at: e.at })

    logs.set(tab, [...(logs.get(tab) ?? []), `${JSON.stringify(e)}\n`])
  }
  for (const t of tabs) {
    if (typeof t?.n !== "number") continue

    const surface = typeof t.surface === "string" ? t.surface : typeof t.util === "string" ? t.util : undefined

    writeJsonFile(join(tabDir(dir, t.n), ABOUT), { n: t.n, ...(surface && { surface }), ...(t.named === true && { named: true }) }, own)
    if (t.model !== undefined) writeJsonFile(join(tabDir(dir, t.n), STATE), t.model, own)
    writeTextFile(join(tabDir(dir, t.n), LOG), (logs.get(t.n) ?? []).join(""), own)
  }
  writeTextFile(join(dir, LOG), (logs.get(undefined) ?? []).join(""), own)

  const { activity: _, tabs: __, ...rest } = model ?? {}

  writeJsonFile(join(dir, SHELL_FILE), { ...rest, tabs: tabs.map(({ model: ___, ...tab }) => tab) }, own)
  rmSync(file, { force: true })
}

/**
 * The ports that keep the shell's model in `dir` in this layout. `now` stamps a tab closed with no time of its own, as one
 * the shell let go of as it loaded.
 */
export function shellKeep(dir: string, now: () => number = Date.now, logBytes: number = LOG_BYTES): Pick<Ports<ShellModel>, "load" | "save"> {
  /** Each open tab's model as last written, by reference, and a hash of its text, which tells a model restored apart from one changed. */
  const states = new Map<number, unknown>()
  const hashes = new Map<number, bigint | number>()
  /** Entries known to be on disk as they are; and, after a load, the hash of each line read, for entries restored anew. */
  const written = new WeakSet<object>()
  const read = new Map<number, bigint | number>()
  let shellText: string | undefined

  return {
    load() {
      if (!existsSync(join(dir, SHELL_FILE))) {
        if (!existsSync(join(dir, OLD_FILE))) return undefined
        migrate(dir)
      }

      const shell = readJsonFile<Omit<ShellModel, "tabs" | "activity"> & { tabs?: Omit<Tab, "model">[] }>(join(dir, SHELL_FILE))
      const metas = Array.isArray(shell?.tabs) ? shell.tabs : []
      const open = new Set(metas.map((t) => t.n))

      // A tab's folder no tab of the shell's names was left by a crash as it opened: it goes to the archive.
      for (const name of listed(tabsDir(dir))) if (!open.has(Number(name))) archiveTab(dir, Number(name), { closed: now(), by: "shell" })

      const logs = [dir, ...metas.map((t) => tabDir(dir, t.n))]
      const entries: { n: number }[] = []

      for (const at of logs) {
        mend(join(at, LOG))
        entries.push(...readLog(at).slice(-KEPT))
      }
      for (const e of entries) read.set(e.n, Bun.hash(JSON.stringify(e)))

      const tabs = metas.map((t) => {
        let text: string | undefined

        try {
          text = readFileSync(join(tabDir(dir, t.n), STATE), "utf8")
        } catch {}

        const model: unknown = text === undefined ? undefined : JSON.parse(text)

        if (text !== undefined) hashes.set(t.n, Bun.hash(JSON.stringify(model ?? null, null, 2)))
        states.set(t.n, model)

        return { ...t, model }
      })

      shellText = JSON.stringify(shell)

      return { model: { ...shell, tabs, activity: entries.sort((a, b) => a.n - b.n) } }
    },
    save({ model }) {
      // The tabs' states, each where it changed.
      for (const tab of model.tabs) {
        if (states.has(tab.n) && states.get(tab.n) === tab.model) continue

        const text = JSON.stringify(tab.model ?? null, null, 2)
        const hash = Bun.hash(text)

        if (!existsSync(join(tabDir(dir, tab.n), ABOUT)))
          writeJsonFile(
            join(tabDir(dir, tab.n), ABOUT),
            { n: tab.n, surface: tab.surface, ...(tab.named && { named: true }), ...(tab.opened !== undefined && { opened: tab.opened }) },
            own
          )
        if (hashes.get(tab.n) !== hash) writeTextFile(join(tabDir(dir, tab.n), STATE), text, own)
        states.set(tab.n, tab.model)
        hashes.set(tab.n, hash)
      }

      // The entries new or folded since, each appended to its tab's log, or the shell's.
      const lines = new Map<number | undefined, string>()

      for (const e of (model.activity ?? []) as Entry[]) {
        if (written.has(e)) continue
        written.add(e)

        const line = JSON.stringify(e)
        const was = read.get(e.n)

        read.delete(e.n)
        if (was !== undefined && was === Bun.hash(line)) continue

        const tab = tabOfEntry(e)

        lines.set(tab, `${lines.get(tab) ?? ""}${line}\n`)
      }
      for (const [tab, text] of lines) append(tab === undefined ? dir : tabDir(dir, tab), text, logBytes)

      // A tab no longer open goes to the archive, with how it closed.
      const open = new Set(model.tabs.map((t) => t.n))

      for (const n of [...states.keys()])
        if (!open.has(n)) {
          archiveTab(dir, n, closingOf(model, n, now()))
          states.delete(n)
          hashes.delete(n)
        }

      // The shell's own part, last, where it changed.
      const text = JSON.stringify(ownPart(model))

      if (text !== shellText) {
        writeTextFile(join(dir, SHELL_FILE), text, own)
        shellText = text
      }
    },
  }
}
