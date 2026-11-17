// The settings: a surface that comes with the shell, beside the project's, which holds the person's settings of the
// shell's page, the appearance with where the rail of tabs stands, the preferences a page follows, the shortcuts and the mark, each a fact
// with the action that changes it. They are the
// person's, not a tab's nor a session's: its state is their file (store.ts), which every settings tab, in any session,
// watches and follows; the model is what the file said last, with what this tab changed and is writing. A change is
// written by a command, and a read while one is being written waits for it, so the tab never shows an older value back.
// The shell's page applies what they say. Nothing is noticed but a write that failed, and every change is quiet: the page's
// own, of no event in the agent's work, so it is told to the agent in no way; the agent reads the tab when asked to change one.
// At /archive the archive of closed tabs (../../src/archive.ts): how long it keeps them and how large it may grow, the
// person's in every project as the rest is; and two clears, which act on the project of the session the tab is open in,
// each saying what it frees before it is taken, as measured by a command as the tab starts and after each clear, or when
// asked. A clear is no bookkeeping: it is kept as activity, and says what it freed.
import { action, surface, view, type Schema, type Update } from "../../../core/index.ts"
import { clashing, COMMANDS, isCommand, parse, type CommandId } from "./keys.ts"
import { bounded, isPreset } from "../../../kit/theme.ts"
import {
  DRAWERS,
  KEEP_BOUNDS,
  keeps,
  ENDS,
  isChoice,
  isMode,
  MODES,
  numbersOf,
  PREFERENCE_NAMES,
  PREFERENCES,
  settingsOf,
  SIDES,
  THEMES,
  viewOf,
  type Choice,
  type Keep,
  type Mode,
  type Rail,
  type Settings,
} from "./settings.ts"
import { readSettings, settingsFile, watchSettings, writeSettings } from "./store.ts"
import { dirname } from "node:path"
import { sessionDir } from "../../../core/state/session-dir.ts"
import { clear, measure, projectHome, sized, type Freed, type Measure } from "../../src/archive.ts"

/** Which closed tabs a clear takes: this session's, or the whole project's. */
export type Scope = "session" | "project"
/**
 * `writing`: this tab's writes not yet done; `unsaved`: why the last one failed. `measured`: what each clear would free, as
 * last measured; `clearing`: the clear under way.
 */
export type Model = { settings: Settings; writing: number; unsaved?: string; measured?: Measure; clearing?: Scope }
export type Event =
  | { kind: "read"; settings: Settings }
  | { kind: "wrote" }
  | { kind: "failed"; why: string; writing: boolean; clear?: true }
  | { kind: "measured"; measure: Measure }
  | { kind: "cleared"; scope: Scope; freed: Freed }
