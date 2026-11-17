// The person's settings of the shell, as values: what they are, their defaults, and how a kept value is read, tolerant
// of what it does not know. Pure, for the surface that changes them and for the page that applies them alike: the
// appearance, a mode and a theme for both modes or for each, a preset or the person's own numbers (the kit's theme.ts), and
// where the rail of tabs stands; the preferences a page follows by convention (the shell's conventions); the shortcuts, the
// person's bindings over the shell's commands (keys.ts); and whether the mark moves while the agent works.
import { bounded, isPreset, presetOf, PRESETS, type Mode, type PresetId, type Theme } from "../../../kit/theme.ts"
import { COMMANDS, isCommand, normal, RENAMED, same, type CommandId } from "./keys.ts"

export type { Mode, Theme }
/** A mode's theme: a preset, by its id, or dynamic, the person's own three numbers. */
export type Choice = PresetId | Theme
/**
 * The rail of tabs: the side of the page it stands at; for a rail at the left or right, the end the mark is at, `from`;
 * for one along the top or bottom, the side a tab's drawer opens at, `drawer`. Each is kept whichever side is chosen.
 */
export type Rail = { side: "left" | "right" | "top" | "bottom"; from: "top" | "bottom"; drawer: "left" | "right" }
/** `same`: one theme for both modes, `themes.light`; otherwise each mode has its own. */
export type Appearance = { mode: Mode | "system"; same: boolean; themes: Record<Mode, Choice>; rail: Rail }

/**
 * The person's preferences, which the shell hands every page as its conventions (src/conventions.ts) and a page follows by
 * its own code: each its choices, its default and what it is. One entry is the whole of a preference: it is kept and read
 * here, told by the settings' view, set by an action of its name and chosen on the settings' page, as are the others.
 */
export const PREFERENCES = {
  motion: { label: "Motion", does: "whether pages move; system follows the machine's preference", choices: ["system", "full", "reduced"], default: "system" },
  scale: { label: "Text size", does: "the size of text on every page, as a share of the usual", choices: [0.9, 1, 1.1, 1.25, 1.5], default: 1 },
  side: { label: "Sidebar", does: "the side a page's own sidebar stands at", choices: ["left", "right"], default: "right" },
} as const satisfies Record<string, { label: string; does: string; choices: readonly (string | number)[]; default: string | number }>
export type Preference = keyof typeof PREFERENCES
export type Preferences = { -readonly [K in Preference]: (typeof PREFERENCES)[K]["choices"][number] }
/** Each preference's name, in the order the settings' page shows them. */
export const PREFERENCE_NAMES = Object.keys(PREFERENCES) as Preference[]

/** `keys`: the person's bindings, where they differ from a command's default. */
export type Settings = { appearance: Appearance; preferences: Preferences; keys: Partial<Record<CommandId, string>>; logo: { animate: boolean } }

export const MODES = ["light", "dark", "system"] as const
export const SIDES = ["left", "right", "top", "bottom"] as const
export const ENDS = ["top", "bottom"] as const
export const DRAWERS = ["left", "right"] as const
/** What a mode's theme may be called: each preset, and dynamic. */
export const THEMES = [...PRESETS.map((p) => p.id), "dynamic"] as const

export const DEFAULTS: Settings = {
  appearance: { mode: "system", same: true, themes: { light: "neutral", dark: "neutral" }, rail: { side: "left", from: "bottom", drawer: "left" } },
  preferences: Object.fromEntries(PREFERENCE_NAMES.map((name) => [name, PREFERENCES[name].default])) as Preferences,
  keys: {},
  logo: { animate: true },
}

export const isMode = (value: unknown): value is Appearance["mode"] => value === "light" || value === "dark" || value === "system"

const oneOf = <T extends string>(options: readonly T[], value: unknown, otherwise: T): T => (options.includes(value as T) ? (value as T) : otherwise)
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/** Whether a value is one of a preference's choices. */
export const isChoice = <K extends Preference>(name: K, value: unknown): value is Preferences[K] =>
  (PREFERENCES[name].choices as readonly unknown[]).includes(value)

/** The preferences a kept value says, each it does not say, or says wrongly, the default. */
export function preferencesOf(value: unknown): Preferences {
  const kept = record(value)

  return Object.fromEntries(PREFERENCE_NAMES.map((name) => [name, isChoice(name, kept[name]) ? kept[name] : DEFAULTS.preferences[name]])) as Preferences
}

/** The choice a kept value says: a preset's id, or three numbers, bounded; anything else, none. Clay was once named claude. */
export function choiceOf(value: unknown): Choice | undefined {
  if (value === "claude") return "clay"
  if (isPreset(value)) return value

  const { hue, tint, vivid } = record(value)

  return finite(hue) && finite(tint) && finite(vivid) ? bounded({ hue, tint, vivid }) : undefined
}

/** Whether two choices are the same theme. */
export const sameChoice = (a: Choice, b: Choice): boolean =>
  typeof a === "string" || typeof b === "string" ? a === b : a.hue === b.hue && a.tint === b.tint && a.vivid === b.vivid

