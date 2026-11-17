// The kit: shadcn's primitives with one layer of opinions, the parts of a content and the design language a page is built
// with; the shell's page and every surface's own use it.
export type { MenuItem } from "./layouts/menu.tsx"
export { WorkbenchToolbar, WorkbenchSpacer, WorkbenchSegments, WorkbenchPage, WorkbenchEmpty, useNarrow } from "./layouts/parts.tsx"
export { Button } from "./components/button"
export { Input } from "./components/input"
export { Textarea } from "./components/textarea"
export { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/alert"
export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./components/empty"
export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/dialog"
export { Popover, PopoverContent, PopoverTrigger } from "./components/popover"
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/tooltip"
export { ToggleGroup, ToggleGroupItem } from "./components/toggle-group"
export { Badge, badgeVariants } from "./components/badge"
export { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/resizable"
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/dropdown-menu"
export { ThemePicker } from "./components/theme-picker"
export { derive, PRESETS, presetOf, varsOf, type Theme, type PresetId } from "./theme.ts"
