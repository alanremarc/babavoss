// How a harness is set up in a project, the one method there is: a skill file of baba's own, and baba's hooks among the
// person's in the harness's own project file. An adapter declares where and which (`Method`), and `install` and `uninstall`
// do it the same way for each. The person's files are theirs, so every write to one goes through `replace`: the file as it
// was is copied to .babavoss/backups first, the new text is checked before it stands in the old one's place, and it is
// swapped in whole, so the file is never half-written. `editHooks` changes nothing but baba's own hook groups, told from
// the person's by the command they run, and proves it before writing: what is left with baba's taken out is what was there.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import type { SetUp } from "./harness.ts"

/** The package's own skill baba, the words every harness is given. */
export const SKILL = fileURLToPath(new URL("../../../skill/SKILL.md", import.meta.url))
/** The package's command, from a project's directory. */
const BIN = "/.baba/node_modules/babavoss/bin/baba.ts"
/** How baba's hooks are told from the person's: by the command they run. */
export const HOOK = `${BIN}" hook`
/** Where the person's files are copied before baba changes them, in the project; each file's newest few are kept. */
export const BACKUPS = ".babavoss/backups"
const KEPT = 10

/**
 * The command a harness's hook runs: the nearest .baba/ up from the session's project, and its package's `hook NAME`.
 * A harness that names the project gives it as CLAUDE_PROJECT_DIR; the others run a hook in the session's directory.
 * Silent, and never failing, where bun or the package is missing.
 */
export const hookCommand = (name: string): string =>
  `d="\${CLAUDE_PROJECT_DIR:-$PWD}"; until [ -f "$d${BIN}" ] || [ "$d" = / ]; do d="$(dirname "$d")"; done; bun "$d${BIN}" hook ${name} 2>/dev/null || true`

/** A file of the person's that baba will not change as it is, said with what they can do; nothing was written. */
export class Unsafe extends Error {}

/** Writes `text` to `file` where it differs, and answers whether it did. For baba's own files: the person's go through `replace`. */
export const written = (file: string, text: string): boolean => {
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)

  return true
}

/** Removes `dir` where it is empty, and its parents up to `top` that are then empty. */
export const pruned = (dir: string, top: string) => {
  for (let at = dir; at.startsWith(`${top}/`) && existsSync(at) && !readdirSync(at).length; at = dirname(at)) rmdirSync(at)
}

/** Removes `file` and the folders it leaves empty up to `top`; answers whether it was there. */
export const removed = (file: string, top: string): boolean => {
  if (!lstatSync(file, { throwIfNoEntry: false })) return false
  rmSync(file, { recursive: true, force: true })
  pruned(dirname(file), top)

  return true
}

/** What `replace` did: whether the file changed, and the copy kept of what it was, from the project. */
export type Replaced = { changed: boolean; backup?: string }

/**
 * Copies `file`, in `project`, to the backups as it is now, and answers the copy's path from the project. The copy is
 * named for the file's path and the moment, has the file's own mode, and the oldest beyond a few of that file are removed.
 */
export function backup(project: string, file: string, now: Date = new Date()): string {
  const dir = join(project, BACKUPS)
  const name = relative(project, file).replaceAll(/[/\\]/g, "__")
  const stamp = now.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
  let to = join(dir, `${name}.${stamp}`)

  mkdirSync(dir, { recursive: true })
  // Two within a second are both kept: the later takes a number.
  for (let n = 1; existsSync(to); n++) to = join(dir, `${name}.${stamp}.${n}`)
  copyFileSync(file, to)

  const mine = readdirSync(dir)
    .filter((entry) => entry.startsWith(`${name}.`) && /^\d{8}T\d{6}Z(\.\d+)?$/.test(entry.slice(name.length + 1)))
    .map((entry) => ({ entry, at: statSync(join(dir, entry)).mtimeMs }))
    .sort((a, b) => b.at - a.at || b.entry.localeCompare(a.entry, undefined, { numeric: true }))

  for (const { entry } of mine.slice(KEPT)) rmSync(join(dir, entry), { force: true })

  return relative(project, to)
}

/**
 * Puts `text` in the place of `file`, one of the person's in `project`, or removes the file where `text` is undefined.
 * Nothing is done where the text is what is there. Otherwise the file as it was is copied to the backups; the new text is
 * written beside it, with the file's mode, read back and given to `check`, which throws where it is not valid; and only
 * then is it moved into place, in one step. A link is written through, to the file it names. Whatever fails, the file is
 * as it was.
 */
