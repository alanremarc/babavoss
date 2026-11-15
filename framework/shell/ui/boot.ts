// What the page was served with, read once before it first draws: the door's boot island (core/runtime/door.ts), the
// change the stream counts from, whose move it is, and the views the shell named for the page's path. So the first frame
// is the shell whole, on the right tab, and often that tab's content too; the stream's first change says whether it still is.
import { BOOT_ID } from "../../core/runtime/boot.ts"
import type { Turn } from "./client.ts"

export type Boot = { version?: number; turn?: Turn; views: Record<string, unknown> }

/** The island's text as the page's state: nothing where there is none or it does not read. */
export function parseBoot(text: string | null | undefined): Boot {
  try {
    const value = JSON.parse(text ?? "") as Partial<Boot> | null

    if (!value || typeof value !== "object") return { views: {} }

    return {
      ...(typeof value.version === "number" && { version: value.version }),
      ...(value.turn && typeof value.turn === "object" && { turn: value.turn }),
      views: value.views && typeof value.views === "object" ? value.views : {},
    }
  } catch {
    return { views: {} }
  }
}

let read: Boot | undefined

/** The page's boot, read from the document once. */
export const boot = (): Boot => (read ??= parseBoot(typeof document === "undefined" ? undefined : document.getElementById(BOOT_ID)?.textContent))

/** The view the page was served with at `path`, taken once: a later look reads the door. */
export function booted<V>(path: string): V | undefined {
  const views = boot().views
  const view = views[path] as V | undefined

  delete views[path]

  return view
}

/** Whether the stream's change still says what the page was served: only its first, of the version the island gave. */
export function servedAs(first: boolean, version: number): boolean {
  return first && boot().version === version
}
