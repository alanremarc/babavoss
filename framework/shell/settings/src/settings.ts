// The person's settings of the shell, as values: what they are, their defaults, and how a kept value is read, tolerant
// of what it does not know. Pure, for the surface that changes them and for the page that applies them alike: the
// appearance, a mode and a theme for both modes or for each, a preset or the person's own numbers (the kit's theme.ts);
// the shortcuts, the person's bindings over the shell's commands (keys.ts); and whether the mark moves while the agent works.
import { bounded, isPreset, presetOf, PRESETS, type Mode, type PresetId, type Theme } from "../../../kit/theme.ts"
import { COMMANDS, isCommand, normal, same, type CommandId } from "./keys.ts"

export type { Mode, Theme }
/** A mode's theme: a preset, by its id, or dynamic, the person's own three numbers. */
export type Choice = PresetId | Theme
/** `same`: one theme for both modes, `themes.light`; otherwise each mode has its own. */
export type Appearance = { mode: Mode | "system"; same: boolean; themes: Record<Mode, Choice> }
/** `keys`: the person's bindings, where they differ from a command's default. */
export type Settings = { appearance: Appearance; keys: Partial<Record<CommandId, string>>; logo: { animate: boolean } }

export const MODES = ["light", "dark", "system"] as const
/** What a mode's theme may be called: each preset, and dynamic. */
export const THEMES = [...PRESETS.map((p) => p.id), "dynamic"] as const

export const DEFAULTS: Settings = {
  appearance: { mode: "system", same: true, themes: { light: "neutral", dark: "neutral" } },
  keys: {},
  logo: { animate: true },
}

export const isMode = (value: unknown): value is Appearance["mode"] => value === "light" || value === "dark" || value === "system"

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/** The choice a kept value says: a preset's id, or three numbers, bounded; anything else, none. */
export function choiceOf(value: unknown): Choice | undefined {
  if (isPreset(value)) return value

  const { hue, tint, vivid } = record(value)

  return finite(hue) && finite(tint) && finite(vivid) ? bounded({ hue, tint, vivid }) : undefined
}

/** Whether two choices are the same theme. */
export const sameChoice = (a: Choice, b: Choice): boolean =>
  typeof a === "string" || typeof b === "string" ? a === b : a.hue === b.hue && a.tint === b.tint && a.vivid === b.vivid

/**
 * The appearance a kept value says, each part it does not say, or says wrongly, the default. A file of before there were
 * dynamic themes says no `same`: its two modes are the same where they name the same theme.
 */
export function appearanceOf(value: unknown): Appearance {
  const kept = record(value)
  const themes = record(kept.themes)
  const light = choiceOf(themes.light) ?? "neutral"
  const dark = choiceOf(themes.dark) ?? "neutral"

  return { mode: isMode(kept.mode) ? kept.mode : "system", same: typeof kept.same === "boolean" ? kept.same : sameChoice(light, dark), themes: { light, dark } }
}

/** The theme a mode is shown in: the one for both where they are the same. */
export const choiceIn = (appearance: Appearance, mode: Mode): Choice => appearance.themes[appearance.same ? "light" : mode]

/** A choice's name, its preset's id or dynamic, and its numbers. */
export const nameOf = (choice: Choice): (typeof THEMES)[number] => (typeof choice === "string" ? choice : "dynamic")
export const numbersOf = (choice: Choice): Theme => (typeof choice === "string" ? presetOf(choice) : choice)

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