export function replace(project: string, file: string, text: string | undefined, check: (text: string) => void = () => {}, now?: Date): Replaced {
  const there = lstatSync(file, { throwIfNoEntry: false })
  const target = there?.isSymbolicLink() ? realpathSync(file) : file

  if (there && !statSync(target).isFile()) throw new Unsafe(`${file} is not a file: left as it is`)

  const before = there ? readFileSync(target, "utf8") : undefined

  if (before === text) return { changed: false }

  const kept = before === undefined ? undefined : backup(project, file, now)

  if (text === undefined) {
    removed(file, project)

    return { changed: true, backup: kept }
  }

  const beside = `${target}.baba-${process.pid}.tmp`

  mkdirSync(dirname(target), { recursive: true })
  try {
    writeFileSync(beside, text, { mode: there ? statSync(target).mode & 0o777 : 0o644 })

    const landed = readFileSync(beside, "utf8")

    if (landed !== text) throw new Error(`${file}: what was written is not what was meant`)
    check(landed)
    renameSync(beside, target)
  } catch (error) {
    rmSync(beside, { force: true })
    throw error
  }

  return { changed: true, backup: kept }
}

type Handler = { type?: string; command?: string } & Record<string, unknown>
export type Group = { matcher?: string; hooks?: Handler[] } & Record<string, unknown>
export type Hooks = Record<string, Group[]>

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const isOurs = (handler: unknown): boolean => isObject(handler) && typeof handler.command === "string" && handler.command.includes(HOOK)

/**
 * `hooks` without baba's handlers; a group that held nothing but baba's goes with them, and an event with no group left.
 * What the person wrote is as it was, but for an event with no groups, which says nothing to a harness and cannot be
 * told from one baba emptied: it goes too.
 */
export function without(hooks: Hooks): Hooks {
  const kept: Hooks = {}

  for (const [event, groups] of Object.entries(hooks)) {
    const left = groups.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks) || !group.hooks.some(isOurs)) return [group]

      const hooks = group.hooks.filter((handler) => !isOurs(handler))

      return hooks.length ? [{ ...group, hooks }] : []
    })

    if (left.length) kept[event] = left
  }

  return kept
}

/** `value` with its hooks set to `hooks`, the key gone where there are none: as an event with no groups, it says nothing. */
const withHooks = (value: Record<string, unknown>, hooks: Hooks): Record<string, unknown> => {
  const { hooks: _, ...rest } = value

  return Object.keys(hooks).length ? { ...value, hooks } : rest
}

/** JSON text with the space between its tokens taken out, each token as it was written. */
const compact = (text: string): string => text.replace(/"(?:\\.|[^"\\])*"|\s+/g, (token) => (token.startsWith('"') ? token : ""))

/** The JSON object a hooks file holds, and how it is written: its indent, its line ends, a byte-order mark, a last newline. */
type Read = { value: Record<string, unknown>; indent: string; eol: string; bom: string; end: string }

