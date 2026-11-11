export type Mode = "light" | "dark"
export type Appearance = { mode: Mode | "system"; themes: Record<Mode, string> }
export const appearanceKey = "babavoss.appearance"

// Each mode has its own choices and remembered selection; palettes live in styles.css. index.html applies the
// remembered appearance before the first paint, by the same rules.
export const themes = {
  light: [
    { id: "neutral", label: "Neutral" },
    { id: "claude", label: "Claude" },
  ],
  dark: [
    { id: "neutral", label: "Neutral" },
    { id: "claude", label: "Claude" },
  ],
} as const

const theme = (mode: Mode, id: unknown) => themes[mode].find((t) => t.id === id)?.id ?? themes[mode][0].id

// Every session's page is its own origin, by port, while cookies on 127.0.0.1 ignore the port: the choice is kept in a cookie,
// so it holds across sessions and across the pages one page embeds. index.html reads the same cookie before the first paint.
const COOKIE_MAX_AGE = 365 * 24 * 3600

const stored = (): string | undefined => {
  const found = document.cookie.split("; ").find((c) => c.startsWith(`${appearanceKey}=`))

  return found ? decodeURIComponent(found.slice(appearanceKey.length + 1)) : undefined
}

export function writeAppearance(appearance: Appearance): void {
  document.cookie = `${appearanceKey}=${encodeURIComponent(JSON.stringify(appearance))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function readAppearance(): Appearance {
  let p: { mode?: unknown; themes?: Partial<Record<Mode, unknown>> } | null = null

  try {
    p = JSON.parse(stored() ?? "null")
  } catch {
    /* A broken cookie: the defaults. */
  }

  return {
    mode: p?.mode === "dark" || p?.mode === "light" ? p.mode : "system",
    themes: { light: theme("light", p?.themes?.light), dark: theme("dark", p?.themes?.dark) },
  }
}

export const resolveMode = (appearance: Appearance, systemDark: boolean): Mode =>
  appearance.mode === "system" ? (systemDark ? "dark" : "light") : appearance.mode

export function applyAppearance(appearance: Appearance, mode: Mode): void {
  document.documentElement.classList.toggle("dark", mode === "dark")
  document.documentElement.dataset.theme = appearance.themes[mode]
  document.documentElement.style.colorScheme = mode
}
