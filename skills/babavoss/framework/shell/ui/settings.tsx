import { useEffect, useState } from "react"
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "./components/toggle-group"
import { applyAppearance, readAppearance, resolveMode, themes, writeAppearance, type Appearance } from "./appearance"
import { Plain } from "./layouts/plain.tsx"

/** Appearance: color mode and the theme per mode, kept in this browser for every babavoss page on this machine. */
export function Settings({ title }: { title: string }) {
  const [appearance, setAppearance] = useState(readAppearance)
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches)
  const mode = resolveMode(appearance, systemDark)

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

  const modes = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ]

  // The same choices in the View menu, the header every layout has.
  return (
    <Plain
      label="Settings"
      viewMenu={[
        {
          kind: "choice",
          id: "mode",
          label: "Color mode",
          value: appearance.mode,
          options: modes,
          set: (value) => update({ ...appearance, mode: value as Appearance["mode"] }),
        },
        {
          kind: "choice",
          id: "theme",
          label: `Theme, ${mode}`,
          value: appearance.themes[mode],
          options: themes[mode].map((t) => ({ id: t.id, label: t.label })),
          set: (value) => update({ ...appearance, themes: { ...appearance.themes, [mode]: value } }),
        },
      ]}
    >
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
        </div>
      </div>
    </Plain>
  )
}
