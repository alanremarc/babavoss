// What home offers, worked out without a page: home is to the shell what a page is to its surface, so what it offers is
// what the shell has at /: which surfaces can be opened and which do not load, the open tabs to switch to, and the tab
// home returns to; its list, each thing once with what Enter does on it; and where home's shortcut goes. A surface's own actions and places are its tab's menu, never home's.
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

/** An open tab as home needs it to list it: where it is, its surface and what it is called. */
export type TabChoice = { at: string; surface: string; label: string }

/**
 * A line of home's list. Each thing stands once: an open tab, which Enter goes to, with its surface's open where another
 * may be opened; a surface with no tab open, which Enter opens; or one that does not load.
 */
export type HomeRow =
  | { kind: "tab"; value: string; at: string; surface: string; label: string; another?: Handle }
  | { kind: "surface"; value: string; name: string; description: string; open: Handle }
  | { kind: "broken"; value: string; name: string; broken: string }

/** Home's list, in the order it is read: the open tabs, newest first as given; then the surfaces with no tab open. */
export function rowsOf(surfaces: readonly SurfaceEntry[], tabs: readonly TabChoice[]): HomeRow[] {
  const offered = choices(surfaces)
  const openOf = (name: string) => {
    const choice = offered.find((u) => u.name === name)

    return choice && "open" in choice ? choice.open : undefined
  }

  return [
    ...tabs.map((tab): HomeRow => {
      const another = openOf(tab.surface)

      return { kind: "tab", value: `tab ${tab.at}`, at: tab.at, surface: tab.surface, label: tab.label, ...(another && { another }) }
    }),
    ...offered
      .filter((u) => !tabs.some((tab) => tab.surface === u.name))
      .map((u): HomeRow => ("broken" in u ? { kind: "broken", value: `surface ${u.name}`, ...u } : { kind: "surface", value: `surface ${u.name}`, ...u })),
  ]
}

/** What Enter does on a line, and what Enter with the command key does where it does something else; nothing on one that does not load. */
export function doesOf(row: HomeRow): { enter?: string; other?: string } {
  if (row.kind === "tab") return { enter: "Go to tab", ...(row.another && { other: "Open another" }) }
  if (row.kind === "surface") return { enter: "Open in new tab" }

  return {}
}
