// The launcher: one palette to open a surface and to switch to an open tab, found by name. It drops from the strip's "+"
// and from ⌘K or Ctrl+K anywhere on the page; where no tab is open it is the page itself. A tab row says what stands in
// it, broken or who it needs, and its footer says, quietly, when a later babavoss is out.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { BoxIcon, PlusIcon, SettingsIcon } from "lucide-react"
import type { Handle } from "../../core/index.ts"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../../kit/components/command"
import { Popover, PopoverContent, PopoverTrigger } from "../../kit/components/popover"
import { standing, type TabNeed } from "./tabs.tsx"

/** A surface as the desktop lists it. */
export type SurfaceEntry = { name: string; description: string; open: Handle }
/** An open tab as the launcher offers it, newest first. */
export type TabEntry = { at: string; n: number; surface: string; label: string; icon: ReactNode; needs?: TabNeed[]; broken?: string }

type Choices = {
  surfaces: SurfaceEntry[]
  icons: Record<string, ReactNode | undefined>
  /** The open tabs, newest first. */
  tabs: TabEntry[]
  active: string
  disabled: boolean
  loading: boolean
  launch: (surface: SurfaceEntry) => void
  select: (at: string) => void
  settings: () => void
}

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const shortcut = mac ? "⌘K" : "Ctrl K"

/** Whose page this is, from the meta tags the runtime serves the page with; presentation, never in a view. */
const about = (key: string): string | undefined => document.querySelector<HTMLMetaElement>(`meta[name="babavoss:${key}"]`)?.content || undefined

const Glyph = ({ children }: { children: ReactNode }) => <span className="grid size-[22px] shrink-0 place-items-center">{children}</span>

