// The shell: the root surface of a .baba/, which the framework provides. It holds the project's surfaces, each opened as a
// tab as often as wanted, and at / it is the desktop: every surface with what it is for and `open`, and every open tab
// with its surface's facts, so what changes in a tab is in the agent's present. A tab stands at /tabs/N and its surface's
// own paths below it; the surface never knows: the paths its views name under `at`, and its notices, are given whole on the way
// out, a notice with its surface's name. A tab whose surface says `attention` at / is needed: who, and why, gathered first at
// / as `needs`, so who is needed is read before every tab. Every commit is kept as activity, who did what where, read on
// demand at /activity and named at / by one fact that never changes (activity.ts); what the person has seen of its
// notices is marked by asks at /activity/notices, which are no activity and change nothing at /. What
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
import { action, handles, isPerson, surface, view, type AnySurface, type Call, type Json, type Notice, type Surface, type Update, type View } from "../../core/index.ts"
import settings from "../settings/src/surface.ts"
import { activityView, linesOf, lookAt, NOTICES, record, restored, seenFrom, seeUpto, unseenIn, type Entry, type Seen } from "./activity.ts"

/** `broken`: why the tab's surface could not restore its kept model, or does not load, which is then kept as it was saved. */
export type Tab = { n: number; surface: string; model: unknown; broken?: string }
/** Where the agent last pointed the person, and how many times it has: the page goes there when the count moves. */
export type Pointed = { at: string; n: number }
/**
 * `activity`: who did what in the session's tabs, oldest first (activity.ts); absent in state kept before it. `seen`: what
 * the person has seen of its notices (activity.ts); absent in state kept before it.
 */
export type ShellModel = { tabs: Tab[]; next: number; pointed?: Pointed; activity?: Entry[]; seen?: Seen }
/** `t`: when the shell's run heard the event, in ms since the epoch, for its activity. */
export type ShellEvent = { kind: "tab"; n: number; event: { kind: string }; t?: number }
export type ShellCommand = { n: number; surface: string; command: unknown }

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

const TAB = /^\/tabs\/(\d+)(\/.*)?$/

