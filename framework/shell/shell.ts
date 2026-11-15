// The shell surface: one surface made of utils, each a mini-app with its own surface, opened as tabs. A tab stands at
// /tabs/N and the util's own paths below it; the util never knows: the paths its views name under `at` are given whole
// on the way out. Home at / lists each open tab with its util's facts at /, so what changes in a tab is in the agent's
// present. The shell is a built-in of the framework: it imports the core beside it, and nothing else of the framework
// imports it.
import { action, surface, view, type Call, type Json, type Surface, type Update, type View } from "../core/index.ts"

/** `open: "always"`: the util has one tab, from the start; it is neither opened again nor closed. */
export type UtilOptions = { open?: "always" }
export type Util<M, E extends { kind: string }, C> = { name: string; description: string; surface: Surface<M, E, C>; open?: "always" }
// Deliberately any: this erases the type parameters, for code that holds one without knowing them.
export type AnyUtil = Util<any, any, any>

/** A util: a mini-app, one per workflow or job. */
export const util = <M, E extends { kind: string }, C>(
  name: string,
  description: string,
  program: Surface<M, E, C>,
  options: UtilOptions = {}
): Util<M, E, C> => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`A util name is lowercase kebab-case: ${name}`)

  return { name, description, surface: program, ...(options.open && { open: options.open }) }
}

export type Tab = { n: number; util: string; model: unknown }
export type ShellModel = { tabs: Tab[]; next: number }
export type ShellEvent = { kind: "tab"; n: number; event: { kind: string } }
export type ShellCommand = { n: number; util: string; command: unknown }

const TAB = /^\/tabs\/(\d+)(\/.*)?$/

/** The tab a path stands in, and the path within it. */
export const within = (path: string): { n: number; path: string } | undefined => {
  const m = TAB.exec(path)

  return m ? { n: Number(m[1]), path: m[2] && m[2] !== "/" ? m[2].replace(/\/$/, "") : "/" } : undefined
}

const isHandle = (value: Json | undefined) => !!value && typeof value === "object" && !Array.isArray(value) && value.kind === "handle"

/** A view with the paths it names under `at` put below `address`: what the util calls /notes/1 is /tabs/2/notes/1 to its readers. */
export function whole<V extends Json | undefined>(value: V, address: string): V {
  if (Array.isArray(value)) return value.map((v) => whole(v, address)) as V
  if (!value || typeof value !== "object" || isHandle(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, k === "at" && typeof v === "string" && v.startsWith("/") ? address + (v === "/" ? "" : v) : whole(v, address)])
  ) as V
}

/** A view's facts: what it says, without the handles it offers. */
function facts(value: Json | undefined): Json | undefined {
  if (Array.isArray(value)) return value.map((v) => facts(v) ?? null)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => (isHandle(v) ? [] : [[k, facts(v)]])))
}

