// Playground: agent sessions with the chosen app loaded, in workspaces the person makes from presets and keeps until
// they delete them, prompted by the person or driven by a scenario. The apps under the project are its scopes: with
// several, the person or the agent selects one first; with one, it is chosen from the start. A session is a child of its
// workspace; one is live at a time, and a stopped one can be resumed where it was. The workspaces on disk are the record:
// the model holds what was last read from them, the session live or in view, and the selection.
import { resolve } from "node:path"
import { action, surface, view, type Update, type View } from "#babavoss/core/index.ts"
import type { AgentEvent, AgentOptions, HarnessModel, Json, Tokens, Tuning } from "#babavoss/core/index.ts"
import { contextOf, marked } from "./context.ts"
import type { FoundApp, AppRef } from "./apps.ts"
import { EMPTY, emptyPreset, type Preset, type Problem, type Scan, type ScenarioFile, type Setup } from "./scenarios.ts"
import type { WorkspaceSummary } from "./workspaces.ts"

export type SkillBody = { title: string; text: string }
export type By = "person" | "scenario"
export type Entry =
  | { at: number; kind: "you"; text: string; by: By }
  | { at: number; kind: "text"; text: string }
  | { at: number; kind: "thinking"; text?: string; durationMs?: number }
  | { at: number; kind: "tool"; id: string; name: string; input: unknown; output?: string; error?: boolean; skillBodies?: SkillBody[] }
  | { at: number; kind: "skill"; title: string; text: string }
  | { at: number; kind: "call"; by: By; path: string; handle: string; input: unknown; refused?: string; result?: unknown }
  | { at: number; kind: "read"; path: string; view: unknown }
  | { at: number; kind: "turn"; durationMs?: number; costUsd?: number; tokens?: Tokens; window?: number }
  | { at: number; kind: "note"; text: string }
  /** What a model call read, as the harness measured it: kept with the trace, so what came before it is what it read. */
  | { at: number; kind: "context"; tokens: number; cached?: number; window?: number }
/** new: no prompt yet, the harness starts with the first one. */
export type Status = "new" | "idle" | "busy" | "exited"
export type ScenarioState = { name: string; state: "running" | "done" | "failed"; error?: string }
/** A session as its record keeps it: sessions/<n>.json in its workspace. */
export type SessionRecord = {
  /** The workspace it is a child of, by id, and its number there. */
  workspace: string
  n: number
  setup: string
  harness: AgentOptions["harness"]
  app: AppRef
  preset: string
  status: Status
  /** The harness's own session id, once it has one: what a resume continues. */
  session?: string
  /** What it runs under as asked, by its setup or the person: a model as the harness offers it, an effort; unset, the harness's own. */
  model?: string
  effort?: string
  /** The model as the harness named it when it started. */
  ran?: string
  scenario?: ScenarioState
  error?: string
  startedAt: number
  endedAt?: number
  transcript: Entry[]
}
export type SessionSummary = Omit<SessionRecord, "transcript"> & { costUsd?: number }
/** A session live or in view: its record, its workspace's directory, and the app's page and view while it runs. */
export type Run = SessionRecord & { dir: string; page?: string; view?: Json; commands?: string[] }
/** What a harness offers to run under, as it said when asked, or why it did not say. */
export type Offers = { models: HarnessModel[] } | { error: string }
export type Model = {
  /** The apps found under the project; undefined until looked for. */
  apps?: FoundApp[]
  /** The chosen app, by id; its scenarios, setups and presets are what the scan read from its directory. */
  app?: string
  scan?: Scan
  /** The selected setup and preset, by name. */
  chosen?: string
  preset?: string
  /** The model and effort the person last picked under each setup, by its name: what a new session under it starts with. */
  picks?: Record<string, Tuning>
  /** What each harness the setups name offers, asked once the setups are read and on every rescan. */
  offers?: Partial<Record<AgentOptions["harness"], Offers>>
  /** The chosen app's workspaces as last read, newest first, and the one open. */
  workspaces?: WorkspaceSummary[]
  workspace: string | null
  /** The one live session, or the last, until another replaces it. */
  live: Run | null
  /** A session put in view that is not the live one, read from its record. */
  look: Run | null
  /** What went wrong with the workspaces on disk, until they are read again. */
  trouble?: string
}
/** What the ports need to start a session besides its options: the app's directory, its state's base, a scenario. */
export type Provision = { app: string; state: string; scenario?: ScenarioFile }
/** What follows a workspace made for a run: a session started in it under a setup, with a scenario. */
export type Next = { setup: string; scenario?: ScenarioFile }
export type Command =
  | { kind: "discover" }
  | { kind: "scan"; app: string; path: string }
  | { kind: "list"; app: string; path: string }
  | { kind: "offers"; harness: AgentOptions["harness"] }
  | { kind: "create"; app: string; path: string; preset: string; scenario?: string; replace: string[]; next?: Next }
  | { kind: "trash"; app: string; path: string; id: string }
  | { kind: "read"; app: string; path: string; workspace: string; n: number; resume: boolean }
  | { kind: "record"; dir: string; session: SessionRecord }
  | { kind: "start"; key: string; options: AgentOptions; provision: Provision }
  | { kind: "send"; key: string; text: string }
  | { kind: "tune"; key: string; tuning: Tuning }
  | { kind: "stop"; key: string }
/** What the ports report: the agent's events, its app's page and view, what a scenario did on the user side, how it ended. */
export type PortEvent =
  | AgentEvent
  | { kind: "page"; url: string }
  | { kind: "view"; view: Json }
  | { kind: "you"; text: string }
  | { kind: "call"; by: By; path: string; handle: string; input: unknown; refused?: string; result?: unknown }
  | { kind: "read"; path: string; view: unknown }
  | { kind: "note"; text: string }
  | { kind: "scenario"; state: "done" | "failed"; error?: string }
export type Event =
  | { kind: "discovered"; apps: FoundApp[] }
  | { kind: "scanned"; app: string; scan: Scan }
  | { kind: "listed"; app: string; workspaces: WorkspaceSummary[] }
  | { kind: "offered"; harness: AgentOptions["harness"]; offers: Offers }
  | { kind: "created"; app: string; workspace: WorkspaceSummary; trashed: string[]; next?: Next }
  | { kind: "trashed"; app: string; id: string }
  | { kind: "read"; app: string; workspace: string; record: SessionRecord | undefined; resume: boolean }
  | { kind: "agent"; key: string; event: PortEvent }
  | { kind: "failed"; key: string; error: string }
  | { kind: "trouble"; message: string }
