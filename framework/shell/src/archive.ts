// The archive of closed tabs: a tab closed is moved whole to its root's closed/N (keep.ts), its state and its log with an
// about.json that says its surface, its title, when it opened and closed and who closed it. It is read only: a closed tab is
// never opened again with its state, and the agent reads its log at /activity/closed/N.
//
// It clears itself. A rolling window, the person's settings (`days`, `megabytes`): a closed tab goes once it closed `days`
// ago, and the oldest first once the project's archive is past `megabytes`. A session that is over goes the same way, its
// whole folder: one whose harness said it ended (the hook leaves `ended` in its folder), or whose folder nothing wrote in for
// `days`; it counts from then. The sweep runs as a runtime starts, at most once a day for the project, under the project's
// lock, so two runtimes never sweep at once. It never touches a live session: of the sessions, it touches its own runtime's
// closed tabs, and another session only while it holds the locks of all of its roots, which a runtime serving it would hold.
// What a surface keeps beside its tabs is the session's, and goes only with the session's folder: the queue's work.json; what
// a surface keeps outside the sessions, as the lab's runs, is not the archive's.
//
// The person clears it too, from the settings: the closed tabs of this session; or of the whole project, every session no
// runtime serves, the folders of those over included, with this session's own.
import { closeSync, existsSync, lstatSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { readJsonFile } from "../../core/state/json-file.ts"
import { holdLock } from "../../core/runtime/service.ts"
import { entriesFrom, type Entry } from "./activity.ts"
import { ENDED } from "../../core/state/session-dir.ts"
import type { Ports } from "../../core/surface/run.ts"
import { readSettings, settingsFile } from "../settings/src/store.ts"
import { ABOUT, listed, readLog, shellKeep } from "./keep.ts"

/** What the archive keeps of a closed tab: its surface, the title it had, when it opened and closed, and who closed it, the shell where it let it go. */
export type About = { n: number; surface: string; title?: string; opened?: number; closed: number; by: "person" | "agent" | "shell" }
/** A closed tab as read: what it was, and how many entries its log keeps and how many bytes it takes. */
export type Archived = About & { entries: number; bytes: number }
/** How the archive clears itself: closed tabs older than `days`, and the oldest first past `megabytes` for the project. */
export type Window = { days: number; megabytes: number }

export const DAY_MS = 24 * 60 * 60 * 1000
/** The project's files of the sweep: its lock, and the file whose time says when it last ran. */
const SWEEP_LOCK = "sweep.lock"
const SWEPT = "swept"

const closedDir = (root: string) => join(root, "closed")

/** The bytes a path takes: a file's size, a folder's files' sizes, a link's nothing. */
export function bytesOf(path: string): number {
  const stat = lstatSync(path, { throwIfNoEntry: false })

  if (!stat) return 0
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0

  return listed(path).reduce((sum, name) => sum + bytesOf(join(path, name)), 0)
}

/** The newest time anything in a folder, or a folder below it, was written. */
function newestIn(path: string): number {
  const stat = lstatSync(path, { throwIfNoEntry: false })

  if (!stat) return 0
  if (!stat.isDirectory()) return stat.mtimeMs

  return listed(path).reduce((newest, name) => Math.max(newest, newestIn(join(path, name))), stat.mtimeMs)
}

/** What about.json says, where it reads as one; a folder with none is of a tab closed by a crash, closed as it was last written. */
function aboutOf(folder: string): About | undefined {
  const n = Number(basename(folder).split("-")[0])

  if (!Number.isInteger(n)) return undefined

  let kept: Partial<About> | undefined

  try {
    kept = readJsonFile<Partial<About>>(join(folder, ABOUT))
  } catch {}

  const closed = typeof kept?.closed === "number" ? kept.closed : newestIn(folder)
  const by = kept?.by === "person" || kept?.by === "agent" ? kept.by : "shell"

  return {
    n,
    surface: typeof kept?.surface === "string" ? kept.surface : "unknown",
    ...(typeof kept?.title === "string" && { title: kept.title }),
    ...(typeof kept?.opened === "number" && { opened: kept.opened }),
    closed,
    by,
  }
}

/** The closed tabs of a root's state directory, the latest closed first. */
export function closedTabs(root: string): (Archived & { folder: string })[] {
  return listed(closedDir(root))
    .flatMap((name) => {
      const folder = join(closedDir(root), name)
      const about = aboutOf(folder)

      return about ? [{ ...about, entries: readLog(folder).length, bytes: bytesOf(folder), folder }] : []
    })
    .sort((a, b) => b.closed - a.closed || b.n - a.n)
}

/** The log of closed tab n, oldest first, every entry it keeps; undefined where the archive has no such tab. */
export function closedLog(root: string, n: number): Entry[] | undefined {
  const tab = closedTabs(root).find((t) => t.n === n)

  return tab && entriesFrom(readLog(tab.folder))
}

/** The archive a shell reads, once its runtime has given it its state directory; until then, as in a spec, an empty one. */
export type Archive = { closed(): Archived[]; log(n: number): Entry[] | undefined }
export const archiveOf = (root: () => string | undefined): Archive => ({
  closed: () => {
    const at = root()

    return at ? closedTabs(at).map(({ folder: _, ...tab }) => tab) : []
  },
  log: (n) => {
    const at = root()

    return at ? closedLog(at, n) : undefined
  },
})

/** What the archive holds that may go: a closed tab, or the whole folder of a session that is over; when it closed or ended, and its size. */
type Item = { path: string; session: string; when: number; bytes: number; tabs: number; whole: boolean }

/** A session's folder: whether it is over, and since when; its roots' closed tabs. */
type Session = { path: string; over?: number; tabs: Item[] }

/**
 * Whether a session is over, and since when: its harness said it ended, or nothing was written in its folder for `days`.
 * Undefined while it may go on.
 */
function overSince(path: string, now: number, window: Window): number | undefined {
  const ended = statSync(join(path, ENDED), { throwIfNoEntry: false })

  if (ended) return ended.mtimeMs

  const newest = newestIn(path)

  return now - newest > window.days * DAY_MS ? newest : undefined
}

/** The project's sessions, by their folders under `home`, each with its closed tabs. */
function sessionsOf(home: string, now: number, window: Window): Session[] {
  const sessions = join(home, "sessions")

  return listed(sessions).flatMap((name) => {
    const path = join(sessions, name)

    if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) return []

    const tabs = listed(path).flatMap((root) =>
      closedTabs(join(path, root)).map((t): Item => ({ path: t.folder, session: path, when: t.closed, bytes: t.bytes, tabs: 1, whole: false }))
    )

    return [{ path, over: overSince(path, now, window), tabs }]
  })
}

