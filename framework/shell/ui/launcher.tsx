import { useEffect, useState, type ReactNode } from "react"
import { BoxIcon, SettingsIcon } from "lucide-react"
import type { Handle } from "../../core/index.ts"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../../kit/components/command"

/** A surface as the desktop lists it. */
export type SurfaceEntry = { name: string; description: string; open: Handle }

/** Whose page this is, from the meta tags the runtime serves the page with; presentation, never in a view. */
const about = (key: string): string | undefined => document.querySelector<HTMLMetaElement>(`meta[name="babavoss:${key}"]`)?.content || undefined

/** The launcher: the shell's title, what it says when there is no surface, the surfaces as a command palette, the shortcuts, and whose page it is at the bottom. */
export function Launcher({
  title,
  notice,
  surfaces,
  icons,
  tabs,
  disabled,
  loading,
  launch,
  settings,
}: {
  title?: string
  notice?: string
  surfaces: SurfaceEntry[]
  icons: Record<string, ReactNode | undefined>
  tabs: { surface: string }[]
  disabled: boolean
  loading: boolean
  launch: (surface: SurfaceEntry) => void
  settings: () => void
}) {
  const [search, setSearch] = useState("")

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-4 pt-[max(16px,14vh)] pb-3" aria-label="Launcher">
      <div className="flex h-fit w-full max-w-[560px] flex-col gap-3">
        {title && <h1 className="truncate px-2 text-large font-medium">{title}</h1>}
        {notice && <p className="px-2 text-muted-foreground">{notice}</p>}
        <Command loop>
          <CommandInput
            autoFocus
            aria-label="Search surfaces"
            placeholder="Search surfaces…"
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
            <CommandEmpty>{loading ? "Loading…" : "No surfaces found."}</CommandEmpty>
            <div className="flex flex-col gap-3">
              <CommandGroup heading="Surfaces">
                {surfaces.map((u) => {
                  const count = tabs.filter((tab) => tab.surface === u.name).length

                  return (
                    <CommandItem key={u.name} value={`surface-${u.name}`} keywords={[u.name, u.description]} disabled={disabled} onSelect={() => launch(u)}>
                      <span className="grid size-[22px] shrink-0 place-items-center">{icons[u.name] ?? <BoxIcon aria-hidden />}</span>
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{u.description}</span>
                      {count > 0 && <span className="pl-2 text-[11px] whitespace-nowrap text-muted-foreground">{`${count} open`}</span>}
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

/** One muted line: the root and its version, then the session shortened, whole on hover and copied on a click. */
function About() {
  const [facts] = useState(() => ({ root: about("root"), version: about("version"), session: about("session") }))
  const [copied, setCopied] = useState(false)
  const { root, version, session } = facts

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopied(false), 1500)

    return () => clearTimeout(timer)
  }, [copied])

  if (!root && !session) return null

  return (
    <footer className="mt-auto flex w-full max-w-[560px] flex-wrap justify-center gap-x-3 px-2 pt-6 text-meta text-muted-foreground">
      {root && <span>{version ? `${root} ${version}` : root}</span>}
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
