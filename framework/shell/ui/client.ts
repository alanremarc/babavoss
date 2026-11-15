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

/** Told on every change of the surface, and whether the stream is up; the browser reconnects by itself. Returns stop. */
export function changes(onChange: (change: Change) => void, onConnected?: (up: boolean) => void): () => void {
  const source = new EventSource("/")

  source.addEventListener("change", (event) => {
    onChange(JSON.parse((event as MessageEvent<string>).data) as Change)
    onConnected?.(true)
  })
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

/** Loads the page again, at most once in RENEW_MS, so a runtime that keeps refusing does not spin the tab. */
function renew() {
  const last = Number(sessionStorage.getItem(RENEWED) ?? 0)
  const wait = last + RENEW_MS - Date.now()

  if (wait > 0) return void setTimeout(renew, wait)
  sessionStorage.setItem(RENEWED, String(Date.now()))
  location.reload()
}
