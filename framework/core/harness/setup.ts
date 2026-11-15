// What the adapters' set-up faces share: a file written only where it differs, a JSON file of the person's edited with
// only baba's part changed, and hook groups told apart by the command they run, so baba's are replaced or removed and the
// person's are left as they are.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

/** The package's own skill baba, the words every harness is given. */
export const SKILL = fileURLToPath(new URL("../../../skill/SKILL.md", import.meta.url))
/** How baba's hooks are told from the person's: by the command they run. */
export const HOOK = '/.baba/node_modules/babavoss/bin/baba.ts" hook'

/** Writes `text` to `file` where it differs, and answers whether it did. */
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
  if (!existsSync(file)) return false
  rmSync(file, { recursive: true, force: true })
  pruned(dirname(file), top)

  return true
}

type Handler = { type?: string; command?: string }
export type Group = { matcher?: string; hooks?: Handler[] } & Record<string, unknown>
export type Hooks = Record<string, Group[]>

/** `hooks` without baba's handlers, a group and an event left empty by that removed. */
export function without(hooks: Hooks): Hooks {
  const kept: Hooks = {}

  for (const [event, groups] of Object.entries(hooks)) {
    const left = groups
      .map((group) => (group.hooks?.some((handler) => handler.command?.includes(HOOK)) ? { ...group, hooks: group.hooks.filter((h) => !h.command?.includes(HOOK)) } : group))
      .filter((group) => group.hooks?.length !== 0)

    if (left.length) kept[event] = left
  }

  return kept
}

/**
 * Edits the JSON object in `file` with `edit`, which answers the new object, or undefined to remove the file. Where
 * `file` does not mention baba's hook and `touch` is false, it is not read at all; it is written only where it changes,
 * two-space indented as baba has always written it. Answers whether it changed.
 */
export function editJson(file: string, edit: (value: Record<string, unknown>) => Record<string, unknown> | undefined, touch: boolean): boolean {
  const text = existsSync(file) ? readFileSync(file, "utf8") : undefined

  // In the file the hook's quote is escaped, so what is looked for is the path alone.
  if (!touch && !text?.includes(HOOK.slice(0, HOOK.indexOf('"')))) return false

  let value: Record<string, unknown>

  try {
    value = text === undefined ? {} : (JSON.parse(text) as Record<string, unknown>)
  } catch {
    throw new Error(`${file} is not JSON: correct it, and provision again`)
  }

  const next = edit(value)

  if (next === undefined) return text !== undefined && removed(file, dirname(file))

  return written(file, `${JSON.stringify(next, null, 2)}\n`)
}

/** `value` with its hooks replaced by `hooks`, the key removed where none are left. */
export const withHooks = (value: Record<string, unknown>, hooks: Hooks): Record<string, unknown> => {
  const { hooks: _, ...rest } = value

  return Object.keys(hooks).length ? { ...value, hooks } : rest
}
