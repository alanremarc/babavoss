// Home: the shell's first tab, at /, and what the page shows where no tab is. It is the palette, filling the page under
// the strip: a search focused at once, then the commands of the tab shown before home, the surfaces to open, the open tabs
// to switch to, and the page's own, among them ending the person's move while their changes wait. Typing filters them all; arrows and Enter choose. Escape clears what is typed, then
// returns to the tab shown before. ⌘K or Ctrl+K goes home from anywhere, and from home back. A surface that does not load
// is listed, broken, and cannot be opened. Its footer says whose page it is, and when a later babavoss is out.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { cn } from "cn"
import type { Handle } from "../../core/index.ts"
import { BoxIcon, SendIcon, SettingsIcon } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../../kit/components/command"
import { named, type Command as TabCommand } from "./commands.ts"
import type { TabCommands } from "./actions.tsx"
import { Logo } from "./mark.tsx"
import type { Standing as TurnStanding } from "./turn.ts"
import { choices, type SurfaceEntry } from "./home.ts"
import { HOME } from "./pointing.ts"
import { standing, type TabNeed } from "./tabs.tsx"

/** An open tab as home offers it, newest first. */
export type TabEntry = { at: string; n: number; surface: string; label: string; icon: ReactNode; needs?: TabNeed[]; broken?: string }

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const keys = mac ? "⌘K" : "Ctrl K"
/** Home's search, which the shortcut focuses. */
const SEARCH = `#content-${HOME} [cmdk-input]`

/** Whose page this is, from the meta tags the runtime serves the page with; presentation, never in a view. */
const about = (key: string): string | undefined => document.querySelector<HTMLMetaElement>(`meta[name="babavoss:${key}"]`)?.content || undefined

const Glyph = ({ children }: { children?: ReactNode }) => <span className="grid size-[22px] shrink-0 place-items-center">{children}</span>

/** ⌘K or Ctrl+K anywhere on the page: `go` says where; on home the search takes focus. */
export function useHomeKey(go: () => void) {
  const latest = useRef(go)

  latest.current = go
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      latest.current()
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(SEARCH)?.focus())
    }

    window.addEventListener("keydown", press)

    return () => window.removeEventListener("keydown", press)
  }, [])
}

