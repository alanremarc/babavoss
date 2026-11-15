// The primitives' specimens: every component of the kit, in its variants and states, live, with sample content. What
// opens over the page, a dialog, a sheet, a menu, opens from a button here, as it would in a page.
import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { BellIcon, BoldIcon, BotIcon, CircleAlertIcon, CopyIcon, FileTextIcon, InboxIcon, ItalicIcon, PlusIcon, RotateCcwIcon, SearchIcon, TerminalIcon, UnderlineIcon, WrenchIcon } from "lucide-react"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Badge,
  Bubble,
  BubbleContent,
  BubbleGroup,
  Button,
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Composer,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Marker,
  MarkerContent,
  MarkerIcon,
  Message,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Sheet,
  SheetContent,
  SheetTitle,
  Textarea,
  Thread,
  ThreadEnd,
  ThreadEvent,
  ThreadItem,
  ThreadStep,
  ThreadSteps,
  Toasts,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ThemePicker,
  presetOf,
  varsOf,
  type Theme,
  type ToastItem,
} from "babavoss/kit/index.ts"
import { Toggle } from "babavoss/kit/components/toggle.tsx"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "babavoss/kit/components/collapsible.tsx"
import { CodeBlockFooter, CodeBlockLine } from "babavoss/kit/components/code-block.tsx"
import { CommandSeparator, CommandShortcut } from "babavoss/kit/components/command.tsx"
import { MessageAvatar } from "babavoss/kit/components/message.tsx"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const

