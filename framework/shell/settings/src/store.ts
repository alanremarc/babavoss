// Where the person's settings are kept: one JSON file of theirs, beside every session, project and browser, in the
// person's home, ~/.baba/settings.json. BABAVOSS_HOME is not it, since a project's root keeps its sessions in
// the project; BABAVOSS_SETTINGS names another file, as the specs do so the person's is never touched. The file is read
// tolerantly: none, or one that is not JSON, is the defaults, and what it holds that the settings do not know is kept as it
// was when they are written, whole or not at all.
import { readFileSync, watch, type FSWatcher } from "node:fs"
import { basename, dirname } from "node:path"
import { settingsAt } from "../../../core/provision.ts"
import { writeJsonFile } from "../../../core/state/json-file.ts"
import { settingsOf, type Settings } from "./settings.ts"

export type Env = Readonly<Record<string, string | undefined>>

/** The person's settings file. */
export const settingsFile = (env: Env = process.env): string => env.BABAVOSS_SETTINGS || settingsAt()

/** What the file holds as it is, or nothing where there is no file or it is not a JSON object. */
export function kept(file: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"))

    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** The settings the file says, the defaults for what it does not. */
export const readSettings = (file: string): Settings => settingsOf(kept(file))

/** Writes the settings over what the file holds, keeping what else it holds. */
export function writeSettings(file: string, settings: Settings): void {
  writeJsonFile(file, { ...kept(file), ...settings })
}

/**
 * Tells `changed` whenever the file may have changed: made, written, replaced or removed. Its directory is watched, so a
 * file written by renaming over it, as every writer here does, is followed; until the directory exists, it is looked for
 * every second. Returns stop.
 */
export function watchSettings(file: string, changed: () => void): () => void {
  let watcher: FSWatcher | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const name = basename(file)
  const follow = () => {
    if (stopped) return
    try {
      watcher = watch(dirname(file), (_, of) => {
        if (of === null || of === name) changed()
      })
      watcher.on("error", () => {
        watcher?.close()
        retry()
      })
    } catch {
      retry()
    }
  }
  const retry = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      follow()
      changed()
    }, 1000)
  }

  follow()

  return () => {
    stopped = true
    clearTimeout(timer)
    watcher?.close()
  }
}
