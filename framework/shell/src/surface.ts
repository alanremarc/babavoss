// The shell surface: one surface made of utils, each a surface of its own, opened as tabs. A tab stands at
// /tabs/N and the util's own paths below it; the util never knows: the paths its views name under `at` are given whole
// on the way out. Home at / lists each open tab with its util's facts at /, so what changes in a tab is in the agent's
// present. What a util throws breaks only what it was asked for: a tab it cannot restore or show at / is listed as broken,
// with why and what to do, and close stays offered; a path it cannot show says so, and the rest of the tab works; a tab
// it cannot open is not made. The shell is a built-in of the framework: it imports the core beside it, and nothing else
// of the framework imports it.
import { action, surface, view, type Call, type Json, type Surface, type Update, type View } from "../../core/index.ts"

/** `open: "always"`: the util has one tab, from the start; it is neither opened again nor closed. */
export type UtilOptions = { open?: "always" }
export type Util<M, E extends { kind: string }, C> = { name: string; description: string; surface: Surface<M, E, C>; open?: "always" }
// Deliberately any: this erases the type parameters, for code that holds one without knowing them.
export type AnyUtil = Util<any, any, any>

/** A util: a surface of its own, one per workflow or job. */
export const util = <M, E extends { kind: string }, C>(
  name: string,
  description: string,
  program: Surface<M, E, C>,
  options: UtilOptions = {}
): Util<M, E, C> => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`A util name is lowercase kebab-case: ${name}`)

  return { name, description, surface: program, ...(options.open && { open: options.open }) }
}

/** `broken`: why the util could not restore the tab's kept model, which is then kept as it was saved, or could not make
 * one, when `model` is undefined. */
export type Tab = { n: number; util: string; model: unknown; broken?: string }
export type ShellModel = { tabs: Tab[]; next: number }
export type ShellEvent = { kind: "tab"; n: number; event: { kind: string } }
export type ShellCommand = { n: number; util: string; command: unknown }

const TAB = /^\/tabs\/(\d+)(\/.*)?$/

