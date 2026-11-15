// The shell's page, the default export: the whole page, not a component in a tab as a surface's is, holding each
// surface's component in its tabs. And what a surface's page uses to reach its tab: its context, live views, and the door;
// and the shape of a drawer, what a page exports as `drawers` to ask an action's inputs in its own way.
export { Shell as default, type Registry } from "./shell.tsx"
export { TabProvider, useTab, useLive, type TabContext } from "./tab.tsx"
export { read, call, changes, type Answer, type Change, type Notice } from "./client.ts"
export type { DrawerProps, Drawers } from "./inputs.tsx"
