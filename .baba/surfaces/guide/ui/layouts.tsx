// The layouts' specimens: the kit's frames, the workbench and the plain layout with its welcome page, each a working one
// in a box of its own; its menus as data; and the workbench's parts, grouped as a page uses them: what stands in a
// toolbar, what a page is made of, and the rows of lists and trees.
import { useState, type ComponentType } from "react"
import { BugIcon, FileTextIcon, FolderIcon, InfoIcon, ListIcon, LoaderIcon, PlayIcon, PlusIcon, RefreshCwIcon, SettingsIcon, SparklesIcon } from "lucide-react"
import { ContextMenu } from "radix-ui"
import {
  Plain,
  Workbench,
  WorkbenchButton,
  WorkbenchCode,
  WorkbenchEmpty,
  WorkbenchFold,
  WorkbenchInfo,
  WorkbenchList,
  WorkbenchMark,
  WorkbenchMeter,
  WorkbenchNotice,
  WorkbenchPage,
  WorkbenchPicker,
  WorkbenchProperties,
  WorkbenchSection,
  WorkbenchSegments,
  WorkbenchSetting,
  WorkbenchSpacer,
  WorkbenchSplitter,
  WorkbenchToolbar,
  WorkbenchTree,
  ResizablePanel,
  ResizablePanelGroup,
  Input,
  type MenuItem,
  type Scopes,
  type WorkbenchGroup,
  type WorkbenchNode,
  type WorkbenchTool,
} from "babavoss/kit/index.ts"
import { ContextKit, MenuDropdown, MenuItems, MenuTriggers, SearchMenu, menuContent, type Menu } from "babavoss/kit/layouts/menu.tsx"
import { SearchField } from "babavoss/kit/layouts/parts.tsx"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"

const OPTIONS = [
  { id: "haiku", label: "Haiku", description: "Fast and light", detail: "$" },
  { id: "sonnet", label: "Sonnet", description: "The default", detail: "$$" },
  { id: "opus", label: "Opus", description: "The deepest", detail: "$$$" },
]
const GROUPS: WorkbenchGroup[] = [
  {
    id: "lanes",
    label: "In progress",
    rows: [
      { id: "4", label: "Show the present", detail: "#4", icon: LoaderIcon, busy: true, badge: "lane 2", tip: [["Lane", "2"], ["Since", "14:02"]] },
      { id: "6", label: "Rename the picker", detail: "#6", tone: "error", badge: "failing", actions: [{ id: "retry", label: "Retry", icon: RefreshCwIcon, run: () => {} }] },
    ],
  },
  {
    id: "backlog",
    label: "Backlog",
    rows: [
      { id: "7", label: "Close a tab from its menu", detail: "#7", description: "The menu offers close, close others, copy link and reload." },
      { id: "8", label: "Fold the injections", detail: "#8" },
    ],
  },
]
const NODES: WorkbenchNode[] = [
  {
    id: "framework",
    label: "framework",
    icon: FolderIcon,
    folder: true,
    children: [
      { id: "kit", label: "kit", icon: FolderIcon, folder: true, children: [{ id: "button", label: "button.tsx", icon: FileTextIcon, detail: "47 lines" }] },
      { id: "shell", label: "shell", icon: FolderIcon, folder: true, children: [{ id: "mark", label: "mark.tsx", icon: FileTextIcon, badge: "changed" }] },
    ],
  },
  { id: "readme", label: "README.md", icon: FileTextIcon },
]

function WorkbenchSpecimen() {
  const [active, setActive] = useState<string | undefined>("4")
  const [query, setQuery] = useState("")
  const tools: WorkbenchTool[] = [
    {
      id: "issues",
      label: "Issues",
      icon: ListIcon,
      badge: { value: 4 },
      filter: { label: "Filter issues", value: query, set: setQuery },
      actions: [{ id: "add", label: "Add", icon: PlusIcon, run: () => {} }],
      content: <WorkbenchList label="Issues" groups={GROUPS} active={active} open={setActive} empty="No issues" />,
    },
    { id: "files", label: "Files", icon: FolderIcon, content: <WorkbenchTree label="Files" nodes={NODES} open={() => {}} empty="No files" /> },
    { id: "problems", label: "Problems", icon: BugIcon, badge: { value: 1, tone: "error" }, fit: true, content: <WorkbenchList label="Problems" rows={[{ id: "p", label: "Lane 1 is stuck", tone: "error" }]} empty="None" /> },
    {
      id: "settings",
      label: "Settings",
      icon: SettingsIcon,
      meta: true,
      content: (
        <div className="p-2">
          <WorkbenchSetting label="Model" hint="What a new run uses">
            <WorkbenchPicker label="Model" value="sonnet" options={OPTIONS} set={() => {}} />
          </WorkbenchSetting>
        </div>
      ),
    },
  ]

  return (
    <States>
      <State label="toolbars on the edges; drag a tool or a toolbar, right-click for the rest; documents above the content" wide className="flex h-[26rem] flex-col items-stretch overflow-hidden p-0">
        <Workbench
          address="/guide-workbench"
          util="guide-workbench"
          tools={tools}
          documents={{ active, describe: (id) => ({ label: `#${id}` }), open: setActive, empty: <WorkbenchEmpty>Open an issue from the tools.</WorkbenchEmpty> }}
          main={
            active ? (
              <>
                <WorkbenchToolbar label="Issue">
                  <WorkbenchButton action={{ id: "run", label: "Run", icon: PlayIcon, run: () => {} }} />
                  <WorkbenchSpacer />
                  <WorkbenchInfo label="About this issue" rows={[["Lane", "2"], ["Narrative", "guide"]]} />
                </WorkbenchToolbar>
                <WorkbenchPage title={`Issue ${active}`} meta="in lane 2">
                  <p>The document in view, under its own toolbar.</p>
                </WorkbenchPage>
              </>
            ) : null
          }
        />
      </State>
    </States>
  )
}

