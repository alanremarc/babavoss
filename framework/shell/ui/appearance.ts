// The person's settings as the page applies them: given with the page as it is served, read again from /_/settings.json
// when the page is looked at again or when the shell asks, and told at once by a settings tab on this page as they change
// there. The settings are their file's (settings/src/store.ts); the appearance is applied before the first paint by
// index.html, by the same rules as here.
import { useEffect, useState } from "react"
import { resolveMode, settingsOf, type Appearance, type Mode, type Settings } from "../settings/src/settings.ts"

const SETTINGS_ID = "babavoss-settings"
/** The window event a settings tab tells its settings by, as its view changes. */
const CHANGED = "babavoss:settings"

/** The settings the page was served with. */
export const given = (): Settings => {
  try {
    return settingsOf(JSON.parse(document.getElementById(SETTINGS_ID)?.textContent || "null"))
  } catch {
    return settingsOf(undefined)
  }
}

/** Tells the page the settings, as a settings tab reads them. */
export const announce = (settings: Settings) => window.dispatchEvent(new CustomEvent<Settings>(CHANGED, { detail: settings }))

export function applyAppearance(appearance: Appearance, mode: Mode): void {
  document.documentElement.classList.toggle("dark", mode === "dark")
  document.documentElement.dataset.theme = appearance.themes[mode]
  document.documentElement.style.colorScheme = mode
}

/** Whether the system asks for dark, kept current. */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches)

  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)")
    const change = () => setDark(system.matches)

    system.addEventListener("change", change)

    return () => system.removeEventListener("change", change)
  }, [])

  return dark
}

/** The person's settings, kept current, with the appearance applied to the page; and how to read them again. */
export function useSettings(): { settings: Settings; again: () => void } {
  const [settings, setSettings] = useState(given)
  const systemDark = useSystemDark()
  const mode = resolveMode(settings.appearance, systemDark)
  const [again] = useState(() => () => {
    if (document.hidden) return
    void fetch("/_/settings.json", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((value: unknown) => setSettings(settingsOf(value)), () => undefined)
  })

  useEffect(() => {
    const told = (event: Event) => setSettings((event as CustomEvent<Settings>).detail)

    window.addEventListener(CHANGED, told)
    window.addEventListener("focus", again)
    document.addEventListener("visibilitychange", again)
    // Read once as the page opens too: it takes in what an older page kept in its cookie.
    again()

    return () => {
      window.removeEventListener(CHANGED, told)
      window.removeEventListener("focus", again)
      document.removeEventListener("visibilitychange", again)
    }
  }, [again])
  useEffect(() => applyAppearance(settings.appearance, mode), [settings.appearance, mode])

  return { settings, again }
}

export type { Appearance, Mode, Settings }
