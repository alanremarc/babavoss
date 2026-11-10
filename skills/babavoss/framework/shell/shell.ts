// The shell surface: one surface made of utils, each a mini-app with its own surface, opened as tabs. A tab stands at
// /tabs/N and the util's own paths below it; the util never knows. The shell is a built-in of the framework: it imports
// the core beside it, and nothing else of the framework imports it.
import { action, surface, view, type Call, type Surface, type Update, type View } from "../core/index.ts"

export type Util<M, E extends { kind: string }, C> = { name: string; description: string; surface: Surface<M, E, C> }
// Deliberately any: this erases the type parameters, for code that holds one without knowing them.
export type AnyUtil = Util<any, any, any>

/** A util: a mini-app, one per workflow or job. */
export const util = <M, E extends { kind: string }, C>(name: string, description: string, program: Surface<M, E, C>): Util<M, E, C> => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`A util name is lowercase kebab-case: ${name}`)

  return { name, description, surface: program }
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
      utils: options.utils.map((u) => ({ name: u.name, description: u.description, open: open.bind({ util: u.name }) })),
      tabs: model.tabs.map((tab) => ({
        at: `/tabs/${tab.n}`,
        n: tab.n,
        util: tab.util,
        ...(title(tab) && { title: title(tab) }),
        close: close.bind({ n: tab.n }),
      })),
    }),
  })
  const wrapped = (tab: Tab, result: Update<unknown, unknown>, model: ShellModel): Update<ShellModel, ShellCommand> =>
    "refused" in result
      ? result
      : {
          model: { ...model, tabs: model.tabs.map((t) => (t.n === tab.n ? { ...t, model: result.model } : t)) },
          commands: (result.commands ?? []).map((command) => ({ n: tab.n, util: tab.util, command })),
        }

  return surface<ShellModel, ShellEvent, ShellCommand>({
    description: `${options.title}: ${options.utils.map((u) => u.name).join(", ")} in tabs`,
    init: () => ({ tabs: [], next: 1 }),
    restore(saved): ShellModel {
      const kept = saved as Partial<ShellModel> | undefined

      if (!kept || !Array.isArray(kept.tabs) || typeof kept.next !== "number") throw new Error("saved shell state has no tabs and next number")

      return {
        next: kept.next,
        tabs: kept.tabs
          .filter((t) => utils.has(t.util))
          .map((t) => {
            const u = utils.get(t.util)!

            return { n: t.n, util: t.util, model: u.surface.restore ? u.surface.restore(t.model) : t.model }
          }),
      }
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

      if (!at) return root.view(model, path)

      const tab = model.tabs.find((t) => t.n === at.n)

      return tab && utils.get(tab.util)!.surface.view(tab.model, at.path, actor)
    },
    run: (c, send, signal) => utils.get(c.util)!.surface.run(c.command, (event: { kind: string }) => send({ kind: "tab", n: c.n, event }), signal),
    failed: (c, error) => ({ kind: "tab", n: c.n, event: utils.get(c.util)!.surface.failed(c.command, error) }),
  })
}
