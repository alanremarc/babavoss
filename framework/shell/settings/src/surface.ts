// The settings: a surface that comes with the shell, beside the project's, which holds the person's settings of the
// shell's page, the appearance with where the rail of tabs stands, the preferences a page follows, the shortcuts and the mark, each a fact
// with the action that changes it. They are the
// person's, not a tab's nor a session's: its state is their file (store.ts), which every settings tab, in any session,
// watches and follows; the model is what the file said last, with what this tab changed and is writing. A change is
// written by a command, and a read while one is being written waits for it, so the tab never shows an older value back.
// The shell's page applies what they say. Nothing is noticed but a write that failed, and every change is quiet: the page's
// own, of no event in the agent's work, so it is told to the agent in no way; the agent reads the tab when asked to change one.
import { action, surface, view, type Update } from "../../../core/index.ts"
import { clashing, COMMANDS, parse, type CommandId } from "./keys.ts"
import { bounded } from "../../../kit/theme.ts"
import {
  DRAWERS,
  ENDS,
  isChoice,
  MODES,
  numbersOf,
  PREFERENCE_NAMES,
  PREFERENCES,
  settingsOf,
  SIDES,
  THEMES,
  viewOf,
  type Choice,
  type Mode,
  type Rail,
  type Settings,
} from "./settings.ts"
import { readSettings, settingsFile, watchSettings, writeSettings } from "./store.ts"

/** `writing`: this tab's writes not yet done; `unsaved`: why the last one failed. */
export type Model = { settings: Settings; writing: number; unsaved?: string }
export type Event = { kind: "read"; settings: Settings } | { kind: "wrote" } | { kind: "failed"; why: string; writing: boolean }
export type Command = { kind: "watch" } | { kind: "write"; settings: Settings }

const changed = (m: Model, settings: Settings): Update<Model, Command> => ({
  model: { settings, writing: m.writing + 1 },
  commands: [{ kind: "write", settings }],
})
/** Which mode a theme is of: both while the modes are the same. */
const OF = { type: "string", choices: ["both", "light", "dark"] } as const
/** A value from 0 to `most`, of a dynamic theme's numbers. */
const upto = (most: number) => ({ type: "number", range: [0, most] }) as const

/** Where a theme is set: both modes while they are the same, else the one named; or why it cannot be. */
function target(m: Model, mode: "both" | Mode): { modes: Mode[] } | { refused: string } {
  const { same } = m.settings.appearance

  if (mode === "both") return same ? { modes: ["light"] } : { refused: "the modes have themes of their own: name light or dark, or call same with on true first" }
  if (same) return { refused: `both modes use one theme: name both, or call same with on false first to give ${mode} its own` }

  return { modes: [mode] }
}
const chosen = (m: Model, modes: Mode[], choice: Choice): Update<Model, Command> => {
  const { appearance } = m.settings

  return changed(m, { ...m.settings, appearance: { ...appearance, themes: { ...appearance.themes, ...Object.fromEntries(modes.map((at) => [at, choice])) } } })
}

