// The shell's specimens: the rail in each of its four positions with tabs in every standing, a tab's drawer and home's,
// the three kinds of entry in a thread, a notice's bubble, the desktop, the modal an action's inputs open in, the
// connection's states and a tab's own. Each is the shell's component, given sample data (samples.ts) where the live shell
// gives it the runtime's; a drawer's menu reads sample views through a door of their own, so what it lists, orders and
// dots is the shell's own working.
import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { BookOpenTextIcon, FlaskConicalIcon, ListTodoIcon, SettingsIcon, StickyNoteIcon } from "lucide-react"
import { handle, type Args, type View } from "../../../../framework/core/surface/view.ts"
import { Button } from "babavoss/kit/index.ts"
import { RefusedLine, useTabMenu } from "../../../../framework/shell/ui/actions.tsx"
import { Said, type Bubble } from "../../../../framework/shell/ui/bubbles.tsx"
import { controlsOf, noticesIn, type Offered } from "../../../../framework/shell/ui/commands.ts"
import { Overlay, PointedAlert, RefusedAlert, said } from "../../../../framework/shell/ui/connection.tsx"
import { Drawer, Line } from "../../../../framework/shell/ui/drawer.tsx"
import { Desktop, Foot } from "../../../../framework/shell/ui/home.tsx"
import { homeMenu, type HomeProps } from "../../../../framework/shell/ui/home.ts"
import { Inputs } from "../../../../framework/shell/ui/inputs.tsx"
import { Logo } from "../../../../framework/shell/ui/mark.tsx"
import { Rail, RailEntry, type RailItem } from "../../../../framework/shell/ui/rail.tsx"
import { entriesIn, itemsOf, pinnedOf, shellEntries, unheardPinned, waitingRows, withUnheard } from "../../../../framework/shell/ui/thread.ts"
import { TabBroken, TabFailed, TabNoPage } from "../../../../framework/shell/ui/tabs.tsx"
import { standingOf } from "../../../../framework/shell/ui/turn.ts"
import type { Rail as Placed } from "../../../../framework/shell/settings/src/settings.ts"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"
import { Again, useHeld } from "./primitives.tsx"
import { FRESH, ROWS, sampleDoor } from "./samples.ts"

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
/** The unseen notices of the sample, about the queue's tab: one at issue 2. */
const UNSEEN = noticesIn("/queue", [{ at: "/queue/issues/2" }])

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
    typeof args.lane === "number" && (args.lane < 1 || args.lane > 5) ? "There are lanes 1 to 5" : typeof args.about === "string" && !args.about.trim() ? "Say what it is about" : undefined

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
  { id: "/design", label: "Design", icon: ICONS.design, mark: "agent", why: ["Needs the agent: to play the scenarios again"] },
  { id: "/tabs/5", label: "Lab", icon: ICONS.lab, mark: "person", why: ["Opened by the agent"] },
  { id: "/queue", label: "Queue", icon: ICONS.queue, mark: "person", why: ["Needs you: to approve or drop 1 draft", "1 new notice"] },
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
    { name: "queue", open: handle("open", "open a queue tab", { surface: "queue" }) },
    { name: "design", open: handle("open", "open a design tab", { surface: "design" }) },
    { name: "settings", open: handle("open", "open the settings tab, or show the one open", { surface: "settings" }) },
  ],
  tabs: [{ at: "/queue", close: handle("close", "close tab 3, Queue; its state is dropped", { n: 3 }) }],
}

/** A tab's drawer over a sample page, its menu read from the sample's views, as the shell opens it; closed, a button opens it again. */
function TabDrawer({ side, broken, empty }: { side: "left" | "right"; broken?: string; empty?: boolean }) {
  const menu = useTabMenu({ door, address: "/queue", route: "/issues/4", title: "Queue", name: "queue", start: () => {}, navigate: () => {}, notices: UNSEEN, controls: controls() })
  const pinned = pinnedOf({ needs: broken ? [] : [{ who: "person", why: "to approve or drop 1 draft" }], ...(broken && { broken }), ...(menu.ask && { ask: menu.ask }) })

  return (
    <Drawer
      label="Queue"
      side={side}
      menu={broken ? { items: controls() } : { items: menu.items, find: menu.find }}
      rows={empty ? [] : entriesIn(ROWS, "/queue")}
      loaded
      stay={new Set(FRESH)}
      {...(pinned && { pinned })}
      go={() => {}}
      goThere={() => {}}
      reload={() => {}}
      close={() => {}}
    />
  )
}

