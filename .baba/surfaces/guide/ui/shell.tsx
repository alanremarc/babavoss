// The shell's specimens: the rail in each of its four positions with tabs in every standing, a tab's drawer and home's,
// home's closed tabs and a closed tab's log, the parts of a thread, its highlights, folds and batches, a highlight's bubble, the desktop, the modal an action's inputs open in, the
// connection's states and a tab's own. Each is the shell's component, given sample data (samples.ts) where the live shell
// gives it the runtime's; a drawer's menu reads sample views through a door of their own, so what it lists, orders and
// dots is the shell's own working.
import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { BookOpenTextIcon, FlaskConicalIcon, ListTodoIcon, SettingsIcon, StickyNoteIcon } from "lucide-react"
import { handle, meant, type Args, type View } from "../../../../framework/core/surface/view.ts"
import { Button } from "babavoss/kit/index.ts"
import { RefusedLine, useTabMenu } from "../../../../framework/shell/ui/actions.tsx"
import { Said, type Bubble } from "../../../../framework/shell/ui/bubbles.tsx"
import { controlsOf, highlightsIn, type Offered } from "../../../../framework/shell/ui/commands.ts"
import { Overlay, PointedAlert, RefusedAlert, said } from "../../../../framework/shell/ui/connection.tsx"
import type { Archive } from "../../../../framework/shell/ui/closed.tsx"
import { Drawer, Fold, Line, Notice, type Body } from "../../../../framework/shell/ui/drawer.tsx"
import { Desktop, Foot } from "../../../../framework/shell/ui/home.tsx"
import { homeMenu, type HomeProps } from "../../../../framework/shell/ui/home.ts"
import { Inputs } from "../../../../framework/shell/ui/inputs.tsx"
import { Logo } from "../../../../framework/shell/ui/mark.tsx"
import { Rail, RailEntry, type RailItem } from "../../../../framework/shell/ui/rail.tsx"
import { entriesIn, itemsOf, pinnedOf, placeIn, shellEntries, waitingRows, withUnheard, type Row } from "../../../../framework/shell/ui/thread.ts"
import { TabBroken, TabFailed, TabNoPage } from "../../../../framework/shell/ui/tabs.tsx"
import { standingOf } from "../../../../framework/shell/ui/turn.ts"
import type { Rail as Placed } from "../../../../framework/shell/settings/src/settings.ts"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"
import { Again, useHeld } from "./primitives.tsx"
import { CLOSED_TABS, FRESH, ROWS, sampleArchive, sampleDoor } from "./samples.ts"

const ICONS: Record<string, ReactNode> = {
  queue: <ListTodoIcon aria-hidden />,
  lab: <FlaskConicalIcon aria-hidden />,
  design: <BookOpenTextIcon aria-hidden />,
  notes: <StickyNoteIcon aria-hidden />,
  settings: <SettingsIcon aria-hidden />,
}
const STILL = standingOf({ agent: "idle", waiting: 0 })
const door = sampleDoor()
/** The shell's controls of a sample tab: they do nothing here. */
const controls = (others = true) => controlsOf({ close: { hint: "Close the tab", run: () => {} }, ...(others && { others: () => {} }), link: `${location.origin}/queue`, reload: () => {} })
/** The highlights of the sample not opened, about the queue's tab: one at issue 7. */
const UNOPENED = highlightsIn("/queue", [{ at: "/queue/issues/7" }])

/** The mark, home's entry on the rail, as a row has it: its standing, or a connection lost. */
const Mark = ({ lost }: { lost?: string }) => (
  <RailEntry
    item={{ id: "home", label: "Home", icon: <Logo standing={STILL} lost={!!lost} />, why: [lost ?? STILL.said] }}
    home
    column={false}
    side="top"
    active={false}
    open={false}
    select={() => {}}
    toggle={() => {}}
  />
)

/** The modal an action asks its inputs in, as the shell opens it: a refusal shows in it, and an admitted call closes it. */
function Asking({ action, close }: { action?: Offered; close: () => void }) {
  const call = async (_: Offered, args: Args) =>
    typeof args.about === "string" && !args.about.trim() ? "Say what it is about" : args.mode === "dark" ? "dark is refused here, to show a refusal" : undefined

  return action ? (
    <Suspense fallback={null}>
      <Inputs key={action.handle.name} action={action} call={call} close={close} />
    </Suspense>
  ) : null
}

