// The shell page: the shell's view at / drives the rail and home; each tab, the home of one instance of a surface with
// its own state, shows its surface's component. The rail stands at the side of the page the person chose (rail.tsx):
// the mark first, home's tab, which is also whose move it is (turn.ts), then the open tabs newest first. A tab's content
// fills the rest, or home, the shell's own page, a desktop or the project's own (home.tsx). Every tab, home included, has
// a drawer (drawer.tsx): its menu, drawn from its surface's views as home's is from the shell's at /, over its activity
// as a thread; opening it sees the notices in it. A notice heard while the page is open is a bubble beside its tab for a
// moment (bubbles.tsx). A tab the person opens becomes theirs to look at; one the agent opens takes its place beside the
// mark, marked until looked at, and the person stays where they are. A tab that is broken, needs someone, offers an ask or
// holds a notice not yet seen is marked on the rail and on home, from / where the shell gathers who is needed and counts
// each tab's asks. While the session's hooks are not heard, as the turn says, the mark has a dot, home's drawer pins why
// and what to do, and as that begins it is a bubble beside the mark, kept in home's thread. The URL is the surface path:
// / home, also where no tab is, a tab's address and its route; the address is /NAME where the tab holds its surface's
// name, else /tabs/N, and /tabs/N of a tab at /NAME stands for it. When the
// agent points to a place, the page goes there, or offers it while the person is busy (pointing.ts). The person's settings,
// their own surface's that comes with the shell, are applied here: the appearance and where the rail stands, the shortcuts
// (shortcuts.ts) and the mark's animation (appearance.ts); and with the machine they make the conventions, handed to every
// page, home's too (src/conventions.ts). It loads no stylesheet: the root's page does, one, which
// imports the shell's styles.css, so the shell's styles are compiled once.
import { Activity, Component, startTransition, Suspense, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentType, type ReactNode } from "react"
import type { Args, Handle, View } from "../../core/index.ts"
import { cn } from "../../kit/cn.ts"
import { call, changes, read, type Notice, type Turn, type Unheard } from "./client.ts"
import { Actions, useTabAsks, useTabMenu } from "./actions.tsx"
import { controlsOf, named, noticesIn, type Offered } from "./commands.ts"
import { added, Bubbles, gone, type Bubble } from "./bubbles.tsx"
import { Drawer } from "./drawer.tsx"
import { ACTIVITY, NOTICES, useFeed, type Feed, type Page as NoticesPage } from "./feed.ts"
import { Desktop, Foot } from "./home.tsx"
import { homeMenu, type HomeProps, type SurfaceEntry } from "./home.ts"
import { Inputs, type Drawers } from "./inputs.tsx"
import * as settingsPage from "../settings/ui/index.tsx"
import { useSettings } from "./appearance.ts"
import { choiceIn, nameOf, numbersOf, type Rail as Placed } from "../settings/src/settings.ts"
import { Logo } from "./mark.tsx"
import { useShortcuts } from "./shortcuts.ts"
import { ChangesContext, ConventionsContext, Ready, ServicesContext, TabProvider, tabCache, type ShellServices } from "./tab.tsx"
import { boot, booted, servedAs } from "./boot.ts"
import { Overlay, PointedAlert, RefusedAlert, useSaid, type Connected } from "./connection.tsx"
import { cachesBy } from "./live.ts"
import { arrival, HOME, placeOf, pointedSince, typingIn, type Pointed } from "./pointing.ts"
import { awayOf, cycled, doesOf, drawerSide, homeMarkOf, markOf, newestFirst, onScreen, standing, successor, type Mark, type TabNeed } from "./rail.ts"
import { Rail, tabId, type RailItem } from "./rail.tsx"
import { entriesIn, freshIn, knownAfter, pinnedOf, placeIn, shellEntries, tabIn, unheardLine, unheardPinned, waitingRows, withUnheard, type Row as Entry } from "./thread.ts"
import { TabBroken, TabContent, TabFailed, TabNoPage } from "./tabs.tsx"
import { standingOf } from "./turn.ts"