/** The tab a path stands in, and the path within it. */
export const within = (path: string): { n: number; path: string } | undefined => {
  const m = TAB.exec(path)

  return m ? { n: Number(m[1]), path: m[2] && m[2] !== "/" ? m[2].replace(/\/$/, "") : "/" } : undefined
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
 * `broken` names the surfaces of that .baba/ whose code did not load, with why (loading.ts).
 * A session's state kept from before is read as it was: its picker tab is dropped, and a tab's `util` is its surface.
 */
export function shell(
  surfaces: Record<string, AnySurface>,
  baba?: string,
  broken: Record<string, string> = {},
  own: Record<string, AnySurface> = OWN
): Surface<ShellModel, ShellEvent, ShellCommand> {
  const held = new Map([...Object.entries(surfaces).filter(([name]) => !(name in own)), ...Object.entries(own)])
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
        const tab: Tab = { n: model.next, surface: name, model: s.init() }

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
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, tabs: model.tabs.filter((t) => t.n !== n) } }),
  })
  // Pointing is a moment, not state: the place and a count the page watches, so it goes there once per show. It is
  // dropped on restore, so a page loaded later does not go there again.
  const show = action({
    name: "show",
    description: "bring a place to the front of the person's page: at is /tabs/N or a path below it, as an at a tab names",
    subject: {},
    inputs: { at: "string" },
    update(model: ShellModel, { at }): Update<ShellModel, ShellCommand> {
      const place = within(at)

      if (!place) return { refused: `${at} is not in a tab: point at /tabs/N or a path below it` }

      const tab = model.tabs.find((t) => t.n === place.n)

      if (!tab) return { refused: `no tab ${place.n}: it is closed or was never opened; open the surface first` }

      const seen = shown(tab, place.path)

      if ("broken" in seen) return { refused: seen.broken }
      if (!seen.ok) return { refused: `nothing at ${at}: the ${tab.surface} surface has no such path` }

      const path = `/tabs/${tab.n}${place.path === "/" ? "" : place.path}`

      return { model: { ...model, pointed: { at: path, n: (model.pointed?.n ?? 0) + 1 } } }
    },
  })
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
  const shown = (tab: Tab, path: string, actor?: string): { ok: View | undefined } | { broken: string } => {
    if (tab.broken !== undefined) return { broken: tab.broken }

    const s = held.get(tab.surface)!
    let home: View | undefined

    try {
      home = s.view(tab.model, "/", actor)
    } catch (error) {
      return { broken: unshown(tab, error) }
    }
    if (path === "/") return { ok: home }
    try {
      return { ok: s.view(tab.model, path, actor) }
    } catch (error) {
      const failed = `its ${tab.surface} surface fails there (${message(error)})`

      return { broken: `/tabs/${tab.n}${path} cannot be shown: ${failed}, while tab ${tab.n} works at /: fix the surface's code for this path` }
    }
  }
  // The person's marks of what they have seen of the notices: asks, so offered to them alone, at /activity/notices.
  const seen = action({
    name: "seen",
    description: "the person saw every notice up to n, as on opening their notifications",
    subject: {},
    inputs: { n: "number" },
    ask: true,
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, seen: seeUpto(model.seen ?? { upto: 0, looked: [] }, n) } }),
  })
  const looked = action({
    name: "looked",
    description: "the person looked at notice n alone, as by clicking its toast or opening its tab's channel",
    subject: {},
    inputs: { n: "number" },
    ask: true,
    update: (model: ShellModel, { n }): Update<ShellModel, ShellCommand> => ({ model: { ...model, seen: lookAt(model.seen ?? { upto: 0, looked: [] }, n) } }),
  })
  const opened = (model: ShellModel) => new Set(model.tabs.map((t) => t.n))
  const desktop = view([open, close, show, seen, looked], {
    "/": (model) => ({
      title: "baba",
      ...(baba === undefined ? { missing: MISSING } : ![...held.keys()].some((name) => !(name in own)) && !unloaded.size && { empty: EMPTY }),
      surfaces: [
        ...[...held].map(([name, s]) => ({ name, description: s.description, open: open.bind({ surface: name }) })),
        ...[...unloaded.keys()].map((name) => ({ name, broken: unloadable(name) })),
      ],
      tabs: model.tabs.map((tab) => ({ at: `/tabs/${tab.n}`, n: tab.n, surface: tab.surface, close: close.bind({ n: tab.n }) })),
      ...(model.tabs.length > 0 && { show: show.bind({}) }),
      ...(model.pointed && { pointed: model.pointed }),
      activity: { at: "/activity" },
    }),
    "/activity": (model) => activityView(model.activity ?? [], opened(model)),
    [NOTICES]: (model) => ({ ...activityView(model.activity ?? [], opened(model), undefined, true), seen: seen.bind({}), looked: looked.bind({}) }),
    [`${NOTICES}/:n`]: (model, { n }) => activityView(model.activity ?? [], opened(model), Number(n), true),
    "/activity/:n": (model, { n }) => activityView(model.activity ?? [], opened(model), Number(n)),
  })
  /**
   * A tab as the desktop lists it, for the actor: its surface's title, actions and facts at /, the paths whole, and who it
   * needs, which / gathers and so is not among its facts; or why it is broken.
   */
  const said = (tab: Tab, actor?: string): { row: { title?: string; actions?: string[]; facts?: Json; broken?: string }; needs: Attention[] } => {
    const seen = shown(tab, "/", actor)

    if ("broken" in seen) return { row: { broken: seen.broken }, needs: [] }

    const { title, ...rest } = seen.ok ?? {}
    const needs = attentionOf(rest.attention)

    if (needs.length) delete rest.attention

    // What can be done in the tab, by name: their commands are at the tab's path, so what is possible is known from / alone.
    const actions = [...new Set(handles(rest).map((h) => h.name))]

    return { row: { ...(typeof title === "string" && { title }), ...(actions.length && { actions }), facts: facts(whole(rest, `/tabs/${tab.n}`)) }, needs }
  }
  /** A call into a tab, or its refusal with why: where its surface cannot show the call's path, or fails on the call itself. */
  const called = (tab: Tab, call: Call, model: ShellModel): Update<ShellModel, ShellCommand> => {
    const seen = shown(tab, call.path, call.actor)

    if ("broken" in seen) return { refused: seen.broken }
    try {
      return wrapped(tab, held.get(tab.surface)!.update(tab.model, call), model)
    } catch (error) {
      return { refused: `tab ${tab.n} is unchanged: its ${tab.surface} surface fails on ${call.handle} (${message(error)}); fix the surface's code` }
    }
  }
  /** A tab's notice as the shell gives it: its path whole, and its surface named. */
  const noticed = (tab: Tab, notice: Notice): Notice => {
    const { text, at } = typeof notice === "string" ? { text: notice, at: undefined } : notice
    const address = `/tabs/${tab.n}`

    return { text, at: typeof at === "string" && at.startsWith("/") && at !== "/" ? address + at : address, from: tab.surface }
  }
  const wrapped = (tab: Tab, result: Update<unknown, unknown>, model: ShellModel): Update<ShellModel, ShellCommand> =>
    "refused" in result
      ? result
      : {
          model: { ...model, tabs: model.tabs.map((t) => (t.n === tab.n ? { ...t, model: result.model } : t)) },
          commands: (result.commands ?? []).map((command) => ({ n: tab.n, surface: tab.surface, command })),
          ...(result.notices?.length && { notices: result.notices.map((notice) => noticed(tab, notice)) }),
        }
  /** A message's next model and what it gives, before its activity is kept. */
  const step = (model: ShellModel, message: Call | ShellEvent): Update<ShellModel, ShellCommand> => {
    if (message.kind === "call") {
      const at = within(message.path)

      if (!at) return desktop.update(model, message)

      const tab = model.tabs.find((t) => t.n === at.n)

      if (!tab) return { refused: `no tab ${at.n}` }

      return called(tab, { ...message, path: at.path }, model)
    }

    const tab = model.tabs.find((t) => t.n === message.n)

    // An event for a closed tab arrives late and lands nowhere.
    if (!tab) return { model }

    const result = attempt(tab, (s) => s.update(tab.model, message.event))

    // An event for a broken tab, or one its surface fails on, lands nowhere, as for a closed one.
    return !result ? { model } : wrapped(tab, result.ok, model)
  }

  return surface<ShellModel, ShellEvent, ShellCommand>({
    description: "The project's surfaces, each opened as a tab",
    // A fresh session has a seen mark from the start, so only state kept before marks were kept is without one.
    init: () => ({ tabs: [], next: 1, seen: { upto: 0, looked: [] } }),
    restore(saved): ShellModel {
      const kept = saved as { tabs?: { n: number; surface?: string; util?: string; model: unknown }[]; next?: number } | undefined

      if (!kept || !Array.isArray(kept.tabs) || typeof kept.next !== "number") throw new Error("saved shell state has no tabs and next number")

      const activity = restored((saved as { activity?: unknown }).activity)

      return {
        next: kept.next,
        activity,
        seen: seenFrom((saved as { seen?: unknown }).seen, activity),
        tabs: kept.tabs.flatMap((t): Tab[] => {
          const name = t.surface ?? (t.util === PICKER ? undefined : t.util)
          const s = name === undefined ? undefined : held.get(name)

          if (name !== undefined && unloaded.has(name) && t.model !== undefined)
            return [{ n: t.n, surface: name, model: t.model, broken: `tab ${t.n} is broken: ${unloadable(name)}, with the state the tab keeps` }]
          // A tab with no model holds nothing, and one whose surface is gone has nothing to show it.
          if (name === undefined || !s || t.model === undefined) return []
          try {
            return [{ n: t.n, surface: name, model: s.restore ? s.restore(t.model) : t.model }]
          } catch (error) {
            return [{ n: t.n, surface: name, model: t.model, broken: unrestored({ n: t.n, surface: name, model: t.model }, error) }]
          }
        }),
      }
    },
    start: (model) =>
      model.tabs.flatMap((tab) => {
        const started = attempt(tab, (s) => s.start?.(tab.model) ?? [])

        return !started ? [] : started.ok.map((command: unknown) => ({ n: tab.n, surface: tab.surface, command }))
      }),
    working: (model) => model.tabs.some((tab) => !!attempt(tab, (s) => s.working?.(tab.model) ?? false)?.ok),
    session: (c) => held.get(c.surface)?.session?.(c.command) ?? false,
    // Every commit is kept as activity, at the message's time, or the last known where it carries none.
    update(model, message) {
      const result = step(model, message)

      if ("refused" in result) return result

      const kept = model.activity ?? []
      const lines = linesOf(model, message, message.t ?? kept.at(-1)?.when ?? 0, result.notices)

      return !lines.length ? result : { ...result, model: { ...result.model, activity: record(kept, lines) } }
    },
    view(model, path, actor): View | undefined {
      const at = within(path)

      if (!at) {
        const home = desktop.view(model, path, actor)

        // Which notices the person has not seen, and how many, is theirs alone, beside the asks that mark them.
        if (home && path === NOTICES && actor !== undefined && isPerson(actor)) {
          const fresh = unseenIn(model.activity ?? [], model.seen ?? { upto: 0, looked: [] })

          return { ...home, unseen: fresh.length, fresh }
        }
        if (!home || path !== "/") return home

        const rows = model.tabs.map((tab) => said(tab, actor))
        const needs: Need[] = rows.flatMap(({ needs }, i) => needs.map((need) => ({ at: `/tabs/${model.tabs[i]!.n}`, surface: model.tabs[i]!.surface, ...need })))
        const { title, ...rest } = home

        return { title, ...(needs.length && { needs }), ...rest, tabs: (home.tabs as View[]).map((row, i) => ({ ...row, ...rows[i]!.row })) }
      }

      const tab = model.tabs.find((t) => t.n === at.n)

      if (!tab) return undefined

      const seen = shown(tab, at.path, actor)

      return "broken" in seen ? { at: `/tabs/${tab.n}${at.path === "/" ? "" : at.path}`, broken: seen.broken } : whole(seen.ok, `/tabs/${tab.n}`)
    },
    run: (c, send, signal) => held.get(c.surface)!.run(c.command, (event: { kind: string }) => send({ kind: "tab", n: c.n, event, t: Date.now() }), signal),
    failed: (c, error) => ({ kind: "tab", n: c.n, event: held.get(c.surface)!.failed(c.command, error), t: Date.now() }),
  })
}