const mode = action({
  name: "mode",
  quiet: true,
  description: "the page's colours, light or dark; system follows the machine",
  subject: {},
  inputs: { mode: { type: "string", choices: MODES } },
  update: (m: Model, { mode }): Update<Model, Command> => changed(m, { ...m.settings, appearance: { ...m.settings.appearance, mode } }),
})
const theme = action({
  name: "theme",
  quiet: true,
  description: "of mode both while the modes are the same; dynamic keeps the mode's numbers, or starts from the theme it replaces",
  subject: {},
  inputs: { mode: OF, theme: { type: "string", choices: THEMES } },
  update(m: Model, { mode, theme }): Update<Model, Command> {
    const at = target(m, mode)

    if ("refused" in at) return at

    const now = m.settings.appearance.themes[at.modes[0]!]

    return chosen(m, at.modes, theme === "dynamic" ? numbersOf(now) : theme)
  },
})
const dynamic = action({
  name: "dynamic",
  quiet: true,
  description: "a theme of these numbers, its mode as for theme; tint, how strongly the greys lean to the hue; vivid, how coloured the accent is",
  subject: {},
  inputs: { mode: OF, hue: upto(360), tint: upto(100), vivid: upto(100) },
  update(m: Model, { mode, hue, tint, vivid }): Update<Model, Command> {
    const at = target(m, mode)

    if ("refused" in at) return at

    return chosen(m, at.modes, bounded({ hue, tint, vivid }))
  },
})
const same = action({
  name: "same",
  quiet: true,
  description: "whether both modes use one theme; off, each starts from the one they shared and is chosen on its own",
  subject: {},
  inputs: { on: "boolean" },
  update(m: Model, { on }): Update<Model, Command> {
    const { appearance } = m.settings

    if (on === appearance.same) return { model: m, quiet: true }

    return changed(m, { ...m.settings, appearance: { ...appearance, same: on, themes: on ? appearance.themes : { ...appearance.themes, dark: appearance.themes.light } } })
  },
})
const animate = action({
  name: "animate",
  quiet: true,
  description: "whether the mark looks about while the agent works; off, it shows the work by its tint alone",
  subject: {},
  inputs: { on: "boolean" },
  update: (m: Model, { on }): Update<Model, Command> => changed(m, { ...m.settings, logo: { animate: on } }),
})
const rail = action({
  name: "rail",
  quiet: true,
  description: "where the tabs stand; from, the mark's end of a rail at a side; drawer, where a drawer opens under one at the top or bottom; all three given",
  subject: {},
  inputs: { side: { type: "string", choices: SIDES }, from: { type: "string", choices: ENDS }, drawer: { type: "string", choices: DRAWERS } },
  update(m: Model, { side, from, drawer }): Update<Model, Command> {
    const placed: Rail = { side, from, drawer }

    return changed(m, { ...m.settings, appearance: { ...m.settings.appearance, rail: placed } })
  },
})
/** An action for each preference, named after it, with one input of its name: what it is set to. */
const preferred = PREFERENCE_NAMES.map((name) => {
  const { does, choices, default: usual } = PREFERENCES[name]

  return action({
    name,
    quiet: true,
    description: does,
    subject: {},
    inputs: { [name]: { type: typeof usual === "number" ? "number" : "string", choices } } as Record<string, { type: "string" | "number"; choices: readonly (string | number)[] }>,
    update(m: Model, args): Update<Model, Command> {
      const value = args[name]

      if (!isChoice(name, value)) return { refused: `${name} is ${choices.join(", ")}, not ${value}` }

      return changed(m, { ...m.settings, preferences: { ...m.settings.preferences, [name]: value } })
    },
  })
})
const bind = action({
  name: "bind",
  quiet: true,
  description: "to keys written as mod+p or mod+shift+k, mod being ⌘ on a Mac and Ctrl elsewhere",
  subject: {},
  inputs: { command: { type: "string", choices: Object.keys(COMMANDS) as CommandId[] }, keys: { type: "string", kind: "keys" } },
  update(m: Model, { command, keys }): Update<Model, Command> {
    const read = parse(keys)

    if ("refused" in read) return read

    const clash = clashing(m.settings.keys, command, read.keys)

    if (clash) return { refused: `${read.keys} is bound to ${clash} already: bind ${clash} to other keys first, or choose others` }

    const { [command]: _, ...rest } = m.settings.keys

    return changed(m, { ...m.settings, keys: read.keys === COMMANDS[command].keys ? rest : { ...rest, [command]: read.keys } })
  },
})
const reset = action({
  name: "reset",
  quiet: true,
  description: "binds it to its default keys again; all, every command",
  subject: {},
  inputs: { command: { type: "string", choices: [...(Object.keys(COMMANDS) as CommandId[]), "all"] } },
  update(m: Model, { command }): Update<Model, Command> {
    if (command === "all") return changed(m, { ...m.settings, keys: {} })

    const { [command]: _, ...rest } = m.settings.keys
    const clash = clashing(rest, command, COMMANDS[command].keys)

    if (clash) return { refused: `${COMMANDS[command].keys}, the default of ${command}, is bound to ${clash} now: bind ${clash} to other keys first` }

    return changed(m, { ...m.settings, keys: rest })
  },
})