/** The rail a kept value says, each part it does not say, or says wrongly, the default. */
export function railOf(value: unknown): Rail {
  const kept = record(value)
  const { side, from, drawer } = DEFAULTS.appearance.rail

  return { side: oneOf(SIDES, kept.side, side), from: oneOf(ENDS, kept.from, from), drawer: oneOf(DRAWERS, kept.drawer, drawer) }
}

/**
 * The appearance a kept value says, each part it does not say, or says wrongly, the default. A file of before there were
 * dynamic themes says no `same`: its two modes are the same where they name the same theme. One of before the rail says
 * none: the rail stands where it does by default.
 */
export function appearanceOf(value: unknown): Appearance {
  const kept = record(value)
  const themes = record(kept.themes)
  const light = choiceOf(themes.light) ?? "neutral"
  const dark = choiceOf(themes.dark) ?? "neutral"

  return {
    mode: isMode(kept.mode) ? kept.mode : "system",
    same: typeof kept.same === "boolean" ? kept.same : sameChoice(light, dark),
    themes: { light, dark },
    rail: railOf(kept.rail),
  }
}

/** The theme a mode is shown in: the one for both where they are the same. */
export const choiceIn = (appearance: Appearance, mode: Mode): Choice => appearance.themes[appearance.same ? "light" : mode]

/** A choice's name, its preset's id or dynamic, and its numbers. */
export const nameOf = (choice: Choice): (typeof THEMES)[number] => (typeof choice === "string" ? choice : "dynamic")
export const numbersOf = (choice: Choice): Theme => (typeof choice === "string" ? presetOf(choice) : choice)

/**
 * The settings a kept value says: what is not there, or cannot be read, is the default; a binding of no command, one that
 * cannot be a binding, or one that clashes with another, is dropped. A binding kept for a command that was renamed is the
 * new command's, unless that has its own. What else the value holds is left to the file.
 */
export function settingsOf(value: unknown): Settings {
  const kept = record(value)
  const keys: Partial<Record<CommandId, string>> = {}
  const written = record(kept.keys)
  const renamed = Object.entries(RENAMED).flatMap(([was, now]) => (written[was] !== undefined && written[now] === undefined ? [[now, written[was]] as const] : []))

  for (const [command, binding] of [...Object.entries(written), ...renamed]) {
    const keys_ = typeof binding === "string" ? normal(binding) : undefined

    if (isCommand(command) && keys_ !== undefined && keys_ !== COMMANDS[command].keys) keys[command] = keys_
  }

  // A binding that clashes gives way, the later command's first, until no two commands share one.
  for (let clash = clashOf(keys); clash; clash = clashOf(keys)) delete keys[clash]

  const logo = record(kept.logo)

  return { appearance: appearanceOf(kept.appearance), preferences: preferencesOf(kept.preferences), keys, logo: { animate: logo.animate !== false } }
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

/** A mode's theme as the settings' view tells it: a preset's id, or dynamic with its numbers. */
export type Told = string | ({ theme: "dynamic" } & Theme)
/** The appearance as the view tells it: the mode, one theme for both or one each, and the rail. */
export type ToldAppearance = ({ same: true; theme: Told } | { same: false; light: Told; dark: Told }) & { mode: Appearance["mode"]; rail: Rail }
/** The settings as their view at / tells them, beside its actions: what the page takes the whole settings from. */
export type SettingsView = { appearance: ToldAppearance; preferences: Preferences; shortcuts: Record<CommandId, string>; logo: Settings["logo"] }

const told = (choice: Choice): Told => (typeof choice === "string" ? choice : { theme: "dynamic", ...choice })

/** The settings as their view tells them: each binding whole, the default where the person set none. */
export function viewOf(settings: Settings): SettingsView {
  const { mode, same, themes, rail } = settings.appearance
  const keys = Object.fromEntries((Object.keys(COMMANDS) as CommandId[]).map((id) => [id, settings.keys[id] ?? COMMANDS[id].keys])) as Record<CommandId, string>

  return {
    appearance: same ? { mode, same: true, theme: told(themes.light), rail } : { mode, same: false, light: told(themes.light), dark: told(themes.dark), rail },
    preferences: { ...settings.preferences },
    shortcuts: keys,
    logo: { animate: settings.logo.animate },
  }
}

/**
 * The whole settings a view tells, as the settings' page hands them to the shell: every part of them, never a chosen few,
 * so a part added later reaches the page too.
 */
export function settingsFromView(view: SettingsView): Settings {
  const { appearance: a } = view
  const themes = a.same ? { light: a.theme, dark: a.theme } : { light: a.light, dark: a.dark }
  const bound = Object.entries(view.shortcuts).filter(([id, keys]) => isCommand(id) && keys !== COMMANDS[id].keys)

  return {
    appearance: appearanceOf({ mode: a.mode, same: a.same, themes, rail: a.rail }),
    preferences: preferencesOf(view.preferences),
    keys: settingsOf({ keys: Object.fromEntries(bound) }).keys,
    logo: { animate: view.logo.animate !== false },
  }
}
