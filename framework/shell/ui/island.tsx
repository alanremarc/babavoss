// The island: a tab's menu as its drawer holds it, floating over the thread's head. At rest it is its search field alone, a
// pill; while anything in it has focus it opens to its entries, scrolling inside them with no bar and a fade at either end.
// The entries are the menu the shell draws from a surface's views (commands.ts), with its density and nesting: pills,
// a submenu opening in place under its entry, set in. Typing searches, as the menu's `find` or its own words; Up and Down
// move through every entry shown, nested ones too, Right and Left open and close a submenu, Enter runs, and Enter from the
// field runs the first result. Running an entry closes the drawer first, as Escape does.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ChevronRightIcon, SearchIcon } from "lucide-react"
import { cn } from "../../kit/cn.ts"
import { filtered, quietScroll, type MenuItem } from "../../kit/layouts/menu.tsx"
import { SEARCH_MARK } from "./shortcuts.ts"

/** An entry the keys move through: every row that can be run or opened, as shown. */
const ENTRY = "[data-entry]:not(:disabled)"
const row = "flex h-row w-full min-w-0 shrink-0 items-center gap-2 rounded-full px-3 text-left outline-none select-none"
const live = "cursor-pointer hover:bg-foreground/6 focus-visible:bg-foreground/8 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
const fade = "[mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)]"

/** The one mark of what waits on the person, on an entry and on every step of the way to it. */
const Dot = () => <span aria-label="waits on you" className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />

/**
 * `items` the menu; `find` what searching finds beyond them; `empty` what it says while it has none and no query; `done`
 * closes the drawer, before an entry runs; `field` is told the search field, which the drawer focuses as it opens.
 */