function Buttons() {
  return (
    <div className="flex flex-col gap-3">
      <States min={110}>
        {VARIANTS.map((v) => (
          <State key={v} label={v}>
            <Button variant={v}>Approve</Button>
          </State>
        ))}
      </States>
      <States min={200}>
        <State label="sizes: xs, sm, default, lg">
          {(["xs", "sm", "default", "lg"] as const).map((s) => (
            <Button key={s} size={s} variant="outline">
              {s}
            </Button>
          ))}
        </State>
        <State label="icon: icon-xs, icon-sm, icon, icon-lg">
          {(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map((s) => (
            <Button key={s} size={s} variant="ghost" aria-label={s}>
              <CopyIcon />
            </Button>
          ))}
        </State>
        <State label="with an icon">
          <Button>
            <PlusIcon data-icon="inline-start" /> Add issue
          </Button>
        </State>
        <State label="disabled">
          <Button disabled>Approve</Button>
          <Button disabled variant="outline">
            Decline
          </Button>
        </State>
      </States>
    </div>
  )
}

function Toggles() {
  const [on, setOn] = useState(true)
  const [marks, setMarks] = useState(["bold"])
  const [lens, setLens] = useState("list")

  return (
    <States min={150}>
      <State label="off">
        <Toggle aria-label="Bold">
          <BoldIcon />
        </Toggle>
      </State>
      <State label="on">
        <Toggle aria-label="Bold" pressed={on} onPressedChange={setOn}>
          <BoldIcon />
        </Toggle>
      </State>
      <State label="outline, sm">
        <Toggle variant="outline" size="sm" defaultPressed>
          Wrap
        </Toggle>
        <Toggle variant="outline" size="sm">
          Wrap
        </Toggle>
      </State>
      <State label="group, several">
        <ToggleGroup type="multiple" value={marks} onValueChange={setMarks}>
          <ToggleGroupItem value="bold" aria-label="Bold">
            <BoldIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <ItalicIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <UnderlineIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </State>
      <State label="group, one, outline, joined">
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={lens} onValueChange={(v) => v && setLens(v)}>
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="map">Map</ToggleGroupItem>
          <ToggleGroupItem value="archive">Archive</ToggleGroupItem>
        </ToggleGroup>
      </State>
      <State label="disabled">
        <Toggle disabled aria-label="Bold">
          <BoldIcon />
        </Toggle>
      </State>
    </States>
  )
}

function Inputs() {
  return (
    <States min={190}>
      <State label="empty">
        <Input placeholder="A short imperative title" />
      </State>
      <State label="filled">
        <Input defaultValue="Show the present" />
      </State>
      <State label="invalid">
        <Input aria-invalid defaultValue="31, 99" />
      </State>
      <State label="disabled">
        <Input disabled defaultValue="main" />
      </State>
      <State label="textarea" wide>
        <Textarea rows={3} placeholder="What changes and why" defaultValue={"The strip shows whose move it is.\nThe mark moves while the agent works."} />
      </State>
    </States>
  )
}

function InputGroups() {
  return (
    <States min={240}>
      <State label="addon start">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search issues" />
        </InputGroup>
      </State>
      <State label="addon end, text">
        <InputGroup>
          <InputGroupInput defaultValue="0.5" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>USD</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </State>
      <State label="button">
        <InputGroup>
          <InputGroupInput defaultValue="bun run baba start" className="font-mono" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Copy">
              <CopyIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </State>
      <State label="textarea, block addon">
        <InputGroup>
          <InputGroupTextarea rows={2} placeholder="Write to the agent" />
          <InputGroupAddon align="block-end">
            <InputGroupText>⌘↵ to send</InputGroupText>
            <InputGroupButton variant="default" className="ml-auto">
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </State>
    </States>
  )
}

function Commands() {
  return (
    <States min={300}>
      <State label="search, groups, shortcut, disabled" className="p-0">
        <Command className="w-full">
          <CommandInput placeholder="Run, open or switch to…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Tabs">
              <CommandItem>
                <InboxIcon /> Queue
                <CommandShortcut>⌘1</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <TerminalIcon /> Lab
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Surfaces">
              <CommandItem>
                <FileTextIcon /> Design
              </CommandItem>
              <CommandItem disabled>
                <CircleAlertIcon /> Broken surface
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </State>
      <State label="empty" className="p-0">
        <Command className="w-full">
          <CommandInput placeholder="Run, open or switch to…" value="zzz" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandItem>Queue</CommandItem>
          </CommandList>
        </Command>
      </State>
    </States>
  )
}

function Badges() {
  return (
    <States min={110}>
      {VARIANTS.map((v) => (
        <State key={v} label={v}>
          <Badge variant={v}>3 drafts</Badge>
          <Badge variant={v}>
            <BellIcon data-icon="inline-start" /> new
          </Badge>
        </State>
      ))}
    </States>
  )
}

function Markers() {
  return (
    <States min={220}>
      <State label="default">
        <Marker>
          <MarkerContent>Resumed at 14:02</MarkerContent>
        </Marker>
      </State>
      <State label="icon, link">
        <Marker>
          <MarkerIcon>
            <WrenchIcon />
          </MarkerIcon>
          <MarkerContent>
            Ran 3 tools · <a href="#marker">open the log</a>
          </MarkerContent>
        </Marker>
      </State>
      <State label="separator">
        <Marker variant="separator">
          <MarkerContent>Today</MarkerContent>
        </Marker>
      </State>
      <State label="border">
        <Marker variant="border">
          <MarkerContent>2 turns · 41s · $0.08</MarkerContent>
        </Marker>
      </State>
    </States>
  )
}

function Alerts() {
  return (
    <States min={260}>
      <State label="default" className="block">
        <Alert>
          <BellIcon />
          <AlertTitle>A later babavoss is out</AlertTitle>
          <AlertDescription>The agent is told how to take it.</AlertDescription>
        </Alert>
      </State>
      <State label="destructive" className="block">
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Refused</AlertTitle>
          <AlertDescription>Lane 1 is delivering issue 4</AlertDescription>
        </Alert>
      </State>
      <State label="action" className="block">
        <Alert>
          <AlertTitle>The agent points to Queue</AlertTitle>
          <AlertAction>
            <Button size="sm">Go there</Button>
          </AlertAction>
        </Alert>
      </State>
    </States>
  )
}

function Empties() {
  return (
    <States min={220}>
      <State label="text" className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No issues</EmptyTitle>
            <EmptyDescription>Tell the agent what to do next.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </State>
      <State label="icon" className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing new</EmptyTitle>
            <EmptyDescription>Notices land here as they come.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </State>
      <State label="content" className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No runs</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm">Start a run</Button>
          </EmptyContent>
        </Empty>
      </State>
    </States>
  )
}

const TOASTS: ToastItem[] = [
  { id: 1, text: "Issue 4, Show the present, is done", title: "Queue", mark: <BotIcon /> },
  { id: 2, text: "Draft 7 waits for your approval", title: "Queue", meta: "now", mark: <BotIcon />, onSelect: () => {} },
  { id: 3, text: "The run ended", title: "Lab", mark: <TerminalIcon /> },
]

/** What passes on its own, held here: each toast goes after a while, or when dismissed, and comes back with Again. */
export function useHeld<T extends { id: number }>(all: T[]) {
  const [shown, setShown] = useState(all)

  return { shown, dismiss: (id: number) => setShown((s) => s.filter((t) => t.id !== id)), again: () => setShown(all.map((t) => ({ ...t, id: t.id + Date.now() }))) }
}

/** The way to bring back what passed. */
export const Again = ({ onClick, children = "Again" }: { onClick: () => void; children?: ReactNode }) => (
  <Button variant="ghost" size="xs" onClick={onClick}>
    <RotateCcwIcon data-icon="inline-start" /> {children}
  </Button>
)

function ToastSpecimen() {
  const { shown, dismiss, again } = useHeld(TOASTS)

  return (
    <States min={320}>
      <State label="line · from · meta · action; hover holds, × dismisses" wide className="flex-col items-stretch">
        <Toasts toasts={shown} dismiss={dismiss} className="static w-full max-w-md" from="top" />
        <div>
          <Again onClick={again} />
        </div>
      </State>
    </States>
  )
}

function Tooltips() {
  return (
    <TooltipProvider>
      <States min={160}>
        {(["top", "right", "bottom"] as const).map((side) => (
          <State key={side} label={`hover · ${side}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  Copy link
                </Button>
              </TooltipTrigger>
              <TooltipContent side={side}>http://localhost:3000/queue</TooltipContent>
            </Tooltip>
          </State>
        ))}
      </States>
    </TooltipProvider>
  )
}

function Popovers() {
  return (
    <States min={160}>
      <State label="open on click">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              Details
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <p className="font-medium">Issue 4</p>
            <p className="text-muted-foreground">In lane 2 since 14:02, its specs pass.</p>
          </PopoverContent>
        </Popover>
      </State>
    </States>
  )
}

function Dropdowns() {
  const [wrap, setWrap] = useState(true)
  const [compare, setCompare] = useState("diff")

  return (
    <States min={160}>
      <State label="items, check, radio, submenu, shortcut, destructive">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Text</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                Copy <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
                Wrap lines
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Compare</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={compare} onValueChange={setCompare}>
              <DropdownMenuRadioItem value="diff">Line diff</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="side">Side by side</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Markdown</DropdownMenuItem>
                <DropdownMenuItem>JSON</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem disabled>Pin</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Drop</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </State>
    </States>
  )
}

function Dialogs() {
  const [open, setOpen] = useState(false)

  return (
    <States min={160}>
      <State label="open on click">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Add issue…
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add</DialogTitle>
              <DialogDescription>Add an issue the person asked for to the bottom of the backlog.</DialogDescription>
            </DialogHeader>
            <Input autoFocus placeholder="A short imperative title" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setOpen(false)}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </State>
    </States>
  )
}

function Sheets() {
  const [open, setOpen] = useState(false)

  return (
    <States min={160}>
      <State label="open on click, under the strip">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Open sheet
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent top="top-11" aria-label="Sheet">
            <div className="flex h-9 shrink-0 items-center px-3">
              <SheetTitle className="text-body font-medium">Sheet</SheetTitle>
            </div>
            <p className="px-3 text-muted-foreground">A panel from the right edge over the page, which stays live around it. Escape or a press outside closes it.</p>
          </SheetContent>
        </Sheet>
      </State>
    </States>
  )
}

function Collapsibles() {
  return (
    <States min={220}>
      {[false, true].map((open) => (
        <State key={String(open)} label={open ? "open" : "closed"} className="block">
          <Collapsible defaultOpen={open}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                Iteration 2 · Rewrite the strip
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pt-1 text-muted-foreground">Why: the dots stood apart from the icon.</CollapsibleContent>
          </Collapsible>
        </State>
      ))}
    </States>
  )
}

function Resizables() {
  return (
    <States min={300}>
      <State label="horizontal, drag the line" className="h-32 p-0">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="40%">
            <div className="p-3 text-muted-foreground">Issues</div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel>
            <div className="p-3 text-muted-foreground">Issue 4</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </State>
      <State label="vertical, with a handle" className="h-32 p-0">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize="50%">
            <div className="p-3 text-muted-foreground">Timeline</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel>
            <div className="p-3 text-muted-foreground">Output</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </State>
    </States>
  )
}

const SOURCE = `import { surface } from "babavoss/core/index.ts"

export default surface({
  description: "Keep a greeting. Use when it is to change.",
  init: () => ({ greeting: "hello" }),
})
`

function CodeBlocks() {
  return (
    <States min={320}>
      <State label="header, copy" className="block">
        <CodeBlock>
          <CodeBlockHeader>
            <CodeBlockTitle>src/surface.ts</CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton value={SOURCE} />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent>{SOURCE}</CodeBlockContent>
        </CodeBlock>
      </State>
      <State label="numbered" className="block">
        <CodeBlock>
          <CodeBlockContent lineNumbers startLine={12}>
            {SOURCE}
          </CodeBlockContent>
        </CodeBlock>
      </State>
      <State label="diff: added, removed, highlighted" className="block">
        <CodeBlock>
          <CodeBlockContent lineNumbers>
            <CodeBlockLine>{"export default surface({"}</CodeBlockLine>
            <CodeBlockLine variant="removed">{'  description: "Keep a greeting.",'}</CodeBlockLine>
            <CodeBlockLine variant="added">{'  description: "Keep a greeting. Use when it is to change.",'}</CodeBlockLine>
            <CodeBlockLine variant="highlighted">{'  init: () => ({ greeting: "hello" }),'}</CodeBlockLine>
            <CodeBlockLine>{"})"}</CodeBlockLine>
          </CodeBlockContent>
        </CodeBlock>
      </State>
      <State label="wrap, sm, footer" className="block">
        <CodeBlock size="sm">
          <CodeBlockContent wrap>
            {"$ bun ../bin/baba.ts start — the page is at http://localhost:3000, open it in the harness's browser where it has one"}
          </CodeBlockContent>
          <CodeBlockFooter className="text-meta">exit 0 · 120ms</CodeBlockFooter>
        </CodeBlock>
      </State>
      <State label="destructive" className="block">
        <CodeBlock size="sm" variant="destructive">
          <CodeBlockContent>{"error: Unexpected end of file\n    at ui/main.tsx:189:24"}</CodeBlockContent>
        </CodeBlock>
      </State>
    </States>
  )
}

function Messages() {
  return (
    <States min={300}>
      <State label="the agent, header, footer" className="block">
        <Message>
          <MessageAvatar>
            <BotIcon />
          </MessageAvatar>
          <MessageContent>
            <MessageHeader>Agent</MessageHeader>
            <p>I started issue 4 in lane 2. Its specs pass; I am merging it.</p>
            <MessageFooter>14:02</MessageFooter>
          </MessageContent>
        </Message>
      </State>
      <State label="the person, tinted bubble, end" className="block">
        <Message align="end">
          <MessageContent>
            <MessageHeader className="justify-end px-0">You</MessageHeader>
            <Bubble variant="tinted" align="end">
              <BubbleContent>Show me the strip with a broken tab.</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </State>
      <State label="bubbles: default, secondary, muted, tinted, outline, ghost, destructive" wide className="block">
        <BubbleGroup>
          {(["default", "secondary", "muted", "tinted", "outline", "ghost", "destructive"] as const).map((v) => (
            <Bubble key={v} variant={v}>
              <BubbleContent>{v}</BubbleContent>
            </Bubble>
          ))}
        </BubbleGroup>
      </State>
      <State label="group" wide className="block">
        <MessageGroup>
          <Message>
            <MessageContent>
              <Bubble variant="muted">
                <BubbleContent>Which lane is free?</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
          <Message>
            <MessageContent>
              <Bubble variant="muted">
                <BubbleContent>Lanes 3, 4 and 5.</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        </MessageGroup>
      </State>
    </States>
  )
}

function Threads() {
  return (
    <States min={320}>
      <State label="message, step, steps running, error, end, event" wide className="flex h-96 flex-col items-stretch p-0">
        <Thread>
          <ThreadItem id="a" end>
            <Message align="end">
              <MessageContent>
                <Bubble variant="tinted" align="end">
                  <BubbleContent>Add a design guide.</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </ThreadItem>
          <ThreadItem id="b">
            <ThreadStep icon={<FileTextIcon />} title="Read" description="docs/DESIGN.md" aside="126 lines">
              <p>The canonical design, cut down to what holds.</p>
            </ThreadStep>
          </ThreadItem>
          <ThreadItem id="c">
            <ThreadSteps icon={<WrenchIcon />} summary="Ran 3 tools" description="bun check, bun test" aside="12s" initial>
              <ThreadStep icon={<TerminalIcon />} title="bun check" aside="1s" />
              <ThreadStep icon={<TerminalIcon />} title="bun test" status="error" description="1 fail" aside="9s" />
              <ThreadStep icon={<TerminalIcon />} title="bun test" status="running" description="again" />
            </ThreadSteps>
          </ThreadItem>
          <ThreadItem id="d">
            <Message>
              <MessageContent>
                <p>The guide is up, with every primitive in it.</p>
              </MessageContent>
            </Message>
            <ThreadEnd title="2 turns, 41 seconds, 8 cents">41s · $0.08</ThreadEnd>
          </ThreadItem>
          <ThreadItem id="e">
            <ThreadEvent icon={<RotateCcwIcon />}>Resumed with another model</ThreadEvent>
          </ThreadItem>
        </Thread>
      </State>
    </States>
  )
}

const COMPLETIONS = [
  { id: "a", label: "queue", description: "The session's work as issues", insert: "/queue" },
  { id: "b", label: "guide", description: "The design guide", insert: "/guide" },
  { id: "c", label: "lab", description: "An agent that uses what was built", insert: "/lab" },
]

function Composers() {
  const send = async (text: string) => (text.startsWith("!") ? "A message may not start with !" : undefined)

  return (
    <States min={320}>
      <State label="empty, sends on Enter; ! is refused" className="block">
        <Composer placeholder="Write to the agent" send={send} footer="sonnet · high" />
      </State>
      <State label="completions: type /" className="block">
        <Composer placeholder="Type / to call a surface" send={send} completions={COMPLETIONS} stop={() => {}} />
      </State>
      <State label="closed" className="block">
        <Composer closed="The run has ended" footer="sonnet" />
      </State>
      <State label="reopen" className="block">
        <Composer closed="The session stopped" reopen={{ label: "Resume", run: () => {} }} />
      </State>
    </States>
  )
}

/** The picker over a box of its own theme, which the box takes as it is dragged; what is let go is said under it. */
function ThemePickers() {
  const [theme, setTheme] = useState<Theme>(presetOf("clay"))
  const [kept, setKept] = useState<Theme>(presetOf("clay"))
  const preview = (mode: "light" | "dark") => (
    <div data-theme="dynamic" className={`${mode} flex flex-1 items-center gap-2 rounded-md border bg-background p-2 text-foreground`} style={varsOf(theme) as CSSProperties}>
      <span className="size-3 rounded-full bg-primary" />
      <span className="text-meta">{mode}</span>
      <span className="ml-auto rounded bg-muted px-1.5 text-meta text-muted-foreground">muted</span>
    </div>
  )

  return (
    <States min={280}>
      <State label={`live: kept hue ${kept.hue}, tint ${kept.tint}, vivid ${kept.vivid}`} className="flex-col items-stretch">
        <ThemePicker value={kept} onChange={setTheme} onCommit={(t) => (setTheme(t), setKept(t))} />
      </State>
      <State label="light and dark, as it is dragged" className="flex-col items-stretch">
        <div className="flex gap-2">
          {preview("light")}
          {preview("dark")}
        </div>
      </State>
      <State label="disabled" className="flex-col items-stretch">
        <ThemePicker value={presetOf("ocean")} disabled />
      </State>
    </States>
  )
}

export const primitives: Record<EntryOf<"primitives">, ComponentType> = {
  button: Buttons,
  toggle: Toggles,
  input: Inputs,
  "input-group": InputGroups,
  command: Commands,
  "theme-picker": ThemePickers,
  badge: Badges,
  marker: Markers,
  alert: Alerts,
  empty: Empties,
  toast: ToastSpecimen,
  tooltip: Tooltips,
  popover: Popovers,
  "dropdown-menu": Dropdowns,
  dialog: Dialogs,
  sheet: Sheets,
  collapsible: Collapsibles,
  resizable: Resizables,
  "code-block": CodeBlocks,
  message: Messages,
  thread: Threads,
  composer: Composers,
}
