// Where the session's work is kept: one file in the session's directory, work.json, written whole or not at all, which every
// queue tab of the session opens and follows. The runtime is one process, so its tabs share the work in memory and each
// change is applied there, saved, and told to every tab that follows; a change to the file from outside, as a runtime that
// started again writes it, is read and told too, and the file removed begins the work again. A tab that brings work kept
// from before has it merged in, losing nothing. Where there is no file to keep it in, as in a story, the work is kept in
// memory alone.
import { watch, type FSWatcher } from "node:fs"
import { basename, dirname, join } from "node:path"
import { readJsonFile, writeJsonFile } from "babavoss/core/index.ts"
import { empty, isWork, union, type Work } from "./work.ts"

export const FILE = "work.json"

export interface Store {
  /**
   * Opens the work, with what a tab `brings` from before merged in, and follows it: `heard` is given the work now and after
   * every change, until `signal` ends. It throws where the work kept cannot be read, and then writes nothing.
   */
  open(brings: Work | undefined, heard: (work: Work) => void, signal: AbortSignal): Promise<void>
  /** Applies a change to the work as it is now, saves it, and tells every tab that follows; a change that gives nothing saves nothing. */
  apply(change: (work: Work) => Work | undefined): void
}

/** The work kept in the file `where` names, or in memory where it names none; read again each time it is asked, so a story can move it. */
export function store(where: () => string | undefined = () => undefined): Store {
  let held: { file?: string; work: Work; text?: string } | undefined
  const following = new Set<(work: Work) => void>()
  let watcher: FSWatcher | undefined
  let again: ReturnType<typeof setTimeout> | undefined

  const tell = () => following.forEach((heard) => heard(held!.work))
  /** The work as it is now: held, or read from its file, or none yet. */
  const now = (): NonNullable<typeof held> => {
    const file = where()

    if (held && held.file === file) return held

    const kept = file ? readJsonFile<unknown>(file) : undefined

    if (kept !== undefined && !isWork(kept)) throw new Error(`${file} does not hold the session's work`)
    held = { file, work: kept ?? empty(), ...(kept !== undefined && { text: JSON.stringify(kept, null, 2) }) }

    return held
  }
  const save = (work: Work) => {
    const at = now()

    if (at.file) writeJsonFile(at.file, work)
    held = { file: at.file, work, text: JSON.stringify(work, null, 2) }
  }
  /**
   * The file changed from outside: read it again, and tell it where it differs from what was written here. A file removed
   * is work begun again, empty, as a session's work with no file is.
   */
  const reread = () => {
    const file = held?.file

    if (!file) return
    try {
      const kept = readJsonFile<unknown>(file)
      const text = kept === undefined ? undefined : JSON.stringify(kept, null, 2)

      if (text === held!.text) return
      if (kept === undefined) {
        held = { file, work: empty() }

        return tell()
      }
      if (!isWork(kept)) return
      held = { file, work: kept, text }
      tell()
    } catch {
      // Read while it was replaced, or not work: the next change reads it again, and what is held stands.
    }
  }
  const follow = (file: string | undefined) => {
    if (watcher || !file) return
    try {
      watcher = watch(dirname(file), (_, name) => {
        if (name !== null && name !== basename(file)) return
        clearTimeout(again)
        again = setTimeout(reread, 50)
      })
      watcher.on("error", () => {
        watcher?.close()
        watcher = undefined
      })
    } catch {
      watcher = undefined
    }
  }

  return {
    async open(brings, heard, signal) {
      const at = now()

      if (brings) {
        const merged = union(at.work, brings)

        // Precious: a store with fewer issues than the tab brought is never written.
        if (merged.issues.length < brings.issues.length) throw new Error("merging the tab's work would lose issues")
        if (JSON.stringify(merged) !== JSON.stringify(at.work) || !at.text) {
          save(merged)
          tell()
        }
      }
      following.add(heard)
      follow(held!.file)
      heard(held!.work)
      if (signal.aborted) return void following.delete(heard)
      await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }))
      following.delete(heard)
      if (!following.size) {
        watcher?.close()
        watcher = undefined
      }
    },
    apply(change) {
      const next = change(now().work)

      if (next) save(next)
      tell()
    },
  }
}

/** The file of the session's work in the session's directory, where there is one. */
export const fileIn = (dir: string | undefined) => (dir ? join(dir, FILE) : undefined)
