// The primitives' specimens: every component of the kit, in its variants and states, live, with sample content, and the
// parts of a content the kit has an opinion on. What opens over the page, a dialog, a menu, opens from a button here, as
// it would in a page.
import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { BellIcon, BoldIcon, CircleAlertIcon, CopyIcon, InboxIcon, ItalicIcon, PlusIcon, RotateCcwIcon, UnderlineIcon } from "lucide-react"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Textarea,
  ThemePicker,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WorkbenchEmpty,
  WorkbenchPage,
  WorkbenchSegments,
  WorkbenchSpacer,
  WorkbenchToolbar,
  presetOf,
  useNarrow,
  varsOf,
  type Theme,
  Toggle,
} from "babavoss/kit/index.ts"
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

/** What passes on its own, held here: each goes when dismissed, and comes back with Again; the shell's bubbles are. */
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

/** A content's toolbar as the queue's narratives draw it: a title, a spacer, segments at the far end. */
function Toolbars() {
  const [lens, setLens] = useState<"story" | "issues">("story")

  return (
    <States min={300}>
      <State label="toolbar · spacer · segments" wide bare className="rounded-lg border">
        <WorkbenchToolbar label="Narrative">
          <span className="px-1 font-medium">Show the present</span>
          <WorkbenchSpacer />
          <div className="w-40">
            <WorkbenchSegments
              label="Lens"
              options={[
                { id: "story", label: "Story" },
                { id: "issues", label: "Issues" },
              ]}
              value={lens}
              set={setLens}
            />
          </div>
        </WorkbenchToolbar>
      </State>
    </States>
  )
}

/** A document's page, its title, aside and meta over its blocks; the empty line where there is nothing; and narrowness, measured. */
function Pages() {
  const [measure, narrow] = useNarrow(420)

  return (
    <States min={300}>
      <State label="page: title, aside, meta" bare className="flex h-48 flex-col rounded-lg border">
        <WorkbenchPage title="Narratives" aside={3} meta="12 issues, 4 open">
          <p className="text-muted-foreground">The blocks of the page, in one measured column.</p>
        </WorkbenchPage>
      </State>
      <State label="empty" bare className="flex h-48 flex-col rounded-lg border">
        <WorkbenchEmpty>No narratives yet. The agent starts one when work goes its own way.</WorkbenchEmpty>
      </State>
      <State label={`useNarrow(420): ${narrow ? "narrow" : "wide"}; resize the window`} wide>
        <div ref={measure} className="flex w-full gap-2" style={{ flexDirection: narrow ? "column" : "row" }}>
          <div className="flex-1 rounded-md bg-muted p-2">Thread</div>
          <div className="flex-1 rounded-md bg-muted p-2">Page under test</div>
        </div>
      </State>
    </States>
  )
}

export const primitives: Record<EntryOf<"primitives">, ComponentType> = {
  button: Buttons,
  toggle: Toggles,
  input: Inputs,
  "theme-picker": ThemePickers,
  badge: Badges,
  alert: Alerts,
  empty: Empties,
  tooltip: Tooltips,
  popover: Popovers,
  "dropdown-menu": Dropdowns,
  dialog: Dialogs,
  resizable: Resizables,
  toolbar: Toolbars,
  page: Pages,
}
