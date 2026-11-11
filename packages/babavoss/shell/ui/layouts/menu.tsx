// The header every layout shares: a menu bar, the util's command surface. Menus are data; every action a util offers is
// in one, even where a button also does it. The same items draw a context menu, so a right click offers what a menu does.
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { ContextMenu as Context, Menubar as Menu } from "radix-ui"

/**
 * One entry of a menu: an action; a checkbox; a choice among options, shown as a titled group of radio items; a
 * separator; or a submenu. `keys` names the shortcut an action will have; shown, not yet bound.
 */
export type MenuItem =
  | { kind: "action"; id: string; label: string; run: () => void; disabled?: boolean; keys?: string }
  | { kind: "check"; id: string; label: string; checked: boolean; set: (checked: boolean) => void; disabled?: boolean; keys?: string }
  | { kind: "choice"; id: string; label: string; value: string; options: { id: string; label: string }[]; set: (value: string) => void; disabled?: boolean }
  | { kind: "separator"; id: string }
  | { kind: "submenu"; id: string; label: string; items: MenuItem[]; disabled?: boolean }

/** A menu of the menu bar: what the util can do, by subject (Run, Issues, View). */
export type Menu = { id: string; label: string; items: MenuItem[]; disabled?: boolean }

export const muted = "text-muted-foreground"
export const menuItem = `relative flex h-row cursor-default items-center gap-2 rounded-md pr-2 pl-7 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-foreground/8 data-[state=open]:bg-foreground/8`
export const menuContent = "z-50 min-w-48 rounded-lg bg-popover p-1 text-body text-popover-foreground shadow-md ring-1 ring-foreground/10"

const Keys = ({ keys }: { keys?: string }) => (keys ? <span className={`ml-auto pl-4 text-meta ${muted}`}>{keys}</span> : null)

/** A menu's entries, nested where a submenu opens: the menu bar's, or a context menu's, which share their parts. */
export function MenuItems({ items, kit: M = Menu }: { items: MenuItem[]; kit?: typeof Menu }) {
  return items.map((item) => {
    switch (item.kind) {
      case "action":
        return (
          <M.Item key={item.id} disabled={item.disabled} className={menuItem} onSelect={item.run}>
            {item.label}
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

/**
 * The layout's top row, the menu bar: the scope's menu first, named by the open one, then the util's own, then View,
 * the layout's, last. Named by the util.
 */
export function MenuBar({ label, menus }: { label: string; menus: Menu[] }) {
  return (
    <header aria-label={label} className="flex h-menubar shrink-0 items-center gap-2 border-b bg-sidebar px-1">
      <Menu.Root aria-label="Menu" className="flex min-w-0 items-center gap-0.5">
        {menus.map((menu) => (
          <Menu.Menu key={menu.id}>
            <Menu.Trigger
              disabled={menu.disabled}
              className={`flex h-row items-center rounded-md px-2 outline-none select-none data-highlighted:bg-foreground/8 data-[state=open]:bg-foreground/8 data-disabled:opacity-40 ${menu.id === "scope" ? "font-medium" : ""}`}
            >
              {menu.label}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="start" sideOffset={4} className={menuContent}>
                <MenuItems items={menu.items} />
              </Menu.Content>
            </Menu.Portal>
          </Menu.Menu>
        ))}
      </Menu.Root>
    </header>
  )
}
