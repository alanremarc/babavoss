// The shell's page, the default export: the whole page, not a component in a tab as a surface's is, holding each
// surface's component in its tabs. And what a surface's component uses to reach its tab: its context, live views, and the door.
export { Shell as default, type Registry } from "./shell.tsx"
export { TabProvider, useTab, useLive, type TabContext } from "./tab.tsx"
export { read, call, changes, type Answer, type Change } from "./client.ts"