/** Reads a hooks file's text; throws `Unsafe` where it is not a JSON object whose `hooks`, if any, are groups by event. */
function read(file: string, text: string): Read {
  const bom = text.startsWith("﻿") ? "﻿" : ""
  const body = text.slice(bom.length)
  const wrong = (what: string): never => {
    throw new Unsafe(`${file} ${what}: correct it and provision again; nothing was changed`)
  }
  let value: unknown

  try {
    value = body.trim() ? JSON.parse(body) : {}
  } catch (error) {
    wrong(`is not JSON (${error instanceof Error ? error.message : String(error)})`)
  }
  if (!isObject(value)) return wrong("does not hold a JSON object")
  // What is read must be all there is: a number written as 1.0 or too large to hold, a key given twice or an escaped
  // character would come back otherwise than it was, so such a file is not written at all.
  if (body.trim() && compact(body) !== JSON.stringify(value))
    wrong("holds what cannot be written back exactly as it is, a number as 1.0 or a very large one, a key given twice, or an escaped character")
  if (value.hooks !== undefined) {
    if (!isObject(value.hooks)) wrong('has "hooks" that is not an object')
    for (const [event, groups] of Object.entries(value.hooks as Record<string, unknown>))
      if (!Array.isArray(groups)) wrong(`has "hooks.${event}" that is not a list`)
  }

  return {
    value,
    bom,
    indent: body.match(/^([ \t]+)"/m)?.[1] ?? "  ",
    eol: body.includes("\r\n") ? "\r\n" : "\n",
    end: body.trim() && !/\n\s*$/.test(body) ? "" : "\n",
  }
}

const write = ({ indent, eol, bom, end }: Omit<Read, "value">, value: unknown): string => bom + JSON.stringify(value, null, indent).replaceAll("\n", eol) + (end && eol)
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
/** A hooks file's object with baba's taken out: what is the person's. */
const theirs = (value: Record<string, unknown>): Record<string, unknown> => {
  return withHooks(value, without((value.hooks ?? {}) as Hooks))
}

/**
 * Sets baba's hooks in `file`, a JSON file of the person's in `project`: `ours`, a group for each event, each put after
 * the person's own for that event; or none, where `ours` is undefined, which removes the file too where nothing else is
 * left in it. Only baba's groups change: every other key, event, group and handler is as it was, in the order it was, and
 * that is checked before anything is written. The one thing of theirs that may go is what says nothing: an event with no
 * groups, or `hooks` with no events. The file keeps its indent and line ends; it is written only where its
 * content changes, and then by `replace`, with a backup. Where the file is not valid as it is, it throws `Unsafe`.
 */
export function editHooks(project: string, file: string, ours: Record<string, Group> | undefined, now?: Date): Replaced {
  const there = existsSync(file)

  if (!there && !ours) return { changed: false }

  const text = there ? readFileSync(file, "utf8") : ""

  // A file baba has nothing in is not read for a removal: whatever state it is in, it is the person's.
  if (!ours && !text.includes(BIN)) return { changed: false }

  const { value, ...form } = read(file, text)
  const hooks = without((value.hooks ?? {}) as Hooks)

  for (const [event, group] of Object.entries(ours ?? {})) hooks[event] = [...(hooks[event] ?? []), group]

  const next = withHooks(value, hooks)

  if (!same(theirs(next), theirs(value))) throw new Error(`${file}: the change would touch what is not baba's; nothing was changed`)
  if (there && same(next, value)) return { changed: false }

  const check = (landed: string) => {
    if (!same(read(file, landed).value, next)) throw new Error(`${file}: what was written does not read back as it was meant`)
  }

  return replace(project, file, !ours && !Object.keys(next).length ? undefined : write(form, next), check, now)
}

/** How a harness is set up in a project: its skill file, and the file its hooks are in, each from the project. */
export type Method = {
  /** The harness's name, as `baba hook NAME` takes it. */
  name: string
  /** Baba's skill, a file of baba's own: SKILL.md in a folder named baba. */
  skill: string
  /** The person's file the harness reads a project's hooks from. */
  hooks: string
  /** The harness's events baba's hook runs at. */
  events: readonly string[]
  /** A hook's time limit in seconds, for the events that need one of their own. */
  timeouts?: Record<string, number>
  /** A link an older release left where the skill's folder is, by what it points at; it is replaced. */
  legacy?: RegExp
  /** What an older release left in the skill's folder besides the skill, which the harness would still load; removed. */
  stale?: readonly string[]
}

/** Whether the skill's folder at `dir` is baba's to write: missing, a link an older release left, or a folder whose skill is baba. */
function skillIsOurs(dir: string, legacy?: RegExp): boolean {
  const stat = lstatSync(dir, { throwIfNoEntry: false })

  if (!stat) return true
  if (stat.isSymbolicLink()) return !!legacy?.test(readlinkSync(dir))
  if (!stat.isDirectory()) return false
  try {
    return /^---\n[\s\S]*?^name: baba$/m.test(readFileSync(join(dir, "SKILL.md"), "utf8"))
  } catch {
    return false
  }
}

/** Removes what an older release left at the skill's folder: the link, or its files beside the skill; answers whether it did. */
function cleared(dir: string, method: Method): boolean {
  const stat = lstatSync(dir, { throwIfNoEntry: false })

  if (stat?.isSymbolicLink()) {
    rmSync(dir)

    return true
  }

  return (method.stale ?? []).filter((entry) => stat && removed(join(dir, entry), dirname(dir))).length > 0
}

const backedUp = (file: string, done: Replaced): string[] => (done.backup ? [`${file} as it was is kept at ${done.backup}`] : [])

/** Sets a harness up in `project` by `method`: baba's skill written where it differs, and baba's hooks set in the person's file. */
export function install(project: string, method: Method): SetUp {
  const dir = join(project, dirname(method.skill))
  const paths: string[] = []
  const push = (path: string) => paths.includes(path) || paths.push(path)

  if (!skillIsOurs(dir, method.legacy)) throw new Unsafe(`${dir} is not baba's: move it, and provision again`)
  if (cleared(dir, method)) push(dirname(method.skill))
  if (written(join(project, method.skill), readFileSync(SKILL, "utf8"))) push(dirname(method.skill))

  const command = hookCommand(method.name)
  const ours = Object.fromEntries(
    method.events.map((event) => [event, { hooks: [{ type: "command", command, ...(method.timeouts?.[event] && { timeout: method.timeouts[event] }) }] }])
  )
  const done = editHooks(project, join(project, method.hooks), ours)

  if (done.changed) paths.push(method.hooks)

  const said = backedUp(method.hooks, done)

  return { paths, ...(said.length && { said: said.join("\n") }) }
}

/** Takes out of `project` what `install` put there by `method`, and nothing else: the skill where it is baba's, and baba's hooks. */
export function uninstall(project: string, method: Method): SetUp {
  const dir = join(project, dirname(method.skill))
  const paths: string[] = []

  if (lstatSync(dir, { throwIfNoEntry: false }) && skillIsOurs(dir, method.legacy)) {
    const stale = cleared(dir, method)

    // The skill alone, and its folder where that leaves it empty: what else the person keeps there is theirs.
    if (removed(join(project, method.skill), project) || stale) paths.push(dirname(method.skill))
  }

  const done = editHooks(project, join(project, method.hooks), undefined)

  if (done.changed) paths.push(method.hooks)

  const said = backedUp(method.hooks, done)

  return { paths, ...(said.length && { said: said.join("\n") }) }
}