/**
 * Holds the locks of every root of a session no runtime serves, and calls `fn` while it holds them; undefined, and nothing
 * called, where a runtime serves it, as one of the locks is held.
 */
function whileIdle<T>(session: string, fn: () => T): T | undefined {
  const held: number[] = []

  try {
    for (const root of listed(session)) {
      const lock = join(session, root, "service.lock")

      if (!existsSync(lock)) continue

      const fd = holdLock(lock)

      if (fd === undefined) return undefined
      held.push(fd)
    }

    return fn()
  } finally {
    for (const fd of held) closeSync(fd)
  }
}

/** What a clear or a sweep took away: how many closed tabs, how many sessions' folders, and the bytes freed. */
export type Freed = { tabs: number; sessions: number; bytes: number }
const none = (): Freed => ({ tabs: 0, sessions: 0, bytes: 0 })

/** Removes what may go, each item of a session other than `own` only while no runtime serves it; what it removed. */
function remove(items: Item[], own: string): Freed {
  const freed = none()
  const bySession = Map.groupBy(items, (item) => item.session)

  for (const [session, of] of bySession) {
    const take = () => {
      for (const item of of) {
        if (!existsSync(item.path)) continue
        rmSync(item.path, { recursive: true, force: true })
        freed.bytes += item.bytes
        if (item.whole) freed.sessions++
        freed.tabs += item.tabs
      }
    }

    if (session === own) take()
    else whileIdle(session, take)
  }

  return freed
}

/** A session that is over taken whole: its closed tabs, every root's, counted in it. */
const whole = (s: Session): Item => ({ path: s.path, session: s.path, when: s.over!, bytes: bytesOf(s.path), tabs: s.tabs.length, whole: true })

/**
 * The items a sweep takes at `now`: the closed tabs past the window and the sessions over for longer, then the oldest of
 * the rest while the archive is past its size. The session `own` is never over, as its runtime serves it.
 */
function due(sessions: Session[], own: string, now: number, window: Window): Item[] {
  const items = sessions.flatMap((s) => (s.path !== own && s.over !== undefined ? [whole(s)] : s.tabs)).sort((a, b) => a.when - b.when)
  const cutoff = now - window.days * DAY_MS
  const cap = window.megabytes * 1_000_000
  let total = items.reduce((sum, item) => sum + item.bytes, 0)

  return items.filter((item) => {
    if (item.when >= cutoff && total <= cap) return false
    total -= item.bytes

    return true
  })
}

/**
 * The sweep of the project whose home is `home`, from the runtime serving the session `own`: at most once a day, and never
 * while another runtime of the project sweeps. What it removed; undefined where it did not run.
 */
