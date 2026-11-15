// Home: the shell's first tab, at /, and what the page shows where no tab is. It is the shell's own page, as a surface's
// page is its surface's, filling the page under the strip: a search focused at once, then what the shell offers at /, the
// surfaces to open, the settings among them, the open tabs to switch to, and the shell's own commands, among them ending
// the person's move while their changes wait. A surface's actions and places are in its tab's menu, never here. Typing
// filters them; arrows and Enter choose. Escape clears what is typed, then returns to the tab shown before. Its shortcut,
// ⌘P or Ctrl+P by default, goes home from anywhere, and from home back. A surface that does not load is listed, broken,
// and cannot be opened. Its footer says whose page it is, and when a later babavoss is out.
import { useEffect, useState, type ReactNode } from "react"
import { cn } from "cn"
import type { Handle } from "../../core/index.ts"
import { BoxIcon, LoaderCircleIcon, SendIcon } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../../kit/components/command"
import { Logo } from "./mark.tsx"
import type { Standing as TurnStanding } from "./turn.ts"
import { choices, type SurfaceEntry } from "./home.ts"
import { HOME } from "./pointing.ts"
import { SEARCH_MARK } from "./shortcuts.ts"
import { standing, type TabNeed } from "./tabs.tsx"

/** An open tab as home offers it, newest first. */
export type TabEntry = { at: string; n: number; surface: string; label: string; icon: ReactNode; needs?: TabNeed[]; broken?: string }

/** Home's search, which the shortcut focuses. */
export const SEARCH = `#content-${HOME} [cmdk-input]`

/** Whose page this is, from the meta tags the runtime serves the page with; presentation, never in a view. */
const about = (key: string): string | undefined => document.querySelector<HTMLMetaElement>(`meta[name="babavoss:${key}"]`)?.content || undefined

const Glyph = ({ children }: { children?: ReactNode }) => <span className="grid size-[22px] shrink-0 place-items-center">{children}</span>

/** Home's place in the strip, first: a tab like the others, selected while home is shown, the mark that says whose move it is. */
export function HomeTab({
  active,
  standing,
  animate,
  keys,
  lost = false,
  onSelect,
}: {
  active: boolean
  standing: TurnStanding
  animate: boolean
  keys: string
  /** The page lost its runtime and is finding it again: the mark sleeps, and says so in a bubble under it. */
  lost?: boolean
  onSelect: () => void
}) {
  return (
    <span className="relative grid shrink-0">
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
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/6 focus-visible:text-foreground data-[active]:bg-foreground/11 data-[active]:text-foreground not-hover:not-data-[active]:has-[[data-turn=working]]:bg-foreground/3"
      onClick={onSelect}
    >
      <Logo standing={standing} animate={animate} asleep={lost} />
    </button>
      {lost && (
        <span
          role="status"
          className="pointer-events-none absolute top-full left-0 z-50 mt-2.5 flex h-6 animate-in items-center gap-1.5 rounded-full rounded-tl-[3px] bg-popover pr-2.5 pl-2 text-meta whitespace-nowrap text-muted-foreground shadow-md ring-1 ring-foreground/10 duration-200 fade-in-0 zoom-in-95 before:absolute before:-top-[4px] before:left-2.5 before:size-2 before:rotate-45 before:border-t before:border-l before:border-foreground/10 before:bg-popover motion-reduce:animate-none"
        >
          <LoaderCircleIcon aria-hidden className="size-3 animate-spin [animation-duration:1.4s]" />
          Reconnecting
        </span>
      )}
    </span>
  )
}

type Props = {
  title?: string
  notice?: string
  surfaces: SurfaceEntry[]
  icons: Record<string, ReactNode | undefined>
  /** The open tabs, newest first. */
  tabs: TabEntry[]
  /** The tab shown before home, which Escape returns to. */
  back?: TabEntry
  /** Home's shortcut, as the person reads it. */
  keys: string
  /** Ending the person's move, while their changes wait for the agent: `run` says what it did. */
  end?: { drivable: boolean; run: () => Promise<string> }
  disabled: boolean
  loading: boolean
  launch: (open: Handle) => void
  select: (at: string) => void
  leave?: () => void
}

/** Home's page: the root's title, what the shell offers, and whose page it is at the bottom. */
export function Home({ title, notice, surfaces, icons, tabs, back, keys, end, disabled, loading, launch, select, leave }: Props) {
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
          <CommandInput autoFocus {...{ [SEARCH_MARK]: "" }} aria-label="Run, open or switch to" placeholder="Run, open or switch to…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-none">
            <CommandEmpty>{loading ? "Loading…" : "Nothing found."}</CommandEmpty>
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
            {end && (
              <CommandGroup heading="Shell">
                <CommandItem value="end move" keywords={["end my move", "agent", "turn", "changes"]} onSelect={() => void end.run().then(setEnded)}>
                  <Glyph>
                    <SendIcon aria-hidden />
                  </Glyph>
                  {end.drivable ? "End my move" : "Copy the message that ends my move"}
                  <span className="min-w-0 flex-1 truncate pl-1.5">{ended ?? (end.drivable ? "start the agent's turn with your changes" : "nothing here can start the agent's turn")}</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>
      <About className="mt-auto max-w-[560px] pt-6">
        <CommandShortcut className="ml-0 tracking-normal">{keys}</CommandShortcut>
      </About>
    </section>
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
