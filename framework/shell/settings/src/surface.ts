// The shell's Settings surface lists its pages at / and offers each setting at its own page. Settings belong to the
// person, across projects and sessions: its state is their file (store.ts), which every settings tab, in any session,
// watches and follows; the model is what the file said last, with what this tab changed and is writing. A change is
// written by a command, and a read while one is being written waits for it, so the tab never shows an older value back.
// The shell's page applies what they say. Nothing is said but a write that failed, a highlight, and every change is quiet: the page's
// own, of no event in the agent's work, so it is told to the agent in no way; the agent reads the tab when asked to change one.
// At /archive the archive of closed tabs (../../src/archive.ts): how long it keeps them and how large it may grow, the
// person's in every project as the rest is; and two clears, which act on the project of the session the tab is open in,
// each saying what it frees before it is taken, as measured by a command as the tab starts and after each clear, or when
// asked. A clear is no bookkeeping: it is kept as activity, and says what it freed.
import { join } from "node:path"
import { action, surface, view, type Update } from "../../../core/index.ts"
import { clashing, COMMANDS, parse, type CommandId } from "./keys.ts"
import { bounded } from "../../../kit/theme.ts"
import { REPOSITORY, VERSION } from "../../../core/update.ts"
import { SETTINGS_PAGES } from "./pages.ts"
import {
  DRAWERS,
  KEEP_BOUNDS,
  ENDS,
  isChoice,
  MODES,
  numbersOf,
  PREFERENCE_NAMES,
  PREFERENCES,
  settingsOf,
  SIDES,
  THEMES,
  appearanceView,
  type Choice,
  type Keep,
  type Mode,
  type Rail,
  type Settings,
} from "./settings.ts"
import { readSettings, settingsFile, watchSettings, writeSettings } from "./store.ts"
import { sessionDir } from "../../../core/state/session-dir.ts"
import { sessionCwd } from "../../../core/state/state.ts"
import { findBaba, setHarness } from "../../../core/provision.ts"
import { HARNESS_NAMES, type HarnessName } from "../../../core/config.ts"
import { isPerson } from "../../../core/session.ts"
import { clear, measure, projectHome, projectOf, sized, type Freed, type Measure } from "../../src/archive.ts"
import { harnessConnection, type HarnessConnection } from "../../src/harness-connection.ts"

/** Which closed tabs a clear takes: this session's, or the whole project's. */
export type Scope = "session" | "project"
/**
 * `writing`: this tab's writes not yet done; `unsaved`: why the last one failed. `measured`: what each clear would free, as
 * last measured; `clearing`: the clear under way.
 */
export type Model = {
  settings: Settings
  writing: number
  unsaved?: string
  measured?: Measure
  clearing?: Scope
  connection?: HarnessConnection | null
  changingHarness?: HarnessName
  harnessError?: string
}
export type Event =
  | { kind: "read"; settings: Settings }
  | { kind: "wrote" }
  | { kind: "failed"; why: string; writing: boolean; clear?: true }
  | { kind: "measured"; measure: Measure }
  | { kind: "connection"; connection: HarnessConnection | null }
  | { kind: "harnessChanged"; connection: HarnessConnection | null }
  | { kind: "harnessFailed"; why: string }
  | { kind: "cleared"; scope: Scope; freed: Freed }
export type Command =
  | { kind: "watch" }
  | { kind: "write"; settings: Settings }
  | { kind: "measure" }
  | { kind: "connection" }
  | { kind: "harness"; name: HarnessName; on: boolean }
  | { kind: "clear"; scope: Scope; window: Keep }

