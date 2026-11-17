// The shell: the root surface of a .baba/, which the framework provides. It holds the project's surfaces, each opened as a
// tab as often as wanted, and at / it is the desktop: every surface with what it is for and `open`, and every open tab
// with its surface's facts, so what changes in a tab is in the agent's present. A tab stands at its address and its surface's
// own paths below it: /NAME, the surface's name, for the tab that holds it, which is the one opened while no other tab of
// that surface held it, until it closes; /tabs/N for another, and for any tab, always. So a path written down survives the
// tab being closed and opened again, and never moves to another open tab. The surface never knows: the paths its views name
// under `at`, and its notices, are given whole, below the tab's address, on the way out, a notice with its surface's name.
// What stood at a path that is gone is said where it is asked for: which tab closed, by whom, and where its surface is
// now. A tab whose surface says `attention` at / is needed: who, and why, gathered first at
// / as `needs`, so who is needed is read before every tab. A tab's surface is read the same by the agent and the person.
// Every commit is kept as activity, who did what where, read on demand at /activity and named at / by one fact that
// never changes (activity.ts); what the person has seen of its notices is marked by the page with quiet actions at
// /activity/notices, which are no activity and change nothing at /. What
// a surface throws breaks only what it was asked for: a tab it cannot restore or show at / is listed as broken, with why
// and what to do, and close stays offered; a path it cannot show says so, and the rest of the tab works; a tab it cannot
// open is not made. A surface whose code does not load is listed as broken with why, and cannot be opened; its open tabs
// keep what they hold, broken, until its code loads again. Beside the project's surfaces, after them, it holds its own,
// which no project's surface can be named for: the settings (../settings/), of which one tab is enough, so opening them
// again points to the tab open.
//
// Laid out as a surface is, src/surface.ts with its page in ui/index.tsx, it differs in two ways: it is made from the
// project's surfaces, so this is a function of them rather than a default export, and its page is the whole page rather
// than a component in a tab. scripts/open.ts makes it from the surfaces of the .baba/ it finds.
import { action, handles, isPerson, revealed, surface, view, type AnySurface, type Call, type Json, type Notice, type Surface, type Update, type View } from "../../core/index.ts"
import settings from "../settings/src/surface.ts"
import { activityView, entryOf, lookAt, NOTICES, record, refusalOf, restored, seenFrom, seeUpto, unseenIn, without, type Entry, type Seen, type Tabs } from "./activity.ts"

/**
 * `broken`: why the tab's surface could not restore its kept model, or does not load, which is then kept as it was saved.
 * `named`: the tab holds its surface's name, so /NAME addresses it.
 */
export type Tab = { n: number; surface: string; model: unknown; broken?: string; named?: true }
/** A tab closed, by whom, whether it held its surface's name, and the title it had: what a path into it is answered with. */
export type Closed = { n: number; surface: string; by: "person" | "agent"; named?: true; title?: string }
/** Where the agent last pointed the person, and how many times it has: the page goes there when the count moves. */
export type Pointed = { at: string; n: number }
/**
 * `activity`: who did what in the session's tabs, oldest first (activity.ts); absent in state kept before it. `seen`: what
 * the person has seen of its notices (activity.ts); absent in state kept before it.
 */
export type ShellModel = { tabs: Tab[]; next: number; pointed?: Pointed; activity?: Entry[]; seen?: Seen; closed?: Closed[] }
/**
 * `t`: when the shell's run heard the event, in ms since the epoch, for its activity. Whose it is, for the activity too:
 * `actor`, who called what started the work it reports; else the world's, `heard` naming what heard it.
 */
export type ShellEvent = { kind: "tab"; n: number; event: { kind: string }; t?: number; actor?: string; heard?: string }
/** A tab's command, and whose its events are: `actor`, the caller whose call started it, else `heard`, the world's hearer that did. */
export type ShellCommand = { n: number; surface: string; command: unknown; actor?: string; heard?: string }

