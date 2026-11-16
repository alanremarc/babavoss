// Home: the shell's first tab, at /, and what the page shows where no tab is. It is the shell's own page, as a surface's
// page is its surface's, filling the page under the strip: a search focused at once, then what the shell offers at /, the
// surfaces to open, the settings among them, the open tabs to switch to. A surface's actions and places are in its tab's menu, never here. Typing
// filters them; arrows and Enter choose. Escape clears what is typed, then returns to the tab shown before. Its shortcut,
// ⌘P or Ctrl+P by default, goes home from anywhere, and from home back. A surface that does not load is listed, broken,
// and cannot be opened. Its footer says whose page it is, and when a later babavoss is out; beside home's shortcut, the
// command key with Enter, where the chosen line is an open tab whose surface opens another.
import { useEffect, useState, type ReactNode } from "react"
import { cn } from "../../kit/cn.ts"
import type { Handle } from "../../core/index.ts"
import { BoxIcon } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../../kit/components/command"
import { Logo } from "./mark.tsx"
import type { Standing as TurnStanding } from "./turn.ts"
import { doesOf, rowsOf, type HomeRow, type SurfaceEntry } from "./home.ts"
import { named } from "./commands.ts"
import { HOME } from "./pointing.ts"
import { mac, SEARCH_MARK } from "./shortcuts.ts"
import { shown } from "../settings/src/keys.ts"
import { MARK, standing, type TabNeed } from "./tabs.tsx"

/** An open tab as home offers it, newest first. */
export type TabEntry = { at: string; n: number; surface: string; label: string; icon: ReactNode; needs?: TabNeed[]; broken?: string; mark?: keyof typeof MARK }

/** What Enter with the command key is, as the person reads it on this platform: ⌘Enter, or Ctrl+Enter. */
const ANOTHER = shown("mod+enter", mac)

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
  lost,
  onSelect,
}: {
  active: boolean
  standing: TurnStanding
  animate: boolean
  keys: string
  /** What the page says of a runtime it lost and is finding again: the mark shows it, and says it on hover. */
  lost?: string
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
      aria-label={`Home. ${lost ?? standing.said}`}
      title={lost ?? `Home: open, switch to or run (${keys})\n${standing.said}`}
      tabIndex={active ? 0 : -1}
      data-active={active || undefined}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/6 focus-visible:text-foreground data-[active]:bg-foreground/11 data-[active]:text-foreground not-hover:not-data-[active]:has-[[data-turn=working]]:bg-foreground/3"
      onClick={onSelect}
    >
      <Logo standing={standing} animate={animate} lost={!!lost} />
    </button>
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
  /** Home's shortcut, as the person reads it. */
  keys: string
  /** The session's harness, by its adapter's name, once known. */
  harness?: string
  /** Ending the person's move, while their changes wait for the agent: `run` says what it did. */
  disabled: boolean
  loading: boolean
  launch: (open: Handle) => void
  select: (at: string) => void
  leave?: () => void
}

/** A line's end: what Enter does on it, the same whether it is the chosen line or not; nothing on one that does not load. */
function Does({ row }: { row: HomeRow }) {
  const { enter } = doesOf(row)

  if (!enter) return null

  return (
    <span className="shrink-0 pl-3 text-meta whitespace-nowrap group-data-[selected=true]/command-item:text-foreground">
      {enter}
    </span>
  )
}

/**
 * Home's page: the root's title, then one list of what the shell has, each thing once: the open tabs, then the surfaces with
 * none open. A line names the thing and says at its end what Enter does on it. Enter with the
 * command key opens another tab of an open tab's surface, which the footer says while such a line is chosen.
 */
