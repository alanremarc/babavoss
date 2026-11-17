// The shell's page, the default export: the whole page, not a component in a tab as a surface's is, holding each
// surface's component in its tabs, and the project's own home where it draws one, given what HomeProps names. And what a surface's page uses to reach its tab: its context, live views, and the door;
// the shell's services, used by convention: a passing word beside the tab, another tab or place, the appearance; the conventions, how the
// person wants pages to be, which a page follows by its own code; and the shape of a drawer, what a page exports as `drawers` to ask an
// action's inputs in its own way.
export { Shell as default, type Registry } from "./shell.tsx"
export type { HomeProps } from "./home.ts"
export { TabProvider, useTab, useLive, useShell, useConventions, type TabContext, type ShellServices } from "./tab.tsx"
export type { Conventions } from "../src/conventions.ts"
export { read, call, changes, type Answer, type Change, type Notice } from "./client.ts"
export type { DrawerProps, Drawers } from "./inputs.tsx"
