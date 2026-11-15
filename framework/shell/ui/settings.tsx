// The shell's settings page: the person's appearance and whether the menu bar shows, its choices in the content.
import { useEffect, useState, useSyncExternalStore } from "react"
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "../../kit/components/toggle-group"
import { applyAppearance, menubar, readAppearance, resolveMode, themes, writeAppearance, type Appearance } from "./appearance"
import { Plain } from "../../kit/layouts/plain.tsx"

/** Appearance: color mode and the theme per mode, kept in this browser for every babavoss page on this machine. */
export function Settings({ title }: { title: string }) {
  const [appearance, setAppearance] = useState(readAppearance)
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches)
  const mode = resolveMode(appearance, systemDark)
  const bar = useSyncExternalStore(menubar.subscribe, menubar.get)

  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)")
    const change = () => setSystemDark(system.matches)

    system.addEventListener("change", change)

    return () => system.removeEventListener("change", change)
  }, [])
  useEffect(() => {
    applyAppearance(appearance, mode)
  }, [appearance, mode])

  const update = (next: Appearance) => {
    setAppearance(next)
    writeAppearance(next)
  }

  return (
    <Plain>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-8 sm:py-12">
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Make {title} feel like home.</p>
          </header>
          <section className="flex flex-col gap-5" aria-labelledby="appearance-heading">
            <h2 id="appearance-heading" className="text-sm font-medium">
              Appearance
            </h2>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">Color mode</p>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={appearance.mode}
                aria-label="Color mode"
                onValueChange={(value) => {
                  if (value === "light" || value === "dark" || value === "system") update({ ...appearance, mode: value })
                }}
              >
                <ToggleGroupItem value="light">
                  <SunIcon data-icon="inline-start" />
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark">
                  <MoonIcon data-icon="inline-start" />
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system">
                  <MonitorIcon data-icon="inline-start" />
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">Theme · {mode}</p>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={appearance.themes[mode]}
                aria-label={`${mode} theme`}
                onValueChange={(value) => {
                  if (value) update({ ...appearance, themes: { ...appearance.themes, [mode]: value } })
                }}
              >
                {themes[mode].map((theme) => (
                  <ToggleGroupItem key={theme.id} value={theme.id}>
                    {theme.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </section>
          <section className="flex flex-col gap-2" aria-labelledby="menubar-heading">
            <h2 id="menubar-heading" className="text-sm font-medium">
              Menu bar
            </h2>
            <p className="text-muted-foreground">The bar above every tab, with the surface's actions, its places and Help. Hidden, they are all in the palette.</p>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={bar ? "shown" : "hidden"}
              aria-label="Menu bar"
              onValueChange={(value) => value && menubar.set(value === "shown")}
            >
              <ToggleGroupItem value="shown">Shown</ToggleGroupItem>
              <ToggleGroupItem value="hidden">Hidden</ToggleGroupItem>
            </ToggleGroup>
          </section>
        </div>
      </div>
    </Plain>
  )
}
