// The person's settings of the shell, as values: what they are, their defaults, and how a kept value is read, tolerant
// of what it does not know. Pure, for the surface that changes them and for the page that applies them alike: the
// appearance, a mode and a theme for each mode; the shortcuts, the person's bindings over the shell's commands
// (keys.ts); and whether the mark moves while the agent works.
import { COMMANDS, isCommand, normal, same, type CommandId } from "./keys.ts"

export type Mode = "light" | "dark"
export type Appearance = { mode: Mode | "system"; themes: Record<Mode, string> }
/** `keys`: the person's bindings, where they differ from a command's default. */
export type Settings = { appearance: Appearance; keys: Partial<Record<CommandId, string>>; logo: { animate: boolean } }

/** Each mode's palettes, defined in the kit's styles.css; the first is the default. */
export const THEMES = {
  light: [
    { id: "neutral", label: "Neutral" },
    { id: "claude", label: "Claude" },
  ],
  dark: [
    { id: "neutral", label: "Neutral" },
    { id: "claude", label: "Claude" },
  ],
} as const

export const MODES = ["light", "dark", "system"] as const

export const DEFAULTS: Settings = { appearance: { mode: "system", themes: { light: "neutral", dark: "neutral" } }, keys: {}, logo: { animate: true } }

export const isMode = (value: unknown): value is Appearance["mode"] => value === "light" || value === "dark" || value === "system"
export const isTheme = (mode: Mode, id: unknown): boolean => THEMES[mode].some((t) => t.id === id)

const theme = (mode: Mode, id: unknown) => (isTheme(mode, id) ? (id as string) : THEMES[mode][0].id)
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

/** The appearance a kept value says, each part it does not say, or says wrongly, the default. */
export function appearanceOf(value: unknown): Appearance {
  const kept = record(value)
  const themes = record(kept.themes)

  return { mode: isMode(kept.mode) ? kept.mode : "system", themes: { light: theme("light", themes.light), dark: theme("dark", themes.dark) } }
}

/**
 * The settings a kept value says: what is not there, or cannot be read, is the default; a binding of no command, one that
 * cannot be a binding, or one that clashes with another, is dropped. What else the value holds is left to the file.
 */
export function settingsOf(value: unknown): Settings {
  const kept = record(value)
  const keys: Partial<Record<CommandId, string>> = {}

  for (const [command, binding] of Object.entries(record(kept.keys))) {
    const keys_ = typeof binding === "string" ? normal(binding) : undefined

    if (isCommand(command) && keys_ !== undefined && keys_ !== COMMANDS[command].keys) keys[command] = keys_
  }

  // A binding that clashes gives way, the later command's first, until no two commands share one.
  for (let clash = clashOf(keys); clash; clash = clashOf(keys)) delete keys[clash]

  const logo = record(kept.logo)

  return { appearance: appearanceOf(kept.appearance), keys, logo: { animate: logo.animate !== false } }
}

/** A command whose own binding is the same as an earlier command's, the later of them that has one of its own; none where all differ. */
function clashOf(keys: Partial<Record<CommandId, string>>): CommandId | undefined {
  const seen: [CommandId, string][] = []

  for (const id of Object.keys(COMMANDS) as CommandId[]) {
    const binding = keys[id] ?? COMMANDS[id].keys
    const earlier = seen.find(([, b]) => same(b, binding))?.[0]

    if (earlier !== undefined) return keys[id] !== undefined ? id : earlier
    seen.push([id, binding])
  }

  return undefined
}

export const resolveMode = (appearance: Appearance, systemDark: boolean): Mode => (appearance.mode === "system" ? (systemDark ? "dark" : "light") : appearance.mode)
