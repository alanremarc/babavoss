// Menus as data, which the shell's drawer draws, its menu and its search: an entry's kinds, how a query filters them, and
// the quiet scroll a long list of them takes.

/**
 * One entry of a menu: an action, `mark`ed where it waits on the person; a checkbox; a choice among options, shown as a
 * titled group of radio items; a separator; a label heading the entries after it, `strong` where it names a section of
 * groups; or a submenu, which opens on a field filtering it given `search`. A `mark`ed label or submenu holds an entry
 * marked, so the mark stands on every step of the way to it. `keys` names the shortcut an action will have;
 * shown, not yet bound. `note` is a word beside an action's label, quieter, on what it does.
 */
export type MenuItem =
  | { kind: "action"; id: string; label: string; run: () => void; disabled?: boolean; keys?: string; hint?: string; mark?: boolean; note?: string }
  | { kind: "check"; id: string; label: string; checked: boolean; set: (checked: boolean) => void; disabled?: boolean; keys?: string }
  | { kind: "choice"; id: string; label: string; value: string; options: { id: string; label: string }[]; set: (value: string) => void; disabled?: boolean }
  | { kind: "separator"; id: string }
  | { kind: "label"; id: string; label: string; strong?: boolean; mark?: boolean }
  | { kind: "submenu"; id: string; label: string; items: MenuItem[]; disabled?: boolean; search?: string; mark?: boolean }

/** A list that scrolls up and down where it is long, with no bar to show for it, and never sideways: its entries are cut. */
export const quietScroll = "overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

/** Whether every word of a query is in an entry's words, ignoring case. */
export const matches = (query: string, ...words: (string | undefined)[]): boolean => {
  const text = words.join(" ").toLowerCase()

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}

/** A menu's entries that match a query, flat: its actions, checks and the actions of its submenus, without the lines between. */
export function filtered(items: MenuItem[], query: string): MenuItem[] {
  if (!query.trim()) return items

  return items.flatMap((item): MenuItem[] => {
    if (item.kind === "submenu") return filtered(item.items, query).filter((i) => i.kind !== "separator" && i.kind !== "label")
    if (item.kind === "action") return matches(query, item.label, item.hint) ? [item] : []
    if (item.kind === "check" || item.kind === "choice") return matches(query, item.label) ? [item] : []

    return []
  })
}
