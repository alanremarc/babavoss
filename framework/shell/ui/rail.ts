// The rail's order and keys, worked out without a page: the tabs newest first beside the mark, standing at the side of the
// page the person chose; the order they stand in on screen, which the arrows and the next and previous tab follow; where
// the person lands when the tab they look at closes; the side a drawer opens at and the way a bubble points, away from
// the rail; and a tab's one mark, and why, as its tooltip says it. Pure: rail.tsx draws it.
import type { Rail } from "../settings/src/settings.ts"

/** The tabs newest first, by their number, which grows with each one opened. */
export function newestFirst<T extends { n: number }>(tabs: readonly T[]): T[] {
  return [...tabs].sort((a, b) => b.n - a.n)
}

/** Where the person lands when the tab at `at` closes: the next older tab, else the next newer, else nowhere. */
export function successor<T extends { at: string }>(newest: readonly T[], at: string): string | undefined {
  const i = newest.findIndex((tab) => tab.at === at)

  if (i < 0) return undefined

  return (newest[i + 1] ?? newest[i - 1])?.at
}

/** Where the next or previous entry is from `active`, along `order`: one step, round from either end. */
export function cycled(order: readonly string[], active: string, step: 1 | -1): string | undefined {
  const i = order.indexOf(active)

  if (!order.length) return undefined

  return order[(((i < 0 ? 0 : i + step) % order.length) + order.length) % order.length]
}

/** Whether the rail stands at a side, a column of icons, rather than along the top or bottom, a row of pills. */
export const upright = (rail: Rail): boolean => rail.side === "left" || rail.side === "right"

/**
 * The rail's entries as they stand on screen, top to bottom or left to right: the mark, then the tabs newest first, so the
 * newest is beside it; on a column that starts from the bottom, the other way, the mark last. A row always starts from the
 * left.
 */
export function onScreen<T>(mark: T, newest: readonly T[], rail: Rail): T[] {
  return upright(rail) && rail.from === "bottom" ? [...newest].reverse().concat([mark]) : [mark, ...newest]
}

/**
 * What a key does on the rail: the arrows along it step one way or the other, in its direction, and Home and End go to
 * either end; the arrows across it do nothing.
 */
export function stepOf(key: string, rail: Rail): 1 | -1 | "first" | "last" | undefined {
  if (key === "Home") return "first"
  if (key === "End") return "last"

  const [back, on] = upright(rail) ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]

  return key === on ? 1 : key === back ? -1 : undefined
}

/** The side a drawer opens at: the rail's own, or for a rail along the top or bottom, the one the person chose. */
export const drawerSide = (rail: Rail): "left" | "right" => (upright(rail) ? (rail.side as "left" | "right") : rail.drawer)

/** The way a bubble beside a tab points: away from the rail, into the page. */
export const awayOf = (rail: Rail): "right" | "left" | "down" | "up" =>
  ({ left: "right", right: "left", top: "down", bottom: "up" } as const)[rail.side]

/** The mark on a tab's icon, the strongest first: broken; a highlight the person has not opened. */
export const MARK = {
  broken: "size-2 bg-destructive",
  highlight: "size-1.5 bg-primary",
}
export type Mark = keyof typeof MARK

/** A tab's mark, home's too: broken, or holding a highlight the person has not opened, or none. */
export const markOf = ({ broken, highlights = [] }: { broken?: string; highlights?: readonly string[] }): Mark | undefined =>
  broken !== undefined ? "broken" : highlights.length ? "highlight" : undefined

/** Why a tab is marked, one line each, as its tooltip says it under its title: broken; and each highlight in it not opened, newest first. */
export const standing = ({ broken, highlights = [] }: { broken?: string; highlights?: readonly string[] }): string[] => [
  ...(broken !== undefined ? ["Broken"] : []),
  ...highlights,
]

/** What opens a tab's drawer from the keyboard, on the tab: the context-menu key, or Shift+F10. */
export const opensDrawer = (e: { key: string; shiftKey: boolean }): boolean => e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)

/** What the person does to an entry of the rail: a click on it, or on its icon on a row; a right click or the context-menu key; the drawer's shortcut; a middle click. */
export type Gesture = "click" | "icon" | "menu" | "shortcut" | "middle"
/** What a gesture does: show the tab, open or close its drawer, or close the tab. */
export type Does = "show" | "open" | "close" | "end"

/**
 * What a gesture on an entry does, given whether it is shown and whether its drawer is open: a click shows it, and on the
 * entry shown opens its drawer; a click on a row's icon, a right click, the context-menu key and the shortcut show it and
 * open its drawer at once; each closes the drawer it would open; a middle click closes the tab.
 */
export function doesOf(gesture: Gesture, { shown, open }: { shown: boolean; open: boolean }): Does[] {
  if (gesture === "middle") return ["end"]
  if (open) return ["close"]
  if (gesture === "click") return shown ? ["open"] : ["show"]

  return shown ? ["open"] : ["show", "open"]
}
