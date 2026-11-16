// The rail's order and keys, worked out without a page: the tabs newest first beside the mark, standing at the side of the
// page the person chose; the order they stand in on screen, which the arrows and the next and previous tab follow; where
// the person lands when the tab they look at closes; the side a drawer opens at and the way a bubble points, away from
// the rail; and a tab's one mark, and why, as its tooltip says it. Pure: rail.tsx draws it.
import type { Rail } from "../settings/src/settings.ts"
import type { Unheard } from "./client.ts"

/** Who a tab needs, and why. */
export type TabNeed = { who: "person" | "agent"; why: string }

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

/** The mark on a tab's icon, the strongest first: broken; the one dot of what waits on the person; needing the agent. */
export const MARK = {
  broken: "size-2 bg-destructive",
  person: "size-1.5 bg-primary",
  agent: "size-1.5 bg-muted-foreground/70",
}
export type Mark = keyof typeof MARK

/**
 * A tab's mark: broken; waiting on the person, where they are needed, an ask or a notice they have not seen waits in it,
 * or it is a tab the agent opened that they have not looked at; needing the agent; or none.
 */
export const markOf = ({ needs = [], broken, unseen, waits }: { needs?: TabNeed[]; broken?: string; unseen?: boolean; waits?: boolean }): Mark | undefined =>
  broken !== undefined ? "broken" : waits || unseen || needs.some((n) => n.who === "person") ? "person" : needs.length ? "agent" : undefined

/** The mark's own dot, home's: the person's, while the session's hooks are not heard; the mark's look is its own. */
export const homeMarkOf = (unheard: Unheard | undefined): Mark | undefined => (unheard ? "person" : undefined)

/**
 * Why a tab is marked, one line each, as its tooltip says it under its title: broken; who it needs and why; what waits on
 * the person in it, asks and notices they have not seen; and that the agent opened it while they have not looked at it.
 */
export const standing = ({ needs = [], broken, asks = 0, notices = 0, unseen }: { needs?: TabNeed[]; broken?: string; asks?: number; notices?: number; unseen?: boolean }): string[] => [
  ...(broken !== undefined ? ["Broken"] : []),
  ...needs.filter((n) => n.who === "person").map((n) => `Needs you: ${n.why}`),
  ...(asks > 0 && !needs.some((n) => n.who === "person") ? [`${asks === 1 ? "Something waits" : `${asks} things wait`} for you`] : []),
  ...(notices > 0 ? [`${notices} new ${notices === 1 ? "notice" : "notices"}`] : []),
  ...(unseen ? ["Opened by the agent"] : []),
  ...needs.filter((n) => n.who === "agent").map((n) => `Needs the agent: ${n.why}`),
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
