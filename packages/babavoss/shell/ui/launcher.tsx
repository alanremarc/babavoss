import { useEffect, useState, type ReactNode } from "react"
import { BoxIcon, SettingsIcon } from "lucide-react"
import type { Handle } from "../../core/index.ts"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/command"

/** A util as home lists it; one that is always open offers no `open`: its tab is there. */
export type UtilEntry = { name: string; description: string; open?: Handle }

/** Whose page this is, from the meta tags the runtime serves the page with; presentation, never in a view. */
const about = (key: string): string | undefined => document.querySelector<HTMLMetaElement>(`meta[name="babavoss:${key}"]`)?.content || undefined

/** The launcher: the app's title, the utils as a command palette, the shortcuts, and whose page it is at the bottom. */
export function Launcher({
  title,
  utils,
  icons,
  tabs,
  disabled,
  loading,
  launch,
  settings,
}: {
  title?: string
  utils: UtilEntry[]
  icons: Record<string, ReactNode | undefined>
  tabs: { util: string }[]
  disabled: boolean
  loading: boolean
  launch: (util: UtilEntry) => void
  settings: () => void
}) {
  const [search, setSearch] = useState("")

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-4 pt-[max(16px,14vh)] pb-3" aria-label="Launcher">
      <div className="flex h-fit w-full max-w-[560px] flex-col gap-3">
        {title && <h1 className="truncate px-2 text-large font-medium">{title}</h1>}
        <Command loop>
          <CommandInput
            autoFocus
            aria-label="Search utils"
            placeholder="Search utils…"
            value={search}
            onValueChange={setSearch}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                setSearch("")
              }
            }}
          />
          <CommandList className="max-h-none">
            <CommandEmpty>{loading ? "Loading…" : "No utils found."}</CommandEmpty>
            <div className="flex flex-col gap-3">
              <CommandGroup heading="Utils">
                {utils.map((u) => {
                  const count = tabs.filter((tab) => tab.util === u.name).length

                  return (
                    <CommandItem key={u.name} value={`util-${u.name}`} keywords={[u.name, u.description]} disabled={disabled} onSelect={() => launch(u)}>
                      <span className="grid size-[22px] shrink-0 place-items-center">{icons[u.name] ?? <BoxIcon aria-hidden />}</span>
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{u.description}</span>
                      {count > 0 && <span className="pl-2 text-[11px] whitespace-nowrap text-muted-foreground">{u.open ? `${count} open` : "open"}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandGroup heading="Shortcuts">
                <CommandItem value="settings" onSelect={settings}>
                  <span className="grid size-[22px] shrink-0 place-items-center">
                    <SettingsIcon />
                  </span>
                  Settings
                </CommandItem>
              </CommandGroup>
            </div>
          </CommandList>
        </Command>
      </div>
      <About />
    </section>
  )
}

/** One muted line: the app and its version, then the session shortened, whole on hover and copied on a click. */
function About() {
  const [facts] = useState(() => ({ app: about("app"), version: about("version"), session: about("session") }))
  const [copied, setCopied] = useState(false)
  const { app, version, session } = facts

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopied(false), 1500)

    return () => clearTimeout(timer)
  }, [copied])

  if (!app && !session) return null

  return (
    <footer className="mt-auto flex w-full max-w-[560px] flex-wrap justify-center gap-x-3 px-2 pt-6 text-meta text-muted-foreground">
      {app && <span>{version ? `${app} ${version}` : app}</span>}
      {session && (
        <button
          type="button"
          title={session}
          aria-label={`Copy session id ${session}`}
          className="cursor-pointer rounded-sm hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          onClick={() => void navigator.clipboard?.writeText(session).then(() => setCopied(true))}
        >
          {copied ? "Copied" : `session ${session.slice(0, 8)}`}
        </button>
      )}
    </footer>
  )
}