/**
 * What the util needs from outside: the apps under the project found, the chosen one's scenarios, setups and presets
 * read; its workspaces listed, made from a preset, moved to the trash, a session's record read and written; the agent
 * started and held by key. Trashing a workspace stops what runs in it first. A start with a scenario runs it and leaves
 * the agent up.
 */
export type PlaygroundPorts = {
  discover(): Promise<FoundApp[]>
  scan(appDir: string): Promise<Scan>
  /** The models the installed harness offers, each with its efforts, as the harness says; absent, nothing is offered to pick from. */
  models?(harness: AgentOptions["harness"]): Promise<HarnessModel[]>
  workspaces(appDir: string): Promise<WorkspaceSummary[]>
  create(appDir: string, preset: string, scenario?: string): Promise<WorkspaceSummary>
  trash(appDir: string, id: string): Promise<void>
  session(appDir: string, id: string, n: number): Promise<SessionRecord | undefined>
  record(dir: string, session: SessionRecord): void
  start(key: string, options: AgentOptions, onEvent: (event: PortEvent) => void, provision: Provision): void
  send(key: string, text: string): void
  /** The model and effort a running agent's next call runs under. */
  tune(key: string, tuning: Tuning): void
  stop(key: string): void
}

const KEEP = 2000

export const alive = (r: { status: Status }) => r.status !== "exited"
/** A session's key among everything the util has started: its workspace and its number there. */
export const keyOf = (r: { workspace: string; n: number }) => `${r.workspace}/${r.n}`

const noted = (r: Run, entry: Entry): Run => ({ ...r, transcript: [...r.transcript, entry].slice(-KEEP) })
const tooled = (r: Run, id: string, next: (t: Extract<Entry, { kind: "tool" }>) => Entry): Run => ({
  ...r,
  transcript: r.transcript.map((e) => (e.kind === "tool" && e.id === id ? next(e) : e)),
})
const ended = <R extends SessionRecord>(r: R, error: string): R =>
  r.scenario?.state === "running" ? { ...r, scenario: { ...r.scenario, state: "failed", error } } : r
/** A session no longer running, though its record may say otherwise: a process does not outlive the runtime. */
const gone = (r: Run, why: string, at = Date.now()): Run =>
  alive(r) ? noted(ended({ ...r, status: "exited", endedAt: at }, why), { at, kind: "note", text: why }) : r

/** The session after one of the ports' events. */
export const heard = (r: Run, e: PortEvent, at: number): Run => {
  switch (e.kind) {
    case "started":
      return { ...r, session: e.session, ...(e.model && { ran: e.model }), ...(e.commands && { commands: e.commands }) }
    case "context":
      return noted(r, { at, kind: "context", tokens: e.tokens, ...(e.cached !== undefined && { cached: e.cached }), ...(e.window && { window: e.window }) })
    case "page":
      return { ...r, page: e.url }
    case "view":
      return { ...r, view: e.view }
    case "you":
      return noted({ ...r, status: "busy" }, { at, kind: "you", text: e.text, by: "scenario" })
    case "call":
      return noted(r, {
        at,
        kind: "call",
        by: e.by,
        path: e.path,
        handle: e.handle,
        input: e.input,
        ...(e.refused !== undefined && { refused: e.refused }),
        ...(e.result !== undefined && { result: e.result }),
      })
    case "read":
      return noted(r, { at, kind: "read", path: e.path, view: e.view })
    case "note":
      return noted(r, { at, kind: "note", text: e.text })
    case "scenario":
      if (r.scenario?.state !== "running") return r

      return e.state === "failed"
        ? noted(
            { ...r, scenario: { ...r.scenario, state: "failed", ...(e.error && { error: e.error }) } },
            { at, kind: "note", text: `scenario failed: ${e.error ?? "unknown"}` }
          )
        : noted({ ...r, scenario: { name: r.scenario.name, state: "done" } }, { at, kind: "note", text: "scenario done" })
    case "thinking":
      return noted(r, { at, kind: "thinking", ...(e.text && { text: e.text }), ...(e.durationMs !== undefined && { durationMs: e.durationMs }) })
    case "text":
      return noted(r, { at, kind: "text", text: e.text })
    case "tool":
      return noted(r, { at, kind: "tool", id: e.id, name: e.name, input: e.input })
    case "result":
      return tooled(r, e.id, (t) => ({ ...t, output: e.output, ...(e.error && { error: true }) }))
    case "skill":
      // A resumed session may repeat a skill body; a tool keeps each once.
      return e.tool && r.transcript.some((t) => t.kind === "tool" && t.id === e.tool)
        ? tooled(r, e.tool, (t) =>
            t.skillBodies?.some((a) => a.title === e.title && a.text === e.text)
              ? t
              : { ...t, skillBodies: [...(t.skillBodies ?? []), { title: e.title, text: e.text }] }
          )
        : noted(r, { at, kind: "skill", title: e.title, text: e.text })
    case "turn-done":
      return noted(
        { ...r, status: "idle" },
        {
          at,
          kind: "turn",
          ...(e.durationMs !== undefined && { durationMs: e.durationMs }),
          ...(e.costUsd !== undefined && { costUsd: e.costUsd }),
          ...(e.tokens && { tokens: e.tokens }),
          ...(e.window && { window: e.window }),
        }
      )
    case "exited":
      return noted(ended({ ...r, status: "exited", endedAt: at, ...(e.error && { error: e.error }) }, "the agent exited"), {
        at,
        kind: "note",
        text: e.error ? `exited: ${e.error}` : `exited (${e.code})`,
      })
    case "raw":
      return r
  }
}

/** The events after which a session's record is written: where it stands changes, or a turn ends. */
const RECORDED = new Set<PortEvent["kind"]>(["started", "turn-done", "exited", "scenario"])

/**
 * The options an agent is started with under a setup in a workspace, on the model and effort asked, the app under
 * development loaded: the workspace's files/ to work in, its home/ for the harness; resuming the harness's own session
 * when given one.
 */
export const optionsOf = (setup: Setup, under: Tuning, dir: string, appDir: string, resume?: string): AgentOptions => ({
  harness: setup.harness,
  cwd: `${dir}/files`,
  skillDirs: [appDir],
  ...(under.model && { model: under.model }),
  ...(under.effort && { effort: under.effort }),
  sandbox: setup.sandbox,
  home: `${dir}/home`,
  ...(resume && { resume }),
})