const SCOPES = (current: string | undefined, open: (id: string | undefined) => void): Scopes => ({
  title: "Projects",
  hint: "Pick a project to work in.",
  current,
  open,
  list: [
    { id: "babavoss", label: "babavoss", description: "The framework", aside: "3 open" },
    { id: "site", label: "site", description: "The website", aside: "idle" },
  ],
})

function PlainSpecimen() {
  const [current, setCurrent] = useState<string | undefined>("babavoss")
  const [none, setNone] = useState<string | undefined>()

  return (
    <States min={320}>
      <State label="a scope open: its row heads the content" className="flex h-56 flex-col items-stretch overflow-hidden p-0">
        <Plain scopes={SCOPES(current, setCurrent)}>
          <div className="p-3 text-muted-foreground">{current ? `Working in ${current}.` : ""}</div>
        </Plain>
      </State>
      <State label="welcome: none open" className="flex h-56 flex-col items-stretch overflow-hidden p-0">
        <Plain scopes={SCOPES(none, setNone)}>
          <div className="p-3 text-muted-foreground">Working in {none}.</div>
        </Plain>
      </State>
    </States>
  )
}

/** A menu's every kind of entry, and the dot on the way to what waits on the person. */
function items(set: { wrap: boolean; setWrap: (v: boolean) => void; lens: string; setLens: (v: string) => void }): MenuItem[] {
  return [
    { kind: "label", id: "issue", label: "Issue 4", strong: true, mark: true },
    { kind: "action", id: "approve", label: "Approve", mark: true, run: () => {} },
    { kind: "action", id: "start", label: "Start…", note: "in a lane", hint: "Give issue 4 to a lane", run: () => {} },
    { kind: "action", id: "copy", label: "Copy link", keys: "⌘L", run: () => {} },
    { kind: "action", id: "pin", label: "Pin", disabled: true, run: () => {} },
    { kind: "separator", id: "s1" },
    { kind: "check", id: "wrap", label: "Wrap lines", checked: set.wrap, set: set.setWrap },
    { kind: "choice", id: "lens", label: "View", value: set.lens, options: [{ id: "list", label: "List" }, { id: "map", label: "Map" }], set: set.setLens },
    { kind: "separator", id: "s2" },
    {
      kind: "submenu",
      id: "go",
      label: "Go",
      mark: true,
      search: "Filter places",
      items: Array.from({ length: 10 }, (_, i) => ({ kind: "action" as const, id: `i${i}`, label: `Issue ${i + 1}`, run: () => {}, ...(i === 6 && { mark: true }) })),
    },
  ]
}

function MenuSpecimen() {
  const [wrap, setWrap] = useState(true)
  const [lens, setLens] = useState("list")
  const [open, setOpen] = useState(false)
  const all = items({ wrap, setWrap, lens, setLens })
  const menus: Menu[] = [
    { id: "scope", label: "babavoss", strong: true, items: [{ kind: "action", id: "a", label: "All projects", run: () => {} }] },
    { id: "view", label: "View", items: all.slice(5) },
    { id: "find", label: "Find", items: all.slice(0, 5), search: { placeholder: "Search actions" } },
    { id: "plain", label: "A label alone", items: [] },
  ]

  return (
    <States min={240}>
      <State label="triggers: a scope's row, a search, a label alone" wide>
        <MenuTriggers menus={menus} />
      </State>
      <State label="dropdown with search: action, note, keys, disabled, check, choice, submenu with a filter, marks">
        <MenuDropdown
          open={open}
          setOpen={setOpen}
          label="Menu"
          trigger={
            <button type="button" className="h-row rounded-md px-2 hover:bg-foreground/8">
              Open the menu
            </button>
          }
        >
          <SearchMenu placeholder="Search actions and places" items={all} close={() => setOpen(false)} />
        </MenuDropdown>
      </State>
      <State label="context: right-click the area" className="p-0">
        <ContextMenu.Root>
          <ContextMenu.Trigger className="grid h-20 w-full place-items-center text-muted-foreground">Right-click here</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className={menuContent}>
              <MenuItems items={all} kit={ContextKit} />
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </State>
    </States>
  )
}

