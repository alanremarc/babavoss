// The design document: where the content babavoss gives an agent is inspected. Canonical scenarios are played on a small
// demo project through the framework's real hook, word and runtime, with no agent and no harness, and every text the agent
// would be given is shown verbatim and measured, with what the person's page showed after each step. They are played again
// whenever the framework's code, baba's words or the demo change, so what is shown follows the code. The demo's shape is
// read from its surfaces as they are played. A pin keeps the tellings as a baseline, and each is then shown with its
// difference from it; a scenario that was not there when it was pinned is new. Scenarios are canonical moments, or noise.
import { watch, type FSWatcher } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { action, surface, view, type Notice, type Update } from "babavoss/core/index.ts"
import { delta, masked, said, size, sum, together, type Delta, type Size } from "./measure.ts"
import { play, type Play, type Played } from "./play.ts"
import { GROUPS, SCENARIOS, slow, type Scenario } from "./scenarios.ts"
import { factsOf, listed, said as factsSaid, shape, type Shape } from "./shape.ts"

/** The tellings as pinned: each scenario's texts, step by step, and when. */
export type Pin = { t: number; texts: Record<string, string[][]> }
/**
 * `playing`: a play is under way; `again`: the code changed while it was, so it plays once more; `failure`: why the last
 * play did not end; `shape`: the demo's surfaces as the last play read them.
 */
export type Model = { plays: Play[]; playing: boolean; again?: boolean; pin?: Pin; failure?: string; shape?: Shape[] }
/** `played`: some scenarios played, the rest kept as they were; `partial`, the play goes on with those that take real time. */
export type Event = { kind: "changed" } | { kind: "played"; plays: Play[]; shape?: Shape[]; partial?: true } | { kind: "unplayed"; error: string } | { kind: "none" }
export type Command = { kind: "watch" } | { kind: "play" }
type Result = Update<Model, Command>

const FRAMEWORK = dirname(fileURLToPath(import.meta.resolve("babavoss/package.json")))
/** What the told texts are made of: the framework's code, its command, baba's words, and the demo. */
const WATCHED = [join(FRAMEWORK, "framework/core"), join(FRAMEWORK, "framework/shell/src"), join(FRAMEWORK, "framework/shell/scripts"), join(FRAMEWORK, "skill"), join(FRAMEWORK, "bin"), fileURLToPath(new URL("../demo", import.meta.url))]
const HOW =
  "Each scenario is played on the demo project through the framework's own hook, word and runtime, again whenever their code changes, so this is what an agent is given now. " +
  "A step's path has its texts whole, and its page what the person's page showed after it; /demo is the demo project's shape. " +
  "Pin to keep the texts as the baseline to compare with. Tokens are estimated: characters / 4."

const playing = (m: Model): Result => (m.playing ? { model: { ...m, again: true } } : { model: { ...m, playing: true, again: false }, commands: [{ kind: "play" }] })

const replay = action({
  name: "play",
  description: "Play every scenario again, as it is played when the code changes",
  subject: {},
  inputs: {},
  update: (m: Model): Result => playing(m),
})
const pin = action({
  name: "pin",
  description: "Keep the current tellings of every scenario as the baseline the next ones are compared with",
  subject: {},
  inputs: {},
  update: (m: Model, _args, call): Result =>
    m.plays.length
      ? { model: { ...m, pin: { t: call.t ?? 0, texts: Object.fromEntries(m.plays.map((p) => [p.name, p.steps.map((s) => s.tellings.map((t) => t.text))])) } } }
      : { refused: "Nothing is played yet: wait for the play under way" },
})
const unpin = action({
  name: "unpin",
  description: "Drop the baseline",
  subject: {},
  inputs: {},
  update: ({ pin: _pin, ...m }: Model): Result => ({ model: m }),
})

const scenarioOf = (name: string) => SCENARIOS.find((s) => s.name === name)
const stepSize = (step: Played): Size => sum(step.tellings.map((t) => size(t.text)))
/** Whether a play has nothing pinned to compare with: there is a pin, and it was taken before the scenario was. */
const unpinned = (m: Model, play: Play) => m.pin !== undefined && m.pin.texts[play.name] === undefined
/** A delta in words, or new where the play has nothing pinned. */
const against = (m: Model, play: Play, d: Delta, texts?: number) => (unpinned(m, play) ? "new" : said(d, texts))
/** A step's tellings against the pin; none where nothing is pinned. */
const deltas = (m: Model, play: Play, n: number): Delta[] | undefined => {
  const pinned = m.pin?.texts[play.name]?.[n]

  return m.pin && play.steps[n]!.tellings.map((t, i) => delta(t.text, pinned?.[i]))
}
const stepDelta = (m: Model, play: Play, n: number) => {
  const all = deltas(m, play, n)

  return all && together(all)
}
const playDelta = (m: Model, play: Play) => {
  if (!m.pin) return undefined

  const all = play.steps.flatMap((_, n) => deltas(m, play, n)!)

  return { delta: together(all), texts: all.filter((d) => d.differs).length }
}
const shortWho: Record<Played["who"], string> = { harness: "harness", person: "person", agent: "agent", surface: "surface", root: "root", project: "project" }