/** The sample's tabs, newest first, one in each standing, and one whose title is longer than a pill. */
const TABS: RailItem[] = [
  { id: "/tabs/9", label: "Settle the second channel's history and its dots", icon: ICONS.settings },
  { id: "/notes", label: "Notes", icon: ICONS.notes, mark: "broken", why: ["Broken"] },
  { id: "/design", label: "Design", icon: ICONS.design },
  { id: "/tabs/5", label: "Lab", icon: ICONS.lab, mark: "highlight", why: ["The run ended: 2 turns, 41s"] },
  { id: "/queue", label: "Queue", icon: ICONS.queue, mark: "highlight", why: ["Draft 7 waits on you", "Lane 2 is free again"] },
]
const PLACES: { label: string; placed: Placed }[] = [
  { label: "left, from the bottom: the mark at the foot, the newest tab above it", placed: { side: "left", from: "bottom", drawer: "left" } },
  { label: "right, from the top: the mark at the head, the newest tab under it", placed: { side: "right", from: "top", drawer: "left" } },
  { label: "top: the mark first, the newest tab beside it; more than fit scroll sideways", placed: { side: "top", from: "bottom", drawer: "left" } },
  { label: "bottom: the same, along the foot", placed: { side: "bottom", from: "bottom", drawer: "right" } },
]
const DIRECTION: Record<Placed["side"], string> = { left: "flex-row", right: "flex-row-reverse", top: "flex-col", bottom: "flex-col-reverse" }

/** The rail at one side, worked as the shell works it: a click shows a tab, again opens its drawer, here only its dots. */
function RailAt({ placed }: { placed: Placed }) {
  const [active, setActive] = useState("/queue")
  const [drawer, setDrawer] = useState<string>()

  return (
    <div className={`flex h-72 w-full overflow-hidden rounded-lg border bg-background ${DIRECTION[placed.side]}`}>
      <Rail
        placed={placed}
        mark={{ id: "home", label: "Home", icon: <Logo standing={STILL} />, why: [STILL.said] }}
        tabs={TABS}
        active={active}
        {...(drawer && { drawer })}
        select={(id) => {
          setActive(id)
          setDrawer(undefined)
        }}
        toggle={(id) => setDrawer((open) => (open === id ? undefined : id))}
      />
      <div className="grid flex-1 place-items-center p-3 text-meta text-muted-foreground">{drawer ? `${drawer}'s drawer is open` : `${active} is shown`}</div>
    </div>
  )
}

function RailSpecimen() {
  return (
    <States min={320}>
      {PLACES.map((p) => (
        <State key={p.label} label={p.label} bare>
          <RailAt placed={p.placed} />
        </State>
      ))}
    </States>
  )
}

/** The shell's view at / as home's menu reads it: open for each surface, close for each tab. */
const ROOT: View = {
  title: "babavoss",
  surfaces: [
    { name: "queue", open: handle("open", "in a new tab, unless its surface keeps one", { surface: "queue" }) },
    { name: "design", open: handle("open", "in a new tab, unless its surface keeps one", { surface: "design" }) },
    { name: "settings", open: handle("open", "in a new tab, unless its surface keeps one", { surface: "settings" }) },
  ],
  tabs: [
    { at: "/queue", title: "Queue", close: handle("close", "its state and log are kept read only in the archive of closed tabs, /activity/closed", { n: 3 }) },
    { at: "/tabs/5", title: "Queue", close: handle("close", "its state and log are kept read only in the archive of closed tabs, /activity/closed", { n: 5 }) },
  ],
}

/** A tab's drawer over a sample page, its menu read from the sample's views, as the shell opens it; closed, a button opens it again. */
function TabDrawer({ side, broken, rows = entriesIn(ROWS, "/queue") }: { side: "left" | "right"; broken?: string; rows?: Row[] }) {
  const menu = useTabMenu({ door, address: "/queue", route: "/issues/4", title: "Queue", name: "queue", start: () => {}, navigate: () => {}, highlights: UNOPENED, controls: controls() })
  const pinned = pinnedOf({ ...(broken && { broken }) })

  return (
    <Drawer
      label="Queue"
      side={side}
      menu={broken ? { items: controls() } : { items: menu.items, find: menu.find }}
      rows={rows}
      loaded
      stay={new Set(FRESH)}
      {...(pinned && { pinned })}
      where={(row) => {
        const place = placeIn({ ...row, at: row.saidAt ?? row.at }, "/queue")

        return place === "/" ? undefined : place
      }}
      go={() => {}}
      reload={() => {}}
      close={() => {}}
    />
  )
}