export function Home({ title, notice, surfaces, icons, tabs, keys, harness, disabled, loading, launch, select, leave }: Props) {
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState("")
  const rows = rowsOf(surfaces, tabs)
  const chosen = rows.find((row) => row.value === picked)
  const other = chosen && !disabled ? doesOf(chosen).other : undefined
  const tabOf = (at: string) => tabs.find((tab) => tab.at === at)

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-4 pt-[max(16px,10vh)] pb-3 text-body" aria-label="Home">
      <div className="flex h-fit w-full max-w-[560px] flex-col gap-3">
        {title && <h1 className="truncate px-2 text-large font-medium">{title}</h1>}
        {notice && <p className="px-2 text-muted-foreground">{notice}</p>}
        {/* Made again once / is read, so the first choice is the first entry, not what stood alone while loading. */}
        <Command
          key={loading ? "loading" : "ready"}
          loop
          value={picked}
          onValueChange={setPicked}
          onKeyDown={(event) => {
            // Enter with the command key does the chosen line's other thing: another tab of an open tab's surface.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (chosen?.kind === "tab" && chosen.another && !disabled) launch(chosen.another)

              return
            }
            if (event.key !== "Escape") return
            event.preventDefault()
            if (search) setSearch("")
            else leave?.()
          }}
        >
          <CommandInput autoFocus {...{ [SEARCH_MARK]: "" }} aria-label="Run, open or switch to" placeholder="Run, open or switch to…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-none">
            <CommandEmpty>{loading ? "Loading…" : "Nothing found."}</CommandEmpty>
            {rows.length > 0 && (
              <CommandGroup>
                {rows.map((row) => {
                  if (row.kind === "tab") {
                    const tab = tabOf(row.at)!
                    const description = surfaces.find((u) => u.name === row.surface)?.description

                    return (
                      <CommandItem key={row.value} value={row.value} keywords={[row.label, row.surface, description ?? "", String(tab.n), "tab", "go"]} onSelect={() => select(row.at)}>
                        <TabGlyph tab={tab} />
                        <span className="min-w-0 shrink truncate text-foreground" title={description}>
                          {row.label}
                        </span>
                        <span className="flex-1" />
                        <Does row={row} />
                      </CommandItem>
                    )
                  }
                  if (row.kind === "broken")
                    return (
                      <CommandItem key={row.value} value={row.value} keywords={[row.name, "broken", row.broken]} disabled data-broken="">
                        <Glyph>{icons[row.name] ?? <BoxIcon aria-hidden />}</Glyph>
                        <span className="max-w-[45%] shrink-0 truncate text-foreground">{named(row.name)}</span>
                        <span className="pl-1.5 text-meta whitespace-nowrap text-destructive">does not load</span>
                        <span className="min-w-0 flex-1 truncate pl-1.5 text-meta" title={row.broken}>
                          {row.broken}
                        </span>
                        <Does row={row} />
                      </CommandItem>
                    )

                  return (
                    <CommandItem key={row.value} value={row.value} keywords={[row.name, row.description, "surface", "open"]} disabled={disabled} onSelect={() => launch(row.open)}>
                      <Glyph>{icons[row.name] ?? <BoxIcon aria-hidden />}</Glyph>
                      {/* A surface's description is written for the agent, to choose it by: here it is found by, and told on hover, not shown. */}
                      <span className="min-w-0 flex-1 truncate text-foreground" title={row.description}>
                        {named(row.name)}
                      </span>
                      <Does row={row} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {!loading && !rows.length && !search && <p className="my-2 ml-7 text-meta text-muted-foreground">Nothing to open yet.</p>}
          </CommandList>
        </Command>
      </div>
      <About className="mt-auto max-w-[560px] pt-6" harness={harness}>
        <span className="whitespace-nowrap">
          <CommandShortcut className="ml-0 tracking-normal">{keys}</CommandShortcut> Home
        </span>
        {other && (
          <span className="whitespace-nowrap">
            <CommandShortcut className="ml-0 tracking-normal">{ANOTHER}</CommandShortcut> {other}
          </span>
        )}
      </About>
    </section>
  )
}

/** The tab's icon with its mark in the corner, as its pill in the strip has it: broken, waiting on the person, or needing the agent. */
function TabGlyph({ tab }: { tab: TabEntry }) {
  return (
    <span className="relative grid size-[22px] shrink-0 place-items-center" title={standing(tab).join("\n") || undefined}>
      {tab.icon}
      {tab.mark && <span aria-hidden data-mark={tab.mark} className={cn("absolute top-0 right-0 rounded-full", MARK[tab.mark])} />}
    </span>
  )
}

/** A harness as the person knows it, by its adapter's name; one not known here is said by that name. */
const HARNESSES: Record<string, string> = { claude: "Claude Code", codex: "Codex" }

/** One muted line: the root and its version, then the session shortened, whole on hover and copied on a click, and its harness once a hook said it; and a later release, where one is out. */
function About({ className, harness, children }: { className?: string; harness?: string; children?: ReactNode }) {
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
        {harness && (
          <span className="whitespace-nowrap" title="The harness this session's agent runs in, as its hooks say">
            {HARNESSES[harness] ?? harness}
          </span>
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