export type Command = { kind: "watch" } | { kind: "write"; settings: Settings } | { kind: "measure" } | { kind: "clear"; scope: Scope; window: Keep }

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
  description: `choose a theme: mode both while the modes are the same, else light or dark; theme ${THEME_NAMES}. Dynamic keeps the mode's numbers, or starts from the theme it replaces`,
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
const rail = action({
  name: "rail",
  quiet: true,
  description: `where the rail of tabs stands: side ${SIDES.join(", ")}; from ${ENDS.join(" or ")}, the end the mark is at on a rail at the left or right; drawer ${DRAWERS.join(" or ")}, where a tab's drawer opens under a rail along the top or bottom. Give all three, the ones not changed as they are`,
  subject: {},
  inputs: { side: "string", from: "string", drawer: "string" },
  update(m: Model, { side, from, drawer }): Update<Model, Command> {
    const one = <T extends string>(options: readonly T[], value: string): value is T => options.includes(value as T)

    if (!one(SIDES, side)) return { refused: `side is ${SIDES.join(", ")}, not ${side}` }
    if (!one(ENDS, from)) return { refused: `from is ${ENDS.join(" or ")}, not ${from}` }
    if (!one(DRAWERS, drawer)) return { refused: `drawer is ${DRAWERS.join(" or ")}, not ${drawer}` }

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
    description: `${does}: ${choices.join(", ")}`,
    subject: {},
    inputs: { [name]: typeof usual === "number" ? "number" : "string" } as Schema,
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

const keep = action({
  name: "keep",
  quiet: true,
  description: `how the archive of closed tabs clears itself, in every project: a closed tab, or a session over, goes days after it closed or ended (${KEEP_BOUNDS.days.join(" to ")}), and the oldest first while a project's archive is past megabytes (${KEEP_BOUNDS.megabytes.join(" to ")}). Give both, the one not changed as it is`,
  subject: {},
  inputs: { days: "number", megabytes: "number" },
  update(m: Model, { days, megabytes }): Update<Model, Command> {
    if (!keeps("days", days)) return { refused: `days is a whole number from ${KEEP_BOUNDS.days.join(" to ")}, not ${days}` }
    if (!keeps("megabytes", megabytes)) return { refused: `megabytes is a whole number from ${KEEP_BOUNDS.megabytes.join(" to ")}, not ${megabytes}` }

    return changed(m, { ...m.settings, archive: { days, megabytes } })
  },
})
const measuring = action({
  name: "measure",
  quiet: true,
  description: "measure again what each clear of closed tabs would free",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: m, commands: [{ kind: "measure" }], quiet: true }),
})
const clearing = action({
  name: "clear",
  description: ({ scope }) => `clear the closed tabs of this ${scope}`,
  subject: { scope: "string" },
  inputs: {},
  update(m: Model, { scope }): Update<Model, Command> {
    if (scope !== "session" && scope !== "project") return { refused: `a clear is of the session or the project, not ${scope}` }
    if (m.clearing) return { refused: `the closed tabs of this ${m.clearing} are being cleared: wait for it` }

    return { model: { ...m, clearing: scope }, commands: [{ kind: "clear", scope, window: m.settings.archive }] }
  },
})

/** What a clear frees, as one phrase: its closed tabs, and the sessions over, with the size. */
const freeing = (f: Freed) =>
  `${f.tabs} closed tab${f.tabs === 1 ? "" : "s"}${f.sessions ? ` and ${f.sessions} session${f.sessions === 1 ? "" : "s"} over` : ""}, ${sized(f.bytes)}`

/** The archive's view: its window, what each clear would free, and the clears where there is something to free. */
const archived = (m: Model, place: string | undefined) => {
  const project = place && dirname(projectHome(place))
  const measured = m.measured
  const offer = (scope: Scope, f: Freed | undefined) =>
    f && (f.tabs || f.sessions) && !m.clearing
      ? { [`clear${scope === "session" ? "Session" : "Project"}`]: { ...clearing.bind({ scope }), description: `clear ${scope === "session" ? "this session's" : `the project's, ${project},`} ${freeing(f)}` } }
      : {}

  return {
    title: "Closed tabs",
    how:
      "A closed tab is kept read only, its state and log, in the archive of its session, read at the shell's /activity/closed. The archive " +
      "clears itself by the window, the person's in every project. A clear acts on this project alone, and only when the person asks.",
    ...(project ? { project } : { project: "none: this tab runs in no session" }),
    window: { ...m.settings.archive },
    keep: keep.bind({}),
    ...(measured && {
      session: { tabs: measured.session.tabs, size: sized(measured.session.bytes) },
      wholeProject: {
        tabs: measured.project.tabs,
        sessions: measured.project.sessions,
        size: sized(measured.project.bytes),
        ...(measured.project.running && { running: `${measured.project.running} other sessions run now, and are left as they are` }),
      },
    }),
    ...(m.clearing && { clearing: m.clearing }),
    ...(project && { measure: measuring.bind({}) }),
    ...offer("session", measured?.session),
    ...offer("project", measured?.project),
  }
}

/** The settings' pages, of the session whose folder `place` names. */
const pagesOf = (place: () => string | undefined) => view([mode, theme, dynamic, same, rail, ...preferred, animate, bind, reset, keep, measuring, clearing], {
  "/": (m) => {
    const told = viewOf(m.settings)

    return {
      title: "Settings",
      how: "The person's own settings of the shell's page, the same in every session and project. Change one when they ask.",
      appearance: told.appearance,
      preferences: told.preferences,
      shortcuts: { at: "/shortcuts", ...told.shortcuts },
      logo: told.logo,
      archive: { at: "/archive", ...told.archive },
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
  "/archive": (m) => archived(m, place()),
})

/**
 * The settings surface over the person's file, which `file` names when it runs: theirs by default; and over the archive of
 * the project of the session whose folder `place` names: the one its runtime serves by default.
 */
export function settings(file: () => string = () => settingsFile(), place: () => string | undefined = () => sessionDir()) {
  const pages = pagesOf(place)

  return surface<Model, Event, Command>({
    description: "The person's settings of the shell's page: appearance, where the tabs stand, motion, text size, the side of a page's sidebar, shortcuts, and whether the mark moves while the agent works. Use when the person asks to change one.",
    init: () => ({ settings: settingsOf(undefined), writing: 0 }),
    // What a tab kept is only a first look: the file is read again as it starts.
    restore: (saved) => ({ settings: settingsOf((saved as { settings?: unknown } | undefined)?.settings), writing: 0 }),
    start: () => [{ kind: "watch" }, ...(place() ? [{ kind: "measure" as const }] : [])],
    session: (c) => c.kind === "watch",
    update(m, message): Update<Model, Command> {
      if (message.kind === "call") return pages.update(m, message)
      if (message.kind === "read") return { model: m.writing > 0 ? m : { ...m, settings: message.settings, writing: 0, unsaved: undefined }, quiet: true }
      if (message.kind === "wrote") return { model: { ...m, writing: Math.max(0, m.writing - 1), unsaved: undefined }, quiet: true }
      if (message.kind === "measured") return { model: { ...m, measured: message.measure }, quiet: true }
      if (message.kind === "cleared")
        return {
          model: { ...m, clearing: undefined },
          commands: [{ kind: "measure" }],
          notices: [`Cleared ${freeing(message.freed)}, from this ${message.scope}'s archive`],
        }

      return {
        model: { ...m, writing: Math.max(0, m.writing - (message.writing ? 1 : 0)), unsaved: message.why, ...(message.clear && { clearing: undefined }) },
        notices: [message.writing ? `The settings were not saved: ${message.why}` : message.why],
      }
    },
    view: pages.view,
    async run(command, send, signal) {
      const at = file()
      const own = place()

      if (command.kind === "measure") {
        if (own) send({ kind: "measured", measure: measure(own, readSettings(at).archive) })

        return
      }
      if (command.kind === "clear") {
        if (!own) throw new Error("this tab runs in no session")
        send({ kind: "cleared", scope: command.scope, freed: clear(own, command.scope, command.window) })

        return
      }

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
    failed: (c, error): Event =>
      c.kind === "write"
        ? { kind: "failed", why: error, writing: true }
        : c.kind === "clear"
          ? { kind: "failed", why: `the closed tabs were not cleared: ${error}`, writing: false, clear: true }
          : c.kind === "measure"
            ? { kind: "failed", why: `the archive was not measured: ${error}`, writing: false }
            : { kind: "failed", why: `the settings file is not followed: ${error}`, writing: false },
  })
}

export default settings()