/** Totals of a session: cost and tokens over its turns, and how long it lasted once ended. */
export const spent = (r: SessionRecord): { costUsd?: number; tokens?: Tokens; durationMs?: number } => {
  const turns = r.transcript.filter((e): e is Extract<Entry, { kind: "turn" }> => e.kind === "turn")
  const cost = turns.reduce<number | undefined>((sum, t) => (t.costUsd === undefined ? sum : (sum ?? 0) + t.costUsd), undefined)
  // The cache's part is summed where every turn said it; a turn that did not leaves it unknown.
  const part = (key: "cached" | "written") => (turns.every((t) => !t.tokens || t.tokens[key] !== undefined) ? key : undefined)
  const keys = [part("cached"), part("written")].filter((k): k is "cached" | "written" => k !== undefined)
  const tokens = turns.reduce<Tokens | undefined>(
    (sum, t) =>
      t.tokens
        ? {
            input: (sum?.input ?? 0) + t.tokens.input,
            output: (sum?.output ?? 0) + t.tokens.output,
            ...Object.fromEntries(keys.map((k) => [k, (sum?.[k] ?? 0) + (t.tokens![k] ?? 0)])),
          }
        : sum,
    undefined
  )
  const duration = r.endedAt !== undefined ? r.endedAt - r.startedAt : undefined

  return { ...(cost !== undefined && { costUsd: cost }), ...(tokens && { tokens }), ...(duration !== undefined && { durationMs: duration }) }
}

/** An app as views name it, without where it is on disk. */
export const refOf = (p: AppRef): AppRef => ({ id: p.id, name: p.name, ...(p.version && { version: p.version }), dir: p.dir })

/** What a session's record holds: the run without its page, view and directory. */
export const recordOf = ({ dir: _dir, page: _page, view: _view, commands: _commands, ...record }: Run): SessionRecord => record

const summaryOf = (r: SessionRecord): SessionSummary => {
  const { transcript: _t, ...rest } = r
  const { costUsd } = spent(r)

  return { ...rest, ...(costUsd !== undefined && { costUsd }) }
}