/**
 * Each surface's page module: its component, the default export; the icon the rail and home show; and the
 * drawers its frame opens for the inputs of the actions they are named for.
 */
export type Registry = Record<string, { default: ComponentType; icon?: ReactNode; drawers?: Drawers }>
/** A tab as the desktop lists it; `broken` says why its surface fails on what it keeps; `asks`, how many it offers the person anywhere in it. */
type Row = { at: string; n: number; surface: string; title?: string; close?: Handle; broken?: string; asks?: number }
/** A tab that is needed, as / gathers it. */
type Need = { at: string; surface: string } & TabNeed
type RootView = { title: string; needs?: Need[]; missing?: string; empty?: string; surfaces: SurfaceEntry[]; tabs: Row[]; pointed?: Pointed }
/** A tab as the page draws it: its row at /, what it is called, its icon, who it needs, and its mark. */
type Tab = { row: Row; label: string; icon: ReactNode; needs: TabNeed[]; mark?: Mark; why: string[]; fresh: boolean }
/** A notice as the shell hears it: from the stream, or a page's own passing word, `kept: false`, which is in no log and goes to its place. */
type Heard = Notice & { kept?: false }

const parse = () => placeOf(location.pathname)
const urlOf = (key: string, route = "/") => (key === HOME ? "/" : key + (route === "/" ? "" : route))
/** The pages of the surfaces that come with the shell, beside the project's. */
const OWN: Registry = { settings: settingsPage }
const SIDES: Record<Placed["side"], string> = { left: "flex-row", right: "flex-row-reverse", top: "flex-col", bottom: "flex-col-reverse" }

class Failing extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  render() {
    if (this.state.error === undefined) return this.props.children

    return <TabFailed error={this.state.error} retry={() => this.setState({ error: undefined })} />
  }
}

