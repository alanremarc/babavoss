// The settings: a surface that comes with the shell, beside the project's, which holds the person's settings of the
// shell's page, the appearance, the shortcuts and the mark, each a fact with the action that changes it. They are the
// person's, not a tab's nor a session's: its state is their file (store.ts), which every settings tab, in any session,
// watches and follows; the model is what the file said last, with what this tab changed and is writing. A change is
// written by a command, and a read while one is being written waits for it, so the tab never shows an older value back.
// The shell's page applies what they say. Nothing is noticed but a write that failed, and every change is quiet: the page's
// own, of no event in the agent's work, so it is told to the agent in no way; the agent reads the tab when asked to change one.
import { action, surface, view, type Update } from "../../../core/index.ts"
import { bindings, clashing, COMMANDS, isCommand, parse, type CommandId } from "./keys.ts"
import { bounded, isPreset } from "../../../kit/theme.ts"
import { choiceIn, isMode, MODES, nameOf, numbersOf, settingsOf, THEMES, type Choice, type Mode, type Settings } from "./settings.ts"
import { readSettings, settingsFile, watchSettings, writeSettings } from "./store.ts"

/** `writing`: this tab's writes not yet done; `unsaved`: why the last one failed. */
export type Model = { settings: Settings; writing: number; unsaved?: string }
export type Event = { kind: "read"; settings: Settings } | { kind: "wrote" } | { kind: "failed"; why: string; writing: boolean }
export type Command = { kind: "watch" } | { kind: "write"; settings: Settings }

const changed = (m: Model, settings: Settings): Update<Model, Command> => ({
  model: { settings, writing: m.writing + 1 },
  commands: [{ kind: "write", settings }],
})
const THEME_NAMES = THEMES.join(", ")

/** Where a theme is set: both modes while they are the same, else the one named; or why it cannot be. */
function target(m: Model, mode: string): { modes: Mode[] } | { refused: string } {
  const { same } = m.settings.appearance

  if (mode === "both") return same ? { modes: ["light"] } : { refused: "the modes have themes of their own: name light or dark, or call same with on true first" }
  if (mode !== "light" && mode !== "dark") return { refused: `a theme is of the light or the dark mode, or both, not ${mode}` }
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
  description: `set the colour mode: ${MODES.join(", ")}`,
  subject: {},
  inputs: { mode: "string" },
  update: (m: Model, { mode }): Update<Model, Command> =>
    isMode(mode) ? changed(m, { ...m.settings, appearance: { ...m.settings.appearance, mode } }) : { refused: `no mode ${mode}: it is ${MODES.join(", ")}` },
})
const theme = action({
  name: "theme",
  quiet: true,
  description: `choose a theme: mode both while the modes are the same, else light or dark; theme ${THEME_NAMES}, dynamic keeping its numbers or starting from the theme it replaces`,
  subject: {},
  inputs: { mode: "string", theme: "string" },
  update(m: Model, { mode, theme }): Update<Model, Command> {
    const at = target(m, mode)

    if ("refused" in at) return at
    if (theme !== "dynamic" && !isPreset(theme)) return { refused: `no theme ${theme}: it is ${THEME_NAMES}` }

    const now = m.settings.appearance.themes[at.modes[0]!]

    return chosen(m, at.modes, theme === "dynamic" ? numbersOf(now) : theme)
  },
})
const dynamic = action({
  name: "dynamic",
  quiet: true,
  description: "give a mode a dynamic theme of these numbers: mode as for theme; hue 0–360, tint (how strongly the greys lean to the hue) and vivid (how coloured the accent is) 0–100",
  subject: {},
  inputs: { mode: "string", hue: "number", tint: "number", vivid: "number" },
  update(m: Model, { mode, hue, tint, vivid }): Update<Model, Command> {
    const at = target(m, mode)

    if ("refused" in at) return at
    if (!Number.isFinite(hue) || hue < 0 || hue > 360) return { refused: `hue is 0 to 360, not ${hue}` }
    if (!Number.isFinite(tint) || tint < 0 || tint > 100) return { refused: `tint is 0 to 100, not ${tint}` }
    if (!Number.isFinite(vivid) || vivid < 0 || vivid > 100) return { refused: `vivid is 0 to 100, not ${vivid}` }

    return chosen(m, at.modes, bounded({ hue, tint, vivid }))
  },
})
const same = action({
  name: "same",
  quiet: true,
  description: "whether both modes use one theme; off, each mode starts from the one they shared and is chosen on its own",
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
  description: "whether the mark looks about while the agent works; off, it stays still and shows the work by its tint alone",
  subject: {},
  inputs: { on: "boolean" },
  update: (m: Model, { on }): Update<Model, Command> => changed(m, { ...m.settings, logo: { animate: on } }),
})
const bind = action({
  name: "bind",
  quiet: true,
  description: `bind a command to keys, written as mod+p or mod+shift+k, mod being ⌘ on a Mac and Ctrl elsewhere; command is ${Object.keys(COMMANDS).join(", ")}`,
  subject: {},
  inputs: { command: "string", keys: "string" },
  update(m: Model, { command, keys }): Update<Model, Command> {
    if (!isCommand(command)) return { refused: `no command ${command}: it is ${Object.keys(COMMANDS).join(", ")}` }

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
  description: "bind a command to its default keys again; command=all for every command",
  subject: {},
  inputs: { command: "string" },
  update(m: Model, { command }): Update<Model, Command> {
    if (command === "all") return changed(m, { ...m.settings, keys: {} })
    if (!isCommand(command)) return { refused: `no command ${command}: it is ${Object.keys(COMMANDS).join(", ")}, or all` }

    const { [command]: _, ...rest } = m.settings.keys
    const clash = clashing(rest, command, COMMANDS[command].keys)

    if (clash) return { refused: `${COMMANDS[command].keys}, the default of ${command}, is bound to ${clash} now: bind ${clash} to other keys first` }

    return changed(m, { ...m.settings, keys: rest })
  },
})

const pages = view([mode, theme, dynamic, same, animate, bind, reset], {
  "/": (m) => ({
    title: "Settings",
    how: "The person's own settings of the shell's page, the same in every session and project. Change one when they ask.",
    appearance: appearanceView(m.settings),
    shortcuts: { at: "/shortcuts", ...bindings(m.settings.keys) },
    logo: { animate: m.settings.logo.animate },
    ...(m.unsaved !== undefined && { unsaved: m.unsaved }),
    mode: mode.bind({}),
    theme: theme.bind({}),
    dynamic: dynamic.bind({}),
    same: same.bind({}),
    animate: animate.bind({}),
  }),
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

/** The appearance as it is told: the mode, and one theme for both or one each, a preset's id or dynamic with its numbers. */
function appearanceView({ appearance }: Settings) {
  const told = (choice: Choice) => (typeof choice === "string" ? choice : { theme: nameOf(choice), ...choice })

  return appearance.same
    ? { mode: appearance.mode, same: true, theme: told(choiceIn(appearance, "light")) }
    : { mode: appearance.mode, same: false, light: told(appearance.themes.light), dark: told(appearance.themes.dark) }
}

/** The settings surface over the person's file, which `file` names when it runs: theirs by default. */
export function settings(file: () => string = () => settingsFile()) {
  return surface<Model, Event, Command>({
    description: "The person's settings of the shell's page: appearance, shortcuts, and whether the mark moves while the agent works. Use when the person asks to change one.",
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
