// The shell's page, and what a surface's component uses to reach its tab: its context, live views, and the door.
export { Shell, type Registry } from "./shell.tsx"
export { TabProvider, useTab, useLive, type TabContext } from "./tab.tsx"
export { read, call, changes, type Answer, type Change } from "./client.ts"
