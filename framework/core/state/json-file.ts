// JSON files, and text, written whole or not at all.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { basename, dirname, join } from "node:path"

/** A JSON file's value; undefined when there is no file. */
export const readJsonFile = <T>(path: string): T | undefined => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined)

/**
 * A temporary file in the same directory, flushed, then renamed over the target. `own`: the file, and the directories made
 * for it, readable by their owner alone, as a session's state is.
 */
export function writeJsonFile(path: string, value: unknown, { own = false } = {}): void {
  writeTextFile(path, JSON.stringify(value, null, 2), { own })
}

/** Text written whole or not at all, as writeJsonFile writes. */
export function writeTextFile(path: string, text: string, { own = false } = {}): void {
  const dir = dirname(path)
  const temporary = join(dir, `.${basename(path)}.${randomUUID()}.tmp`)

  mkdirSync(dir, { recursive: true, ...(own && { mode: 0o700 }) })
  try {
    const fd = openSync(temporary, "w", own ? 0o600 : 0o666)

    try {
      writeSync(fd, text)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}
