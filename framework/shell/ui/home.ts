// What home offers, worked out without a page: home is to the shell what a page is to its surface, so what it offers is
// what the shell has at /: which surfaces can be opened and which do not load, the open tabs to switch to, and the tab
// home returns to; and where home's shortcut goes. A surface's own actions and places are its tab's menu, never home's.
import type { Handle } from "../../core/index.ts"
import { HOME } from "./pointing.ts"

/** A surface as / lists it: one that loads, with what it is for and how to open it; or one whose code does not load, with why. */
export type SurfaceEntry = { name: string; description?: string; open?: Handle; broken?: string }
/** A surface as home offers it: openable by its handle, or broken, saying why, and not openable. */
export type SurfaceChoice = { name: string; description: string; open: Handle } | { name: string; broken: string }

/** Each surface as a choice: one that does not load, or offers no open, is broken and cannot be opened. */
export function choices(surfaces: readonly SurfaceEntry[]): SurfaceChoice[] {
  return surfaces.map(({ name, description, open, broken }) =>
    broken === undefined && open ? { name, description: description ?? "", open } : { name, broken: broken ?? `the ${name} surface offers no open` }
  )
}

/** The tab home returns to: the one shown before it, while it is still open; else none. */
export function backTo(previous: string | undefined, open: readonly string[]): string | undefined {
  return previous !== undefined && open.includes(previous) ? previous : undefined
}

/** Where home's shortcut goes: to home from anywhere else, and from home back to the tab shown before, if any. */
export function shortcut(active: string, back: string | undefined): string {
  return active !== HOME ? HOME : (back ?? HOME)
}