/** The tab a path stands in, and the path within it. */
export const within = (path: string): { n: number; path: string } | undefined => {
  const m = TAB.exec(path)

  return m ? { n: Number(m[1]), path: m[2] && m[2] !== "/" ? m[2].replace(/\/$/, "") : "/" } : undefined
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
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

      // A tab that would be broken from the start is not made: its surface's code is at fault, and the refusal says how.
      try {
        const tab: Tab = { n: model.next, util: name, model: u.surface.init() }

        u.surface.view(tab.model, "/")

        const commands = (u.surface.start?.(tab.model) ?? []).map((command: unknown) => ({ n: tab.n, util: name, command }))

        return { model: { tabs: [...model.tabs, tab], next: model.next + 1 }, commands }
      } catch (error) {
        return { refused: `no ${name} tab is opened: its surface fails as it opens (${message(error)}); fix the surface's code` }
      }
    },
  })
  const always = (name: string) => utils.get(name)?.open === "always"
  /** An always-open util's tab; broken, with no model, when the util cannot make one, and made again at the next restore. */
  const born = (n: number, u: AnyUtil): Tab => {
    try {
      return { n, util: u.name, model: u.surface.init() }
    } catch (error) {
      const broken = `tab ${n} is broken: its ${u.name} surface fails as it opens (${message(error)}); fix the surface's code`

      return { n, util: u.name, model: undefined, broken }
    }
  }
  /** The model with a tab for every always-open util that has none: at the start, and when saved state predates one. */
  const opened = (model: ShellModel): ShellModel =>
    options.utils
      .filter((u) => u.open === "always" && !model.tabs.some((t) => t.util === u.name))
      .reduce<ShellModel>((m, u) => ({ tabs: [...m.tabs, born(m.next, u)], next: m.next + 1 }), model)
  const close = action({
    name: "close",
    description: ({ n }) => `close tab ${n}; its state is dropped`,
    subject: { n: "number" },
    inputs: {},
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, tabs: model.tabs.filter((t) => t.n !== n) } }),
  })
  /** What to do about state the util cannot read: drop it with the tab, where it can be closed, or teach the code to read it. */
  const remedy = (tab: Tab, part: string) =>
    always(tab.util) ? `fix the surface's ${part} to read it` : `close the tab to drop it, or fix the surface's ${part} to read it`
  /** Why a tab is broken when its util cannot restore what it keeps: the fault is the kept state, or the restore. */
  const unrestored = (tab: Tab, error: unknown) =>
    `tab ${tab.n} is broken: its ${tab.util} surface cannot restore the state the tab keeps (${message(error)}); ` +
    `the state is likely from earlier code of the surface: ${remedy(tab, "restore")}`
  /**
   * Why a tab is broken when its util throws at / on the model it keeps, as far as can be told: one it shows a fresh
   * model on points at the kept state; one it fails on a fresh model too has its code at fault, which closing does not mend.
   */
  const unshown = (tab: Tab, error: unknown): string => {
    const u = utils.get(tab.util)!

    try {
      u.surface.view(u.surface.init(), "/")
    } catch {
      return (
        `tab ${tab.n} is broken: its ${tab.util} surface fails in its own code (${message(error)}), on a fresh state as on the one the tab keeps: ` +
        `fix the surface's code${always(tab.util) ? "" : "; closing the tab will not help"}`
      )
    }

    return (
      `tab ${tab.n} is broken: its ${tab.util} surface fails on the state the tab keeps (${message(error)}) but not on a fresh one; ` +
      `the state is likely from earlier code of the surface: ${remedy(tab, "code")}`
    )
  }
  /** The util's answer for a tab, or nothing when it throws or the tab is broken: what one util throws stays in its tab. */
  const attempt = <T>(tab: Tab, fn: (u: AnyUtil) => T): { ok: T } | undefined => {
    if (tab.broken !== undefined) return undefined
    try {
      return { ok: fn(utils.get(tab.util)!) }
    } catch {
      return undefined
    }
  }
  /**
   * The util's view of a tab at a path, or why it cannot be shown: the tab is broken when its util cannot show it at /;
   * a path below that it cannot show is only that path's fault.
   */
  const shown = (tab: Tab, path: string, actor?: string): { ok: View | undefined } | { broken: string } => {
    if (tab.broken !== undefined) return { broken: tab.broken }

    const u = utils.get(tab.util)!
    let home: View | undefined

    try {
      home = u.surface.view(tab.model, "/", actor)
    } catch (error) {
      return { broken: unshown(tab, error) }
    }
    if (path === "/") return { ok: home }
    try {
      return { ok: u.surface.view(tab.model, path, actor) }
    } catch (error) {
      const failed = `its ${tab.util} surface fails there (${message(error)})`

      return { broken: `/tabs/${tab.n}${path} cannot be shown: ${failed}, while tab ${tab.n} works at /: fix the surface's code for this path` }
    }
  }
  const root = view([open, close], {
    "/": (model) => ({
      title: options.title,
      utils: options.utils.map((u) => ({ name: u.name, description: u.description, ...(!always(u.name) && { open: open.bind({ util: u.name }) }) })),
      tabs: model.tabs.map((tab) => ({
        at: `/tabs/${tab.n}`,
        n: tab.n,
        util: tab.util,
        ...(!always(tab.util) && { close: close.bind({ n: tab.n }) }),
      })),
    }),
  })
  /** A tab as home lists it, for the actor: its util's title and facts at /, the paths whole; or why it is broken. */
  const said = (tab: Tab, actor?: string): { title?: string; facts?: Json; broken?: string } => {
    const seen = shown(tab, "/", actor)

    if ("broken" in seen) return { broken: seen.broken }

    const { title, ...rest } = seen.ok ?? {}

    return { ...(typeof title === "string" && { title }), facts: facts(whole(rest, `/tabs/${tab.n}`)) }
  }
  /** A call into a tab, or its refusal with why: where the util cannot show the call's path, or fails on the call itself. */
  const called = (tab: Tab, call: Call, model: ShellModel): Update<ShellModel, ShellCommand> => {
    const seen = shown(tab, call.path, call.actor)

    if ("broken" in seen) return { refused: seen.broken }
    try {
      return wrapped(tab, utils.get(tab.util)!.surface.update(tab.model, call), model)
    } catch (error) {
      return { refused: `tab ${tab.n} is unchanged: its ${tab.util} surface fails on ${call.handle} (${message(error)}); fix the surface's code` }
    }
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

      // A tab with no model holds nothing: its util could not make one, and is asked again.
      return opened({
        next: kept.next,
        tabs: kept.tabs
          .filter((t) => utils.has(t.util) && t.model !== undefined)
          .map((t): Tab => {
            const u = utils.get(t.util)!

            try {
              return { n: t.n, util: t.util, model: u.surface.restore ? u.surface.restore(t.model) : t.model }
            } catch (error) {
              return { n: t.n, util: t.util, model: t.model, broken: unrestored(t, error) }
            }
          }),
      })
    },
    start: (model) =>
      model.tabs.flatMap((tab) => {
        const started = attempt(tab, (u) => u.surface.start?.(tab.model) ?? [])

        return !started ? [] : started.ok.map((command: unknown) => ({ n: tab.n, util: tab.util, command }))
      }),
    working: (model) =>
      model.tabs.some((tab) => {
        const working = attempt(tab, (u) => u.surface.working?.(tab.model) ?? false)

        return !!working?.ok
      }),
    session: (c) => utils.get(c.util)?.surface.session?.(c.command) ?? false,
    update(model, message) {
      if (message.kind === "call") {
        const at = within(message.path)

        if (!at) return root.update(model, message)

        const tab = model.tabs.find((t) => t.n === at.n)

        if (!tab) return { refused: `no tab ${at.n}` }

        return called(tab, { ...message, path: at.path }, model)
      }

      const tab = model.tabs.find((t) => t.n === message.n)

      // An event for a closed tab arrives late and lands nowhere.
      if (!tab) return { model }

      const result = attempt(tab, (u) => u.surface.update(tab.model, message.event))

      // An event for a broken tab, or one its util fails on, lands nowhere, as for a closed one.
      return !result ? { model } : wrapped(tab, result.ok, model)
    },
    view(model, path, actor): View | undefined {
      const at = within(path)

      if (!at) {
        const home = root.view(model, path)

        if (!home || path !== "/") return home

        return { ...home, tabs: (home.tabs as View[]).map((row, i) => ({ ...row, ...said(model.tabs[i]!, actor) })) }
      }

      const tab = model.tabs.find((t) => t.n === at.n)

      if (!tab) return undefined

      const seen = shown(tab, at.path, actor)

      return "broken" in seen ? { at: `/tabs/${tab.n}${at.path === "/" ? "" : at.path}`, broken: seen.broken } : whole(seen.ok, `/tabs/${tab.n}`)
    },
    run: (c, send, signal) => utils.get(c.util)!.surface.run(c.command, (event: { kind: string }) => send({ kind: "tab", n: c.n, event }), signal),
    failed: (c, error) => ({ kind: "tab", n: c.n, event: utils.get(c.util)!.surface.failed(c.command, error) }),
  })
}