/** A scenario as / lists it: its size over every step, and how it moved from the pin. */
const row = (m: Model, scenario: Scenario) => {
  const play = m.plays.find((p) => p.name === scenario.name)
  const total = play && sum(play.steps.map(stepSize))
  const moved = play && playDelta(m, play)

  return {
    at: `/scenarios/${scenario.name}`,
    name: scenario.name,
    group: GROUPS[scenario.group],
    title: scenario.title,
    steps: scenario.steps.length,
    ...total,
    ...(moved && { delta: against(m, play, moved.delta, moved.texts) }),
    ...(play?.error && { error: play.error }),
  }
}

/** A step as its scenario lists it: who did what, and the size of what the agent was given. */
const stepRow = (m: Model, play: Play, n: number) => {
  const step = play.steps[n]!
  const moved = stepDelta(m, play, n)

  return {
    at: `/scenarios/${play.name}/${n + 1}`,
    n: n + 1,
    who: shortWho[step.who],
    did: step.did,
    given: step.tellings.length ? step.tellings.map((t) => (t.text ? t.carrier.replace(/ to .*/, "") : `${t.carrier.replace(/ to .*/, "")}: nothing`)).join(" + ") : "nothing",
    ...stepSize(step),
    ...(moved && { delta: against(m, play, moved) }),
    ...(step.timing && { timing: step.timing }),
    ...(step.unhooked && { unhooked: true }),
  }
}

/** A step whole: what changed in the project, which tabs the person's page had, and each text the agent was given with its size, its delta and, where it differs, the pinned text. */
const stepWhole = (m: Model, play: Play, n: number) => {
  const step = play.steps[n]!
  const all = deltas(m, play, n)
  const pinned = m.pin?.texts[play.name]?.[n]
  const at = `/scenarios/${play.name}/${n + 1}`

  return {
    at,
    scenario: play.name,
    n: n + 1,
    who: step.who,
    did: step.did,
    ...(step.timing && { timing: step.timing }),
    ...(step.unhooked && { unhooked: "the harness ran no hook for this step" }),
    changed: step.changed.length ? step.changed : "nothing",
    page: pageRow(step, at),
    tellings: step.tellings.map((t, i) => ({
      carrier: t.carrier,
      ...size(t.text),
      ...(all && { delta: against(m, play, all[i]!) }),
      text: t.text,
      ...(all?.[i]!.differs && pinned?.[i] !== undefined && { pinned: pinned[i] }),
    })),
  }
}

/** What the person's page showed after a step, in a line: the tab in front and the others, and an at to their views. */
const pageRow = (step: Played, at: string) => {
  const { tabs, shown, asleep } = step.page ?? { tabs: [] }

  return {
    at: `${at}/page`,
    tabs: tabs.length ? tabs.map((t) => `${t.surface} ${t.at}${t.at === shown ? " (in front)" : ""}`) : "none open",
    ...(asleep && { asleep: true }),
  }
}

/** The demo's surfaces as / of /demo lists them: as explored, with the facts the plays saw at / besides, which the surface's own commands bring; a play that changes the demo's code shows what is not the demo's. */
const demoView = (m: Model) =>
  m.shape?.map((s) => {
    const seen = m.plays.filter((p) => !scenarioOf(p.name)?.steps.some((step) => step.kind === "code")).flatMap((p) => p.steps.flatMap((step) => (step.page?.tabs ?? []).filter((t) => t.surface === s.name).map((t) => t.view)))

    return {
      ...s,
      views: s.views.map((v) => {
        if (v.path !== "/") return v

        const facts = listed(v.facts)

        for (const view of seen) factsOf(view, facts)

        return { ...v, facts: factsSaid(facts) }
      }),
    }
  })

/** A scenario with its steps as rows. */
function scenarioView(m: Model, name: string) {
  const scenario = scenarioOf(name)
  const play = m.plays.find((p) => p.name === name)

  if (!scenario) return undefined

  const moved = play && playDelta(m, play)

  return {
    name: scenario.name,
    title: scenario.title,
    about: scenario.about,
    ...(play && sum(play.steps.map(stepSize))),
    ...(moved && { delta: against(m, play, moved.delta, moved.texts) }),
    ...(play?.error && { error: play.error }),
    steps: play ? play.steps.map((_, n) => stepRow(m, play, n)) : "not played yet",
  }
}

