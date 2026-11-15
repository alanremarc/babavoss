// Menus as data, and the row of triggers that drops them: what the shell's frame draws above every tab, and the same items
// as a context menu where a right click offers what a menu does. A menu may open with a search field at its top, which
// filters its entries or, given `find`, looks further, as the Help menu does. A page draws no menu bar of its own.
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { CheckIcon, ChevronRightIcon, CircleIcon, SearchIcon } from "lucide-react"
import { ContextMenu as Context, Menubar as Menu } from "radix-ui"

/**
 * One entry of a menu: an action, `mark`ed where it waits on the person; a checkbox; a choice among options, shown as a
 * titled group of radio items; a separator; a label heading the entries after it; or a submenu. `keys` names the
 * shortcut an action will have; shown, not yet bound.
 */
export type MenuItem =
  | { kind: "action"; id: string; label: string; run: () => void; disabled?: boolean; keys?: string; hint?: string; mark?: boolean }
  | { kind: "check"; id: string; label: string; checked: boolean; set: (checked: boolean) => void; disabled?: boolean; keys?: string }
  | { kind: "choice"; id: string; label: string; value: string; options: { id: string; label: string }[]; set: (value: string) => void; disabled?: boolean }
  | { kind: "separator"; id: string }
  | { kind: "label"; id: string; label: string }
  | { kind: "submenu"; id: string; label: string; items: MenuItem[]; disabled?: boolean }

/**
 * A menu of the bar, by subject. `search` puts a field at its top: without `find` it filters the entries by their words;
 * with it, the entries are what `find` gives for the query, none while it is empty. `opened` is told each time it opens.
 */
export type Menu = {
  id: string
  label: string
  items: MenuItem[]
  disabled?: boolean
  strong?: boolean
  search?: { placeholder: string; find?: (query: string) => MenuItem[] }
  opened?: () => void
}

export const muted = "text-muted-foreground"
export const menuItem = `relative flex h-row cursor-default items-center gap-2 rounded-md pr-2 pl-7 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-foreground/8 data-[state=open]:bg-foreground/8`
export const menuContent = "z-50 min-w-48 max-w-96 rounded-lg bg-popover p-1 text-body text-popover-foreground shadow-md ring-1 ring-foreground/10"

const Keys = ({ keys }: { keys?: string }) => (keys ? <span className={`ml-auto pl-4 text-meta ${muted}`}>{keys}</span> : null)

/** A menu's entries, nested where a submenu opens: the menu bar's, or a context menu's, which share their parts. */
export function MenuItems({ items, kit: M = Menu }: { items: MenuItem[]; kit?: typeof Menu }) {
  return items.map((item) => {
    switch (item.kind) {
      case "action":
        return (
          <M.Item key={item.id} disabled={item.disabled} className={menuItem} onSelect={item.run} title={item.hint}>
            {item.mark && <span aria-label="yours to decide" className="absolute left-3 size-1.5 rounded-full bg-primary" />}
            <span className="min-w-0 truncate">{item.label}</span>
            <Keys keys={item.keys} />
          </M.Item>
        )
      case "check":
        return (
          <M.CheckboxItem
            key={item.id}
            checked={item.checked}
            disabled={item.disabled}
            className={menuItem}
            onCheckedChange={(checked) => item.set(checked === true)}
          >
            <M.ItemIndicator className="absolute left-2 grid size-icon place-items-center">
              <CheckIcon className="size-glyph" />
            </M.ItemIndicator>
            {item.label}
            <Keys keys={item.keys} />
          </M.CheckboxItem>
        )
      case "choice":
        return (
          <M.Group key={item.id} aria-label={item.label}>
            <M.Label className={`flex h-row items-center pl-7 text-meta ${muted}`}>{item.label}</M.Label>
            <M.RadioGroup value={item.value} onValueChange={item.set}>
              {item.options.map((o) => (
                <M.RadioItem key={o.id} value={o.id} disabled={item.disabled} className={menuItem}>
                  <M.ItemIndicator className="absolute left-2 grid size-icon place-items-center">
                    <CircleIcon className="size-1.5 fill-current" />
                  </M.ItemIndicator>
                  {o.label}
                </M.RadioItem>
              ))}
            </M.RadioGroup>
          </M.Group>
        )
      case "separator":
        return <M.Separator key={item.id} className="-mx-1 my-1 h-px bg-border" />
      case "label":
        return (
          <M.Label key={item.id} className={`flex h-row items-center pl-7 text-meta ${muted}`}>
            {item.label}
          </M.Label>
        )
      case "submenu":
        return (
          <M.Sub key={item.id}>
            <M.SubTrigger disabled={item.disabled} className={menuItem}>
              {item.label}
              <ChevronRightIcon aria-hidden className={`ml-auto size-glyph ${muted}`} />
            </M.SubTrigger>
            <M.Portal>
              <M.SubContent sideOffset={4} alignOffset={-4} className={menuContent}>
                <MenuItems items={item.items} kit={M} />
              </M.SubContent>
            </M.Portal>
          </M.Sub>
        )
    }
  })
}

