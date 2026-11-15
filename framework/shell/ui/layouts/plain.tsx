// The plain layout: the menu bar every layout has, then the content, which scrolls itself. For a util that is one page,
// a configuration, a list with what it opens inline. With scopes, the welcome page stands in for the content until one
// is open. Nothing is kept in the browser: there is nothing to arrange.
import type { ReactNode } from "react"
import { MenuBar, type Menu, type MenuItem } from "./menu.tsx"
import { scopeMenu, Welcome, type Scopes } from "./welcome.tsx"

export function Plain({
  label,
  menus = [],
  viewMenu = [],
  scopes,
  children,
}: {
  /** The util's name: the menu bar's, where there are no scopes. */
  label: string
  /** The util's menus, after the scope's and before View. */
  menus?: Menu[]
  /** The util's entries of the View menu, such as a lens; without any, there is no View menu. */
  viewMenu?: MenuItem[]
  scopes?: Scopes
  children: ReactNode
}) {
  const view: Menu[] = viewMenu.length ? [{ id: "view", label: "View", items: viewMenu }] : []

  return (
    <div className="flex min-h-0 flex-1 flex-col text-body">
      <MenuBar label={scopes ? scopes.title : label} menus={[...(scopes ? [scopeMenu(scopes)] : []), ...menus, ...view]} />
      {scopes && scopes.current === undefined ? <Welcome scopes={scopes} /> : <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
    </div>
  )
}