/** What the desktop says when there is no surface to open: how one is made. */
export const EMPTY = "no surfaces yet: ask the agent for one, which it makes with `bun run baba new NAME` in .baba/"
/** What the desktop says where there is no .baba/. */
export const MISSING = "there is no .baba/ in this directory or above: make one with `baba init`"
/** The name a tab of state kept from before gives the picker, which the shell no longer has: its desktop lists the surfaces. */
const PICKER = "surfaces"

/** The surfaces that come with the shell, listed after the project's: a project's surface cannot take their names. */
export const OWN: Record<string, AnySurface> = { settings }
/** The shell's own surfaces of which one tab is enough: opening another shows the one open. */
const SINGLE = new Set(["settings"])

/** Who a surface says is needed at its /: the person, or the agent; and why, in a few words. */
export type Attention = { who: "person" | "agent"; why: string }
/** A tab that is needed, as / gathers it. */
export type Need = { at: string; surface: string } & Attention

/** The shell's own paths: a surface cannot be named for them, or /NAME would stand on them. */
export const PATHS = ["tabs", "activity"]
/** How many closed tabs are remembered, so a path into one says where its surface went. */
const REMEMBERED = 20

/** Whether tab n holds the same in both models: the same model, or one equal to it. */
const same = (before: ShellModel, after: ShellModel, n: number): boolean => {
  const a = before.tabs.find((t) => t.n === n)?.model
  const b = after.tabs.find((t) => t.n === n)?.model

  return a === b || JSON.stringify(a) === JSON.stringify(b)
}
/** Whose a command's events are: the caller's, or the world's, by what heard it. */
type Origin = { actor?: string; heard?: string }
/** Whose an event is, as it arrives: as its command said, the world's where it says nothing. */
const originOf = (e: ShellEvent): Origin => (e.actor !== undefined ? { actor: e.actor } : e.heard !== undefined ? { heard: e.heard } : {})

const TAB = /^\/tabs\/(\d+)(\/.*)?$/
const NAMED = /^\/([a-z][a-z0-9-]*)(\/.*)?$/
const rest = (tail: string | undefined) => (tail && tail !== "/" ? tail.replace(/\/$/, "") : "/")

/** The tab a path stands in by its number, /tabs/N, and the path within it. */
export const within = (path: string): { n: number; path: string } | undefined => {
  const m = TAB.exec(path)

  return m ? { n: Number(m[1]), path: rest(m[2]) } : undefined
}

/** The tab a path names, by number or by its surface's name, and the path within it; undefined where it is the shell's own. */
export const addressed = (path: string): ({ n: number } | { name: string }) & { path: string } | undefined => {
  const tab = within(path)

  if (tab) return tab

  const m = NAMED.exec(path)

  return m && !PATHS.includes(m[1]!) ? { name: m[1]!, path: rest(m[2]) } : undefined
}

/** Where a tab stands: /NAME where it holds its surface's name, else /tabs/N. */
export const addressOf = (tab: { n: number; surface: string; named?: true }) => (tab.named ? `/${tab.surface}` : `/tabs/${tab.n}`)

const isClosed = (c: unknown): c is Closed => {
  const x = c as Partial<Closed> | null

  return !!x && typeof x.n === "number" && typeof x.surface === "string" && (x.by === "person" || x.by === "agent")
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const isHandle = (value: Json | undefined) => !!value && typeof value === "object" && !Array.isArray(value) && value.kind === "handle"

/** A view with the paths it names under `at` put below `address`: what the surface calls /notes/1 is /tabs/2/notes/1 to its readers. */
export function whole<V extends Json | undefined>(value: V, address: string): V {
  if (Array.isArray(value)) return value.map((v) => whole(v, address)) as V
  if (!value || typeof value !== "object" || isHandle(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, k === "at" && typeof v === "string" && v.startsWith("/") ? address + (v === "/" ? "" : v) : whole(v, address)])
  ) as V
}

/** A view's facts: what it says, without the handles it offers. */
function facts(value: Json | undefined): Json | undefined {
  if (Array.isArray(value)) return value.map((v) => facts(v) ?? null)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => (isHandle(v) ? [] : [[k, facts(v)]])))
}

