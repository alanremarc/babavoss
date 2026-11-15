// What a tab's frame offers, worked out without a page: the actions a view offers the person, which of them are asks,
// what a prompt's fields make of their open inputs, and every menu entry as one command of the palette.
import type { Menu, MenuItem } from "../../kit/layouts/menu.tsx"
import { handles, type Args, type Handle, type Schema, type View } from "../../core/surface/view.ts"

/** An action offered at a path: the handle, and whether it is an ask, the person's alone. */
export type Offered = { path: string; handle: Handle; ask: boolean }
/** One command of the palette: from a menu, or an action the view offers. */
export type Command = { id: string; group: string; label: string; hint?: string; keys?: string; ask?: boolean; disabled?: boolean; run: () => void }

const key = (h: Handle) => `${h.name} ${JSON.stringify(h.args)}`

/**
 * The actions offered at `path`, once each, in the view's order. An ask is a handle the person is offered and the agent
 * is not: `agent` is the same view as the agent reads it; without it, nothing is known to be an ask.
 */
export function offered(path: string, person: View | undefined, agent?: View): Offered[] {
  const theirs = agent && new Set(handles(agent).map(key))
  const seen = new Set<string>()

  return handles(person).flatMap((handle) => {
    if (seen.has(key(handle))) return []
    seen.add(key(handle))

    return [{ path, handle, ask: !!theirs && !theirs.has(key(handle)) }]
  })
}

/** An action's name as a person reads it: `end_move` is "End move". */
export const named = (name: string): string => {
  const words = name.replace(/[_-]+/g, " ").trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Offered actions as entries of a menu or the palette: each by its name, or by its description where several share
 * one, the same handle bound to different subjects; with "…" where it asks for input first. Asks first.
 */
export function actionItems(actions: Offered[], run: (action: Offered) => void): { id: string; label: string; hint: string; ask: boolean; run: () => void }[] {
  const count = new Map<string, number>()

  for (const a of actions) count.set(a.handle.name, (count.get(a.handle.name) ?? 0) + 1)

  return [...actions.filter((a) => a.ask), ...actions.filter((a) => !a.ask)].map((a) => ({
    id: `${a.path} ${key(a.handle)}`,
    label: ((count.get(a.handle.name) ?? 0) > 1 ? a.handle.description : named(a.handle.name)) + (Object.keys(a.handle.open).length ? "…" : ""),
    hint: a.handle.description,
    ask: a.ask,
    run: () => run(a),
  }))
}

/** Menus given by several parts of a page, in order; menus of one id become one, their items joined by a separator. */
export function joined(given: Menu[][]): Menu[] {
  const menus: Menu[] = []

  for (const menu of given.flat()) {
    const same = menus.findIndex((m) => m.id === menu.id)

    if (same === -1) menus.push(menu)
    else menus[same] = { ...menus[same]!, items: [...menus[same]!.items, { kind: "separator", id: `${menu.id}-joined-${same}` }, ...menu.items] }
  }

  return menus
}

/** Every entry of the menus as a command, grouped by its menu and named by the path to it: a check toggles, a choice's option sets it. */
export function commandsOf(menus: Menu[]): Command[] {
  const walk = (group: string, trail: string[], items: MenuItem[], off: boolean): Command[] =>
    items.flatMap((item): Command[] => {
      const label = (text: string) => [...trail, text].join(" › ")
      const disabled = off || ("disabled" in item && item.disabled === true)

      switch (item.kind) {
        case "action":
          return [{ id: `${group}/${item.id}`, group, label: label(item.label), hint: item.hint, keys: item.keys, disabled, run: item.run }]
        case "check": {
          const verb = item.checked ? "Uncheck" : "Check"

          return [{ id: `${group}/${item.id}`, group, label: label(`${verb} ${item.label}`), keys: item.keys, disabled, run: () => item.set(!item.checked) }]
        }
        case "choice":
          return item.options
            .filter((o) => o.id !== item.value)
            .map((o) => ({ id: `${group}/${item.id}/${o.id}`, group, label: label(`${item.label}: ${o.label}`), disabled, run: () => item.set(o.id) }))
        case "submenu":
          return walk(group, [...trail, item.label], item.items, disabled)
        case "separator":
          return []
      }
    })

  return menus.flatMap((menu) => walk(menu.label, [], menu.items, menu.disabled === true))
}

/** What a prompt's fields hold, as the action's arguments: each open input of its type, or undefined while one is not. */
export function argsOf(open: Schema, fields: Record<string, string | boolean | undefined>): Args | undefined {
  const args: Args = {}

  for (const [name, type] of Object.entries(open)) {
    const value = fields[name]

    if (type === "boolean") args[name] = value === true
    else if (type === "number") {
      if (typeof value !== "string" || !value.trim() || !Number.isFinite(Number(value))) return undefined
      args[name] = Number(value)
    } else {
      if (typeof value !== "string") return undefined
      args[name] = value
    }
  }

  return args
}