function ToolbarSpecimen() {
  const [lens, setLens] = useState<"list" | "map">("list")
  const [model, setModel] = useState("sonnet")
  const [query, setQuery] = useState("")

  return (
    <States min={260}>
      <State label="toolbar: buttons, busy, a choice, segments, spacer, picker, info" wide className="block p-0">
        <WorkbenchToolbar label="Run">
          <WorkbenchButton action={{ id: "run", label: "Run", icon: PlayIcon, run: () => {} }} />
          <WorkbenchButton action={{ id: "busy", label: "Reading", icon: LoaderIcon, busy: true, run: () => {} }} />
          <WorkbenchButton action={{ id: "off", label: "Disabled", icon: SparklesIcon, disabled: true, run: () => {} }} />
          <WorkbenchButton action={{ id: "start", label: "Start under…", icon: PlusIcon, run: () => {}, choose: { label: "Start under", value: model, options: OPTIONS, set: setModel } }} />
          <WorkbenchSegments label="Lens" options={[{ id: "list", label: "List" }, { id: "map", label: "Map" }]} value={lens} set={setLens} />
          <WorkbenchSpacer />
          <WorkbenchPicker label="Model" value={model} options={OPTIONS} set={setModel} />
          <WorkbenchInfo label="About the run" rows={[["Model", model], ["Cost", "$0.08"]]} />
        </WorkbenchToolbar>
      </State>
      <State label="search field">
        <SearchField label="Filter issues" value={query} set={setQuery} />
      </State>
      <State label="splitter, between panels" className="h-24 p-0">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="50%">
            <div className="p-2 text-muted-foreground">Left</div>
          </ResizablePanel>
          <WorkbenchSplitter orientation="horizontal" />
          <ResizablePanel>
            <div className="p-2 text-muted-foreground">Right</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </State>
    </States>
  )
}

function PageSpecimen() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <States>
      <State label="page: title, aside, meta; section, fold, properties, code, setting, notices" wide className="flex h-[30rem] flex-col items-stretch p-0">
        <WorkbenchPage title="Issue 4" aside="Show the present" meta={<><span>lane 2</span><span>since 14:02</span></>}>
          {!dismissed && <WorkbenchNotice dismiss={() => setDismissed(true)}>Lane 2's worker stopped: its specs fail.</WorkbenchNotice>}
          <WorkbenchNotice tone="note">Drafts wait for the person's approval.</WorkbenchNotice>
          <WorkbenchSection label="About" aside="markdown">
            <p>The strip shows whose move it is, from the mark at its start.</p>
          </WorkbenchSection>
          <WorkbenchProperties label="Facts" titled rows={[["Status", "in a lane"], ["Narrative", "guide"], ["From", "#31, #33"]]} />
          <WorkbenchCode title="bun test" text={"396 pass\n0 fail"} copy />
          <WorkbenchCode title="error" tone="error" text="error: Unexpected end of file" />
          <WorkbenchFold label="Iterations" aside="2 passes">
            <p>1. Rewrite the strip — the dots stood apart.</p>
          </WorkbenchFold>
          <WorkbenchFold label="Open fold" aside="as it starts" open>
            <WorkbenchSetting label="Title" hint="A short imperative title">
              <Input defaultValue="Show the present" />
            </WorkbenchSetting>
          </WorkbenchFold>
        </WorkbenchPage>
      </State>
    </States>
  )
}

function RowsSpecimen() {
  const [active, setActive] = useState("4")

  return (
    <States min={260}>
      <State label="list in groups: busy, error, detail, badge, tip, actions, description, active" className="block p-0">
        <WorkbenchList label="Issues" groups={GROUPS} active={active} open={setActive} empty="No issues" />
      </State>
      <State label="tree: folders, files, badge" className="block p-0">
        <WorkbenchTree label="Files" nodes={NODES} active="mark" open={() => {}} empty="No files" />
      </State>
      <State label="marks and meters in a line of facts" className="flex-col items-start">
        <WorkbenchMark icon={InfoIcon}>idle</WorkbenchMark>
        <WorkbenchMark icon={LoaderIcon} busy>
          working
        </WorkbenchMark>
        <WorkbenchMark icon={BugIcon} tone="error">
          failing
        </WorkbenchMark>
        <WorkbenchMeter share={0.42}>42% of the budget</WorkbenchMeter>
        <WorkbenchMeter share={1.1} tone="error">
          over the budget
        </WorkbenchMeter>
      </State>
      <State label="empty, and a list with nothing" className="flex-col items-stretch p-0">
        <WorkbenchEmpty>Nothing to show here yet.</WorkbenchEmpty>
        <WorkbenchList label="Nothing" rows={[]} empty="No problems" />
      </State>
    </States>
  )
}

export const layouts: Record<EntryOf<"layouts">, ComponentType> = {
  workbench: WorkbenchSpecimen,
  plain: PlainSpecimen,
  menu: MenuSpecimen,
  toolbar: ToolbarSpecimen,
  page: PageSpecimen,
  rows: RowsSpecimen,
}