/** The archive of closed tabs as home's drawer reads it, each with its surface's icon. */
const ARCHIVE: Archive = { read: sampleArchive(), icon: (surface) => ICONS[surface] }

/**
 * Home's drawer: the shell's menu from its view at /, the shell's own entries folded, the closed tabs under them, and what
 * of the person's waits for the agent; with `unheard`, the session's hooks gone quiet 20 minutes ago, its highlight among
 * the entries, saying what to do; `opening` one of the archive's views.
 */
function HomeDrawer({ unheard = false, opening }: { unheard?: boolean; opening?: Body }) {
  const quiet = unheard ? { ever: true, since: Date.now() - 20 * 60_000 } : undefined

  return (
    <Drawer
      label="babavoss"
      side="left"
      home
      menu={{ items: homeMenu({ view: ROOT, title: "babavoss", tabs: [{ at: "/queue", label: "Queue", mark: "highlight" }], start: () => {}, navigate: () => {} }) }}
      rows={withUnheard(shellEntries(ROWS), quiet ? [quiet] : [])}
      loaded
      stay={new Set(quiet ? [-quiet.since] : [])}
      waiting={waitingRows(ROWS, unheard ? 0 : 2)}
      archive={ARCHIVE}
      {...(opening && { opening })}
      go={() => {}}
      reload={() => {}}
      close={() => {}}
    />
  )
}

/** A sample page under a drawer, which keeps the focus a drawer takes as it opens, as the guide must. */
function Under({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (box.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }, [])

  return (
    <div ref={box} className="relative h-[34rem] w-full overflow-hidden rounded-lg border bg-background">
      <div className="p-4 text-muted-foreground">The tab's content, dimmed under its drawer.</div>
      {children}
    </div>
  )
}

/** The queue's entries before its first highlight: a drawer with none yet. */
const ORDINARY = entriesIn(ROWS, "/queue").filter((r) => r.n < 9)

function DrawerSpecimen() {
  return (
    <States min={420}>
      <State label="a tab's: its highlights, those not opened before dotted, each saying where it goes; the rest folded between them, the newest glanced at the foot. Click a fold to open it; the field to open the menu" bare>
        <Under>
          <TabDrawer side="left" />
        </Under>
      </State>
      <State label="no highlight yet: the fold alone, never an empty panel" bare>
        <Under>
          <TabDrawer side="right" rows={ORDINARY} />
        </Under>
      </State>
      <State label="home's: the shell's own entries folded, what waits for the agent, and the closed tabs under them; click them" bare>
        <Under>
          <HomeDrawer />
        </Under>
      </State>
      <State label="home's closed tabs: the latest first, read only, more as you scroll" bare>
        <Under>
          <HomeDrawer opening={{ kind: "closed" }} />
        </Under>
      </State>
      <State label="a closed tab's log: the same thread, read only, with the way back" bare>
        <Under>
          <HomeDrawer opening={{ kind: "log", tab: CLOSED_TABS[0]! }} />
        </Under>
      </State>
      <State label="home's, the session's hooks gone quiet: its highlight in the thread, saying what to do" bare>
        <Under>
          <HomeDrawer unheard />
        </Under>
      </State>
      <State label="a broken tab's: nothing yet, Reload pinned" bare>
        <Under>
          <TabDrawer side="right" broken="its saved state does not load: Unexpected token" rows={[]} />
        </Under>
      </State>
    </States>
  )
}

/** A fold of sample entries as the thread draws it, `open` as it starts. */
function Folded({ rows, open: initially = false, glance = false, home = false }: { rows: Row[]; open?: boolean; glance?: boolean; home?: boolean }) {
  const [open, setOpen] = useState(initially)

  return <Fold rows={rows} open={open} flip={setOpen} glance={glance} label={home ? "babavoss" : "Queue"} home={home} go={() => {}} />
}

