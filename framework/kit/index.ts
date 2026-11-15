// The kit: the components, layouts and design language a page is built with; the shell's page and every surface's own use it.
export { Workbench, type WorkbenchTool, type WorkbenchFilter, type WorkbenchDocument, type WorkbenchDocuments } from "./layouts/workbench.tsx"
export { Plain } from "./layouts/plain.tsx"
export { Welcome, type Scope, type Scopes } from "./layouts/welcome.tsx"
export type { Menu, MenuItem } from "./layouts/menu.tsx"
export {
  WorkbenchButton,
  WorkbenchToolbar,
  WorkbenchSpacer,
  WorkbenchSegments,
  WorkbenchProperties,
  WorkbenchCode,
  WorkbenchInfo,
  WorkbenchPicker,
  WorkbenchMark,
  WorkbenchMeter,
  WorkbenchNotice,
  WorkbenchPage,
  WorkbenchSection,
  WorkbenchFold,
  WorkbenchSetting,
  WorkbenchList,
  WorkbenchTree,
  WorkbenchEmpty,
  WorkbenchSplitter,
  Dismiss,
  useNarrow,
  type WorkbenchAction,
  type WorkbenchChoice,
  type WorkbenchIcon,
  type WorkbenchFacts,
  type WorkbenchOption,
  type WorkbenchRow,
  type WorkbenchGroup,
  type WorkbenchNode,
} from "./layouts/parts.tsx"
export { Button } from "./components/button"
export { Input } from "./components/input"
export { Textarea } from "./components/textarea"
export { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/alert"
export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./components/empty"
export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/dialog"
export { Sheet, SheetContent, SheetTitle } from "./components/sheet"
export { Popover, PopoverContent, PopoverTrigger } from "./components/popover"
export { Toasts, TOAST_MS, type ToastItem } from "./components/toast"
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/tooltip"
export { ToggleGroup, ToggleGroupItem } from "./components/toggle-group"
export { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/command"
export {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "./components/trace"
export { CodeBlock, CodeBlockActions, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle } from "./components/code-block"
export { Thread, ThreadEnd, ThreadEvent, ThreadItem, ThreadStep, ThreadSteps, useThreadDetail } from "./components/thread"
export { Composer, type ComposerCompletion } from "./components/composer"
export { Message, MessageContent, MessageFooter, MessageGroup, MessageHeader } from "./components/message"
export { Bubble, BubbleContent, BubbleGroup } from "./components/bubble"
export {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "./components/message-scroller"
export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from "./components/input-group"
