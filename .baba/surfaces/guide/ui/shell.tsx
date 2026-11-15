// The shell's specimens: the strip with tabs in every standing and their menus, home, the modal an action's inputs open
// in, the notices and the activity drawer, the connection's states and a tab's own. Each is the shell's component, given
// sample data (samples.ts) where the live shell gives it the runtime's; a tab's menu reads sample views through a door
// of their own, so what it lists, orders and dots is the shell's own working.
import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { BookOpenTextIcon, FlaskConicalIcon, ListTodoIcon, SettingsIcon, StickyNoteIcon } from "lucide-react"
import { handle, type Args } from "babavoss/core/surface/view.ts"
import { Button, Sheet, Toasts, type ToastItem } from "babavoss/kit/index.ts"
import { DropdownKit, MenuDropdown, MenuItems } from "babavoss/kit/layouts/menu.tsx"
import { RefusedLine, TabMenu } from "babavoss/shell/ui/actions.tsx"
import { BY, MARK, Mark } from "babavoss/shell/ui/activity.tsx"
import { channelsOf, type Channel } from "babavoss/shell/ui/channels.ts"
import { controlsOf, noticesIn, type Offered } from "babavoss/shell/ui/commands.ts"
import { Overlay, PointedAlert, RefusedAlert, said } from "babavoss/shell/ui/connection.tsx"
import { Home, HomeTab, type TabEntry } from "babavoss/shell/ui/home.tsx"
import type { SurfaceEntry } from "babavoss/shell/ui/home.ts"
import { Inputs } from "babavoss/shell/ui/inputs.tsx"
import { ActivityButton, ActivityLevels, inView, waitingRows, type Entered, type Shown } from "babavoss/shell/ui/notifications.tsx"
import { SurfaceTabs, TabBroken, TabFailed, TabNoPage } from "babavoss/shell/ui/tabs.tsx"
import { standingOf } from "babavoss/shell/ui/turn.ts"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"
import { Again, useHeld } from "./primitives.tsx"
import { FRESH, NEEDS, ROWS, sampleDoor, TABS, TITLES_BY_TAB } from "./samples.ts"

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

/** A tab's menu over the sample's views, at `route`, as the strip opens it; an action with inputs opens its modal. */
function SampleMenu({ route, close, start }: { route: string; close: () => void; start: (action: Offered) => void }) {
  return (
    <TabMenu
      door={door}
      address="/queue"
      route={route}
      title="Queue"
      name="queue"
      start={start}
      navigate={close}
      notices={UNSEEN}
      controls={controls()}
      close={close}
    />
  )
}

function Strip() {
  const [active, setActive] = useState("/guide/queue")
  const [asking, setAsking] = useState<Offered>()
  const start = (action: Offered) => Object.keys(action.handle.open).length && setAsking(action)
  const items = [
    { id: "/guide/queue", label: "Queue", icon: ICONS.queue, menu: (close: () => void) => <SampleMenu route="/issues/4" close={close} start={start} /> },
    { id: "/guide/queue-2", label: "Queue", icon: ICONS.queue, waits: true, needs: [{ who: "person" as const, why: "to approve or drop 1 draft" }], menu: (close: () => void) => <SampleMenu route="/" close={close} start={start} /> },
    { id: "/guide/lab", label: "Lab", icon: ICONS.lab, unseen: true, menu: () => <MenuItems kit={DropdownKit} items={controls()} /> },
    { id: "/guide/design", label: "Design", icon: ICONS.design, needs: [{ who: "agent" as const, why: "to play the scenarios again" }], menu: () => <MenuItems kit={DropdownKit} items={controls()} /> },
    { id: "/guide/notes", label: "Notes", icon: ICONS.notes, broken: "its saved state does not load", menu: () => <MenuItems kit={DropdownKit} items={controls()} /> },
    { id: "/guide/long", label: "Settle the second channel's history and its dots", icon: ICONS.settings, menu: () => <MenuItems kit={DropdownKit} items={controls(false)} /> },
  ]

  return (
    <States>
      <State
        label="home · active · waits on you · new, opened by the agent · needs the agent · broken · a long title, which scrolls on hover. Hover an icon for its dots; right-click or Shift+F10 opens the menu"
        wide
        className="block min-h-0 overflow-hidden p-0"
      >
        <SurfaceTabs
          items={items.map((item) => ({ ...item, onClose: () => {} }))}
          active={active}
          onSelect={setActive}
          home={<HomeTab active={active === "home"} standing={STILL} animate keys="⌘P" onSelect={() => setActive("home")} />}
          end={<ActivityButton badge={2} waiting={1} open={false} onClick={() => {}} />}
        />
        <Asking {...(asking && { action: asking })} close={() => setAsking(undefined)} />
      </State>
    </States>
  )
}