const pages = view<Model, Command>([replay, pin, unpin], {
  "/": (m) => ({
    title: "Design Document",
    how: HOW,
    ...(m.playing && { playing: true }),
    ...(m.failure && { failure: m.failure }),
    scenarios: SCENARIOS.map((s) => row(m, s)),
    demo: { at: "/demo" },
    ...(m.pin && { pinned: new Date(m.pin.t).toISOString().replace(/\.\d{3}Z$/, "Z") }),
    play: replay.bind({}),
    ...(m.plays.length && !m.playing && { pin: pin.bind({}) }),
    ...(m.pin && { unpin: unpin.bind({}) }),
  }),
  "/demo": (m) => ({
    about:
      "The demo project the scenarios are played on: a .baba/ with these surfaces, made afresh for each play and removed after it. " +
      "Each place gives these facts and offers these actions; an ask is the person's alone; itself: the commands a surface starts, which change it with no call.",
    surfaces: demoView(m) ?? "not played yet",
  }),
  "/scenarios/:name": (m, { name }) => scenarioView(m, name!),
  "/scenarios/:name/:n": (m, { name, n }) => {
    const play = m.plays.find((p) => p.name === name)
    const i = Number(n) - 1

    return play && Number.isInteger(i) && i >= 0 && i < play.steps.length ? stepWhole(m, play, i) : undefined
  },
  "/scenarios/:name/:n/page": (m, { name, n }) => {
    const step = m.plays.find((p) => p.name === name)?.steps[Number(n) - 1]

    return step && { ...(step.page ?? { tabs: [] }) }
  },
  // The page's: a scenario laid out whole, every step with its texts and the page it left, as the timeline shows it.
  "/timeline/:name": (m, { name }) => {
    const scenario = scenarioOf(name!)
    const play = m.plays.find((p) => p.name === name)

    return scenario && play ? { ...scenarioView(m, name!), steps: play.steps.map((step, n) => ({ ...stepWhole(m, play, n), page: step.page ?? { tabs: [] } })) } : undefined
  },
})

/** What a play changed from the one before, said once: which scenarios' texts are not what they were. */
function noticed(before: Play[], after: Play[]): Notice[] {
  if (!before.length) return []

  const texts = (p: Play | undefined) => masked(JSON.stringify(p?.steps.map((s) => s.tellings.map((t) => t.text)) ?? []))
  // A scenario played for the first time has nothing to have changed from.
  const moved = after.filter((p) => before.some((b) => b.name === p.name) && texts(p) !== texts(before.find((b) => b.name === p.name)))

  return moved.length ? [`Played again: what ${moved.map((p) => p.name).join(", ")} ${moved.length === 1 ? "tells" : "tell"} the agent changed`] : []
}

function update(m: Model, event: Event): Result {
  if (event.kind === "changed") return playing(m)
  if (event.kind === "unplayed") return { model: { ...m, playing: false, again: false, failure: event.error } }
  if (event.kind !== "played") return { model: m }

  const { failure: _failure, ...kept } = m
  const plays = SCENARIOS.flatMap((s) => event.plays.find((p) => p.name === s.name) ?? m.plays.find((p) => p.name === s.name) ?? [])
  const notices = noticed(m.plays, event.plays)

  if (event.partial) return { model: { ...kept, plays, ...(event.shape && { shape: event.shape }) }, notices }

  const next = { ...kept, plays, playing: false, again: false, ...(event.shape && { shape: event.shape }) }

  return m.again ? { ...playing(next), notices } : { model: next, notices }
}

/** Calls `fn` once things stop changing under the watched directories, and once at the start. */
async function watching(fn: () => void, signal: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(fn, 300)
  }
  const watchers: FSWatcher[] = []

  for (const dir of WATCHED)
    try {
      watchers.push(watch(dir, { recursive: true }, later))
    } catch {}
  fn()
  await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }))
  clearTimeout(timer)
  for (const w of watchers) w.close()
}

export default surface<Model, Event, Command>({
  description: "Inspect what babavoss gives an agent: canonical scenarios played on a demo project, every hook text and answer verbatim and measured. Use when the told content is designed or changed.",
  init: () => ({ plays: [], playing: false }),
  restore: (saved) => {
    const kept = saved as Partial<Model> | undefined

    return { plays: Array.isArray(kept?.plays) ? kept.plays : [], playing: false, ...(kept?.pin && { pin: kept.pin }), ...(Array.isArray(kept?.shape) && { shape: kept.shape }) }
  },
  start: () => [{ kind: "watch" }],
  session: (c) => c.kind === "watch",
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : update(m, message)),
  view: pages.view,
  async run(command, send, signal) {
    if (command.kind === "watch") return watching(() => send({ kind: "changed" }), signal)
    // Those that take real time are played beside the rest, and told once the rest are, so the page fills at once.
    const later = Promise.all(SCENARIOS.filter(slow).map((s) => play(s, signal)))
    const [plays, demo] = await Promise.all([Promise.all(SCENARIOS.filter((s) => !slow(s)).map((s) => play(s, signal))), shape()])

    send({ kind: "played", plays, shape: demo, ...(SCENARIOS.some(slow) && { partial: true as const }) })
    if (SCENARIOS.some(slow)) send({ kind: "played", plays: await later })
  },
  failed: (command, error) => (command.kind === "play" ? { kind: "unplayed", error } : { kind: "none" }),
})
