// Menus as data, and the ways they open: a row of triggers that drops them, a dropdown from one button, as the shell's
// tab menu is, and a context menu where a right click offers what a menu does. A menu may open with a search field at its
// top, which filters its entries or, given `find`, looks further and puts what it finds in their place while there is a query.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { CheckIcon, ChevronRightIcon, CircleIcon, SearchIcon } from "lucide-react"
import { ContextMenu as Context, DropdownMenu as Dropdown, Menubar as Menu } from "radix-ui"

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

/**
 * A menu, by subject. `search` puts a field at its top: without `find` it filters the entries by their words; with it,
 * the entries are what `find` gives for the query, the menu's own while it is empty. `opened` is told each time it opens.
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
export const menuRow = `relative flex h-row cursor-default items-center gap-2 rounded-md pr-2 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-foreground/8 data-[state=open]:bg-foreground/8`
/** A list that scrolls up and down where it is long, with no bar to show for it, and never sideways: its entries are cut. */
export const quietScroll = "overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
export const menuContent = `z-50 min-w-48 max-w-96 max-h-[calc(100dvh-4rem)] rounded-lg bg-popover p-1 text-body text-popover-foreground shadow-md ring-1 ring-foreground/10 ${quietScroll}`

/** The one mark of what waits on the person, beside an entry: on it, and on every label and submenu on the way to it. */
const Mark = () => <span aria-label="waits on you" className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />

const Keys = ({ keys }: { keys?: string }) => (keys ? <span className={`ml-auto pl-4 text-meta ${muted}`}>{keys}</span> : null)

/** A menu's entries, nested where a submenu opens: a row of triggers', a dropdown's or a context menu's, which share their parts. */
export function MenuItems({ items, kit: M = Menu }: { items: MenuItem[]; kit?: typeof Menu }) {
  // The room at the left is for a tick: a menu without one starts its entries at its edge. A mark stands at the right.
  const pad = items.some((item) => item.kind === "check" || item.kind === "choice") ? "pl-7" : "pl-2"
  const menuItem = `${menuRow} ${pad}`

  return items.map((item) => {
    switch (item.kind) {
      case "action":
        return (
          <M.Item key={item.id} disabled={item.disabled} className={menuItem} onSelect={item.run} title={item.hint}>
            <span className="min-w-0 truncate">{item.label}</span>
            {item.note && <span className={`min-w-0 shrink-[2] truncate text-meta ${muted}`}>{item.note}</span>}
            {item.mark && <Mark />}
            <Keys keys={item.mark ? undefined : item.keys} />
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
            <span className="min-w-0 truncate">{item.label}</span>
            <Keys keys={item.keys} />
          </M.CheckboxItem>
        )
      case "choice":
        return (
          <M.Group key={item.id} aria-label={item.label}>
            <M.Label className={`flex h-row items-center ${pad} text-meta ${muted}`}>{item.label}</M.Label>
            <M.RadioGroup value={item.value} onValueChange={item.set}>
              {item.options.map((o) => (
                <M.RadioItem key={o.id} value={o.id} disabled={item.disabled} className={menuItem}>
                  <M.ItemIndicator className="absolute left-2 grid size-icon place-items-center">
                    <CircleIcon className="size-1.5 fill-current" />
                  </M.ItemIndicator>
                  <span className="min-w-0 truncate">{o.label}</span>
                </M.RadioItem>
              ))}
            </M.RadioGroup>
          </M.Group>
        )
      case "separator":
        return <M.Separator key={item.id} className="-mx-1 my-1 h-px bg-border" />
      case "label":
        return (
          <M.Label key={item.id} className={`relative flex h-row min-w-0 items-center ${pad} pr-2 ${item.strong ? "font-medium text-foreground" : `text-meta ${muted}`}`}>
            <span className="truncate">{item.label}</span>
            {item.mark && <Mark />}
          </M.Label>
        )
      case "submenu":
        return (
          <M.Sub key={item.id}>
            <M.SubTrigger disabled={item.disabled} className={menuItem}>
              <span className="min-w-0 truncate">{item.label}</span>
              {item.mark && <Mark />}
              <ChevronRightIcon aria-hidden className={`${item.mark ? "" : "ml-auto"} size-glyph shrink-0 ${muted}`} />
            </M.SubTrigger>
            <M.Portal>
              {/* A submenu opens over its parent's edge, covering the arrow it grew from, its first entry level with that entry: up by its own padding, and by its field where it has one. */}
              <M.SubContent sideOffset={-28} alignOffset={item.search ? -32 : -4} className={menuContent}>
                {item.search ? <SearchMenu placeholder={item.search} items={item.items} kit={M} /> : <MenuItems items={item.items} kit={M} />}
              </M.SubContent>
            </M.Portal>
          </M.Sub>
        )
    }
  })
}

/** The context menu's kit, which shares the parts of a row of triggers. */
export const ContextKit = Context as unknown as typeof Menu
/** The dropdown's kit, which shares them too. */
export const DropdownKit = Dropdown as unknown as typeof Menu

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

/**
 * A menu's entries under a search field it opens on: typing filters them or, given `find`, puts what it finds in their
 * place; Down goes to the entries, Enter takes the first. `close` closes the menu before an entry taken by Enter runs.
 */
export function SearchMenu({
  placeholder,
  items: all,
  find,
  kit = Menu,
  close,
  empty,
}: {
  placeholder: string
  items: MenuItem[]
  find?: (query: string) => MenuItem[]
  kit?: typeof Menu
  close?: () => void
  /** What the menu says while it has no entries and no query, such as that they are being read. */
  empty?: string
}) {
  const [query, setQuery] = useState("")
  const field = useRef<HTMLInputElement>(null)
  const asked = query.trim() !== ""
  const items = !asked ? all : find ? find(query) : filtered(all, query)

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
        close?.()
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
        <div className={`max-h-[60vh] ${quietScroll}`}>
          <MenuItems items={items} kit={kit} />
        </div>
      ) : asked ? (
        <p className={`flex h-row items-center pl-2 ${muted}`}>Nothing matches</p>
      ) : (
        empty && <p className={`flex h-row items-center pl-2 ${muted}`}>{empty}</p>
      )}
    </>
  )
}

/**
 * A menu dropped from one button, `trigger`, opening downward from its start: open on the button's press, or wherever
 * `open` is set, as by a right click. `closed` is told as it closes, in place of the focus going back to the button.
 */
export function MenuDropdown({
  open,
  setOpen,
  label,
  trigger,
  closed,
  sideOffset = 4,
  alignOffset = 0,
  className = "",
  children,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  label: string
  trigger: ReactNode
  closed?: () => void
  sideOffset?: number
  alignOffset?: number
  className?: string
  children: ReactNode
}) {
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side="bottom"
          align="start"
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={8}
          aria-label={label}
          className={`${menuContent} w-72 ${className}`}
          onCloseAutoFocus={(event) => {
            if (!closed) return
            event.preventDefault()
            closed()
          }}
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

/** The menus as a row of triggers, each dropping its items: a scope's row in a layout. */
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
              {menu.search ? (
                <SearchMenu placeholder={menu.search.placeholder} items={menu.items} find={menu.search.find} close={() => setOpen("")} />
              ) : (
                <MenuItems items={menu.items} />
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Menu>
        )
      )}
    </Menu.Root>
  )
}