const isAttention = (value: Json | undefined): value is Attention =>
  !!value && typeof value === "object" && !Array.isArray(value) && (value.who === "person" || value.who === "agent") && typeof value.why === "string"
/** What a view says under `attention`: one, or a list where both are needed; none where it says nothing of the kind. */
export const attentionOf = (value: Json | undefined): Attention[] =>
  isAttention(value) ? [{ who: value.who, why: value.why }] : Array.isArray(value) && value.length && value.every(isAttention) ? value.map(({ who, why }) => ({ who, why })) : []

/**
 * The shell over `surfaces`, by name. `baba` is the .baba/ they are from; where there is none, the desktop says so.
 * `broken` names the surfaces of that .baba/ whose code did not load, with why (loading.ts). `title` names the root at /,
 * from the configuration (titleOf in ../../core/config.ts).
 * A session's state kept from before is read as it was: its picker tab is dropped, and a tab's `util` is its surface.
 */
export function shell(
  surfaces: Record<string, AnySurface>,
  baba?: string,
  broken: Record<string, string> = {},
  own: Record<string, AnySurface> = OWN,
  title = "baba"
): Surface<ShellModel, ShellEvent, ShellCommand> {
  const held = new Map([...Object.entries(surfaces).filter(([name]) => !(name in own) && !PATHS.includes(name)), ...Object.entries(own)])
  const unloaded = new Map(Object.entries(broken).filter(([name]) => !held.has(name)))
  /** Why a surface that does not load is broken, and what mends it. */
  const unloadable = (name: string) => `the ${name} surface does not load (${unloaded.get(name)}); fix its code, and it is loaded again`

  for (const name of [...held.keys(), ...unloaded.keys()]) if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`A surface's name is lowercase kebab-case: ${name}`)

  const open = action({
    name: "open",
    description: ({ surface }) => (SINGLE.has(surface) ? `open the ${surface} tab, or show the one open` : `open a ${surface} tab`),
    subject: { surface: "string" },
    inputs: {},
    update(model: ShellModel, { surface: name }): Update<ShellModel, ShellCommand> {
      const s = held.get(name)

      if (unloaded.has(name)) return { refused: `no ${name} tab is opened: ${unloadable(name)}` }
      if (!s) return { refused: `no surface ${name}` }

      const one = SINGLE.has(name) ? model.tabs.find((t) => t.surface === name) : undefined

      if (one) return { model: { ...model, pointed: { at: `/tabs/${one.n}`, n: (model.pointed?.n ?? 0) + 1 } } }

      // A tab that would be broken from the start is not made: its surface's code is at fault, and the refusal says how.
      try {
        const named = !model.tabs.some((t) => t.surface === name && t.named)
        const tab: Tab = { n: model.next, surface: name, model: s.init(), ...(named && { named: true as const }) }

        s.view(tab.model, "/")

        const commands = (s.start?.(tab.model) ?? []).map((command: unknown) => ({ n: tab.n, surface: name, command }))

        return { model: { ...model, tabs: [...model.tabs, tab], next: model.next + 1 }, commands }
      } catch (error) {
        return { refused: `no ${name} tab is opened: its surface fails as it opens (${message(error)}); fix the surface's code` }
      }
    },
  })
  const close = action({
    name: "close",
    description: ({ n }) => `close tab ${n}; its state is dropped`,
    subject: { n: "number" },
    inputs: {},
    update(model: ShellModel, { n }, call): Update<ShellModel, ShellCommand> {
      const tab = model.tabs.find((t) => t.n === n)
      const by = isPerson(call.actor) ? ("person" as const) : ("agent" as const)
      const title = tab && attempt(tab, (s) => s.view(tab.model, "/")?.title)?.ok
      const was: Closed | undefined = tab && { n, surface: tab.surface, by, ...(tab.named && { named: true as const }), ...(typeof title === "string" && { title }) }
      const closed = was ? [...(model.closed ?? []), was] : model.closed

      return { model: { ...model, tabs: model.tabs.filter((t) => t.n !== n), ...(closed && { closed: closed.slice(-REMEMBERED) }) } }
    },
  })
  // Pointing is a moment, not state: the place and a count the page watches, so it goes there once per show. It is
  // dropped on restore, so a page loaded later does not go there again.
  const show = action({
    name: "show",
    description: "bring a place to the front of the person's page: at is a tab's address, /NAME or /tabs/N, or a path below it, as an at a tab names",
    subject: {},
    inputs: { at: "string" },
    update(model: ShellModel, { at }): Update<ShellModel, ShellCommand> {
      const place = addressed(at)

      if (!place) return { refused: `${at} is not in a tab: point at a tab's address, /NAME or /tabs/N, or a path below it` }

      const tab = tabAt(model, place)

      if (!tab) return { refused: gone(model, at) ?? `nothing at ${at}` }

      const seen = shown(tab, place.path)

      if ("broken" in seen) return { refused: seen.broken }
      if (!seen.ok) return { refused: `nothing at ${at}: the ${tab.surface} surface has no such path` }

      // Kept by number, which names this tab alone; the present says it by the tab's address.
      const path = `/tabs/${tab.n}${place.path === "/" ? "" : place.path}`

      return { model: { ...model, pointed: { at: path, n: (model.pointed?.n ?? 0) + 1 } } }
    },
  })
  /** The open tab a place names: by number, or the tab that holds the name. */
  const tabAt = (model: ShellModel, place: { n: number } | { name: string }) =>
    "n" in place ? model.tabs.find((t) => t.n === place.n) : model.tabs.find((t) => t.surface === place.name && t.named)
  /** A path as the shell keeps it, by the number of the open tab it names; as it is where it names none. */
  const kept = (model: ShellModel, path: string) => {
    const place = addressed(path)
    const tab = place && tabAt(model, place)

    return tab ? `/tabs/${tab.n}${place.path === "/" ? "" : place.path}` : path
  }
  /** A path as the agent and the page read it: below the address of the open tab it names; as it is where it names none. */
  const stable = (model: ShellModel, path: string) => {
    const place = addressed(path)
    const tab = place && tabAt(model, place)

    return tab ? addressOf(tab) + (place.path === "/" ? "" : place.path) : path
  }
  /**
   * What answers a path into a tab that is not open, in place of nothing: the tab it named closed, by whom, and where its
   * surface is now, or how to open it; undefined where the path names no surface's tab that was.
   */
  const gone = (model: ShellModel, path: string): string | undefined => {
    const place = addressed(path)

    if (!place || tabAt(model, place)) return undefined

    const closed = [...(model.closed ?? [])].reverse()
    const was = "n" in place ? closed.find((c) => c.n === place.n) : closed.find((c) => c.surface === place.name && c.named)
    const name = "n" in place ? was?.surface : place.name

    if (name === undefined || (!held.has(name) && !unloaded.has(name))) return undefined

    const head = "n" in place ? `/tabs/${place.n}` : `/${name}`
    const what = !was ? `no ${name} tab is open` : `${head}, the ${name} tab ${was.n}, was closed by the ${was.by}`
    const holder = model.tabs.find((t) => t.surface === name && t.named)
    const other = model.tabs.find((t) => t.surface === name)

    if (unloaded.has(name)) return `${what}; ${unloadable(name)}`
    if (holder) return `${what}; ${name} is now at /${name} (tab ${holder.n})`
    if (other) return `${what}; the ${name} tab open is /tabs/${other.n}, and open surface=${name} at / opens one at /${name}`

    return `${what}: open one with open surface=${name} at /, and it is at /${name}`
  }
  /** Why a tab is broken when its surface cannot restore what it keeps: the fault is the kept state, or the restore. */
  const unrestored = (tab: Tab, error: unknown) =>
    `tab ${tab.n} is broken: its ${tab.surface} surface cannot restore the state the tab keeps (${message(error)}); ` +
    "the state is likely from earlier code of the surface: close the tab to drop it, or fix the surface's restore to read it"
  /**
   * Why a tab is broken when its surface throws at / on the model it keeps, as far as can be told: one it shows a fresh
   * model on points at the kept state; one it fails on a fresh model too has its code at fault, which closing does not mend.
   */
  const unshown = (tab: Tab, error: unknown): string => {
    const s = held.get(tab.surface)!

    try {
      s.view(s.init(), "/")
    } catch {
      return (
        `tab ${tab.n} is broken: its ${tab.surface} surface fails in its own code (${message(error)}), on a fresh state as on the one the tab keeps: ` +
        "fix the surface's code; closing the tab will not help"
      )
    }

    return (
      `tab ${tab.n} is broken: its ${tab.surface} surface fails on the state the tab keeps (${message(error)}) but not on a fresh one; ` +
      "the state is likely from earlier code of the surface: close the tab to drop it, or fix the surface's code to read it"
    )
  }
  /** The surface's answer for a tab, or nothing when it throws or the tab is broken: what one surface throws stays in its tab. */
  const attempt = <T>(tab: Tab, fn: (s: AnySurface) => T): { ok: T } | undefined => {
    if (tab.broken !== undefined) return undefined
    try {
      return { ok: fn(held.get(tab.surface)!) }
    } catch {
      return undefined
    }
  }
  /**
   * The surface's view of a tab at a path, or why it cannot be shown: the tab is broken when its surface cannot show it
   * at /; a path below that it cannot show is only that path's fault.
   */
  const shown = (tab: Tab, path: string): { ok: View | undefined } | { broken: string } => {
    if (tab.broken !== undefined) return { broken: tab.broken }

    const s = held.get(tab.surface)!
    let home: View | undefined

    try {
      home = s.view(tab.model, "/")
    } catch (error) {
      return { broken: unshown(tab, error) }
    }
    if (path === "/") return { ok: home }
    try {
      return { ok: s.view(tab.model, path) }
    } catch (error) {
      const failed = `its ${tab.surface} surface fails there (${message(error)})`

      return { broken: `${addressOf(tab)}${path} cannot be shown: ${failed}, while tab ${tab.n} works at /: fix the surface's code for this path` }
    }
  }
  // The page's marks of what the person has seen of the notices, at /activity/notices: quiet, so no one is told of them.
  const seen = action({
    name: "seen",
    quiet: true,
    description: "the page's mark: the person saw every notice up to n",
    subject: {},
    inputs: { n: "number" },
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, seen: seeUpto(model.seen ?? { upto: 0, looked: [] }, n) } }),
  })
  const looked = action({
    name: "looked",
    quiet: true,
    description: "the page's mark: the person looked at notice n alone, as by opening the drawer of the tab it is in",
    subject: {},
    inputs: { n: "number" },
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, seen: lookAt(model.seen ?? { upto: 0, looked: [] }, n) } }),
  })
  /** The tabs activity says an entry's place by: the address of the open tab numbered n. */
  const opened = (model: ShellModel): Tabs => ({
    at: (n) => {
      const tab = model.tabs.find((t) => t.n === n)

      return tab && addressOf(tab)
    },
  })
  /** A tab's close, naming what runs in it beside its number, so a menu of several tabs tells them apart: "close tab 3, Queue". */
  const closing = (tab: ShellModel["tabs"][number]) => {
    const title = attempt(tab, (s) => s.view(tab.model, "/")?.title)?.ok
    const name = typeof title === "string" && title ? title : tab.surface

    return { ...close.bind({ n: tab.n }), description: `close tab ${tab.n}, ${name}; its state is dropped` }
  }
  const desktop = view([open, close, show, seen, looked], {
    "/": (model) => ({
      title,
      ...(baba === undefined ? { missing: MISSING } : ![...held.keys()].some((name) => !(name in own)) && !unloaded.size && { empty: EMPTY }),
      surfaces: [
        ...[...held].map(([name, s]) => ({ name, description: s.description, open: open.bind({ surface: name }) })),
        ...[...unloaded.keys()].map((name) => ({ name, broken: unloadable(name) })),
      ],
      tabs: model.tabs.map((tab) => ({ at: addressOf(tab), n: tab.n, surface: tab.surface, close: closing(tab) })),
      ...(model.tabs.length > 0 && { show: show.bind({}) }),
      ...(model.pointed && { pointed: { ...model.pointed, at: stable(model, model.pointed.at) } }),
      activity: { at: "/activity" },
    }),
    "/activity": (model) => activityView(model.activity ?? [], opened(model)),
    // Which notices the person has not seen, and how many, beside the page's marks of them.
    [NOTICES]: (model) => {
      const fresh = unseenIn(model.activity ?? [], model.seen ?? { upto: 0, looked: [] })

      return { ...activityView(model.activity ?? [], opened(model), undefined, true), seen: seen.bind({}), looked: looked.bind({}), unseen: fresh.length, fresh }
    },
    [`${NOTICES}/:n`]: (model, { n }) => activityView(model.activity ?? [], opened(model), Number(n), true),
    "/activity/:n": (model, { n }) => activityView(model.activity ?? [], opened(model), Number(n)),
  })
  /**
   * A tab as the desktop lists it: its surface's title, actions and facts at /, the paths whole, and who it
   * needs, which / gathers and so is not among its facts; or why it is broken.
   */
  const said = (tab: Tab): { row: { title?: string; actions?: string[]; facts?: Json; broken?: string }; needs: Attention[] } => {
    const seen = shown(tab, "/")

    if ("broken" in seen) return { row: { broken: seen.broken }, needs: [] }

    const { title, ...rest } = seen.ok ?? {}
    const needs = attentionOf(rest.attention)

    if (needs.length) delete rest.attention

    // What can be done in the tab, by name: their commands are at the tab's path, so what is possible is known from / alone.
    const actions = [...new Set(handles(rest).map((h) => h.name))]

    return { row: { ...(typeof title === "string" && { title }), ...(actions.length && { actions }), facts: facts(whole(rest, addressOf(tab))) }, needs }
  }
  /** A call into a tab, or its refusal with why: where its surface cannot show the call's path, or fails on the call itself. */
  const called = (tab: Tab, call: Call, model: ShellModel): Update<ShellModel, ShellCommand> => {
    const seen = shown(tab, call.path)

    if ("broken" in seen) return { refused: seen.broken }
    try {
      return wrapped(tab, held.get(tab.surface)!.update(tab.model, call), model, { actor: call.actor })
    } catch (error) {
      return { refused: `tab ${tab.n} is unchanged: its ${tab.surface} surface fails on ${call.handle} (${message(error)}); fix the surface's code` }
    }
  }
  /** A tab's notice as the shell gives it: its path whole, and its surface named. */
  const noticed = (tab: Tab, notice: Notice): Notice => {
    const { text, at } = typeof notice === "string" ? { text: notice, at: undefined } : notice
    const address = addressOf(tab)

    return { text, at: typeof at === "string" && at.startsWith("/") && at !== "/" ? address + at : address, from: tab.surface }
  }
  /** A tab's update as the shell's; its commands are `from` whoever caused it, the caller or the world's hearer. */
  const wrapped = (tab: Tab, result: Update<unknown, unknown>, model: ShellModel, from: Origin): Update<ShellModel, ShellCommand> =>
    "refused" in result
      ? result
      : {
          model: { ...model, tabs: model.tabs.map((t) => (t.n === tab.n ? { ...t, model: result.model } : t)) },
          commands: (result.commands ?? []).map((command) => ({ n: tab.n, surface: tab.surface, command, ...from })),
          ...(result.notices?.length && { notices: result.notices.map((notice) => noticed(tab, notice)) }),
          ...(result.quiet && { quiet: true as const }),
        }
  /** Whose a command's events are: the caller's who started it, unless it is a session command, whose are the world's, heard by it. */
  const origin = (c: ShellCommand): Origin => {
    const kind = (c.command as { kind?: unknown } | undefined)?.kind
    let session = false

    try {
      session = held.get(c.surface)?.session?.(c.command) ?? false
    } catch {}

    return c.actor !== undefined && !session ? { actor: c.actor } : { heard: c.heard ?? (typeof kind === "string" ? kind : "command") }
  }
  /** A message's next model and what it gives, before its activity is kept. */
  const step = (model: ShellModel, message: Call | ShellEvent): Update<ShellModel, ShellCommand> => {
    if (message.kind === "call") {
      const at = addressed(message.path)

      if (!at) return desktop.update(model, message)

      const tab = tabAt(model, at)

      if (!tab) return { refused: gone(model, message.path) ?? `nothing at ${message.path}` }

      return called(tab, { ...message, path: at.path }, model)
    }

    const tab = model.tabs.find((t) => t.n === message.n)

    // An event for a closed tab arrives late and lands nowhere.
    if (!tab) return { model }

    const result = attempt(tab, (s) => s.update(tab.model, message.event))

    // An event for a broken tab, or one its surface fails on, lands nowhere, as for a closed one.
    return !result ? { model } : wrapped(tab, result.ok, model, originOf(message))
  }

  return surface<ShellModel, ShellEvent, ShellCommand>({
    description: "The project's surfaces, each opened as a tab",
    // A fresh session has a seen mark from the start, so only state kept before marks were kept is without one.
    init: () => ({ tabs: [], next: 1, seen: { upto: 0, looked: [] } }),
    restore(saved): ShellModel {
      const kept = saved as { tabs?: { n: number; surface?: string; util?: string; model: unknown; named?: unknown }[]; next?: number } | undefined

      if (!kept || !Array.isArray(kept.tabs) || typeof kept.next !== "number") throw new Error("saved shell state has no tabs and next number")

      const activity = restored((saved as { activity?: unknown }).activity)
      const closed = (saved as { closed?: unknown }).closed
      const tabs = kept.tabs.flatMap((t): Tab[] => {
          const name = t.surface ?? (t.util === PICKER ? undefined : t.util)
          const s = name === undefined ? undefined : held.get(name)

          if (name !== undefined && unloaded.has(name) && t.model !== undefined)
            return [{ n: t.n, surface: name, model: t.model, broken: `tab ${t.n} is broken: ${unloadable(name)}, with the state the tab keeps` }]
          // A tab with no model holds nothing, and one whose surface is gone has nothing to show it.
          if (name === undefined || !s || t.model === undefined) return []
          try {
            return [{ n: t.n, surface: name, model: s.restore ? s.restore(t.model) : t.model, ...(t.named === true && { named: true as const }) }]
          } catch (error) {
            const broken = unrestored({ n: t.n, surface: name, model: t.model }, error)

            return [{ n: t.n, surface: name, model: t.model, broken, ...(t.named === true && { named: true as const }) }]
          }
        })
      // State kept before tabs held names: each surface's oldest tab holds its name.
      const named = new Set(tabs.filter((t) => t.named).map((t) => t.surface))

      return {
        next: kept.next,
        // Entries of a tab closed before entries went with their tab, or not restored, go now.
        activity: without(activity, (n) => !tabs.some((t) => t.n === n)),
        seen: seenFrom((saved as { seen?: unknown }).seen, activity),
        ...(Array.isArray(closed) && {
        closed: closed
          .filter(isClosed)
          .slice(-REMEMBERED)
          .map(({ title, ...c }) => ({ ...c, ...(typeof title === "string" && { title }) })),
      }),
        tabs: tabs.map((t) => (t.named || named.has(t.surface) || !named.add(t.surface) ? t : { ...t, named: true as const })),
      }
    },
    start: (model) =>
      model.tabs.flatMap((tab) => {
        const started = attempt(tab, (s) => s.start?.(tab.model) ?? [])

        return !started ? [] : started.ok.map((command: unknown) => ({ n: tab.n, surface: tab.surface, command }))
      }),
    working: (model) => model.tabs.some((tab) => !!attempt(tab, (s) => s.working?.(tab.model) ?? false)?.ok),
    session: (c) => held.get(c.surface)?.session?.(c.command) ?? false,
    // Every commit is kept as activity, at the message's time, or the last known where it carries none; its places by tab
    // number, which names one tab alone, as the address a name gives moves to the next tab of the surface.
    update(model, message) {
      const result = step(model, message)

      // A quiet commit is the page's own bookkeeping, no activity: as what waits for the agent, it is no one's doing. An
      // event that landed nowhere, for a closed or broken tab, is none either.
      if ("refused" in result || result.quiet || (message.kind !== "call" && result.model === model)) return result

      const log = model.activity ?? []
      const numbered: Call | ShellEvent =
        message.kind !== "call"
          ? message
          : {
              ...message,
              path: kept(model, message.path),
              ...(message.handle === "show" && typeof message.args.at === "string" && { args: { ...message.args, at: kept(model, message.args.at) } }),
            }
      const notices = result.notices?.map((n) => (typeof n === "string" || typeof n.at !== "string" ? n : { ...n, at: kept(model, n.at) }))
      // An event of the world that changed nothing in its tab and said nothing is no action, as a watcher hearing the
      // surface's own write comes back to what the tab holds.
      const echo = message.kind !== "call" && message.actor === undefined && !notices?.length && same(model, result.model, message.n)
      const line = echo ? undefined : entryOf(model, numbered, message.t ?? log.at(-1)?.when ?? 0, notices)
      // A closed tab's entries go with it, once its own line is kept: that line is the newest, so numbers never repeat.
      const gone = (n: number) => model.tabs.some((t) => t.n === n) && !result.model.tabs.some((t) => t.n === n)
      const activity = without(record(log, line), gone)

      return !line && activity.length === log.length ? result : { ...result, model: { ...result.model, activity } }
    },
    // A refused call is kept as activity too, with why; nothing else of the model changes.
    refused(model, call, reason) {
      const log = model.activity ?? []
      const line = refusalOf(model, { ...call, path: kept(model, call.path) }, call.t ?? log.at(-1)?.when ?? 0, reason)

      return line && { ...model, activity: record(log, line) }
    },
    absent: (model, path) => gone(model, path),
    view(model, path, actor): View | undefined {
      const at = addressed(path)

      if (!at) {
        const home = desktop.view(model, path)

        if (!home || path !== "/") return home

        const person = actor !== undefined && isPerson(actor)
        const rows = model.tabs.map((tab) => said(tab))
        const needs: Need[] = rows.flatMap(({ needs }, i) => needs.map((need) => ({ at: addressOf(model.tabs[i]!), surface: model.tabs[i]!.surface, ...need })))
        const { title, ...all } = home
        // Pointing is the agent's, at the person: the person is not offered it, so home's menu, drawn from this view, has it not.
        const { show: _, ...rest } = all
        const tabs = (home.tabs as View[]).map((row, i) => ({ ...row, ...rows[i]!.row }))
        const root = { title, ...(needs.length && { needs }), ...(person ? rest : all), tabs }

        // A tab's detail stays marked only in the agent's present, which counts it; the person reads it as it is.
        return person ? revealed(root) : root
      }

      const tab = tabAt(model, at)

      if (!tab) return undefined

      const seen = shown(tab, at.path)

      // At its own path a tab is read whole, its detail as ordinary values.
      return "broken" in seen ? { at: `${addressOf(tab)}${at.path === "/" ? "" : at.path}`, broken: seen.broken } : revealed(whole(seen.ok, addressOf(tab)))
    },
    run: (c, send, signal) => {
      const from = origin(c)

      return held.get(c.surface)!.run(c.command, (event: { kind: string }) => send({ kind: "tab", n: c.n, event, t: Date.now(), ...from }), signal)
    },
    failed: (c, error) => ({ kind: "tab", n: c.n, event: held.get(c.surface)!.failed(c.command, error), t: Date.now(), ...origin(c) }),
  })
}