function Entries() {
  const queue = entriesIn(ROWS, "/queue")
  const highlight = queue.find((r) => r.n === 22)!
  const between = queue.filter((r) => r.n < 22 && r.n > 9)
  const batch = itemsOf(queue.filter((r) => r.id === "program:c41")).find((i) => i.kind === "batch")!
  const refused = itemsOf(queue.filter((r) => r.n === 16))[0]!
  const world = itemsOf(queue.filter((r) => r.n === 15))[0]!

  return (
    <States min={360}>
      <State label="a highlight: who raised it and when, the bubble, where it goes; dotted where it was not opened" className="flex-col items-stretch gap-2">
        <Notice row={highlight} author="Agent" fresh where="/issues/7" go={() => {}} />
      </State>
      <State label="a fold: how many and by whom; at the foot, its newest entry glanced at" className="flex-col items-stretch gap-2">
        <Folded rows={queue.filter((r) => r.n > 22)} glance />
        <Folded rows={between} />
      </State>
      <State label="a fold opened: the entries as they are, notices as bubbles with the call under them" className="flex-col items-stretch gap-2">
        <Folded rows={between} open />
      </State>
      <State label="a batch, one command's calls: stopped where a call was refused; click to open" className="flex-col items-stretch gap-2">
        <Line item={batch} label="Queue" home={false} go={() => {}} />
      </State>
      <State label="a refusal, and the world's events, named by what heard them" className="flex-col items-stretch gap-2">
        <Line item={refused} label="Queue" home={false} />
        <Line item={world} label="Queue" home={false} />
      </State>
      <State label="on home, each naming its surface" className="flex-col items-stretch gap-2">
        <Folded rows={shellEntries(ROWS)} open home />
      </State>
    </States>
  )
}

const BUBBLES: (Bubble & { away: "right" | "left" | "down" | "up"; label: string })[] = [
  { id: 1, text: "Draft 7 waits on you", kept: true, away: "right", label: "a highlight beside a tab on a rail at the left" },
  { id: 2, text: "The run ended: 2 turns, 41s", kept: true, away: "left", label: "at the right" },
  { id: 3, text: "Lane 2 is free again", kept: true, away: "down", label: "under a rail along the top" },
  { id: 4, text: "The settings were not saved: EACCES", from: "Settings", kept: true, away: "up", label: "beside the mark, saying its surface" },
]

function BubbleSpecimen() {
  const { shown, dismiss, again } = useHeld(BUBBLES)

  return (
    <div className="flex flex-col gap-2">
      <States min={200}>
        {BUBBLES.map((b) => {
          const now = shown.find((s) => s.away === b.away)

          return (
            <State key={b.away} label={`${b.label}; hover holds it, it goes after 3s`} className="min-h-20">
              {now && <Said bubble={now} away={now.away} act={() => {}} dismiss={() => dismiss(now.id)} />}
            </State>
          )
        })}
      </States>
      <div>
        <Again onClick={again} />
      </div>
    </div>
  )
}

const DESKTOP: HomeProps = {
  title: "babavoss",
  surfaces: [
    { name: "queue", label: "Queue", description: "Track the session's work as issues. Use when work is asked for.", icon: ICONS.queue, open: () => {} },
    { name: "lab", label: "Lab", description: "Have an agent under test use a checkout. Use when checking a surface.", icon: ICONS.lab, open: () => {} },
    { name: "design", label: "Design", description: "Inspect what an agent is given. Use when baba's words change.", icon: ICONS.design, open: () => {} },
    { name: "settings", label: "Settings", description: "The person's settings. Use when they ask to change one.", icon: ICONS.settings, open: () => {} },
    { name: "notes", label: "Notes", description: "", icon: ICONS.notes, broken: "the notes surface does not load (src/surface.ts: Unexpected end of file)" },
  ],
  tabs: [
    { at: "/queue", surface: "queue", label: "Queue", mark: "highlight", go: () => {} },
    { at: "/tabs/5", surface: "lab", label: "Lab", go: () => {} },
    { at: "/tabs/4", surface: "lab", label: "Lab 4", go: () => {} },
  ],
  foot: <Foot harness="claude" facts={{ root: "babavoss", version: "0.60.0", session: "d437fdcb-0d70-40c0-b515-97ae0de7c265", update: undefined }} />,
}

