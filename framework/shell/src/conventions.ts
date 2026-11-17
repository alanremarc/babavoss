// The conventions: what the shell hands every page of how the person wants pages to be, derived from their settings and
// the machine by one pure function. A page reads them and interprets them by its own code: from useConventions(), or from
// the page's root, where each is an attribute, data-NAME, and a number a variable too, --NAME, so CSS, Tailwind's variants
// and the kit follow them with no code in the page. They are a protocol, not a constraint: a page is expected to follow
// them, and nothing checks that it does. Another is one field here, one preference in settings.ts, one line in
// skill/making-surfaces.md.
import { resolveMode, type Mode, type Rail, type Settings } from "../settings/src/settings.ts"

export type Conventions = {
  /** Whether a page moves: reduced, it shows each state at once, with no animation. */
  motion: "full" | "reduced"
  /** The size of text, a share of the usual: the kit sizes in rem, so a page drawn by its tokens follows unasked. */
  scale: number
  /** The side a page's own sidebar stands at. */
  side: "left" | "right"
  /** The side of the page the shell's rail of tabs stands at, to keep clear of or to mirror. */
  rail: Rail["side"]
  /** The mode the page is shown in, as resolved. */
  mode: Mode
}

/** What the machine says that a convention follows, as the page knows it. */
export type Machine = { dark: boolean; reduced: boolean }

export function conventionsOf(settings: Settings, machine: Machine): Conventions {
  const { motion, scale, side } = settings.preferences

  return {
    motion: motion === "system" ? (machine.reduced ? "reduced" : "full") : motion,
    scale,
    side,
    rail: settings.appearance.rail.side,
    mode: resolveMode(settings.appearance, machine.dark),
  }
}

/** The conventions as they stand on the page's root: each an attribute, data-NAME, and each number a variable too, --NAME. */
export function attributesOf(conventions: Conventions): { data: Record<string, string>; vars: Record<string, string> } {
  const entries = Object.entries(conventions)

  return {
    data: Object.fromEntries(entries.map(([name, value]) => [name, String(value)])),
    vars: Object.fromEntries(entries.filter(([, value]) => typeof value === "number").map(([name, value]) => [`--${name}`, String(value)])),
  }
}