/** Home's place in the strip, first: a tab like the others, selected while home is shown, the mark that says whose move it is. */
export function HomeTab({ active, standing, onSelect }: { active: boolean; standing: TurnStanding; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${HOME}`}
      aria-selected={active}
      aria-controls={`content-${HOME}`}
      aria-label={`Home. ${standing.said}`}
      title={`Home: open, switch to or run (${keys})\n${standing.said}`}
      tabIndex={active ? 0 : -1}
      data-active={active || undefined}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:bg-foreground/11 data-[active]:text-foreground not-hover:not-data-[active]:has-[[data-turn=working]]:bg-foreground/3 transition-colors duration-500"
      onClick={onSelect}
    >
      <Logo standing={standing} />
    </button>
  )
}

type Props = {
  title?: string
  notice?: string
  surfaces: SurfaceEntry[]
  icons: Record<string, ReactNode | undefined>
  /** The open tabs, newest first. */
  tabs: TabEntry[]
  /** The tab shown before home, which Escape returns to and whose commands come first. */
  back?: TabEntry
  commands: TabCommands
  /** Ending the person's move, while their changes wait for the agent: `run` says what it did. */
  end?: { drivable: boolean; run: () => Promise<string> }
  disabled: boolean
  loading: boolean
  launch: (open: Handle) => void
  select: (at: string) => void
  settings: () => void
  leave?: () => void
}

/** Home's page: the root's title, the palette, and whose page it is at the bottom. */
export function Home({ title, notice, surfaces, icons, tabs, back, commands, end, disabled, loading, launch, select, settings, leave }: Props) {
  const [search, setSearch] = useState("")
  const [ended, setEnded] = useState<string>()
  const offered = choices(surfaces)

  // What ending the move last did is said until the turn moves on.
  useEffect(() => setEnded(undefined), [end?.drivable, !end])

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-4 pt-[max(16px,10vh)] pb-3 text-body" aria-label="Home">
      <div className="flex h-fit w-full max-w-[560px] flex-col gap-3">
        {title && <h1 className="truncate px-2 text-large font-medium">{title}</h1>}
        {notice && <p className="px-2 text-muted-foreground">{notice}</p>}
        {/* Made again once / is read, so the first choice is the first entry, not what stood alone while loading. */}
        <Command
          key={loading ? "loading" : "ready"}
          loop
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            if (search) setSearch("")
            else leave?.()
          }}
        >
          <CommandInput autoFocus aria-label="Run, open or switch to" placeholder="Run, open or switch to…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-none">
            <CommandEmpty>{loading ? "Loading…" : "Nothing found."}</CommandEmpty>
            {back && <BackCommands commands={commands} tab={back} select={select} />}
            {offered.length > 0 && (
              <CommandGroup heading="Open">
                {offered.map((u) => {
                  const count = tabs.filter((tab) => tab.surface === u.name).length

                  return "broken" in u ? (
                    <CommandItem key={u.name} value={`surface ${u.name}`} keywords={[u.name, "broken", u.broken]} disabled data-broken="">
                      <Glyph>{icons[u.name] ?? <BoxIcon aria-hidden />}</Glyph>
                      <span className="max-w-[45%] shrink-0 truncate text-foreground">{u.name}</span>
                      <span className="pl-1.5 text-meta whitespace-nowrap text-destructive">does not load</span>
                      <span className="min-w-0 flex-1 truncate pl-1.5" title={u.broken}>
                        {u.broken}
                      </span>
                    </CommandItem>
                  ) : (
                    <CommandItem key={u.name} value={`surface ${u.name}`} keywords={[u.name, u.description]} disabled={disabled} onSelect={() => launch(u.open)}>
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
            {!loading && !offered.length && !search && <p className="my-2 ml-7 text-meta text-muted-foreground">Nothing to open yet.</p>}
            {tabs.length > 0 && (
              <CommandGroup heading="Switch to">
                {tabs.map((tab) => (
                  <CommandItem key={tab.at} value={`tab ${tab.at}`} keywords={[tab.label, tab.surface, String(tab.n)]} onSelect={() => select(tab.at)}>
                    <Glyph>{tab.icon}</Glyph>
                    <span className="min-w-0 flex-1 truncate text-foreground">{tab.label}</span>
                    <Standing tab={tab} previous={tab.at === back?.at} />
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
              {end && (
                <CommandItem value="end move" keywords={["end my move", "agent", "turn", "changes"]} onSelect={() => void end.run().then(setEnded)}>
                  <Glyph>
                    <SendIcon aria-hidden />
                  </Glyph>
                  {end.drivable ? "End my move" : "Copy the message that ends my move"}
                  <span className="min-w-0 flex-1 truncate pl-1.5">{ended ?? (end.drivable ? "start the agent's turn with your changes" : "nothing here can start the agent's turn")}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
      <About className="mt-auto max-w-[560px] pt-6">
        <CommandShortcut className="ml-0 tracking-normal">{keys}</CommandShortcut>
      </About>
    </section>
  )
}

/**
 * The commands of the tab shown before home, as its actions give them, under the tab's name: what waits on the person
 * first. Its actions stay live while home is shown, so they are current. A command goes back to its tab, then runs, so
 * what it opens, such as its prompt, opens there.
 */
function BackCommands({ commands: store, tab, select }: { commands: TabCommands; tab: TabEntry; select: (at: string) => void }) {
  const commands = useSyncExternalStore(store.subscribe, () => store.get(tab.at)) ?? []
  const own = new Set([tab.label, named(tab.surface)])
  const list = [...commands.filter((c) => c.ask), ...commands.filter((c) => !c.ask)]
  const choose = (command: TabCommand) => {
    select(tab.at)
    requestAnimationFrame(command.run)
  }

  if (!list.length) return null

  return (
    <CommandGroup heading={tab.label}>
      {list.map((c) => (
        <CommandItem key={c.id} value={`command ${c.id}`} keywords={[c.label, c.hint ?? "", c.group, tab.label]} disabled={c.disabled} onSelect={() => choose(c)}>
          <Glyph>{c.ask && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}</Glyph>
          <span className="max-w-[45%] shrink-0 truncate text-foreground">{c.label}</span>
          {c.hint && c.hint !== c.label && (
            <span className="min-w-0 flex-1 truncate pl-1.5" title={c.hint}>
              {c.hint}
            </span>
          )}
          {!own.has(c.group) && <span className="ml-auto pl-2 text-meta whitespace-nowrap">{c.group}</span>}
          {c.keys && <CommandShortcut>{c.keys}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

/** What the row of an open tab says at its end: broken, or who it needs and why, else which it is. */
function Standing({ tab, previous }: { tab: TabEntry; previous: boolean }) {
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
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tab.broken !== undefined ? "bg-destructive" : person ? "bg-primary" : "bg-muted-foreground/70")} />
      )}
      <span className="truncate">{first ?? (previous ? "previous" : `${tab.surface} ${tab.n}`)}</span>
    </span>
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