const pages = view([mode, theme, dynamic, same, rail, ...preferred, animate, bind, reset], {
  "/": (m) => {
    const told = viewOf(m.settings)

    return {
      title: "Settings",
      how: "The person's own settings of the shell's page, the same in every session and project. Change one when they ask.",
      appearance: told.appearance,
      preferences: told.preferences,
      shortcuts: { at: "/shortcuts", ...told.shortcuts },
      logo: told.logo,
      ...(m.unsaved !== undefined && { unsaved: m.unsaved }),
      mode: mode.bind({}),
      theme: theme.bind({}),
      dynamic: dynamic.bind({}),
      same: same.bind({}),
      rail: rail.bind({}),
      ...Object.fromEntries(preferred.map((a) => [a.name, a.bind({})])),
      animate: animate.bind({}),
    }
  },
  "/shortcuts": (m) => ({
    title: "Shortcuts",
    commands: (Object.keys(COMMANDS) as CommandId[]).map((command) => ({
      command,
      does: COMMANDS[command].does,
      keys: m.settings.keys[command] ?? COMMANDS[command].keys,
      ...(m.settings.keys[command] !== undefined && { default: COMMANDS[command].keys }),
    })),
    bind: bind.bind({}),
    reset: reset.bind({}),
  }),
})

/** The settings surface over the person's file, which `file` names when it runs: theirs by default. */
export function settings(file: () => string = () => settingsFile()) {
  return surface<Model, Event, Command>({
    description: "The person's settings of the shell's page: appearance, where the tabs stand, motion, text size, the side of a page's sidebar, shortcuts, and whether the mark moves while the agent works. Use when the person asks to change one.",
    init: () => ({ settings: settingsOf(undefined), writing: 0 }),
    // What a tab kept is only a first look: the file is read again as it starts.
    restore: (saved) => ({ settings: settingsOf((saved as { settings?: unknown } | undefined)?.settings), writing: 0 }),
    start: () => [{ kind: "watch" }],
    session: (c) => c.kind === "watch",
    update(m, message): Update<Model, Command> {
      if (message.kind === "call") return pages.update(m, message)
      if (message.kind === "read") return { model: m.writing > 0 ? m : { settings: message.settings, writing: 0 }, quiet: true }
      if (message.kind === "wrote") return { model: { settings: m.settings, writing: Math.max(0, m.writing - 1) }, quiet: true }

      return {
        model: { ...m, writing: Math.max(0, m.writing - (message.writing ? 1 : 0)), unsaved: message.why },
        notices: [message.writing ? `The settings were not saved: ${message.why}` : message.why],
      }
    },
    view: pages.view,
    async run(command, send, signal) {
      const at = file()

      if (command.kind === "write") {
        writeSettings(at, command.settings)
        send({ kind: "wrote" })

        return
      }

      let timer: ReturnType<typeof setTimeout> | undefined
      const read = () => send({ kind: "read", settings: readSettings(at) })
      const stop = watchSettings(at, () => {
        clearTimeout(timer)
        timer = setTimeout(read, 30)
      })

      read()
      await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }))
      clearTimeout(timer)
      stop()
    },
    failed: (c, error) =>
      c.kind === "write" ? { kind: "failed", why: error, writing: true } : { kind: "failed", why: `the settings file is not followed: ${error}`, writing: false },
  })
}

export default settings()
