// The person's settings as the page applies them: given with the page as it is served, read again from /_/settings.json
// when the page is looked at again or when the shell asks, and told at once by a settings tab on this page as they change
// there. The settings are their file's (settings/src/store.ts); the appearance is applied before the first paint by
// index.html, by the same rules as here. With the settings comes the machine's mode, where the runtime could tell it:
// that is what "system" follows, a browser's own answer only where there is none. From the settings and the machine come
// the conventions every page is handed (src/conventions.ts), set on the page's root as they change.
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react"
import { varsOf, type Theme } from "../../kit/theme.ts"
import { attributesOf, conventionsOf, type Conventions } from "../src/conventions.ts"
import { choiceIn, nameOf, numbersOf, resolveMode, settingsOf, type Appearance, type Mode, type Settings } from "../settings/src/settings.ts"

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

/** Applies the appearance immediately as its Settings page changes it. The shell also follows the saved settings. */
type AppearanceChange = Pick<Settings, "appearance" | "preferences" | "logo">
export const announce = (change: AppearanceChange) => window.dispatchEvent(new CustomEvent<AppearanceChange>(CHANGED, { detail: change }))

/** Paints a theme's numbers on the page's root, the tokens following at once: what a picker does as it is dragged. */
export function paintTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(varsOf(theme))) root.style.setProperty(name, value)
}

/** Applies the mode, and its theme: data-theme names it, a preset's id or dynamic, and its numbers paint it. */
export function applyAppearance(appearance: Appearance, mode: Mode): void {
  const choice = choiceIn(appearance, mode)
  const root = document.documentElement

  root.classList.toggle("dark", mode === "dark")
  root.dataset.theme = nameOf(choice)
  root.style.colorScheme = mode
  paintTheme(numbersOf(choice), root)
}

/** Sets the conventions on the page's root, where CSS and the kit read them: as index.html does before the first paint. */
export function applyConventions(conventions: Conventions, root: HTMLElement = document.documentElement): void {
  const { data, vars } = attributesOf(conventions)

  for (const [name, value] of Object.entries(data)) root.dataset[name] = value
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
}

/** Whether a media query of the browser matches, kept current. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)

  useEffect(() => {
    const media = matchMedia(query)
    const change = () => setMatches(media.matches)

    change()
    media.addEventListener("change", change)

    return () => media.removeEventListener("change", change)
  }, [query])

  return matches
}

const modeOf = (value: unknown): Mode | undefined => {
  const system = (value as { system?: unknown } | null)?.system

  return system === "light" || system === "dark" ? system : undefined
}

/** The machine's mode as the runtime last told it, one value for the whole page; undefined where it could not tell. */
let machine: Mode | undefined
let read = false
const listeners = new Set<() => void>()
const machineNow = () => {
  if (!read) {
    read = true
    try {
      machine = modeOf(JSON.parse(document.getElementById(SETTINGS_ID)?.textContent || "null"))
    } catch {}
  }

  return machine
}
const setMachine = (mode: Mode | undefined) => {
  if (mode === machineNow()) return
  machine = mode
  for (const told of listeners) told()
}
const listen = (told: () => void) => (listeners.add(told), () => void listeners.delete(told))

/** How often a page shown in the system's mode asks again what the machine says, in ms. */
const MACHINE_MS = 5000

/** Whether the system asks for dark, kept current: the machine's mode where the runtime tells it, the browser's otherwise. */
export function useSystemDark(): boolean {
  const told = useSyncExternalStore(listen, machineNow, () => undefined)
  const dark = useMedia("(prefers-color-scheme: dark)")

  return told ? told === "dark" : dark
}

/**
 * The person's settings, kept current, with the appearance and the conventions applied to the page; the mode it resolves
 * to; the conventions; and how to read them again.
 */
export function useSettings(): { settings: Settings; mode: Mode; conventions: Conventions; again: () => void } {
  const [settings, setSettings] = useState(given)
  const systemDark = useSystemDark()
  const reduced = useMedia("(prefers-reduced-motion: reduce)")
  const mode = resolveMode(settings.appearance, systemDark)
  const conventions = useMemo(() => conventionsOf(settings, { dark: systemDark, reduced }), [settings, systemDark, reduced])
  const [again] = useState(() => () => {
    if (document.hidden) return
    void fetch("/_/settings.json", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((value: unknown) => (setMachine(modeOf(value)), setSettings(settingsOf(value))), () => undefined)
  })

  useEffect(() => {
    const told = (event: Event) => setSettings((settings) => ({ ...settings, ...(event as CustomEvent<AppearanceChange>).detail }))

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
  // A machine changes its mode without telling a page: one that follows it asks again now and then, while shown.
  const follows = settings.appearance.mode === "system" && machineNow() !== undefined

  useEffect(() => {
    if (!follows) return

    const timer = window.setInterval(again, MACHINE_MS)

    return () => window.clearInterval(timer)
  }, [follows, again])
  useEffect(() => applyAppearance(settings.appearance, mode), [settings.appearance, mode])
  // Before the page is painted, so a page drawn by them never shows a frame by the conventions before.
  useLayoutEffect(() => applyConventions(conventions), [conventions])

  return { settings, mode, conventions, again }
}

export type { Appearance, Conventions, Mode, Settings }
