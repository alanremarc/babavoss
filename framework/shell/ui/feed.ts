// A feed of the shell's activity on the page: the rows at /activity or /activity/notices, newest first, read again on every
// change while it is live and further back on asking, and for the person which notices they have not seen. The shell reads
// the notices once, for the marks they put on the tabs; a drawer reads all activity while it is open, for its thread.
import { useCallback, useEffect, useRef, useState } from "react"
import { read } from "./client.ts"
import type { Row } from "./thread.ts"

/** A page of /activity: its entries, the page before, and for the person how many and which notices they have not seen. */
export type Page = { entries: Row[] | string; earlier?: { at: string }; unseen?: number; fresh?: number[] }
type Stream = { subscribe: (fn: () => void) => () => void }

export const ACTIVITY = "/activity"
export const NOTICES = "/activity/notices"
const THROTTLE_MS = 400

/** One feed of rows at `path`, newest first, read again on every change while `live`, and further back on asking; `served` what the page was served there, so it is not read at first. */
export function useFeed(path: string, changes: Stream, live: boolean, served?: Page) {
  const [rows, setRows] = useState<Row[]>(() => (Array.isArray(served?.entries) ? served.entries : []))
  const [earlier, setEarlier] = useState<string | undefined>(served?.earlier?.at)
  const [unseen, setUnseen] = useState(served?.unseen ?? 0)
  const [fresh, setFresh] = useState<number[]>(served?.fresh ?? [])
  const [loaded, setLoaded] = useState(served !== undefined)
  const first = useRef(served !== undefined)
  const older = useRef<Row[]>([])
  const load = useCallback(async () => {
    const page = await read<Page>(path).catch(() => undefined)

    if (!page) return

    const latest = Array.isArray(page.entries) ? page.entries : []
    const oldest = latest.at(-1)?.n ?? Infinity
    const kept = older.current.filter((r) => r.n < oldest)

    setRows([...latest, ...kept])
    setUnseen(page.unseen ?? 0)
    setFresh(page.fresh ?? [])
    setLoaded(true)
    if (!kept.length) setEarlier(page.earlier?.at)
  }, [path])
  const more = useCallback(async () => {
    if (!earlier) return

    const page = await read<Page>(earlier).catch(() => undefined)

    if (!page) return
    older.current = [...older.current, ...(Array.isArray(page.entries) ? page.entries : [])]
    setRows((all) => [...all, ...older.current.filter((r) => !all.some((a) => a.n === r.n))])
    setEarlier(page.earlier?.at)
  }, [earlier])

  useEffect(() => {
    if (!live) return

    let timer: ReturnType<typeof setTimeout> | undefined

    if (!first.current) void load()
    first.current = false

    const off = changes.subscribe(() => {
      timer ??= setTimeout(() => {
        timer = undefined
        void load()
      }, THROTTLE_MS)
    })

    return () => {
      off()
      clearTimeout(timer)
    }
  }, [changes, load, live])

  return { rows, earlier, unseen, fresh, more, load, loaded }
}

/** A feed as the shell holds it. */
export type Feed = ReturnType<typeof useFeed>