/** The context menu's kit, which shares the menu bar's parts. */
export const ContextKit = Context as unknown as typeof Menu

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

/** A menu that opens on a search field: typing filters or finds, Down goes to the entries, Enter takes the first. */
function Searched({ menu, close }: { menu: Menu & { search: NonNullable<Menu["search"]> }; close: () => void }) {
  const [query, setQuery] = useState("")
  const field = useRef<HTMLInputElement>(null)
  const { find, placeholder } = menu.search
  const items = find ? (query.trim() ? find(query) : []) : filtered(menu.items, query)

  // The menu focuses itself as it opens; the field takes the focus after it, so the menu opens on it.
  useEffect(() => {
    const later = setTimeout(() => field.current?.focus(), 0)

    return () => clearTimeout(later)
  }, [])

  // The field keeps the keys a menu would take for itself, typeahead and moving between menus, but Down, Escape and Tab.
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      field.current?.closest("[role=menu]")?.querySelector<HTMLElement>("[role=menuitem]:not([data-disabled])")?.focus()
    } else if (event.key === "Enter") {
      event.preventDefault()

      const first = items.find((i) => i.kind === "action" && !i.disabled)

      if (first?.kind === "action") {
        close()
        first.run()
      }
    } else if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation()
  }

  return (
    <>
      <label className="mb-1 flex h-row items-center gap-1.5 rounded-md bg-foreground/5 px-1.5">
        <SearchIcon aria-hidden className={`size-icon shrink-0 ${muted}`} />
        <input
          ref={field}
          type="search"
          aria-label={placeholder}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={keys}
        />
      </label>
      {items.length ? (
        <div className="max-h-[60vh] overflow-y-auto">
          <MenuItems items={items} />
        </div>
      ) : (
        query.trim() && <p className={`flex h-row items-center pl-7 ${muted}`}>Nothing matches</p>
      )}
    </>
  )
}

/** The menus as a row of triggers, each dropping its items: what the frame draws. */
export function MenuTriggers({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState("")

  return (
    <Menu.Root
      aria-label="Menu"
      value={open}
      onValueChange={(id) => {
        setOpen(id)
        menus.find((m) => m.id === id)?.opened?.()
      }}
      className="flex min-w-0 items-center gap-0.5"
    >
      {menus.map((menu) =>
        // A menu with nothing in it is its label alone.
        !menu.items.length && !menu.search ? (
          <span key={menu.id} className={`flex h-row min-w-0 items-center px-2 select-none ${menu.strong ? "shrink-0 font-medium" : ""}`}>
            <span className="truncate">{menu.label}</span>
          </span>
        ) : (
        <Menu.Menu key={menu.id} value={menu.id}>
          <Menu.Trigger
            disabled={menu.disabled}
            className={`flex h-row min-w-0 items-center rounded-md px-2 outline-none select-none data-highlighted:bg-foreground/8 data-[state=open]:bg-foreground/8 data-disabled:opacity-40 ${menu.strong ? "shrink-0 font-medium" : ""}`}
          >
            <span className="truncate">{menu.label}</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              side="bottom"
              align="start"
              sideOffset={4}
              className={menuContent}
            >
              {menu.search ? <Searched menu={{ ...menu, search: menu.search }} close={() => setOpen("")} /> : <MenuItems items={menu.items} />}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Menu>
        )
      )}
    </Menu.Root>
  )
}