const changed = (m: Model, settings: Settings): Update<Model, Command> => ({
  model: { ...m, settings, writing: m.writing + 1, unsaved: undefined, measured: undefined, clearing: undefined },
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
const sleepAtEnd = action({
  name: "sleepAtEnd",
  quiet: true,
  description: "whether a session-end hook shortens the runtime's wake deadline to a minute; off keeps the inactivity timer",
  subject: {},
  inputs: { on: "boolean" },
  update: (m: Model, { on }): Update<Model, Command> => changed(m, { ...m.settings, runtime: { sleepAtEnd: on } }),
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

const keep = action({
  name: "keep",
  quiet: true,
  description:
    "how the archive of closed tabs clears itself, in every project: a closed tab or a session over goes days after it ended, and the oldest first while a project's archive is past megabytes; both given",
  subject: {},
  inputs: { days: { type: "number", range: KEEP_BOUNDS.days }, megabytes: { type: "number", range: KEEP_BOUNDS.megabytes } },
  update(m: Model, { days, megabytes }): Update<Model, Command> {
    return changed(m, { ...m.settings, archive: { days, megabytes } })
  },
})
const measuring = action({
  name: "measure",
  quiet: true,
  description: "again, what each clear of closed tabs would free",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: m, commands: [{ kind: "measure" }], quiet: true }),
})
const clearing = action({
  name: "clear",
  description: "frees the closed tabs it keeps",
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
  const project = place && projectOf(projectHome(place))
  const measured = m.measured
  const offer = (scope: Scope, f: Freed | undefined) =>
    f && (f.tabs || f.sessions) && !m.clearing
      ? { [`clear${scope === "session" ? "Session" : "Project"}`]: { ...clearing.bind({ scope }), description: `frees ${freeing(f)}${scope === "project" ? `, of ${project}` : ""}` } }
      : {}

  return {
    title: "Data & Storage",
    how:
      "A closed tab is kept read only, its state and log, in the archive of its session, read at the shell's /activity/closed. The archive " +
      "clears itself by the window, the person's in every project. A clear acts on this project alone.",
    ...(project ? { project } : { project: "none: this tab runs in no session" }),
    window: { ...m.settings.archive },
    keep: keep.bind({}),
    ...(measured && {
      session: { tabs: measured.session.tabs, size: sized(measured.session.bytes) },
      wholeProject: {
        tabs: measured.project.tabs,
        sessions: measured.project.sessions,
        size: sized(measured.project.bytes),
        ...(measured.project.running && {
          running: measured.project.running === 1 ? "1 other session runs now, and is left as it is" : `${measured.project.running} other sessions run now, and are left as they are`,
        }),
      },
    }),
    ...(m.clearing && { clearing: m.clearing }),
    ...(project && { measure: measuring.bind({}) }),
    ...offer("session", measured?.session),
    ...offer("project", measured?.project),
  }
}

const checkConnection = action({
  name: "checkConnection",
  quiet: true,
  description: "refresh what the project has configured and what this session has heard",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: m, commands: [{ kind: "connection" }] }),
})

const changeHarness = action({
  name: "changeHarness",
  description: "enable and provision a project harness, or remove Baba’s integration for it",
  subject: {},
  inputs: { harness: { type: "string", choices: HARNESS_NAMES }, on: "boolean" },
  update(m: Model, { harness, on }, call): Update<Model, Command> {
    if (!isPerson(call.actor)) return { refused: "Change harness connections from Baba Settings." }
    if (m.changingHarness) return { refused: "Wait for the current harness change to finish." }

    return { model: { ...m, changingHarness: harness, harnessError: undefined }, commands: [{ kind: "harness", name: harness, on }] }
  },
})

/** The settings' pages, of the session whose folder `place` names. */
const pagesOf = (place: () => string | undefined) => view(
  [mode, theme, dynamic, same, rail, ...preferred, animate, sleepAtEnd, checkConnection, changeHarness, bind, reset, keep, measuring, clearing], {
  "/": (m) => ({
    title: "Settings",
    pages: SETTINGS_PAGES.map((page) => ({ ...page })),
    ...(m.unsaved !== undefined && { unsaved: m.unsaved }),
  }),
  "/general": (m) => ({
    title: "General", runtime: m.settings.runtime, sleepAtEnd: sleepAtEnd.bind({}),
    ...(place() && {
      checkConnection: checkConnection.bind({}),
      ...(m.connection !== undefined && { connection: m.connection }),
      ...(m.connection && { changeHarness: changeHarness.bind({}) }),
      ...(m.changingHarness && { changingHarness: m.changingHarness }),
      ...(m.harnessError && { harnessError: m.harnessError }),
    }),
  }),
  "/appearance": (m) => ({
    title: "Appearance",
    appearance: appearanceView(m.settings.appearance),
    preferences: m.settings.preferences,
    logo: m.settings.logo,
    mode: mode.bind({}),
    theme: theme.bind({}),
    dynamic: dynamic.bind({}),
    same: same.bind({}),
    rail: rail.bind({}),
    ...Object.fromEntries(preferred.map((a) => [a.name, a.bind({})])),
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
  "/archive": (m) => archived(m, place()),
  "/about": () => ({ title: "About", version: VERSION, website: "https://babavoss.org", source: `https://github.com/${REPOSITORY}` }),
})

/**
 * The settings surface over the person's file, which `file` names when it runs: theirs by default; and over the archive of
 * the project of the session whose folder `place` names: the one its runtime serves by default.
 */
export function settings(file: () => string = () => settingsFile(), place: () => string | undefined = () => sessionDir()) {
  const pages = pagesOf(place)

  return surface<Model, Event, Command>({
    description: "The person's shell settings and the running version. Use when changing appearance, shortcuts, session behavior or archive retention, or when checking the version.",
    init: () => ({ settings: settingsOf(undefined), writing: 0 }),
    // What a tab kept is only a first look: the file is read again as it starts.
    restore: (saved) => ({ settings: settingsOf((saved as { settings?: unknown } | undefined)?.settings), writing: 0 }),
    start: () => place() ? [{ kind: "watch" }, { kind: "measure" }, { kind: "connection" }] : [{ kind: "watch" }],
    session: (c) => c.kind === "watch",
    update(m, message): Update<Model, Command> {
      if (message.kind === "call") return pages.update(m, message)
      if (message.kind === "read") return { model: m.writing > 0 ? m : { ...m, settings: message.settings, writing: 0, unsaved: undefined }, quiet: true }
      if (message.kind === "wrote") return { model: { ...m, writing: Math.max(0, m.writing - 1), unsaved: undefined }, quiet: true }
      if (message.kind === "measured") return { model: { ...m, measured: message.measure }, quiet: true }
      if (message.kind === "connection") return { model: m.changingHarness ? m : { ...m, connection: message.connection }, quiet: true }
      if (message.kind === "harnessChanged") return { model: { ...m, connection: message.connection, changingHarness: undefined }, quiet: true }
      if (message.kind === "harnessFailed") return { model: { ...m, changingHarness: undefined, harnessError: message.why }, quiet: true }
      if (message.kind === "cleared")
        return {
          model: { ...m, clearing: undefined },
          commands: [{ kind: "measure" }],
          notices: [`Cleared ${freeing(message.freed)}, from this ${message.scope}'s archive`],
        }

      return {
        model: { ...m, writing: Math.max(0, m.writing - (message.writing ? 1 : 0)), unsaved: message.why, ...(message.clear && { clearing: undefined }) },
        notices: [{ text: message.writing ? `The settings were not saved: ${message.why}` : message.why, highlight: true }],
      }
    },
    view: pages.view,
    async run(command, send, signal) {
      const at = file()
      const own = place()

      if (command.kind === "connection" || command.kind === "harness") {
        const cwd = own && sessionCwd(join(own, "baba"))
        const baba = cwd && findBaba(cwd)

        if (command.kind === "harness") {
          if (!baba) throw new Error("This session has no Baba project.")
          await setHarness(baba, command.name, command.on)
        }
        const connection = own && baba ? await harnessConnection(baba, own).catch(() => null) : null

        send({ kind: command.kind === "harness" ? "harnessChanged" : "connection", connection })

        return
      }
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
      c.kind === "harness"
        ? { kind: "harnessFailed", why: error }
        : c.kind === "connection"
        ? { kind: "connection", connection: null }
        : c.kind === "write"
        ? { kind: "failed", why: error, writing: true }
        : c.kind === "clear"
          ? { kind: "failed", why: `the closed tabs were not cleared: ${error}`, writing: false, clear: true }
          : c.kind === "measure"
            ? { kind: "failed", why: `the archive was not measured: ${error}`, writing: false }
            : { kind: "failed", why: `the settings file is not followed: ${error}`, writing: false },
  })
}

export default settings()