export function shell(options: { title: string; utils: readonly AnyUtil[] }): Surface<ShellModel, ShellEvent, ShellCommand> {
  const utils = new Map(options.utils.map((u) => [u.name, u]))

  if (utils.size !== options.utils.length) throw new Error("Util names must be unique")

  const open = action({
    name: "open",
    description: ({ util }) => `open a ${util} tab`,
    subject: { util: "string" },
    inputs: {},
    update(model: ShellModel, { util: name }): Update<ShellModel, ShellCommand> {
      const u = utils.get(name)

      if (!u) return { refused: `no util ${name}` }

      const tab: Tab = { n: model.next, util: name, model: u.surface.init() }
      const commands = (u.surface.start?.(tab.model) ?? []).map((command: unknown) => ({ n: tab.n, util: name, command }))

      return { model: { tabs: [...model.tabs, tab], next: model.next + 1 }, commands }
    },
  })
  const always = (name: string) => utils.get(name)?.open === "always"
  /** The model with a tab for every always-open util that has none: at the start, and when saved state predates one. */
  const opened = (model: ShellModel): ShellModel =>
    options.utils
      .filter((u) => u.open === "always" && !model.tabs.some((t) => t.util === u.name))
      .reduce<ShellModel>((m, u) => ({ tabs: [...m.tabs, { n: m.next, util: u.name, model: u.surface.init() }], next: m.next + 1 }), model)
  const close = action({
    name: "close",
    description: ({ n }) => `close tab ${n}; its state is dropped`,
    subject: { n: "number" },
    inputs: {},
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, tabs: model.tabs.filter((t) => t.n !== n) } }),
  })
  const title = (tab: Tab): string | undefined => {
    const v = utils.get(tab.util)?.surface.view(tab.model, "/")

    return v && typeof v.title === "string" ? v.title : undefined
  }
  const root = view([open, close], {
    "/": (model) => ({
      title: options.title,
      utils: options.utils.map((u) => ({ name: u.name, description: u.description, ...(!always(u.name) && { open: open.bind({ util: u.name }) }) })),
      tabs: model.tabs.map((tab) => ({
        at: `/tabs/${tab.n}`,
        n: tab.n,
        util: tab.util,
        ...(title(tab) && { title: title(tab) }),
        ...(!always(tab.util) && { close: close.bind({ n: tab.n }) }),
      })),
    }),
  })
  /** What a tab's util says at /, for the actor: its facts, the title apart, its paths whole. */
  const said = (tab: Tab, actor?: string): Json | undefined => {
    const { title: _title, ...rest } = utils.get(tab.util)!.surface.view(tab.model, "/", actor) ?? {}

    return facts(whole(rest, `/tabs/${tab.n}`))
  }
  const wrapped = (tab: Tab, result: Update<unknown, unknown>, model: ShellModel): Update<ShellModel, ShellCommand> =>
    "refused" in result
      ? result
      : {
          model: { ...model, tabs: model.tabs.map((t) => (t.n === tab.n ? { ...t, model: result.model } : t)) },
          commands: (result.commands ?? []).map((command) => ({ n: tab.n, util: tab.util, command })),
        }

  return surface<ShellModel, ShellEvent, ShellCommand>({
    description: `${options.title}: ${options.utils.map((u) => u.name).join(", ")} in tabs`,
    init: () => opened({ tabs: [], next: 1 }),
    restore(saved): ShellModel {
      const kept = saved as Partial<ShellModel> | undefined

      if (!kept || !Array.isArray(kept.tabs) || typeof kept.next !== "number") throw new Error("saved shell state has no tabs and next number")

      return opened({
        next: kept.next,
        tabs: kept.tabs
          .filter((t) => utils.has(t.util))
          .map((t) => {
            const u = utils.get(t.util)!

            return { n: t.n, util: t.util, model: u.surface.restore ? u.surface.restore(t.model) : t.model }
          }),
      })
    },
    start: (model) =>
      model.tabs.flatMap((tab) => (utils.get(tab.util)!.surface.start?.(tab.model) ?? []).map((command: unknown) => ({ n: tab.n, util: tab.util, command }))),
    working: (model) => model.tabs.some((tab) => utils.get(tab.util)!.surface.working?.(tab.model) ?? false),
    session: (c) => utils.get(c.util)?.surface.session?.(c.command) ?? false,
    update(model, message) {
      if (message.kind === "call") {
        const at = within(message.path)

        if (!at) return root.update(model, message)

        const tab = model.tabs.find((t) => t.n === at.n)

        if (!tab) return { refused: `no tab ${at.n}` }

        const call: Call = { ...message, path: at.path }

        return wrapped(tab, utils.get(tab.util)!.surface.update(tab.model, call), model)
      }

      const tab = model.tabs.find((t) => t.n === message.n)

      // An event for a closed tab arrives late and lands nowhere.
      if (!tab) return { model }

      return wrapped(tab, utils.get(tab.util)!.surface.update(tab.model, message.event), model)
    },
    view(model, path, actor): View | undefined {
      const at = within(path)

      if (!at) {
        const home = root.view(model, path)

        if (!home || path !== "/") return home

        return { ...home, tabs: (home.tabs as View[]).map((row, i) => ({ ...row, facts: said(model.tabs[i]!, actor) })) }
      }

      const tab = model.tabs.find((t) => t.n === at.n)

      return tab && whole(utils.get(tab.util)!.surface.view(tab.model, at.path, actor), `/tabs/${tab.n}`)
    },
    run: (c, send, signal) => utils.get(c.util)!.surface.run(c.command, (event: { kind: string }) => send({ kind: "tab", n: c.n, event }), signal),
    failed: (c, error) => ({ kind: "tab", n: c.n, event: utils.get(c.util)!.surface.failed(c.command, error) }),
  })
}