export function sweep(home: string, own: string, window: Window, now = Date.now()): Freed | undefined {
  const swept = join(home, SWEPT)
  const last = statSync(swept, { throwIfNoEntry: false })?.mtimeMs

  if (last !== undefined && now - last < DAY_MS && last <= now) return undefined

  const fd = holdLock(join(home, SWEEP_LOCK))

  if (fd === undefined) return undefined
  try {
    // Another runtime may have swept between the look and the lock.
    const again = statSync(swept, { throwIfNoEntry: false })?.mtimeMs

    if (again !== undefined && again !== last && now - again < DAY_MS) return undefined
    writeFileSync(swept, "", { mode: 0o600 })
    utimesSync(swept, now / 1000, now / 1000)

    // A session another runtime serves is not counted: what it keeps is its runtime's to sweep as it starts.
    const sessions = sessionsOf(home, now, window).filter((s) => s.path === own || !serves(s.path))

    return remove(due(sessions, own, now, window), own)
  } finally {
    closeSync(fd)
  }
}

/** What a clear would free, or freed: of this session, its closed tabs; of the project, those of every session no runtime serves too, and the folders of those over. */
export type Measure = { session: Freed; project: Freed & { running: number } }

/** Whether a runtime serves a session now, as its endpoints say: a look, not a lock, for what a clear would free. */
const serves = (session: string): boolean =>
  listed(session).some((root) => {
    try {
      const endpoint = readJsonFile<{ pid?: unknown }>(join(session, root, "service.json"))

      return typeof endpoint?.pid === "number" && process.kill(endpoint.pid, 0)
    } catch {
      return false
    }
  })

/** What clearing would take: this session's closed tabs; and, for the project, also every session no runtime serves, whole where it is over. */
function clearable(home: string, own: string, window: Window, now: number): { session: Item[]; project: Item[]; running: number } {
  const sessions = sessionsOf(home, now, window)
  const mine = sessions.find((s) => s.path === own)?.tabs ?? []
  const others = sessions.filter((s) => s.path !== own)
  const idle = others.filter((s) => !serves(s.path))

  return {
    session: mine,
    project: [...mine, ...idle.flatMap((s) => (s.over !== undefined ? [whole(s)] : s.tabs))],
    running: others.length - idle.length,
  }
}

const sum = (items: Item[]): Freed => ({
  tabs: items.reduce((n, i) => n + i.tabs, 0),
  sessions: items.filter((i) => i.whole).length,
  bytes: items.reduce((n, i) => n + i.bytes, 0),
})

/** What each clear would free now, from the session whose folder is `own`, in the project whose home is above it. */
export function measure(own: string, window: Window, now = Date.now()): Measure {
  const { session, project, running } = clearable(projectHome(own), own, window, now)

  return { session: sum(session), project: { ...sum(project), running } }
}

/** Clears the closed tabs of the session whose folder is `own`, or, with `project`, of every session of its project no runtime serves, the folders of those over whole. */
export function clear(own: string, scope: "session" | "project", window: Window, now = Date.now()): Freed {
  const found = clearable(projectHome(own), own, window, now)

  return remove(found[scope], own)
}

/** The project's state folder, `.baba/.state/`, of a session's folder: two above it. */
export const projectHome = (session: string) => dirname(dirname(session))

/** The project a state folder is of: the directory its .baba/ is in. */
export const projectOf = (home: string) => dirname(dirname(home))

/** A size as the person reads it: bytes, KB, MB or GB, to one decimal. */
export function sized(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`

  const [unit, by] = bytes < 1e6 ? ["KB", 1e3] : bytes < 1e9 ? ["MB", 1e6] : ["GB", 1e9]

  return `${(bytes / (by as number)).toFixed(1)} ${unit}`
}

/**
 * What the shell's root keeps by: its model in the layout of keep.ts, the archive its views read, and the sweep once its
 * runtime serves, by the person's settings as they are then. The root's state directory is known once the runtime gives it.
 */
export function shellState(window: () => Window = () => readSettings(settingsFile()).archive, log: (line: string) => void = (line) => console.error(line)) {
  let root: string | undefined

  return {
    archive: archiveOf(() => root),
    keep: (dir: string): Pick<Ports<unknown>, "load" | "save"> => {
      root = dir

      return shellKeep(dir) as Pick<Ports<unknown>, "load" | "save">
    },
    started: (dir: string) => {
      const session = dirname(dir)
      const freed = sweep(projectHome(session), session, window())

      if (freed && (freed.tabs || freed.sessions))
        log(`${new Date().toISOString()} the archive's sweep removed ${freed.tabs} closed tabs and ${freed.sessions} sessions over, ${sized(freed.bytes)}`)
    },
  }
}