/**
 * Home's drawer: the shell's menu from its view at /, the shell's own entries, and what of the person's waits for the agent;
 * with `unheard`, the session's hooks gone quiet 20 minutes ago, its notice kept among the entries and why pinned at the foot.
 */
function HomeDrawer({ unheard = false }: { unheard?: boolean }) {
  const quiet = unheard ? { ever: true, since: Date.now() - 20 * 60_000 } : undefined
  const pinned = unheardPinned(quiet)

  return (
    <Drawer
      label="babavoss"
      side="left"
      home
      menu={{ items: homeMenu({ view: ROOT, title: "babavoss", tabs: [{ at: "/queue", label: "Queue", mark: "person" }], start: () => {}, navigate: () => {} }) }}
      rows={withUnheard(shellEntries(ROWS), quiet ? [quiet] : [])}
      loaded
      stay={new Set()}
      {...(pinned && { pinned })}
      waiting={waitingRows(ROWS, unheard ? 0 : 2)}
      go={() => {}}
      goThere={() => {}}
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

function DrawerSpecimen() {
  return (
    <States min={420}>
      <State label="a tab's: its menu at rest over its thread, new notices dotted, what it needs pinned at the foot. Click the field to open the menu; type to search" bare>
        <Under>
          <TabDrawer side="left" />
        </Under>
      </State>
      <State label="home's: the shell's actions and the tabs as its places, the shell's own entries, what waits for the agent" bare>
        <Under>
          <HomeDrawer />
        </Under>
      </State>
      <State label="home's, the session's hooks gone quiet: the notice kept in its thread, why and what to do pinned at the foot" bare>
        <Under>
          <HomeDrawer unheard />
        </Under>
      </State>
      <State label="a broken tab's, at the right: nothing yet, Reload pinned" bare>
        <Under>
          <TabDrawer side="right" broken="its saved state does not load: Unexpected token" empty />
        </Under>
      </State>
    </States>
  )
}

function Entries() {
  const items = itemsOf(entriesIn(ROWS, "/queue"))
  const own = itemsOf(shellEntries(ROWS))

  return (
    <States min={360}>
      <State label="notices, the agent's, the surface's and yours; calls in a row folded, click to open; the tab entry" className="flex-col items-stretch gap-2">
        {[...items].reverse().map((item) => (
          <Line key={item.kind === "calls" ? item.rows[0]!.n : item.row.n} item={item} label="Queue" home={false} fresh={item.kind === "notice" && FRESH.includes(item.row.n)} go={() => {}} />
        ))}
      </State>
      <State label="on home, each naming its surface" className="flex-col items-stretch gap-2">
        {[...own].reverse().map((item) => (
          <Line key={item.kind === "calls" ? item.rows[0]!.n : item.row.n} item={item} label="babavoss" home fresh={false} go={() => {}} />
        ))}
      </State>
    </States>
  )
}

const BUBBLES: (Bubble & { away: "right" | "left" | "down" | "up"; label: string })[] = [
  { id: 1, text: "Issue 4, Show the present, is done", kept: true, away: "right", label: "beside a tab on a rail at the left" },
  { id: 2, text: "The run ended: 2 turns, 41s", kept: true, away: "left", label: "at the right" },
  { id: 3, text: "Lane 2 is free again", kept: true, away: "down", label: "under a rail along the top" },
  { id: 4, text: "Saved", from: "Settings", kept: true, away: "up", label: "beside the mark, saying its surface" },
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
    { at: "/queue", surface: "queue", label: "Queue", mark: "person", go: () => {} },
    { at: "/tabs/5", surface: "lab", label: "Lab", mark: "agent", go: () => {} },
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
  { label: "Describe…", action: { path: "/", ask: false, handle: handle("describe", "Rewrite what issue 4 is about, as brief markdown; empty is refused", { n: 4 }, { about: "string" }) } },
  { label: "Start…", action: { path: "/", ask: false, handle: handle("start", "Give issue 4 to a lane, 1 to 5; another is refused", { n: 4 }, { lane: "number", notify: "boolean" }) } },
]

function InputsSpecimen() {
  const [asking, setAsking] = useState<Offered>()

  return (
    <States min={200}>
      {ASKS.map((a) => (
        <State key={a.label} label={`${Object.values(a.action.handle.open).join(", ")} fields; refused stays open`}>
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
