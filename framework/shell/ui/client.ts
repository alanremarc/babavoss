// The browser side of the door: the surface's paths are the URLs, GET reads, POST calls, the event stream tells of change.
// The page's cookie carries the service token, so nothing here does.
import type { Args, View } from "../../core/index.ts"

export type Answer<V = View> = { outcome: "written"; view: V } | { outcome: "refused"; reason: string }

/** The view at `path`; throws with the door's reason when there is none. */
export async function read<V = View>(path: string): Promise<V> {
  const response = await fetch(path, { headers: { accept: "application/json" } })
  const result = (await response.json()) as V & { error?: string }

  if (!response.ok) throw new Error(result.error ?? `could not read ${path}`)

  return result
}

/** A call at `path`: written with the view after it, or refused with the reason. A lost response is uncertain: read before retrying. */
export async function call<V = View>(path: string, handle: string, args: Args): Promise<Answer<V>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ handle, args }),
    signal: AbortSignal.timeout(30_000),
  })

  if (response.status !== 200 && response.status !== 409) throw new Error(((await response.json()) as { error?: string }).error ?? `could not call ${path}`)

  return (await response.json()) as Answer<V>
}

export type Change = { version: number; jobs: string[] }
/** What just happened, told once as it is heard: `at` the path it is about, `from` who says it, `by` who caused it where not the person. */
export type Notice = { text: string; at?: string; from?: string; by?: string }

/** Whose move it is in the session, and how many of the person's calls wait for the agent's next answer; `drivable` where the page can start a turn; `harness` the session's harness, by its adapter's name, once a hook of it was heard. */
export type Turn = { agent: "working" | "idle" | "unknown"; since: number; waiting: number; drivable: boolean; harness?: string }

/** Told on every change of the surface, of each notice, of the turn, and whether the stream is up; the browser reconnects by itself. Returns stop. */
export function changes(
  onChange: (change: Change) => void,
  onConnected?: (up: boolean) => void,
  onNotice?: (notice: Notice) => void,
  onTurn?: (turn: Turn) => void
): () => void {
  const source = new EventSource("/")

  source.addEventListener("change", (event) => {
    onChange(JSON.parse((event as MessageEvent<string>).data) as Change)
    onConnected?.(true)
  })
  source.addEventListener("notice", (event) => onNotice?.(JSON.parse((event as MessageEvent<string>).data) as Notice))
  source.addEventListener("turn", (event) => onTurn?.(JSON.parse((event as MessageEvent<string>).data) as Turn))
  // The page's own code changed: only a fresh page has it.
  source.addEventListener("page", () => location.reload())
  source.onerror = () => {
    onConnected?.(false)
    // The browser retries a stream that dropped, and gives up on one that is refused: the runtime at this address is a new
    // instance, with a token this page does not hold. A fresh page is given it.
    if (source.readyState === EventSource.CLOSED) renew()
  }

  return () => source.close()
}

const RENEWED = "babavoss-renewed"
const RENEW_MS = 10_000
/** How often a page whose runtime is gone asks whether it is back. */
const RETRY_MS = 2000

/**
 * Loads the page again, at most once in RENEW_MS, so a runtime that keeps refusing does not spin the tab; and only once
 * the page is there to load: while nothing answers at its address the page stays as it is, saying it is reconnecting,
 * and asks again, so a runtime that is gone never turns the tab into the browser's own error page.
 */
function renew() {
  const last = Number(sessionStorage.getItem(RENEWED) ?? 0)
  const wait = last + RENEW_MS - Date.now()

  if (wait > 0) return void setTimeout(renew, wait)
  fetch(location.href, { cache: "no-store", headers: { accept: "text/html" } }).then(
    (response) => {
      if (!response.ok) return void setTimeout(renew, RETRY_MS)
      sessionStorage.setItem(RENEWED, String(Date.now()))
      location.reload()
    },
    () => void setTimeout(renew, RETRY_MS)
  )
}