/** A tab's menu, dropped from a button as the strip drops it from the tab's dots. */
function MenuAt({ route, label, start }: { route: string; label: string; start: (action: Offered) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <MenuDropdown
      open={open}
      setOpen={setOpen}
      label={`Menu at ${route}`}
      trigger={
        <Button variant="outline" size="sm">
          {label}
        </Button>
      }
    >
      {open && <SampleMenu route={route} close={() => setOpen(false)} start={start} />}
    </MenuDropdown>
  )
}

function TabMenus() {
  const [asking, setAsking] = useState<Offered>()
  const start = (action: Offered) => Object.keys(action.handle.open).length && setAsking(action)

  return (
    <States min={260}>
      <State label="at an issue: its actions under its name, asks first and dotted, the view's groups, Go with the dots on the way, the controls">
        <MenuAt route="/issues/4" label="Queue at /issues/4" start={start} />
      </State>
      <State label="at /: the surface's actions, Go of more than 8 places with a filter; type to search the whole tree">
        <MenuAt route="/" label="Queue at /" start={start} />
      </State>
      <Asking {...(asking && { action: asking })} close={() => setAsking(undefined)} />
    </States>
  )
}

const SURFACES: SurfaceEntry[] = [
  { name: "queue", description: "Track the session's work as issues. Use when work is asked for.", open: handle("open", "Open a queue tab", { surface: "queue" }) },
  { name: "design", description: "Inspect what an agent is given. Use when baba's words change.", open: handle("open", "Open a design tab", { surface: "design" }) },
  { name: "settings", description: "The person's settings. Use when they ask to change one.", open: handle("open", "Open the settings", { surface: "settings" }) },
  { name: "notes", broken: "src/surface.ts: Unexpected end of file" },
]
const HOME_TABS: TabEntry[] = [
  { at: "/queue", n: 3, surface: "queue", label: "Queue", icon: ICONS.queue, needs: [{ who: "person", why: "to approve or drop 1 draft" }] },
  { at: "/tabs/2", n: 2, surface: "lab", label: "Lab", icon: ICONS.lab, needs: [{ who: "agent", why: "to read the run" }] },
  { at: "/tabs/1", n: 1, surface: "lab", label: "Lab 1", icon: ICONS.lab, broken: "its saved state does not load" },
]