/** The palette: what can be opened, the open tabs to switch to, and settings; typing filters all three. */
function Palette({ surfaces, icons, tabs, active, disabled, loading, launch, select, settings, search, setSearch, list }: Choices & {
  search: string
  setSearch: (search: string) => void
  list?: string
}) {
  const openable = surfaces

  return (
    <Command loop>
      <CommandInput autoFocus aria-label="Open or switch to" placeholder="Open or switch to…" value={search} onValueChange={setSearch} />
      <CommandList className={list}>
        <CommandEmpty>{loading ? "Loading…" : "Nothing found."}</CommandEmpty>
        {openable.length > 0 && (
          <CommandGroup heading="Open">
            {openable.map((u) => {
              const count = tabs.filter((tab) => tab.surface === u.name).length

              return (
                <CommandItem key={u.name} value={`surface ${u.name}`} keywords={[u.name, u.description]} disabled={disabled} onSelect={() => launch(u)}>
                  <Glyph>{icons[u.name] ?? <BoxIcon aria-hidden />}</Glyph>
                  <span className="max-w-[45%] shrink-0 truncate text-foreground">{u.name}</span>
                  <span className="min-w-0 flex-1 truncate pl-1.5" title={u.description}>
                    {u.description}
                  </span>
                  {count > 0 && <span className="pl-2 text-meta whitespace-nowrap">{count} open</span>}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
        {!loading && !openable.length && !search && <p className="my-2 ml-7 text-meta text-muted-foreground">Nothing to open yet.</p>}
        {tabs.length > 0 && (
          <CommandGroup heading="Switch to">
            {tabs.map((tab) => (
              <CommandItem key={tab.at} value={`tab ${tab.at}`} keywords={[tab.label, tab.surface, String(tab.n)]} onSelect={() => select(tab.at)}>
                <Glyph>{tab.icon}</Glyph>
                <span className="min-w-0 flex-1 truncate text-foreground">{tab.label}</span>
                <Standing tab={tab} active={tab.at === active} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Page">
          <CommandItem value="settings" keywords={["settings", "appearance", "theme"]} onSelect={settings}>
            <Glyph>
              <SettingsIcon aria-hidden />
            </Glyph>
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/** What the row of an open tab says at its end: broken, or who it needs and why, else which it is. */
function Standing({ tab, active }: { tab: TabEntry; active: boolean }) {
  const said = standing(tab)
  const person = tab.needs?.find((n) => n.who === "person")
  const first = tab.broken !== undefined ? "broken" : (person ?? tab.needs?.[0])?.why

  return (
    <span
      title={said.join("\n") || undefined}
      className={cn(
        "flex max-w-[50%] min-w-0 items-center gap-1.5 pl-2 text-meta",
        tab.broken !== undefined ? "text-destructive" : person ? "text-foreground" : undefined
      )}
    >
      {first !== undefined && (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tab.broken !== undefined ? "bg-destructive" : person ? "bg-warning" : "bg-muted-foreground/70")} />
      )}
      <span className="truncate">{first ?? (active ? "current" : `${tab.surface} ${tab.n}`)}</span>
    </span>
  )
}

/** The launcher as the page, where no tab is open: the root's title, the palette, and whose page it is at the bottom. */
export function Launcher({ title, notice, ...choices }: Choices & { title?: string; notice?: string }) {
  const [search, setSearch] = useState("")

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-4 pt-[max(16px,14vh)] pb-3" aria-label="Launcher">
      <div className="flex h-fit w-full max-w-[560px] flex-col gap-3">
        {title && <h1 className="truncate px-2 text-large font-medium">{title}</h1>}
        {notice && <p className="px-2 text-muted-foreground">{notice}</p>}
        <Palette {...choices} search={search} setSearch={setSearch} list="max-h-none" />
      </div>
      <About className="mt-auto max-w-[560px] pt-6" />
    </section>
  )
}

/** The strip's "+": the launcher dropped above it. A choice closes it; Escape clears what is typed, then closes. */
export function LauncherButton({ launch, select, settings, ...choices }: Choices) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const chose = useRef(false)
  const choose =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      chose.current = true
      setOpen(false)
      fn(...args)
    }

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      setOpen((was) => !was)
    }

    window.addEventListener("keydown", toggle)

    return () => window.removeEventListener("keydown", toggle)
  }, [])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setSearch("")
      }}
    >
      <PopoverTrigger
        id="tab-new"
        aria-label="Open or switch to"
        title={`Open or switch to (${shortcut})`}
        className={cn(
          "grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/11 data-[state=open]:text-foreground",
          choices.active === "new" && "bg-foreground/11 text-foreground"
        )}
      >
        <PlusIcon className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        aria-label="Launcher"
        className="w-[min(28rem,calc(100vw-16px))] gap-1.5 p-1.5"
        onOpenAutoFocus={() => (chose.current = false)}
        onCloseAutoFocus={(event) => {
          if (chose.current) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (!search) return
          event.preventDefault()
          setSearch("")
        }}
      >
        <Palette
          {...choices}
          launch={choose(launch)}
          select={choose(select)}
          settings={choose(settings)}
          search={search}
          setSearch={setSearch}
          list="max-h-[min(24rem,60dvh)]"
        />
        <About className="justify-between px-2.5 pt-0.5 pb-0.5">
          <CommandShortcut className="ml-0 tracking-normal">{shortcut}</CommandShortcut>
        </About>
      </PopoverContent>
    </Popover>
  )
}

/** One muted line: the root and its version, then the session shortened, whole on hover and copied on a click; and a later release, where one is out. */
function About({ className, children }: { className?: string; children?: ReactNode }) {
  const [facts] = useState(() => ({ root: about("root"), version: about("version"), session: about("session"), update: about("update") }))
  const [copied, setCopied] = useState(false)
  const { root, version, session, update } = facts

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopied(false), 1500)

    return () => clearTimeout(timer)
  }, [copied])

  if (!root && !session && !children) return null

  return (
    <footer className={cn("flex w-full flex-wrap justify-center gap-x-3 px-2 text-meta text-muted-foreground", className)}>
      <span className="flex min-w-0 gap-x-3">
        {root && <span className="truncate">{version ? `${root} ${version}` : root}</span>}
        {session && (
          <button
            type="button"
            title={session}
            aria-label={`Copy session id ${session}`}
            className="cursor-pointer rounded-sm whitespace-nowrap hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            onClick={() => void navigator.clipboard?.writeText(session).then(() => setCopied(true))}
          >
            {copied ? "Copied" : `session ${session.slice(0, 8)}`}
          </button>
        )}
        {update && (
          <span className="truncate" title={`babavoss ${update} is out; the agent is told how to take it`}>
            babavoss {update} is out: ask the agent to update
          </span>
        )}
      </span>
      {children}
    </footer>
  )
}
