// JSON files written whole or not at all.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { basename, dirname, join } from "node:path"

/** A JSON file's value; undefined when there is no file. */
export const readJsonFile = <T>(path: string): T | undefined => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined)

/** A temporary file in the same directory, flushed, then renamed over the target. */
export function writeJsonFile(path: string, value: unknown): void {
  const dir = dirname(path)
  const temporary = join(dir, `.${basename(path)}.${randomUUID()}.tmp`)

  mkdirSync(dir, { recursive: true })
  try {
    const fd = openSync(temporary, "w")

    try {
      writeSync(fd, JSON.stringify(value, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}