export function Shell({ surfaces: project, home: OwnHome }: { surfaces: Registry; home?: ComponentType<HomeProps> }) {
  const surfaces = useMemo(() => ({ ...project, ...OWN }), [project])
  const { settings, mode, conventions, again: settingsAgain } = useSettings()
  const placed = settings.appearance.rail
  // What the page was served with is its first frame: the shell at /, the turn, the notices, and the shown tab's views.
  const [root, setRoot] = useState<RootView | undefined>(() => booted<RootView>("/"))
  const [error, setError] = useState("")
  const [connected, setConnected] = useState<Connected>("connecting")
  // What the page says of a stream it lost, under the mark, whose eyes sleep meanwhile; nothing on a normal load.
  const lost = useSaid(connected)
  const [at, setAt] = useState(parse)
  const [routes, setRoutes] = useState<Record<string, string>>(() => (at.key.startsWith("/") ? { [at.key]: at.route } : {}))
  const [listeners] = useState(() => new Set<() => void>())
  // Each tab's asks, which mark it.
  const asks = useTabAsks()
  const [, asksMoved] = useReducer((n: number) => n + 1, 0)
  // The action asking its inputs in a modal, by the tab it is of, or home; and the last refusal of one, by its tab.
  const [asking, setAsking] = useState<{ at: string; action: Offered }>()
  const [refused, setRefused] = useState<{ at: string; reason: string }>()
  // Each tab's reloads: raising one reads its views again.
  const [reloads, setReloads] = useState<Record<string, number>>({})
  const up = useRef(false)
  // Each tab's views, read once for its page and its menu, kept while it is open; the shown tab's seeded with the page.
  const [caches] = useState(() => cachesBy((address) => tabCache(address, boot().views)))
  const stream = useMemo(
    () => ({
      subscribe: (fn: () => void) => {
        listeners.add(fn)

        return () => void listeners.delete(fn)
      },
      connected: () => up.current,
      cacheOf: caches.of,
    }),
    [listeners, caches]
  )
  const rows = root?.tabs ?? []
  const settingsOpen = useRef(false)

  settingsOpen.current = rows.some((r) => r.surface === "settings")
  // A tab's number in the URL, where the tab stands at its surface's name: the page goes on at that address.
  const numbered = rows.find((r) => at.key === `/tabs/${r.n}` && r.at !== at.key)?.at
  const active = at.key === HOME || rows.some((r) => r.at === at.key) ? at.key : (numbered ?? HOME)
  const icons = useMemo(() => Object.fromEntries(Object.entries(surfaces).map(([name, s]) => [name, s.icon])), [surfaces])
  const newest = useMemo(() => newestFirst(rows), [rows])
  // Who hears each notice as it comes: the bubbles.
  const [hearers] = useState(() => new Set<(notice: Heard) => void>())
  // The tabs the person has looked at, or that were open when the page loaded: any other was opened by the agent since.
  const [seen, setSeen] = useState<ReadonlySet<string> | undefined>(() => root && new Set([...root.tabs.map((r) => r.at), active]))
  // Whose move it is, as the runtime hears it from the harness's hooks.
  const [turn, setTurn] = useState<Turn | undefined>(() => boot().turn)
  const standingNow = standingOf(turn)
  // Each stretch of the hooks' silence the page has known, kept in home's thread; one that begins while it is open is a bubble.
  const [known, setKnown] = useState<readonly Unheard[]>(() => knownAfter([], boot().turn?.unheard))
  const knownNow = useRef(known)
  // The notices, read once: what marks the tabs until seen.
  const [servedNotices] = useState(() => booted<NoticesPage>(NOTICES))
  const told = useFeed(NOTICES, stream, true, servedNotices)
  const served = useRef(root !== undefined)
  const unseen = useMemo(() => told.rows.filter((r) => told.fresh.includes(r.n)), [told.rows, told.fresh])
  // The entry whose drawer is open, a tab's address or home; the notices new in it as it opened; and all activity, read while it is open.
  const [drawer, setDrawer] = useState<string>()
  const [stay, setStay] = useState<ReadonlySet<number>>(new Set())
  const all = useFeed(ACTIVITY, stream, drawer !== undefined)
  const [bubbles, setBubbles] = useState<Record<string, Bubble[]>>({})

  useEffect(() => asks.subscribe(asksMoved), [asks])

  useEffect(() => {
    const load = () => read<RootView>("/").then(setRoot, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    let first = true
    let ever = false

    if (!served.current) void load()

    return changes(
      (change) => {
        const opening = first

        first = false
        // The stream's first change, of the version the page was served, says nothing new: what is shown is so.
        if (servedAs(opening && served.current, change.version)) return
        caches.changed()
        void load()
        // A settings tab of this session may have changed them, also while it is not shown: they are read again.
        if (settingsOpen.current) settingsAgain()
        for (const fn of listeners) fn()
      },
      (connected, asleep) => {
        // Coming up the first time changes nothing; going down, or coming back, is told.
        if (up.current !== connected && ever) for (const fn of listeners) fn()
        ever ||= connected
        up.current = connected
        setConnected((was) => (connected ? "up" : asleep ? "asleep" : was === "connecting" ? "connecting" : "lost"))
      },
      (notice) => {
        for (const fn of hearers) fn(notice)
      },
      (next) => {
        const after = knownAfter(knownNow.current, next.unheard)

        setTurn(next)
        if (after === knownNow.current || !next.unheard) return
        knownNow.current = after
        setKnown(after)
        for (const fn of hearers) fn({ text: unheardLine(next.unheard) })
      }
    )
  }, [listeners, hearers, settingsAgain, caches])

  // A closed tab's views go with it.
  useEffect(() => {
    if (root) caches.keep(root.tabs.map((r) => r.at))
  }, [root, caches])

  // A tab's page is drawn once it is first shown, and kept: a tab not yet looked at reads nothing.
  const [drawn, setDrawn] = useState<ReadonlySet<string>>(() => new Set([at.key]))

  useEffect(() => {
    document.title = root?.title ?? "babavoss"
  }, [root?.title])

  useLayoutEffect(() => {
    const navigate = () => {
      const next = parse()

      if (next.key.startsWith("/")) setRoutes((previous) => ({ ...previous, [next.key]: next.route }))
      setAt(next)
    }

    window.addEventListener("popstate", navigate)

    return () => window.removeEventListener("popstate", navigate)
  }, [])

  useEffect(() => {
    if (root) setSeen((s) => (!s ? new Set([...root.tabs.map((r) => r.at), active]) : s.has(active) ? s : new Set([...s, active])))
  }, [root, active])

  useEffect(() => {
    setDrawn((d) => (d.has(active) ? d : new Set([...d, active])))
  }, [active])

  // A drawer belongs to the tab shown: moving elsewhere, as where the agent points, closes it.
  useEffect(() => {
    if (drawer !== undefined && drawer !== active) setDrawer(undefined)
  }, [active, drawer])

  useLayoutEffect(() => {
    if (!numbered) return
    setRoutes((previous) => ({ ...previous, [numbered]: at.route }))
    setAt({ key: numbered, route: at.route })
    history.replaceState(null, "", urlOf(numbered, at.route))
  }, [numbered])

  // A closed tab in the URL falls back to home.
  useEffect(() => {
    if (root && at.key !== active && !numbered) history.replaceState(null, "", urlOf(active, routes[active]))
  }, [root, at.key, active, routes, numbered])

  const go = (key: string, route?: string) => {
    const url = urlOf(key, route ?? routes[key])

    if (location.pathname !== url) history.pushState(null, "", url)

    const move = () => {
      if (route) setRoutes((previous) => ({ ...previous, [key]: route }))
      setAt({ key, route: route ?? routes[key] ?? "/" })
    }

    // Moving within the tab shown keeps it as it is until what the new place reads is known; another tab is shown at once.
    if (key === at.key) startTransition(move)
    else move()
  }
  const act = async (path: string, handle: Handle) => {
    setError("")
    try {
      const result = await call<RootView>(path, handle.name, handle.args)

      if (result.outcome === "refused") setError(result.reason)
      else {
        setRoot(result.view)

        return result.view
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const open = async (handle: Handle) => {
    const view = await act("/", handle)
    const opened = newestFirst(view?.tabs.filter((r) => r.surface === handle.args.surface) ?? [])[0]

    if (opened) go(opened.at, "/")
  }

  // What a page may ask of the shell (useShell), the same object while the appearance holds: it reaches what is current.
  const now = useRef({ go, open, rows, root, setError })

  now.current = { go, open, rows, root, setError }

  const choice = choiceIn(settings.appearance, mode)
  const theme = nameOf(choice)
  const { hue, tint, vivid } = numbersOf(choice)
  const services = useMemo<ShellServices>(
    () => ({
      open: async (surface) => {
        const { go, open, rows, root, setError } = now.current
        const opened = newestFirst(rows.filter((r) => r.surface === surface))[0]
        const handle = root?.surfaces.find((s) => s.name === surface)?.open

        if (opened) go(opened.at)
        else if (handle) await open(handle)
        else setError(`there is no surface ${surface} to open`)
      },
      go: (at) => now.current.go(placeOf(at).key, placeOf(at).route),
      toast: (address, text, at) => {
        for (const fn of hearers) fn({ text, at: address + (at && at !== "/" ? at : ""), kept: false })
      },
      appearance: { mode, theme, numbers: { hue, tint, vivid } },
    }),
    [hearers, mode, theme, hue, tint, vivid]
  )

  // Pointing: the agent's show moves `pointed` at /; the page goes there, or offers it while the person is busy.
  const [offer, setOffer] = useState<Pointed>()
  const pointedSeen = useRef<number>(undefined)
  const acted = useRef(0)
  const offered = offer && placeOf(offer.at)

  useEffect(() => {
    const mark = () => void (acted.current = Date.now())
    const kinds = ["pointerdown", "keydown", "wheel"] as const

    for (const kind of kinds) window.addEventListener(kind, mark, { capture: true, passive: true })

    return () => {
      for (const kind of kinds) window.removeEventListener(kind, mark, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!root) return

    const { seen, fresh } = pointedSince(pointedSeen.current, root.pointed)

    pointedSeen.current = seen
    if (!fresh) return

    const place = placeOf(fresh.at)

    if (!root.tabs.some((r) => r.at === place.key) || (place.key === at.key && place.route === at.route)) return setOffer(undefined)
    if (arrival({ typing: typingIn(document.activeElement), acted: acted.current }, Date.now()) === "go") {
      setOffer(undefined)
      go(place.key, place.route)
    } else setOffer(fresh)
  }, [root])

  // An offer the person took up by going there themselves is done.
  useEffect(() => {
    if (offered && offered.key === at.key && offered.route === at.route) setOffer(undefined)
  }, [offered?.key, offered?.route, at.key, at.route])

  const close = async (row: Row) => {
    if (!row.close) return
    await act("/", row.close)
    if (active === row.at) go(successor(newest, row.at) ?? HOME)
  }
  const closeOthers = async (row: Row) => {
    for (const other of newest) if (other.at !== row.at && other.close) await act("/", other.close)
    if (active !== row.at && active !== HOME) go(row.at)
  }
  // An action of a tab, wherever it was chosen: one that asks for inputs opens its modal in the tab, shown first; another
  // is called at once, and a refusal shows the tab with why.
  const start = (row: Row, action: Offered) => {
    if (Object.keys(action.handle.open).length || surfaces[row.surface]?.drawers?.[action.handle.name]) {
      setAsking({ at: row.at, action })
      if (active !== row.at) go(row.at)

      return
    }
    void call(row.at + (action.path === "/" ? "" : action.path), action.handle.name, action.handle.args).then(
      (answer) => {
        if (answer.outcome !== "refused") return setRefused((r) => (r?.at === row.at ? undefined : r))
        setRefused({ at: row.at, reason: answer.reason })
        if (active !== row.at) go(row.at)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e))
    )
  }
  // An action of the shell's, from home's menu: one that asks for inputs opens the same modal over home; another is called
  // at once, and a tab it opens is gone to.
  const startHome = (action: Offered) => {
    if (Object.keys(action.handle.open).length) return setAsking({ at: HOME, action })
    if (action.handle.name === "open") void open(action.handle)
    else void act("/", action.handle)
  }
  const answerHome = async (action: Offered, inputs: Args): Promise<string | undefined> => {
    const answer = await call<RootView>("/", action.handle.name, { ...action.handle.args, ...inputs })

    if (answer.outcome === "refused") return answer.reason
    setRoot(answer.view)

    return undefined
  }
  // The shell's own controls, the same in every tab's menu.
  const controls = (row: Row) =>
    controlsOf({
      ...(row.close && { close: { hint: row.close.description, run: () => void close(row) } }),
      ...(newest.some((other) => other.at !== row.at && other.close) && { others: () => void closeOthers(row) }),
      link: location.origin + urlOf(row.at, routes[row.at]),
      reload: () => setReloads((r) => ({ ...r, [row.at]: (r[row.at] ?? 0) + 1 })),
    })

  // Going where an unseen notice is about sees it.
  useEffect(() => {
    if (!active.startsWith("/")) return

    const here = active + ((routes[active] ?? "/") === "/" ? "" : routes[active])
    const there = unseen.filter((n) => n.at === here && here !== active)

    if (!there.length) return
    void Promise.all(there.map((n) => call(NOTICES, "looked", { n: n.n }))).then(() => told.load(), () => undefined)
  }, [active, routes, unseen])

  // A tab waits on the person where it offers them an ask, at any depth as / counts them, or where it is shown, or holds a notice not seen.
  const noticesOf = (at: string) => noticesIn(at, unseen).length
  const asksOf = (row: Row) => Math.max(row.asks ?? 0, asks.count(row.at))
  const tabs: Tab[] = newest.map((row) => {
    const needs = (root?.needs ?? []).filter((need) => need.at === row.at).map(({ who, why }) => ({ who, why }))
    const fresh = !!seen && !seen.has(row.at) && row.at !== active
    const marks = { needs, ...(row.broken !== undefined && { broken: row.broken }) }
    const mark = markOf({ ...marks, unseen: fresh, waits: asksOf(row) > 0 || noticesOf(row.at) > 0 })

    return {
      row,
      label: row.title ?? `${named(row.surface)} ${row.n}`,
      icon: icons[row.surface] ?? <span className="size-3.5 rounded-full bg-foreground/30" aria-hidden />,
      needs,
      ...(mark && { mark }),
      why: standing({ ...marks, asks: asksOf(row), notices: noticesOf(row.at), unseen: fresh }),
      fresh,
    }
  })
  const title = root?.title ?? "babavoss"

  // Opening a drawer shows its tab and sees the notices in it, which keep their dot while it stays; closing it gives focus back to the tab.
  const openDrawer = (key: string) => {
    const mine = freshIn(key === HOME ? shellEntries(told.rows) : entriesIn(told.rows, key), told.fresh)

    if (key !== active) go(key)
    setStay(new Set(mine))
    setDrawer(key)
    if (mine.length) void Promise.all(mine.map((n) => call(NOTICES, "looked", { n }))).then(() => told.load(), () => undefined)
  }
  const closeDrawer = () => {
    const was = drawer

    setDrawer(undefined)
    // Unless what was chosen opened a modal, which keeps the focus.
    if (was !== undefined)
      requestAnimationFrame(() => {
        if (!document.querySelector('[role="dialog"][data-state="open"]')) document.getElementById(tabId(was))?.focus()
      })
  }
  // The rail has shown the entry where a gesture asked for it already: this opens or closes its drawer.
  const toggle = (key: string) => (drawer === key ? closeDrawer() : openDrawer(key))

  // Escape closes the drawer from anywhere, unless a modal over it takes it first.
  useEffect(() => {
    if (drawer === undefined) return

    const press = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"]')) return
      e.preventDefault()
      closeDrawer()
    }

    window.addEventListener("keydown", press)

    return () => window.removeEventListener("keydown", press)
  })

  // Each notice heard is a bubble beside its tab, or the mark where it is in none; not while that tab's drawer, which shows it, is open.
  const hearing = useRef({ drawer, rows })

  hearing.current = { drawer, rows }
  useEffect(() => {
    const hear = (notice: Heard) => {
      const tab = tabIn(notice.at)
      const key = tab && hearing.current.rows.some((r) => r.at === tab) ? tab : HOME

      if (hearing.current.drawer === key) return

      const bubble: Bubble = {
        id: Date.now() + Math.random(),
        text: notice.text,
        ...(key === HOME && notice.from && { from: named(notice.from) }),
        ...(notice.at && { at: notice.at }),
        kept: notice.kept !== false,
      }

      setBubbles((was) => added(was, key, bubble))
    }

    hearers.add(hear)

    return () => void hearers.delete(hear)
  }, [hearers])

  const order = onScreen(HOME, newest.map((r) => r.at), placed)
  const focusedOnRail = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-rail-id]")?.dataset.railId

  useShortcuts(settings.keys, {
    drawer: () => {
      const key = drawer ?? focusedOnRail() ?? active

      for (const does of doesOf("shortcut", { shown: key === active, open: drawer === key })) {
        if (does === "close") closeDrawer()
        if (does === "open") openDrawer(key)
      }
    },
    next: () => go(cycled(order, active, 1) ?? HOME),
    previous: () => go(cycled(order, active, -1) ?? HOME),
  })

  const shownTab = tabs.find((t) => t.row.at === drawer)
  const homeTabs = tabs.map((t) => ({ at: t.row.at, surface: t.row.surface, label: t.label, icon: t.icon, ...(t.mark && { mark: t.mark }), go: () => go(t.row.at) }))
  const HomePage = OwnHome ?? Desktop
  const homeMark = homeMarkOf(turn?.unheard)
  const homePinned = unheardPinned(turn?.unheard)
  const rail: { mark: RailItem; tabs: RailItem[] } = {
    mark: {
      id: HOME,
      label: "Home",
      icon: <Logo standing={standingNow} animate={settings.logo.animate} lost={!!lost} />,
      ...(homeMark && { mark: homeMark }),
      why: [lost ?? standingNow.said, ...(turn?.unheard ? [unheardLine(turn.unheard)] : [])],
    },
    tabs: tabs.map((t) => ({
      id: t.row.at,
      label: t.label,
      icon: t.icon,
      ...(t.mark && { mark: t.mark }),
      why: t.why,
      fresh: t.fresh,
      ...(t.row.close && { close: () => void close(t.row) }),
    })),
  }

  return (
    <ChangesContext.Provider value={stream}>
      <ServicesContext.Provider value={services}>
        <ConventionsContext.Provider value={conventions}>
          <div className={cn("flex h-dvh min-h-64 overflow-hidden text-body", SIDES[placed.side])}>
            <Rail placed={placed} mark={rail.mark} tabs={rail.tabs} active={active} {...(drawer !== undefined && { drawer })} select={(key) => go(key)} toggle={toggle} />
            <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Over the content, never above it: nothing that comes or goes here moves the page. */}
              <Overlay>
                {error && <RefusedAlert reason={error} dismiss={() => setError("")} />}
                {offer && offered && (
                  <PointedAlert
                    label={tabs.find((t) => t.row.at === offered.key)?.label ?? offered.key}
                    route={offered.route}
                    go={() => go(offered.key, offered.route)}
                    dismiss={() => setOffer(undefined)}
                  />
                )}
              </Overlay>
              {active === HOME && (
                <TabContent address={HOME} hidden={false}>
                  <Failing>
                    <HomePage
                      title={title}
                      {...((root?.missing ?? root?.empty) && { notice: root?.missing ?? root?.empty })}
                      surfaces={(root?.surfaces ?? []).map((s) => ({
                        name: s.name,
                        label: named(s.name),
                        description: s.description ?? "",
                        icon: icons[s.name],
                        ...(s.broken !== undefined && { broken: s.broken }),
                        ...(s.open && s.broken === undefined && { open: () => void open(s.open!) }),
                      }))}
                      tabs={homeTabs}
                      foot={<Foot {...(turn?.harness && { harness: turn.harness })} />}
                    />
                  </Failing>
                </TabContent>
              )}
              {rows.map((row) => {
                const Page = surfaces[row.surface]?.default
                const visible = active === row.at

                return (
                  // By number too: a tab opened again at its surface's name is another, drawn anew.
                  <TabContent key={`${row.at} ${row.n}`} address={row.at} hidden={!visible}>
                    <Activity mode={visible ? "visible" : "hidden"}>
                      {!visible && !drawn.has(row.at) ? null : row.broken !== undefined ? (
                        <TabBroken why={row.broken} />
                      ) : Page ? (
                        <Failing>
                          <TabProvider
                            address={row.at}
                            surface={row.surface}
                            route={routes[row.at] ?? "/"}
                            active={visible}
                            navigate={(route) => go(row.at, route)}
                            reload={reloads[row.at] ?? 0}
                          >
                            <Actions
                              asks={asks}
                              title={row.title}
                              name={row.surface}
                              drawers={surfaces[row.surface]?.drawers}
                              start={(action) => start(row, action)}
                              {...(asking?.at === row.at && { asking: asking.action })}
                              answered={() => setAsking(undefined)}
                              {...(refused?.at === row.at && { refused: refused.reason })}
                              dismiss={() => setRefused(undefined)}
                            >
                              <Ready>
                                <Page />
                              </Ready>
                            </Actions>
                          </TabProvider>
                        </Failing>
                      ) : (
                        <TabNoPage surface={row.surface} />
                      )}
                    </Activity>
                  </TabContent>
                )
              })}
              {drawer === HOME && active === HOME && (
                <Drawer
                  label={title}
                  side={drawerSide(placed)}
                  home
                  menu={{
                    items: homeMenu({ view: root as View | undefined, title, tabs: homeTabs, start: startHome, navigate: (at) => go(placeOf(at).key, placeOf(at).route) }),
                    empty: "Nothing to do here yet",
                  }}
                  rows={withUnheard(shellEntries(all.rows), known)}
                  loaded={all.loaded}
                  {...(all.earlier && { more: all.more })}
                  stay={stay}
                  {...(homePinned && { pinned: homePinned })}
                  waiting={waitingRows(all.rows, standingNow.waiting)}
                  go={(entry) => {
                    closeDrawer()
                    if (entry.at && entry.at !== "/") go(placeOf(entry.at).key, placeOf(entry.at).route)
                  }}
                  goThere={(at) => go(placeOf(at).key, placeOf(at).route)}
                  reload={() => {}}
                  close={closeDrawer}
                />
              )}
              {shownTab && shownTab.row.at === active && (
                <TabDrawer
                  key={shownTab.row.at}
                  tab={shownTab}
                  side={drawerSide(placed)}
                  paged={!!surfaces[shownTab.row.surface]?.default}
                  route={routes[shownTab.row.at] ?? "/"}
                  feed={all}
                  stay={stay}
                  notices={noticesIn(shownTab.row.at, unseen)}
                  controls={controls(shownTab.row)}
                  start={(action) => start(shownTab.row, action)}
                  navigate={(route) => go(shownTab.row.at, route)}
                  reload={() => setReloads((r) => ({ ...r, [shownTab.row.at]: (r[shownTab.row.at] ?? 0) + 1 }))}
                  close={closeDrawer}
                />
              )}
            </main>
            <Bubbles
              bubbles={bubbles}
              away={awayOf(placed)}
              open={openDrawer}
              go={(at) => go(placeOf(at).key, placeOf(at).route)}
              dismiss={(key, id) => setBubbles((was) => gone(was, key, id))}
            />
            {asking?.at === HOME && (
              <Suspense fallback={null}>
                <Inputs action={asking.action} {...(root && { view: root as View })} call={answerHome} close={() => setAsking(undefined)} />
              </Suspense>
            )}
          </div>
        </ConventionsContext.Provider>
      </ServicesContext.Provider>
    </ChangesContext.Provider>
  )
}

/** A tab's drawer: its menu, read from its surface's views as it opens, over its entries; what its mark says pinned at the foot. */
function TabDrawer({
  tab,
  side,
  paged,
  route,
  feed,
  stay,
  notices,
  controls,
  start,
  navigate,
  reload,
  close,
}: {
  tab: Tab
  side: "left" | "right"
  /** Whether its surface has a page: a tab of one that has none, or that is broken, offers the shell's controls alone. */
  paged: boolean
  route: string
  feed: Feed
  stay: ReadonlySet<number>
  notices: string[]
  controls: ReturnType<typeof controlsOf>
  start: (action: Offered) => void
  navigate: (route: string) => void
  reload: () => void
  close: () => void
}) {
  const { row } = tab
  const menu = useTabMenu({ address: row.at, route, ...(row.title !== undefined && { title: row.title }), name: row.surface, start, navigate, notices, controls })
  const plain = row.broken !== undefined || !paged
  const pinned = pinnedOf({ needs: tab.needs, ...(row.broken !== undefined && { broken: row.broken }), ...(!plain && menu.ask && { ask: menu.ask }) })
  const goTo = (entry: Entry) => {
    close()
    navigate(placeIn(entry, row.at) ?? "/")
  }

  return (
    <Drawer
      label={tab.label}
      side={side}
      menu={plain ? { items: controls } : { items: menu.items, find: menu.find, ...(!menu.ready && { empty: "Reading…" }) }}
      rows={entriesIn(feed.rows, row.at)}
      loaded={feed.loaded}
      {...(feed.earlier && { more: feed.more })}
      stay={stay}
      {...(pinned && { pinned })}
      go={goTo}
      goThere={(at) => {
        close()
        navigate(at)
      }}
      reload={() => {
        close()
        reload()
      }}
      close={close}
    />
  )
}

export type { View }
