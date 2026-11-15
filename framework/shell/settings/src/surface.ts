// The settings: a surface that comes with the shell, beside the project's, which holds the person's settings of the
// shell's page, the appearance, the shortcuts and the mark, each a fact with the action that changes it. They are the
// person's, not a tab's nor a session's: its state is their file (store.ts), which every settings tab, in any session,
// watches and follows; the model is what the file said last, with what this tab changed and is writing. A change is
// written by a command, and a read while one is being written waits for it, so the tab never shows an older value back.
// The shell's page applies what they say. Nothing is noticed but a write that failed.
import { action, surface, view, type Update } from "../../../core/index.ts"
import { bindings, clashing, COMMANDS, isCommand, parse, type CommandId } from "./keys.ts"
import { isMode, isTheme, MODES, settingsOf, THEMES, type Mode, type Settings } from "./settings.ts"
import { readSettings, settingsFile, watchSettings, writeSettings } from "./store.ts"

/** `writing`: this tab's writes not yet done; `unsaved`: why the last one failed. */
export type Model = { settings: Settings; writing: number; unsaved?: string }
export type Event = { kind: "read"; settings: Settings } | { kind: "wrote" } | { kind: "failed"; why: string; writing: boolean }
export type Command = { kind: "watch" } | { kind: "write"; settings: Settings }

const changed = (m: Model, settings: Settings): Update<Model, Command> => ({
  model: { settings, writing: m.writing + 1 },
  commands: [{ kind: "write", settings }],
})
const themes = (mode: Mode) => THEMES[mode].map((t) => t.id)

const mode = action({
  name: "mode",
  description: `set the colour mode: ${MODES.join(", ")}`,
  subject: {},
  inputs: { mode: "string" },
  update: (m: Model, { mode }): Update<Model, Command> =>
    isMode(mode) ? changed(m, { ...m.settings, appearance: { ...m.settings.appearance, mode } }) : { refused: `no mode ${mode}: it is ${MODES.join(", ")}` },
})
const theme = action({
  name: "theme",
  description: `set the theme of a mode: mode light or dark, theme ${themes("light").join(" or ")}`,
  subject: {},
  inputs: { mode: "string", theme: "string" },
  update(m: Model, { mode, theme }): Update<Model, Command> {
    if (mode !== "light" && mode !== "dark") return { refused: `a theme is of the light or the dark mode, not ${mode}` }
    if (!isTheme(mode, theme)) return { refused: `no ${mode} theme ${theme}: it is ${themes(mode).join(" or ")}` }

    return changed(m, { ...m.settings, appearance: { ...m.settings.appearance, themes: { ...m.settings.appearance.themes, [mode]: theme } } })
  },
})
const animate = action({
  name: "animate",
  description: "whether the mark looks about while the agent works; off, it stays still and shows the work by its tint alone",
  subject: {},
  inputs: { on: "boolean" },
  update: (m: Model, { on }): Update<Model, Command> => changed(m, { ...m.settings, logo: { animate: on } }),
})
const bind = action({
  name: "bind",
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

const pages = view([mode, theme, animate, bind, reset], {
  "/": (m) => ({
    title: "Settings",
    how: "The person's own settings of the shell's page, the same in every session and project. Change one when they ask.",
    appearance: { mode: m.settings.appearance.mode, light: m.settings.appearance.themes.light, dark: m.settings.appearance.themes.dark },
    shortcuts: { at: "/shortcuts", ...bindings(m.settings.keys) },
    logo: { animate: m.settings.logo.animate },
    ...(m.unsaved !== undefined && { unsaved: m.unsaved }),
    mode: mode.bind({}),
    theme: theme.bind({}),
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
      if (message.kind === "read") return { model: m.writing > 0 ? m : { settings: message.settings, writing: 0 } }
      if (message.kind === "wrote") return { model: { settings: m.settings, writing: Math.max(0, m.writing - 1) } }

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
