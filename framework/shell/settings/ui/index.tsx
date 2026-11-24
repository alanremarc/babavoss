// Settings navigation and the active page of the tab.
import { Suspense } from "react"
import { DatabaseIcon, InfoIcon, KeyboardIcon, PaletteIcon, SettingsIcon, SlidersHorizontalIcon } from "lucide-react"
import { useLive, useTab } from "../../ui/tab.tsx"
import { SETTINGS_PAGES } from "../src/pages.ts"
import { Appearance } from "./appearance.tsx"
import { Storage } from "./archive.tsx"
import { General } from "./general.tsx"
import { Line, Section } from "./parts.tsx"
import { KeyboardShortcuts } from "./shortcuts.tsx"

export const icon = <SettingsIcon aria-hidden />

const pages = {
  "/general": { panel: General, icon: SlidersHorizontalIcon },
  "/appearance": { panel: Appearance, icon: PaletteIcon },
  "/shortcuts": { panel: KeyboardShortcuts, icon: KeyboardIcon },
  "/archive": { panel: Storage, icon: DatabaseIcon },
  "/about": { panel: About, icon: InfoIcon },
}

export default function Settings() {
  const { view } = useLive<{ unsaved?: string }>("/")
  const { address, route, navigate } = useTab()
  const page = SETTINGS_PAGES.find(({ at }) => at === route) ?? SETTINGS_PAGES[0]
  const Panel = pages[page.at].panel

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row-reverse side-left:md:flex-row">
      <nav aria-label="Settings pages" className="shrink-0 border-b px-3 py-3 md:w-48 md:border-b-0 md:border-l md:p-4 side-left:md:border-l-0 side-left:md:border-r">
        <p className="mb-2 px-2 font-semibold">Settings</p>
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {SETTINGS_PAGES.map(({ at, title }) => {
            const Icon = pages[at].icon

            return (
              <li key={at}>
                <a
                  href={address + at}
                  aria-current={page.at === at ? "page" : undefined}
                  className="flex h-row items-center gap-2 rounded-md px-2 text-meta text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                  onClick={(event) => {
                    if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
                    event.preventDefault()
                    navigate(at)
                  }}
                >
                  <Icon aria-hidden className="size-glyph" />
                  {title}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
      <div key={page.at} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-5 text-body sm:px-7 sm:py-8">
          <h1 className="text-large font-semibold">{page.title}</h1>
          {view?.unsaved && <p role="alert" className="text-destructive">{view.unsaved}</p>}
          <Suspense fallback={<p role="status" className="text-meta text-muted-foreground">Loading…</p>}>
            <Panel />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function About() {
  const { view } = useLive<{ version: string; website: string; source: string }>("/about")

  if (!view) return null

  return (
    <Section title="Baba Voss">
      <Line label="Running version"><span className="font-mono">{view.version}</span></Line>
      <div className="flex gap-4 pt-2">
        <a href={view.website} className="underline underline-offset-4" target="_blank" rel="noreferrer">Website</a>
        <a href={view.source} className="underline underline-offset-4" target="_blank" rel="noreferrer">Source code</a>
      </div>
    </Section>
  )
}