export function Island({
  items: all,
  find,
  empty,
  label,
  done,
  field,
}: {
  items: MenuItem[]
  find?: (query: string) => MenuItem[]
  empty?: string
  label: string
  done: () => void
  field?: (input: HTMLInputElement | null) => void
}) {
  const [query, setQuery] = useState("")
  const [engaged, setEngaged] = useState(false)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const self = useRef<HTMLDivElement>(null)
  const asked = query.trim() !== ""
  const items = !asked ? all : find ? find(query) : filtered(all, query)
  const run = (fn: () => void) => {
    done()
    fn()
  }
  const flip = (id: string, to?: boolean) =>
    setOpened((was) => {
      const now = new Set(was)

      if (to ?? !now.has(id)) now.add(id)
      else now.delete(id)

      return now
    })
  const entries = () => [...(self.current?.querySelectorAll<HTMLElement>(ENTRY) ?? [])]
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = entries()
    const target = event.target as HTMLElement
    const at = list.indexOf(target)
    const inField = target.tagName === "INPUT"
    const to = (i: number) => {
      event.preventDefault()
      if (i < 0) return self.current?.querySelector<HTMLInputElement>("input")?.focus()
      list[Math.min(list.length - 1, i)]?.focus()
    }

    if (event.key === "ArrowDown") return to(inField ? 0 : at + 1)
    if (event.key === "ArrowUp") return to(inField ? list.length - 1 : at - 1)
    if (inField) return
    if (event.key === "Home") return to(0)
    if (event.key === "End") return to(list.length - 1)

    const sub = target.dataset.submenu
    const parent = target.closest<HTMLElement>("[data-in]")?.dataset.in

    if (event.key === "ArrowRight" && sub && !opened.has(sub)) return (event.preventDefault(), flip(sub, true))
    if (event.key === "ArrowLeft" && sub && opened.has(sub)) return (event.preventDefault(), flip(sub, false))
    if (event.key === "ArrowLeft" && parent) {
      event.preventDefault()
      flip(parent, false)
      self.current?.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(parent)}"]`)?.focus()
    }
  }

  // A query that changes shows its results from the top.
  useLayoutEffect(() => {
    self.current?.querySelector("[data-entries]")?.scrollTo({ top: 0 })
  }, [query])

  return (
    <div
      ref={self}
      role="menu"
      aria-label={label}
      data-island
      data-engaged={engaged || undefined}
      className="absolute inset-x-2 top-2 z-10 flex flex-col rounded-[22px] bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      onFocus={() => setEngaged(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setEngaged(false)
      }}
      onKeyDown={keys}
    >
      <label className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-foreground/6 px-3">
        <SearchIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={field}
          type="search"
          aria-label="Search actions and places"
          placeholder="Search actions and places"
          {...{ [SEARCH_MARK]: "" }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()

            const first = firstAction(items)

            if (first) run(first.run)
          }}
        />
      </label>
      {engaged && (
        <div data-entries className={cn("mt-1 flex max-h-[312px] flex-col py-1", quietScroll, fade)}>
          {items.length ? (
            <Entries items={items} opened={opened} flip={flip} run={run} />
          ) : (
            <p className="flex h-row items-center px-3 text-muted-foreground">{asked ? "Nothing matches" : (empty ?? "Nothing to do here")}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** The first entry Enter from the field runs: an action, at any depth, that is not disabled. */
function firstAction(items: MenuItem[]): Extract<MenuItem, { kind: "action" }> | undefined {
  for (const item of items) {
    if (item.kind === "action" && !item.disabled) return item
    if (item.kind === "submenu" && !item.disabled) {
      const inner = firstAction(item.items)

      if (inner) return inner
    }
  }

  return undefined
}

/** A menu's entries as pills; a submenu's under it, set in, while it is open. */
function Entries({
  items,
  opened,
  flip,
  run,
  within,
}: {
  items: MenuItem[]
  opened: ReadonlySet<string>
  flip: (id: string) => void
  run: (fn: () => void) => void
  within?: string
}): ReactNode {
  return items.map((item) => {
    const key = `${within ?? ""} ${item.id}`

    switch (item.kind) {
      case "action":
        return (
          <button
            key={key}
            type="button"
            role="menuitem"
            data-entry
            tabIndex={-1}
            disabled={item.disabled}
            title={item.hint}
            className={cn(row, live)}
            onClick={() => run(item.run)}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            {item.note && <span className="min-w-0 shrink-[2] truncate text-meta text-muted-foreground">{item.note}</span>}
            {item.mark ? <Dot /> : item.keys && <span className="ml-auto pl-4 text-meta text-muted-foreground">{item.keys}</span>}
          </button>
        )
      case "check":
        return (
          <button
            key={key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={item.checked}
            data-entry
            tabIndex={-1}
            disabled={item.disabled}
            className={cn(row, live)}
            onClick={() => run(() => item.set(!item.checked))}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            {item.checked && <span className="ml-auto text-meta text-muted-foreground">on</span>}
          </button>
        )
      case "choice":
        return (
          <div key={key} role="group" aria-label={item.label} className="flex flex-col">
            <span className="flex h-row items-center px-3 text-meta text-muted-foreground">{item.label}</span>
            {item.options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={o.id === item.value}
                data-entry
                tabIndex={-1}
                disabled={item.disabled}
                className={cn(row, live, "pl-5")}
                onClick={() => run(() => item.set(o.id))}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {o.id === item.value && <span className="ml-auto size-1.5 rounded-full bg-foreground" />}
              </button>
            ))}
          </div>
        )
      case "separator":
        return <hr key={key} className="mx-3 my-1 border-border" />
      case "label":
        return (
          <span key={key} className={cn("flex h-row shrink-0 items-center gap-2 px-3", item.strong ? "font-medium text-foreground" : "text-meta text-muted-foreground")}>
            <span className="truncate">{item.label}</span>
            {item.mark && <Dot />}
          </span>
        )
      case "submenu": {
        const open = opened.has(item.id)

        return (
          <div key={key} className="flex flex-col">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              data-entry
              data-submenu={item.id}
              tabIndex={-1}
              disabled={item.disabled}
              className={cn(row, live)}
              onClick={() => flip(item.id)}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              {item.mark && <Dot />}
              <ChevronRightIcon
                aria-hidden
                className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", !item.mark && "ml-auto", open && "rotate-90")}
              />
            </button>
            {open && (
              <div role="menu" aria-label={item.label} data-in={item.id} className="ml-3 flex flex-col border-l border-border/70 pl-1">
                <Entries items={item.items} opened={opened} flip={flip} run={run} within={item.id} />
              </div>
            )}
          </div>
        )
      }
    }
  })
}