function HomeSpecimen() {
  const box = useRef<HTMLDivElement>(null)

  // Home takes the focus as it is drawn, as it should in the shell; here the guide keeps it.
  useEffect(() => {
    if (box.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }, [])

  return (
    <States>
      <State label="the open tabs, what each needs, the previous one; the surfaces to open; one that does not load" wide className="flex h-[26rem] flex-col items-stretch overflow-hidden p-0">
        <div ref={box} className="contents">
          <Home
            title="babavoss"
            surfaces={SURFACES}
            icons={ICONS}
            tabs={HOME_TABS}
            back={HOME_TABS[1]}
            keys="⌘P"
            disabled={false}
            loading={false}
            launch={() => {}}
            select={() => {}}
          />
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

/** The toasts the shell raises for notices heard: who did it, what, and from which tab; one goes to its place, the rest into the button. */
const HEARD: ToastItem[] = [
  { id: 1, text: "Issue 4, Show the present, is done", title: "Queue", mark: <Mark label={BY.agent}>{MARK.agent}</Mark>, onSelect: () => {} },
  { id: 2, text: "The run ended", title: "Lab", mark: <Mark label={BY.surface}>{MARK.surface}</Mark>, onSelect: () => {} },
  { id: 3, text: "Saved", title: "Settings", mark: <Mark label={BY.person}>{MARK.person}</Mark> },
]

function Notices() {
  const button = useRef<HTMLButtonElement>(null)
  const { shown, dismiss, again } = useHeld(HEARD)

  return (
    <div className="flex flex-col gap-3">
      <States min={110}>
        {[
          { label: "idle", badge: 0, waiting: 0, open: false },
          { label: "unseen", badge: 2, waiting: 0, open: false },
          { label: "waiting: 3", badge: 0, waiting: 3, open: false },
          { label: "both", badge: 1, waiting: 12, open: false },
          { label: "open", badge: 0, waiting: 0, open: true },
        ].map((s) => (
          <State key={s.label} label={s.label} className="justify-center bg-sidebar">
            <ActivityButton badge={s.badge} waiting={s.waiting} open={s.open} onClick={() => {}} />
          </State>
        ))}
      </States>
      <States>
        <State label="toasts: a dismissed or passed one goes into the button" wide className="flex-col items-stretch gap-0 overflow-hidden p-0">
          <div className="flex h-11 items-center justify-end border-b bg-sidebar px-2">
            <ActivityButton ref={button} badge={HEARD.length - shown.length} waiting={0} open={false} onClick={() => {}} />
          </div>
          <div className="flex min-h-36 flex-col items-end gap-2 p-2">
            <Toasts toasts={shown} dismiss={dismiss} into={button} className="static" from="top" />
            <Again onClick={again} />
          </div>
        </State>
      </States>
    </div>
  )
}

/** The drawer's levels with sample activity, worked as the drawer works them: entering a channel, back, Notices and All. */
function Drawer({ initial, rows = ROWS, open: opened = false }: { initial?: string; rows?: typeof ROWS; open?: boolean }) {
  const [shown, setShown] = useState<Shown>("notices")
  const [entered, setEntered] = useState<Entered | undefined>(() => (initial ? { key: initial, stay: new Set(FRESH), since: rows[0]?.n ?? 0 } : undefined))
  const [expanded, setExpanded] = useState<number>()
  const [nextOpen, setNextOpen] = useState(opened)
  const [backed, setBacked] = useState(false)
  const fresh = new Set(FRESH)
  const channels = channelsOf(inView(rows, shown), TABS, rows.length ? NEEDS : [], fresh, "babavoss", TITLES_BY_TAB)
  const channel: Channel | undefined = entered && channels.find((c) => c.key === entered.key)

  return (
    <Sheet open>
      <div className="flex h-[26rem] w-full flex-col overflow-hidden rounded-lg border bg-popover text-body text-popover-foreground">
        <ActivityLevels
          {...(channel && entered && { channel, entered })}
          icons={ICONS}
          elsewhere={!!channel}
          leave={() => {
            setEntered(undefined)
            setBacked(true)
          }}
          goTo={() => {}}
          expanded={expanded}
          expand={setExpanded}
          shown={shown}
          show={setShown}
          unseen={rows.filter((r) => fresh.has(r.n)).length}
          seeAll={() => {}}
          next={waitingRows(rows, 2)}
          tabs={TABS}
          nextOpen={nextOpen}
          toggleNext={() => setNextOpen((o) => !o)}
          channels={channels}
          since={rows[0]?.n ?? 0}
          enter={(key) => setEntered({ key, stay: new Set(FRESH), since: rows[0]?.n ?? 0 })}
          backed={backed}
          {...(rows.length && { more: () => {} })}
        />
      </div>
    </Sheet>
  )
}

function Activity() {
  return (
    <States min={320}>
      <State label="channels: needs you pinned, unseen dotted, a closed tab's; choose one" bare>
        <Drawer />
      </State>
      <State label="the agent sees next, opened" bare>
        <Drawer open />
      </State>
      <State label="a channel's history, grouped by when, a line opened whole; back with ←" bare>
        <Drawer initial="/queue" />
      </State>
      <State label="nothing yet" bare>
        <Drawer rows={[]} />
      </State>
    </States>
  )
}

function Connection() {
  const lost = said("lost", Infinity)!
  const connecting = said("connecting", Infinity)!

  return (
    <States min={220}>
      <State label={`${connecting.toLowerCase()}: the page never had its stream`} className="justify-center bg-sidebar">
        <HomeTab active={false} standing={STILL} animate keys="⌘P" lost={connecting} onSelect={() => {}} />
      </State>
      <State label={`${lost.toLowerCase()}: it had it and lost it`} className="justify-center bg-sidebar">
        <HomeTab active={false} standing={STILL} animate keys="⌘P" lost={lost} onSelect={() => {}} />
      </State>
      <State label="over the content: a refusal, and where the agent points while you are busy" wide className="relative block h-40 overflow-hidden p-0">
        <div className="p-3 pt-28 text-muted-foreground">The tab's content, unmoved under them.</div>
        <Overlay>
          <RefusedAlert reason="Lane 1 is delivering issue 4" dismiss={() => {}} />
          <PointedAlert label="Queue" route="/issues/7" go={() => {}} dismiss={() => {}} />
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
  strip: Strip,
  "tab-menu": TabMenus,
  home: HomeSpecimen,
  inputs: InputsSpecimen,
  notices: Notices,
  activity: Activity,
  connection: Connection,
  "tab-states": TabStates,
}