function DesktopSpecimen() {
  return (
    <States>
      <State label="a surface each: open, two tabs, marked where a tab of it waits on someone, one that does not load; whose page this is at the foot" wide bare>
        <div className="flex h-80 w-full overflow-hidden rounded-lg border bg-background">
          <Desktop {...DESKTOP} />
        </div>
      </State>
    </States>
  )
}

const ASKS: { label: string; action: Offered }[] = [
  { label: "Describe…", action: { path: "/", handle: handle("describe", "empty is refused", { n: 4 }, { about: { type: "string", kind: "markdown" } }) } },
  {
    label: "Start…",
    action: { path: "/", handle: handle("start", "when a subagent begins on it", { n: 4 }, { lane: { type: "number", range: [1, 5] }, notify: "boolean" }) },
  },
  {
    label: "Theme…",
    action: { path: "/", handle: handle("theme", "dark is refused", {}, { mode: { type: "string", choices: ["light", "dark", "system"] }, hue: { type: "number", range: [0, 360] } }) },
  },
  { label: "Note…", action: { path: "/", handle: handle("note", "what is being done or waited for", { n: 4 }, { text: { type: "string", kind: "line" } }) } },
]

function InputsSpecimen() {
  const [asking, setAsking] = useState<Offered>()

  return (
    <States min={200}>
      {ASKS.map((a) => (
        <State key={a.label} label={`${Object.values(a.action.handle.open).map(meant).join(", ")}; refused stays open`}>
          <Button variant="outline" size="sm" onClick={() => setAsking(a.action)}>
            {a.label}
          </Button>
        </State>
      ))}
      <Asking {...(asking && { action: asking })} close={() => setAsking(undefined)} />
    </States>
  )
}

function Connection() {
  const lost = said("lost", Infinity)!
  const connecting = said("connecting", Infinity)!

  return (
    <States min={220}>
      <State label={`${connecting.toLowerCase()}: the page never had its stream`} className="justify-center bg-sidebar">
        <Mark lost={connecting} />
      </State>
      <State label={`${lost.toLowerCase()}: it had it and lost it`} className="justify-center bg-sidebar">
        <Mark lost={lost} />
      </State>
      <State label="over the content: a refusal, and where the agent points while you are busy" wide className="relative block h-40 overflow-hidden p-0">
        <div className="p-3 pt-28 text-muted-foreground">The tab's content, unmoved under them.</div>
        <Overlay>
          <RefusedAlert reason="Lane 1 is delivering issue 4" dismiss={() => {}} />
          <PointedAlert label="Queue" route="/issues/7" go={() => {}} dismiss={() => {}} />
        </Overlay>
      </State>
      <State label="pointed to a long path: it wraps beside the buttons, never under them" wide className="relative block h-28 overflow-hidden p-0">
        <Overlay>
          <PointedAlert label="Queue" route="/narratives/release-hardening/issues/128/iterations/3/decisions/the-second-pass-on-the-lane-layout" go={() => {}} dismiss={() => {}} />
        </Overlay>
      </State>
    </States>
  )
}

function TabStates() {
  return (
    <States min={260}>
      <State label="refused: the line over the content" className="block p-0">
        <RefusedLine reason="Lane 1 is delivering issue 4" dismiss={() => {}} />
        <div className="p-3 text-muted-foreground">The tab's content</div>
      </State>
      <State label="broken" className="block p-0">
        <TabBroken why="its saved state does not load: Unexpected token" />
      </State>
      <State label="its page failed" className="block p-0">
        <TabFailed error="Cannot read properties of undefined (reading 'issues')" retry={() => {}} />
      </State>
      <State label="no page" className="block p-0">
        <TabNoPage surface="notes" />
      </State>
    </States>
  )
}

export const shell: Record<EntryOf<"shell">, ComponentType> = {
  rail: RailSpecimen,
  bubble: BubbleSpecimen,
  drawer: DrawerSpecimen,
  entries: Entries,
  inputs: InputsSpecimen,
  desktop: DesktopSpecimen,
  connection: Connection,
  "tab-states": TabStates,
}
