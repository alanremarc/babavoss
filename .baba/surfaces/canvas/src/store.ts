// Where the canvas is kept: one file, written whole or not at all, which every canvas tab of the worktree opens and follows.
// Tabs in one runtime share it in memory: each change is applied there, saved, and told to every tab that follows. A write
// from outside, as another session's runtime makes for a worker's report, is read and told too; a change applied here reads
// the file first, so it lands on what another runtime wrote. The file removed begins the canvas again, empty.
import { linkSync, mkdirSync, rmSync, watch, type FSWatcher } from "node:fs"
import { randomUUID } from "node:crypto"
import { basename, dirname, join } from "node:path"
import { readJsonFile, writeJsonFile } from "babavoss/core/index.ts"
import { asCanvas, empty, type Canvas } from "./canvas.ts"

export interface Store {
  /** Opens the canvas and follows it: `heard` is given it now and after every change, until `signal` ends. It throws where the file cannot be read. */
  open(heard: (canvas: Canvas) => void, signal: AbortSignal): Promise<void>
  /** Applies a change to the canvas as it is now, saves it, and tells every tab that follows; a change that gives nothing saves nothing. */
  apply(change: (canvas: Canvas) => Canvas | undefined): void
}

/** The canvas kept in the file `where` names; read again each time it is asked, so a spec can move it. */
export function store(where: () => string, initial?: () => Canvas | undefined): Store {
  let held: { file: string; canvas: Canvas; text?: string } | undefined
  const following = new Set<(canvas: Canvas) => void>()
  let watcher: FSWatcher | undefined
  let again: ReturnType<typeof setTimeout> | undefined

  const tell = () => following.forEach((heard) => heard(held!.canvas))
  /** The file's canvas, or undefined where it holds none: not there, or not a canvas. */
  const read = (file: string): { canvas: Canvas; text?: string } | undefined => {
    const kept = readJsonFile<unknown>(file)

    if (kept === undefined) return { canvas: empty() }
    const canvas = asCanvas(kept)

    if (!canvas) return undefined

    return { canvas, text: JSON.stringify(kept, null, 2) }
  }
  const now = () => {
    const file = where()

    if (held && held.file === file) return held

    let got = read(file)

    if (!got) throw new Error(`${file} does not hold a canvas`)
    if (got.text === undefined) {
      const canvas = initial?.()

      if (canvas) {
        const candidate = join(dirname(file), `.${randomUUID()}.json`)

        try {
          writeJsonFile(candidate, canvas, { own: true })
          // Both sessions can reach the first open. Only one installs the complete record.
          linkSync(candidate, file)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        } finally {
          rmSync(candidate, { force: true })
        }
        got = read(file)
        if (!got || got.text === undefined) throw new Error(`${file} does not hold a canvas`)
      }
    }
    held = { file, ...got }

    return held
  }
  const reread = () => {
    if (!held) return
    try {
      const got = read(held.file)

      if (!got || got.text === held.text) return
      held = { file: held.file, ...got }
      tell()
    } catch {
      // Read while it was replaced: the next change reads it again, and what is held stands.
    }
  }
  const follow = (file: string) => {
    if (watcher) return
    try {
      mkdirSync(dirname(file), { recursive: true })
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
    async open(heard, signal) {
      const at = now()

      following.add(heard)
      follow(at.file)
      heard(at.canvas)
      if (!signal.aborted) await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }))
      following.delete(heard)
      if (!following.size) {
        clearTimeout(again)
        watcher?.close()
        watcher = undefined
        held = undefined
      }
    },
    apply(change) {
      const at = now()
      // What another runtime wrote and this one has not heard yet is taken first.
      const fresh = read(at.file)

      if (!fresh) throw new Error(`${at.file} does not hold a canvas`)
      if (fresh.text !== at.text) held = { file: at.file, ...fresh }

      const next = change(held!.canvas)

      if (next) {
        writeJsonFile(held!.file, next, { own: true })
        held = { file: held!.file, canvas: next, text: JSON.stringify(next, null, 2) }
      }
      tell()
    },
  }
}
