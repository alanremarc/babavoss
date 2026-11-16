// What home offers, worked out without a page: home is to the shell what a tab is to its surface, so what it offers is
// what the shell has at /. Its menu is drawn as a tab's is, from the shell's own view at /: its actions, and the open
// tabs as its places, nothing written by hand. Its desktop is an icon a surface, with how many tabs of it are open and
// the strongest mark among them, a click going to its newest tab or opening one; a surface that does not load is shown,
// and cannot be opened.
import type { ReactNode } from "react"
import type { Handle, View } from "../../core/index.ts"
import type { MenuItem } from "../../kit/layouts/menu.tsx"
import { offered, tabMenu, type Offered } from "./commands.ts"
import { MARK, type Mark } from "./rail.ts"

/** A surface as / lists it: one that loads, with what it is for and how to open it; or one whose code does not load, with why. */
export type SurfaceEntry = { name: string; description?: string; open?: Handle; broken?: string }

/**
 * What a home is given to draw itself, the desktop or a project's own `.baba/home.tsx`: the project's title, and what the
 * shell says where there are no surfaces or no .baba/; its surfaces, each with a way to open a tab of it, none where it
 * does not load, saying why; the open tabs, newest first, each with its mark and a way to go there; and the foot that says
 * whose page this is.
 */
export type HomeProps = {
  title: string
  notice?: string
  surfaces: { name: string; label: string; description: string; icon?: ReactNode; broken?: string; open?: () => void }[]
  tabs: { at: string; surface: string; label: string; icon?: ReactNode; mark?: Mark; go: () => void }[]
  foot: ReactNode
}

/** A surface on the desktop: its open tabs, newest first, and the strongest mark among them. */
export type Icon<S, T> = { surface: S; tabs: T[]; mark?: Mark }

const STRONGEST = Object.keys(MARK) as Mark[]

/** The desktop's icons, the surfaces in the order given, each with its open tabs, newest first as given, and their strongest mark. */
export function iconsOf<S extends { name: string }, T extends { surface: string; mark?: Mark }>(surfaces: readonly S[], tabs: readonly T[]): Icon<S, T>[] {
  return surfaces.map((surface) => {
    const mine = tabs.filter((t) => t.surface === surface.name)
    const mark = STRONGEST.find((m) => mine.some((t) => t.mark === m))

    return { surface, tabs: mine, ...(mark && { mark }) }
  })
}

/** What an icon says under its name: Open, or how many tabs; nothing where none is open. */
export const openOf = (tabs: number): string | undefined => (tabs === 0 ? undefined : tabs === 1 ? "Open" : `${tabs} tabs`)

/** An open tab as home's menu lists it: where it is, what it is called, and its mark. */
export type TabChoice = { at: string; label: string; mark?: Mark }

/**
 * Home's menu, as a tab's is drawn: the shell's actions at /, in its view's order and grouping; then Go, the open tabs as
 * its places, each dotted where it waits on the person. It has no controls of its own: home is never closed or reloaded.
 */
export function homeMenu({
  view,
  title,
  tabs,
  start,
  navigate,
}: {
  view: View | undefined
  title: string
  tabs: readonly TabChoice[]
  start: (action: Offered) => void
  navigate: (at: string) => void
}): MenuItem[] {
  return tabMenu({
    surface: { label: title, actions: offered("/", view), menu: view?.menu },
    go: tabs.map((t) => ({ at: t.at, label: t.label })),
    dots: new Set(tabs.filter((t) => t.mark === "person").map((t) => t.at)),
    start,
    navigate,
    controls: [],
  })
}