export function playgroundSurface(ports: PlaygroundPorts, defaults: { project: string }) {
  const found = (model: Model): FoundApp[] => model.apps ?? []
  const appOf = (model: Model): FoundApp | undefined => found(model).find((p) => p.id === model.app)
  const setups = (model: Model): Setup[] => model.scan?.setups ?? []
  const presets = (model: Model): Preset[] => model.scan?.presets ?? [emptyPreset()]
  const chosen = (model: Model): string | undefined => {
    const all = setups(model)

    return all.find((s) => s.name === model.chosen)?.name ?? all[0]?.name
  }
  const picked = (model: Model): string => (presets(model).some((p) => p.name === model.preset) ? model.preset! : EMPTY)
  const setupOf = (model: Model, name: string | undefined): Setup | undefined => setups(model).find((s) => s.name === name)
  const offered = (model: Model, harness: AgentOptions["harness"] | undefined): HarnessModel[] | undefined => {
    const offers = harness && model.offers?.[harness]

    return offers && "models" in offers ? offers.models : undefined
  }
  /** The offered model a setup runs under: the one it names, by id, or the harness's own choice. */
  const modelOf = (models: HarnessModel[] | undefined, setup: Setup | undefined): HarnessModel | undefined =>
    setup?.model ? models?.find((m) => m.id === setup.model) : models?.find((m) => m.default)
  /** The efforts a model takes, when the harness said: the one named, or its own unasked. */
  const takes = (model: Model, harness: AgentOptions["harness"], id: string | undefined) => modelOf(offered(model, harness), { model: id } as Setup)?.efforts
  /** A setup as a new session starts under it: the person's last picks under it over its own model and effort. */
  const under = (model: Model, setup: Setup | undefined): Setup | undefined => {
    if (!setup) return undefined

    const pick = model.picks?.[setup.name]
    const { effort, ...picked } = { ...setup, ...(pick?.model && { model: pick.model }), ...(pick?.effort && { effort: pick.effort }) }
    const known = takes(model, setup.harness, picked.model)

    // An effort the model is known not to take is not passed to it.
    return effort && !(known && !known.includes(effort)) ? { ...picked, effort } : picked
  }
  /** The selected setup, the one last started under, as a session starts under it. */
  const selected = (model: Model): Setup | undefined => under(model, setupOf(model, chosen(model)))
  /** Asking each harness the setups name what it offers. */
  const ask = (model: Model, again = false): Command[] =>
    ports.models
      ? [...new Set(setups(model).map((s) => s.harness))].filter((h) => again || !model.offers?.[h]).map((harness) => ({ kind: "offers" as const, harness }))
      : []
  const scenarioOf = (model: Model, name: string): ScenarioFile | undefined => model.scan?.scenarios.find((s) => s.name === name)
  const workspacesOf = (model: Model): WorkspaceSummary[] => model.workspaces ?? []
  const workspaceOf = (model: Model, id: string | null | undefined): WorkspaceSummary | undefined => workspacesOf(model).find((w) => w.id === id)
  const oneOf = (what: string, names: string[]) => ({ refused: `${what} is one of: ${names.join(", ") || "none yet"}` })
  const refuseSetup = (model: Model) =>
    oneOf(
      "setup",
      setups(model).map((s) => s.name)
    )
  const refusePreset = (model: Model) =>
    oneOf(
      "preset",
      presets(model).map((p) => p.name)
    )
  const refuseWorkspace = (model: Model) =>
    oneOf(
      "workspace",
      workspacesOf(model).map((w) => w.id)
    )
  // Not offered without an app, so the door refuses first; here for the type.
  const noApp = () => ({ refused: "No app is chosen" })
  const isLive = (model: Model, r: { workspace: string; n: number }) => !!model.live && alive(model.live) && keyOf(model.live) === keyOf(r)
  /** The session in view: one looked at, or the live one. */
  const inView = (model: Model): Run | null => model.look ?? model.live

  /** The workspaces with a session's summary put in, in place of its earlier one. */
  const withSession = (model: Model, r: SessionRecord): WorkspaceSummary[] | undefined =>
    model.workspaces?.map((w) =>
      w.id === r.workspace ? { ...w, sessions: [...w.sessions.filter((s) => s.n !== r.n), summaryOf(r)].sort((a, b) => a.n - b.n) } : w
    )
  /** The model with the live session as `next`, its record written. */
  const keep = (model: Model, next: Run): { model: Model; commands: Command[] } => ({
    model: { ...model, live: next, workspaces: withSession(model, next) },
    commands: [{ kind: "record", dir: next.dir, session: recordOf(next) }],
  })
  /** The live session stopped and set aside as exited, its record written so, before another takes its place. */
  const retire = (model: Model, why: string): { model: Model; commands: Command[] } => {
    if (!model.live || !alive(model.live)) return { model, commands: [] }

    const done = keep(model, gone(model.live, why))

    return { model: done.model, commands: [{ kind: "stop", key: keyOf(model.live) }, ...done.commands] }
  }
  /** The app chosen, its scan and workspaces to come; the live session stopped, no workspace open. */
  const into = (model: Model, p: FoundApp): Update<Model, Command> => {
    const off = retire(model, "stopped: another app was chosen")

    return {
      model: { ...off.model, app: p.id, scan: undefined, workspaces: undefined, workspace: null, live: null, look: null },
      commands: [...off.commands, { kind: "scan", app: p.id, path: p.path }, { kind: "list", app: p.id, path: p.path }],
    }
  }
  /**
   * A session in a workspace in place of the live one, which is stopped first: a new one numbered after the workspace's
   * last, or `resumed`, an exited one going on from its record in the same files, home and state.
   */
  const begin = (
    model: Model,
    p: FoundApp,
    w: WorkspaceSummary,
    setup: Setup,
    how: { scenario?: ScenarioFile; resumed?: SessionRecord }
  ): Update<Model, Command> => {
    const off = retire(model, "stopped: another session started")
    const at = Date.now()
    const r: Run = how.resumed
      ? noted(
          { ...how.resumed, dir: w.dir, setup: setup.name, harness: setup.harness, status: "idle", error: undefined, endedAt: undefined },
          { at, kind: "note", text: `resumed under ${setup.name}` }
        )
      : {
          workspace: w.id,
          dir: w.dir,
          n: Math.max(0, ...w.sessions.map((s) => s.n)) + 1,
          setup: setup.name,
          harness: setup.harness,
          ...(setup.model && { model: setup.model }),
          ...(setup.effort && { effort: setup.effort }),
          app: refOf(p),
          preset: w.preset,
          status: "new",
          ...(how.scenario && { scenario: { name: how.scenario.name, state: "running" as const } }),
          startedAt: at,
          transcript: [],
        }
    const kept = keep({ ...off.model, workspace: w.id, look: null }, r)

    return {
      model: kept.model,
      commands: [
        ...off.commands,
        ...kept.commands,
        {
          kind: "start",
          key: keyOf(r),
          options: optionsOf(setup, { model: r.model, effort: r.effort }, w.dir, p.path, how.resumed?.session),
          provision: { app: p.path, state: `${w.dir}/state`, ...(how.scenario && { scenario: how.scenario }) },
        },
      ],
    }
  }
  /** Resume a session from its record: under the setup it ran under, when that is still named. */
  const resumeFrom = (model: Model, record: SessionRecord): Update<Model, Command> => {
    const p = appOf(model)
    const w = workspaceOf(model, record.workspace)

    if (!p) return noApp()
    if (!w) return refuseWorkspace(model)
    if (alive(record) || isLive(model, record)) return { refused: `Session ${record.n} is not stopped` }
    if (!record.session) return { refused: `Session ${record.n} never reached the harness; start a new one` }

    const setup = setupOf(model, record.setup)

    if (!setup) return { refused: `Session ${record.n} ran under setup ${record.setup}, which scenarios/setups.yaml no longer names` }
    if (setup.harness !== record.harness) return { refused: `Setup ${setup.name} is now ${setup.harness}; session ${record.n} ran in ${record.harness}` }

    return begin(model, p, w, setup, { resumed: record })
  }

  const select = action({
    name: "select",
    description: ({ app }) => `Open the playground for app ${app}; a live session is stopped and the workspace closed`,
    subject: { app: "string" },
    inputs: {},
    update(model: Model, { app }): Update<Model, Command> {
      const p = found(model).find((x) => x.id === app)

      if (!p)
        return oneOf(
          "app",
          found(model).map((x) => x.id)
        )

      return p.id === model.app ? { model } : into(model, p)
    },
  })
  const back = action({
    name: "back",
    description: "Return to the list of apps; a live session is stopped and the workspace closed",
    subject: {},
    inputs: {},
    update(model: Model): Update<Model, Command> {
      if (model.app === undefined) return { refused: "No app is open" }

      const off = retire(model, "stopped: the app was left")

      return {
        model: { ...off.model, app: undefined, scan: undefined, workspaces: undefined, workspace: null, live: null, look: null },
        commands: off.commands,
      }
    },
  })
  /**
   * The session in view on a model or effort from its next call, its setup's next sessions with it: a live one is tuned
   * where it runs, a stopped one resumes under it. An effort the new model does not take gives way to its own.
   */
  const tune = (model: Model, next: Tuning): Update<Model, Command> => {
    const r = inView(model)

    if (!r) return { refused: "No session is in view" }

    const models = offered(model, r.harness)
    const id = next.model ?? r.model

    if (next.model && models && !models.some((m) => m.id === next.model)) return { refused: `model is one of: ${models.map((m) => m.id).join(", ")}` }

    const running = modelOf(models, { model: id } as Setup)
    const known = running?.efforts

    if (next.effort && known && !known.includes(next.effort))
      return { refused: known.length ? `effort is one of: ${known.join(", ")}` : "This model takes no effort" }

    const effort = next.effort ?? (r.effort && known && !known.includes(r.effort) ? running?.effort : r.effort)
    const tuned: Run = noted(
      { ...r, ...(id && { model: id }), effort },
      { at: Date.now(), kind: "note", text: `from here on ${[id ?? "the default model", effort].filter(Boolean).join(" · ")}` }
    )
    const picks = { ...model.picks, [r.setup]: { ...(id && { model: id }), ...(effort && { effort }) } }
    const live = isLive(model, r)

    if (!live)
      return {
        model: { ...model, picks, look: tuned, workspaces: withSession(model, tuned) },
        commands: [{ kind: "record", dir: tuned.dir, session: recordOf(tuned) }],
      }

    const kept = keep({ ...model, picks }, tuned)

    return {
      ...kept,
      commands: [
        { kind: "tune", key: keyOf(r), tuning: { ...(next.model && { model: next.model }), ...(effort !== r.effort && effort && { effort }) } },
        ...kept.commands,
      ],
    }
  }
  const setModel = action({
    name: "model",
    description: "Run the session in view on this model from its next call, one its harness offers; its setup's next sessions too",
    subject: {},
    inputs: { model: "string" },
    update: (model: Model, { model: id }): Update<Model, Command> => (id ? tune(model, { model: id }) : { refused: "A model is needed" }),
  })
  const setEffort = action({
    name: "effort",
    description: "Run the session in view at this effort from its next call, one its model takes; its setup's next sessions too",
    subject: {},
    inputs: { effort: "string" },
    update: (model: Model, { effort }): Update<Model, Command> => (effort ? tune(model, { effort }) : { refused: "An effort is needed" }),
  })
  const pick = action({
    name: "pick",
    description: "Select the preset a new workspace is made from, and a scenario's that names none",
    subject: {},
    inputs: { preset: "string" },
    update: (model: Model, { preset }): Update<Model, Command> =>
      presets(model).some((p) => p.name === preset) ? { model: { ...model, preset } } : refusePreset(model),
  })
  const create = action({
    name: "create",
    description: 'Make a workspace from a preset and open it; "" is the selected preset',
    subject: {},
    inputs: { preset: "string" },
    update(model: Model, { preset }): Update<Model, Command> {
      const p = appOf(model)

      if (!p) return noApp()

      const from = preset || picked(model)

      if (!presets(model).some((x) => x.name === from)) return refusePreset(model)

      return { model, commands: [{ kind: "create", app: p.id, path: p.path, preset: from, replace: [] }] }
    },
  })
  const open = action({
    name: "open",
    description: ({ workspace }) => `Open workspace ${workspace}: new sessions start in it`,
    subject: { workspace: "string" },
    inputs: {},
    update: (model: Model, { workspace }): Update<Model, Command> =>
      workspaceOf(model, workspace) ? { model: { ...model, workspace } } : refuseWorkspace(model),
  })
  const remove = action({
    name: "delete",
    description: ({ workspace }) => `Move workspace ${workspace} to the trash, its sessions with it; a live session there is stopped`,
    subject: { workspace: "string" },
    inputs: {},
    update(model: Model, { workspace }): Update<Model, Command> {
      const p = appOf(model)

      if (!p) return noApp()
      if (!workspaceOf(model, workspace)) return refuseWorkspace(model)

      // Its sessions are let go here, so nothing is written into it while it moves; the trash stops what runs there.
      return {
        model: {
          ...model,
          workspaces: workspacesOf(model).filter((w) => w.id !== workspace),
          workspace: model.workspace === workspace ? null : model.workspace,
          live: model.live?.workspace === workspace ? null : model.live,
          look: model.look?.workspace === workspace ? null : model.look,
        },
        commands: [{ kind: "trash", app: p.id, path: p.path, id: workspace }],
      }
    },
  })
  const start = action({
    name: "start",
    description:
      'Start a new session in the open workspace under a setup, to prompt by hand, on the model and effort last picked under it; "" is the one last started under. A live session is stopped first',
    subject: {},
    inputs: { setup: "string" },
    update(model: Model, { setup: name }): Update<Model, Command> {
      const p = appOf(model)
      const w = workspaceOf(model, model.workspace)

      if (!p) return noApp()
      if (!w) return { refused: "No workspace is open: create or open one" }

      const setup = under(model, setupOf(model, name || chosen(model)))

      return setup ? begin({ ...model, chosen: setup.name }, p, w, setup, {}) : refuseSetup(model)
    },
  })
  /**
   * A scenario run `where`: in a workspace by id; null, in one of its own made from its preset, in place of the one its
   * last run made; "", where it belongs: one of its own when it names a preset, whose files it needs, else the open one.
   */
  const runIn = (model: Model, name: string, where: string | null): Update<Model, Command> => {
    const p = appOf(model)

    if (!p) return noApp()

    const scenario = scenarioOf(model, name)

    if (!scenario)
      return oneOf(
        "scenario",
        (model.scan?.scenarios ?? []).map((s) => s.name)
      )

    // A scenario that names a setup runs under it as written; one that names none, under the selected one as picked.
    const setup = scenario.setup ? setupOf(model, scenario.setup) : selected(model)

    if (!setup) return refuseSetup(model)

    // The scenario's file is imported afresh by the run; the list catches up with any other edit.
    const rescan: Command = { kind: "scan", app: p.id, path: p.path }
    const at = where === null ? undefined : where || (scenario.preset ? undefined : (model.workspace ?? undefined))

    if (at) {
      const w = workspaceOf(model, at)

      if (!w) return refuseWorkspace(model)

      const begun = begin(model, p, w, setup, { scenario })

      return "model" in begun ? { ...begun, commands: [...(begun.commands ?? []), rescan] } : begun
    }

    const preset = scenario.preset ?? picked(model)

    if (!presets(model).some((x) => x.name === preset)) return refusePreset(model)

    const off = retire(model, "stopped: a scenario started")
    const replace = workspacesOf(model)
      .filter((w) => w.scenario === name)
      .map((w) => w.id)

    return {
      model: {
        ...off.model,
        live: off.model.live && replace.includes(off.model.live.workspace) ? null : off.model.live,
        look: off.model.look && replace.includes(off.model.look.workspace) ? null : off.model.look,
      },
      commands: [...off.commands, { kind: "create", app: p.id, path: p.path, preset, scenario: name, replace, next: { setup: setup.name, scenario } }, rescan],
    }
  }
  const runScenario = action({
    name: "run",
    description: ({ name }) =>
      `Run scenario ${name}: workspace "" runs it in the open workspace, or in one of its own when it names a preset or none is open; an id runs in that workspace`,
    subject: { name: "string" },
    inputs: { workspace: "string" },
    update: (model: Model, { name, workspace }): Update<Model, Command> => runIn(model, name, workspace),
  })
  const runFresh = action({
    name: "fresh",
    description: ({ name }) => `Run scenario ${name} in a workspace of its own, made from its preset, in place of the one its last run made`,
    subject: { name: "string" },
    inputs: {},
    update: (model: Model, { name }): Update<Model, Command> => runIn(model, name, null),
  })
  const look = action({
    name: "look",
    description: ({ session }) => `Put session ${session} in view`,
    subject: { session: "number" },
    inputs: {},
    update(model: Model, { session }, call): Update<Model, Command> {
      const p = appOf(model)
      const id = decodeURIComponent(call.path.split("/")[2] ?? "")

      if (!p) return noApp()
      if (!workspaceOf(model, id)) return refuseWorkspace(model)
      if (model.live && keyOf(model.live) === keyOf({ workspace: id, n: session })) return { model: { ...model, look: null } }

      return { model, commands: [{ kind: "read", app: p.id, path: p.path, workspace: id, n: session, resume: false }] }
    },
  })
  const resume = action({
    name: "resume",
    description: ({ session }) => `Resume session ${session} where it stopped, in its workspace; a live session is stopped first`,
    subject: { session: "number" },
    inputs: {},
    update(model: Model, { session }, call): Update<Model, Command> {
      const p = appOf(model)
      const shown = inView(model)
      const id = call.path === "/session" ? (shown?.workspace ?? "") : decodeURIComponent(call.path.split("/")[2] ?? "")

      if (!p) return noApp()

      const held = [model.look, model.live].find((r) => r && keyOf(r) === keyOf({ workspace: id, n: session }))

      if (held) return resumeFrom(model, held)
      if (!workspaceOf(model, id)) return refuseWorkspace(model)

      return { model, commands: [{ kind: "read", app: p.id, path: p.path, workspace: id, n: session, resume: true }] }
    },
  })
  const send = action({
    name: "send",
    description: "Prompt the agent",
    subject: {},
    inputs: { text: "string" },
    update: (model: Model, { text }): Update<Model, Command> =>
      !model.live || !alive(model.live)
        ? { refused: "No session is running" }
        : !text.trim()
          ? { refused: "A prompt needs text" }
          : {
              model: { ...model, live: noted({ ...model.live, status: "busy" }, { at: Date.now(), kind: "you", text, by: "person" }) },
              commands: [{ kind: "send", key: keyOf(model.live), text }],
            },
  })
  const stop = action({
    name: "stop",
    description: "Stop the agent, and its scenario when one is running",
    subject: {},
    inputs: {},
    update: (model: Model): Update<Model, Command> =>
      model.live && alive(model.live) ? { model, commands: [{ kind: "stop", key: keyOf(model.live) }] } : { refused: "No session is running" },
  })
  const rescan = action({
    name: "rescan",
    description: "Look for the apps under the project again, and read the chosen one's scenarios, setups, presets and workspaces",
    subject: {},
    inputs: {},
    update: (model: Model): Update<Model, Command> => ({ model, commands: [{ kind: "discover" }, ...ask(model, true)] }),
  })

  const workspaceRef = (model: Model, w: WorkspaceSummary): View => ({
    at: `/workspaces/${w.id}`,
    id: w.id,
    name: w.name,
    preset: w.preset,
    created: w.created,
    kind: w.kind,
    ...(w.scenario && { scenario: w.scenario }),
    dir: w.dir,
    sessions: w.sessions.length,
    live: !!model.live && alive(model.live) && model.live.workspace === w.id,
  })
  const resumable = (model: Model, r: SessionSummary) => !alive(r) && !!r.session && !isLive(model, r)
  const sessionRef = (r: SessionSummary): View => ({
    at: `/workspaces/${r.workspace}/sessions/${r.n}`,
    n: r.n,
    setup: r.setup,
    harness: r.harness,
    status: r.status,
    startedAt: r.startedAt,
    ...(r.endedAt !== undefined && { endedAt: r.endedAt }),
    ...(r.costUsd !== undefined && { costUsd: r.costUsd }),
    ...(r.scenario && { scenario: { name: r.scenario.name, state: r.scenario.state } }),
  })
  const summary = (model: Model, r: Run): View => {
    const live = isLive(model, r)
    const w = workspaceOf(model, r.workspace)

    return {
      at: "/session",
      status: r.status,
      setup: r.setup,
      harness: r.harness,
      ...(r.model && { model: r.model }),
      ...(r.effort && { effort: r.effort }),
      ...(r.session && { session: r.session }),
      app: { ...r.app },
      preset: r.preset,
      workspace: w
        ? workspaceRef(model, w)
        : { at: `/workspaces/${r.workspace}`, id: r.workspace, name: r.workspace, preset: r.preset, created: "", kind: "local", dir: r.dir, sessions: 0, live },
      n: r.n,
      ...(r.scenario && { scenario: { ...r.scenario } }),
      ...(r.page && { page: r.page }),
      startedAt: r.startedAt,
      ...(r.endedAt !== undefined && { endedAt: r.endedAt }),
      ...(r.error && { error: r.error }),
      ...spent(r),
      ...(live && r.status !== "busy" && r.scenario?.state !== "running" && { send: send.bind({}) }),
      ...(live && { stop: stop.bind({}) }),
      ...(resumable(model, r) && { resume: resume.bind({ session: r.n }) }),
    }
  }
  /** What the session runs under and what its harness offers to pick from: the models, the efforts of the one in force. */
  const runsUnder = (model: Model, r: Run): View => {
    const offers = model.offers?.[r.harness]
    const models = offered(model, r.harness)
    const running = modelOf(models, { model: r.model } as Setup)

    return {
      ...(r.model && { model: r.model }),
      ...(r.effort && { effort: r.effort }),
      ...(r.ran && { ran: r.ran }),
      ...(models && { models: models.map((m) => ({ ...m })) }),
      ...(running && { efforts: [...running.efforts], ...(running.effort && { unasked: running.effort }) }),
      ...(offers && "error" in offers && { offersError: offers.error }),
      ...(!offers && ports.models && { asking: true }),
      setModel: setModel.bind({}),
      setEffort: setEffort.bind({}),
    }
  }
  const scenarioSummary = (s: ScenarioFile): View => ({
    at: `/scenarios/${s.name}`,
    name: s.name,
    ...(s.description && { description: s.description }),
    ...(s.setup && { setup: s.setup }),
    ...(s.preset && { preset: s.preset }),
    run: runScenario.bind({ name: s.name }),
    fresh: runFresh.bind({ name: s.name }),
  })
  const appSummary = (p: FoundApp): View => ({
    ...refOf(p),
    at: `/apps/${p.id}`,
    ...(p.description && { description: p.description }),
    scenarios: p.scenarios,
    presets: p.presets,
    select: select.bind({ app: p.id }),
  })
  const problems = (model: Model): Problem[] => [...(model.scan?.problems ?? []), ...(model.trouble ? [{ file: "workspaces", message: model.trouble }] : [])]
  /** What the person may call by name in a session of this app: its skills, written as the harness takes them. */
  const commandsOf = (model: Model, r: Run | null): View[] => {
    const app = r?.app.name ?? appOf(model)?.name
    const harness = r?.harness ?? setupOf(model, chosen(model))?.harness
    const skills = model.scan?.skills ?? []

    if (!app || !harness) return []

    return (
      skills
        .map((s) => ({ name: `${app}:${s.name}`, description: s.description }))
        // Where the harness said what it loaded, only what it loaded.
        .filter((c) => !r?.commands || r.commands.includes(c.name))
        .map((c) => ({ ...c, insert: harness === "claude-code" ? `/${c.name} ` : `$${c.name} ` }))
    )
  }
  const pages = view([select, back, setModel, setEffort, pick, create, open, remove, start, runScenario, runFresh, look, resume, send, stop, rescan], {
    "/": (model) => {
      const p = appOf(model)

      if (!p) return { title: "Playground", project: defaults.project, apps: found(model).map(appSummary), app: null, rescan: rescan.bind({}) }

      const shown = inView(model)
      const open_ = workspaceOf(model, model.workspace)

      return {
        title: "Playground",
        project: defaults.project,
        app: refOf(p),
        apps: found(model).map(appSummary),
        ...(found(model).length > 1 && { back: back.bind({}) }),
        // Each as a new session starts under it: the person's last picks over its own.
        setups: setups(model).map((s) => ({ ...under(model, s)! })),
        setup: chosen(model) ?? "",
        presets: presets(model).map((x) => ({ ...x, ...(x.name === EMPTY && { builtin: true }) })),
        preset: picked(model),
        pick: pick.bind({}),
        scenarios: (model.scan?.scenarios ?? []).map(scenarioSummary),
        ...(problems(model).length && { problems: problems(model).map((x) => ({ ...x })) }),
        workspaces: workspacesOf(model).map((w) => ({
          ...workspaceRef(model, w),
          open: open.bind({ workspace: w.id }),
          delete: remove.bind({ workspace: w.id }),
        })),
        workspace: open_?.id ?? null,
        create: create.bind({}),
        ...(open_ && { start: start.bind({}) }),
        session: shown && summary(model, shown),
        rescan: rescan.bind({}),
      }
    },
    // What the person may call by name in the session in view: the app's skills, as the harness takes them.
    "/commands": (model) => (appOf(model) ? { at: "/commands", commands: commandsOf(model, inView(model)) } : undefined),
    // Every app found, whether one is open or not, so a page can offer switching.
    "/apps": (model) => ({ apps: found(model).map(appSummary) }),
    "/apps/:id": (model, { id }) => {
      const p = found(model).find((x) => x.id === id)

      return p && appSummary(p)
    },
    "/scenarios/:name": (model, { name }) => {
      const s = scenarioOf(model, name ?? "")

      return s && { ...scenarioSummary(s), file: s.file, source: s.source }
    },
    "/workspaces/:id": (model, { id }) => {
      const w = workspaceOf(model, id)

      return (
        w && {
          ...workspaceRef(model, w),
          sessions: w.sessions.map((s) => ({
            ...sessionRef(isLive(model, s) ? summaryOf(model.live!) : s),
            look: look.bind({ session: s.n }),
            ...(resumable(model, s) && { resume: resume.bind({ session: s.n }) }),
          })),
          open: open.bind({ workspace: w.id }),
          delete: remove.bind({ workspace: w.id }),
          ...(model.workspace === w.id && { start: start.bind({}) }),
        }
      )
    },
    "/workspaces/:id/sessions/:n": (model, { id, n }) => {
      const s = workspaceOf(model, id)?.sessions.find((x) => x.n === Number(n))

      return (
        s && {
          ...sessionRef(isLive(model, s) ? summaryOf(model.live!) : s),
          look: look.bind({ session: s.n }),
          ...(resumable(model, s) && { resume: resume.bind({ session: s.n }) }),
        }
      )
    },
    "/session": (model) => {
      const shown = inView(model)

      return shown
        ? {
            ...summary(model, shown),
            ...runsUnder(model, shown),
            ...(shown.view !== undefined && { view: shown.view }),
            // The trace with the app's part marked, and its cli commands read back as surface calls.
            transcript: marked(shown.transcript, shown.app.name, resolve(defaults.project, shown.app.dir)) as unknown as View[],
          }
        : undefined
    },
    // What the session in view's context holds: what each call read, of it the app's part, the conversation's, the
    // tools', the harness's own and the rest; the parts estimated from the trace.
    "/session/context": (model) => {
      const shown = inView(model)

      return shown
        ? { at: "/session/context", ...contextOf(shown.transcript, { app: shown.app.name, appDir: resolve(defaults.project, shown.app.dir) }) }
        : undefined
    },
  })

  return surface<Model, Event, Command>({
    description: "Agent sessions with your app loaded, in workspaces made from presets, prompted by you or driven by a scenario; the trace and the app's view",
    init: () => ({ workspace: null, live: null, look: null }),
    // The process does not survive the runtime, nor does the page it served; what it said and did does, in its record. A
    // model kept from before workspaces is dropped but for the selection.
    restore: (saved) => {
      const kept = (saved ?? {}) as Partial<Model>
      const run = (r: unknown): Run | null => {
        const x = r as Run | null | undefined

        return x && typeof x.workspace === "string" && typeof x.dir === "string" && Array.isArray(x.transcript)
          ? (({ page: _gone, view: _seen, ...rest }: Run): Run => rest)(x)
          : null
      }
      const live = run(kept.live)

      return {
        ...(typeof kept.app === "string" && { app: kept.app }),
        ...(kept.chosen && { chosen: kept.chosen }),
        ...(kept.preset && { preset: kept.preset }),
        ...(kept.picks && typeof kept.picks === "object" && { picks: kept.picks }),
        ...(Array.isArray(kept.workspaces) && { workspaces: kept.workspaces }),
        workspace: typeof kept.workspace === "string" ? kept.workspace : null,
        live: live && gone(live, "the runtime restarted; this session's process is gone"),
        look: run(kept.look),
      }
    },
    // The record of a session the restart ended says so; the disk is read again with the apps.
    start: (model) => [
      ...(model.live && model.live.status === "exited" ? [{ kind: "record", dir: model.live.dir, session: recordOf(model.live) } as const] : []),
      { kind: "discover" },
    ],
    working: (m) => m.live?.status === "busy" || m.live?.scenario?.state === "running",
    session: (c) => c.kind === "start",
    update(model, message): Update<Model, Command> {
      if (message.kind === "call") return pages.update(model, message)
      if (message.kind === "discovered") {
        const apps = message.apps
        const kept = apps.find((p) => p.id === model.app) ?? (apps.length === 1 ? apps[0] : undefined)

        if (!kept) return { model: { ...model, apps, app: undefined, scan: undefined, workspaces: undefined, workspace: null } }

        return {
          model: { ...model, apps, app: kept.id },
          commands: [
            { kind: "scan", app: kept.id, path: kept.path },
            { kind: "list", app: kept.id, path: kept.path },
          ],
        }
      }
      if (message.kind === "scanned") {
        if (message.app !== model.app) return { model }

        const next = { ...model, scan: message.scan }

        return { model: next, commands: ask(next) }
      }
      if (message.kind === "offered") return { model: { ...model, offers: { ...model.offers, [message.harness]: message.offers } } }
      if (message.kind === "listed") {
        if (message.app !== model.app) return { model }

        // Only the live session runs; any other a record calls running was cut short by a restart.
        const workspaces = message.workspaces.map((w) => ({
          ...w,
          sessions: w.sessions.map((s) => (alive(s) && !isLive(model, s) ? { ...s, status: "exited" as const } : s)),
        }))
        const live = model.live && workspaces.some((w) => w.id === model.live!.workspace) ? model.live : null

        return {
          model: {
            ...model,
            workspaces: live ? (withSession({ ...model, workspaces }, live) ?? workspaces) : workspaces,
            workspace: workspaces.some((w) => w.id === model.workspace) ? model.workspace : null,
            live,
            look: model.look && workspaces.some((w) => w.id === model.look!.workspace) ? model.look : null,
            trouble: undefined,
          },
        }
      }
      if (message.kind === "created") {
        const p = appOf(model)

        if (!p || message.app !== p.id) return { model }

        const opened: Model = {
          ...model,
          workspaces: [message.workspace, ...workspacesOf(model).filter((w) => !message.trashed.includes(w.id) && w.id !== message.workspace.id)],
          workspace: message.workspace.id,
        }
        const setup = message.next && setupOf(opened, message.next.setup)
        const begun = message.next && setup ? begin(opened, p, message.workspace, setup, { scenario: message.next.scenario }) : { model: opened }

        return "model" in begun ? { ...begun, commands: [...(begun.commands ?? []), { kind: "list", app: p.id, path: p.path }] } : { model: opened }
      }
      if (message.kind === "trashed") {
        const p = appOf(model)

        return p && message.app === p.id ? { model, commands: [{ kind: "list", app: p.id, path: p.path }] } : { model }
      }
      if (message.kind === "read") {
        const w = workspaceOf(model, message.workspace)

        if (message.app !== model.app || !w) return { model }
        if (!message.record) return { model: { ...model, trouble: `no record of that session in workspace ${message.workspace}` } }

        const record = alive(message.record) && !isLive(model, message.record) ? gone({ ...message.record, dir: w.dir }, "its process is gone") : message.record
        const run: Run = { ...record, dir: w.dir }

        if (!message.resume) return { model: { ...model, look: isLive(model, run) ? null : run } }

        const resumed = resumeFrom(model, run)

        return "refused" in resumed ? { model: { ...model, look: run, trouble: resumed.refused } } : resumed
      }
      if (message.kind === "trouble") return { model: { ...model, trouble: message.message } }
      if (!model.live || keyOf(model.live) !== message.key) return { model }
      if (message.kind === "failed")
        return keep(
          model,
          noted(ended({ ...model.live, status: "exited", endedAt: Date.now(), error: message.error }, message.error), {
            at: Date.now(),
            kind: "note",
            text: message.error,
          })
        )

      const next = heard(model.live, message.event, Date.now())

      return RECORDED.has(message.event.kind) ? keep(model, next) : { model: { ...model, live: next } }
    },
    view: pages.view,
    async run(command, send, signal) {
      switch (command.kind) {
        case "discover":
          return send({ kind: "discovered", apps: await ports.discover() })
        case "scan":
          return send({ kind: "scanned", app: command.app, scan: await ports.scan(command.path) })
        case "list":
          return send({ kind: "listed", app: command.app, workspaces: await ports.workspaces(command.path) })
        case "offers":
          return send({ kind: "offered", harness: command.harness, offers: { models: (await ports.models?.(command.harness)) ?? [] } })
        case "create": {
          for (const id of command.replace) await ports.trash(command.path, id)

          const workspace = await ports.create(command.path, command.preset, command.scenario)

          return send({ kind: "created", app: command.app, workspace, trashed: command.replace, ...(command.next && { next: command.next }) })
        }
        case "trash":
          await ports.trash(command.path, command.id)

          return send({ kind: "trashed", app: command.app, id: command.id })
        case "read":
          return send({
            kind: "read",
            app: command.app,
            workspace: command.workspace,
            record: await ports.session(command.path, command.workspace, command.n),
            resume: command.resume,
          })
        case "record":
          return ports.record(command.dir, command.session)
        case "send":
          return ports.send(command.key, command.text)
        case "tune":
          return ports.tune(command.key, command.tuning)
        case "stop":
          return ports.stop(command.key)
        case "start":
          return new Promise<void>((done) => {
            ports.start(
              command.key,
              command.options,
              (event) => {
                send({ kind: "agent", key: command.key, event })
                if (event.kind === "exited") done()
              },
              command.provision
            )
            signal.addEventListener("abort", () => ports.stop(command.key), { once: true })
          })
      }
    },
    failed: (c, error) =>
      c.kind === "discover"
        ? { kind: "discovered", apps: [] }
        : c.kind === "scan"
          ? { kind: "scanned", app: c.app, scan: { dir: null, setups: [], presets: [emptyPreset()], scenarios: [], problems: [{ file: ".", message: error }] } }
          : c.kind === "offers"
            ? { kind: "offered", harness: c.harness, offers: { error } }
            : c.kind === "start" || c.kind === "send" || c.kind === "tune" || c.kind === "stop"
              ? { kind: "failed", key: c.key, error }
              : { kind: "trouble", message: `${c.kind}: ${error}` },
  })
}
