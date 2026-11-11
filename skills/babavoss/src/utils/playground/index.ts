// The playground util: one agent at a time with the app under development loaded, from the shell, without a terminal,
// in a workspace the person made from a preset; prompted by the person, or driven by a scenario, and watched.
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  ACTOR_HEADER,
  SERVICE_HEADER,
  baseDir,
  connect,
  type Reach,
  endpointFile,
  findService,
  harnessModels,
  readJsonFile,
  startAgent,
  stateDir,
  type Agent,
  type Endpoint,
  type Json,
  type Scenario,
  type ScenarioUser,
} from "#babavoss/core/index.ts"
import { util } from "#babavoss/shell/index.ts"
import { readPromptware } from "../promptware/promptware.ts"
import { discoverApps } from "./apps.ts"
import { EMPTY, loadScenario, PRESETS_DIR, scanScenarios } from "./scenarios.ts"
import { playgroundSurface, type PlaygroundPorts } from "./surface.ts"
import { createWorkspace, listWorkspaces, readSession, readWorkspace, STATE, systemTrash, trashWorkspace, writeSession } from "./workspaces.ts"

export { discoverApps, type FoundApp, type AppRef } from "./apps.ts"
export * from "./workspaces.ts"
export {
  defaultSetups,
  loadScenario,
  parseSetups,
  scanPresets,
  scanScenarios,
  type Preset,
  type Problem,
  type Scan,
  type ScenarioFile,
  type Setup,
} from "./scenarios.ts"
export {
  heard,
  keyOf,
  optionsOf,
  playgroundSurface,
  spent,
  type Entry,
  type Model,
  type PlaygroundPorts,
  type PortEvent,
  type Provision,
  type Run,
  type SessionRecord,
  type SessionSummary,
} from "./surface.ts"

/** How often a started agent's app runtime is looked for, until found or the agent is gone. */
export const PAGE_POLL_MS = 1000
/** How long a scenario's call or read waits for the app's runtime to come up. */
export const DOOR_WAIT_MS = 60_000
/** How long a scenario's own call is matched against the calls the runtime streams, so it is not heard twice. */

const ECHO_MS = 5000
/** The person, as the runtime names the actor. */

const PERSON = "person"

const headersFor = (endpoint: Endpoint, actor: string) => ({ [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: actor })
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Heard = { path: string; handle: string; args: unknown; actor: string; refused?: string }

/**
 * Follows the app's door: the view at / as the agent, read again on every change, and each call it answers, until
 * stopped. Changes and calls arrive on one event stream.
 */
const follow = (endpoint: Endpoint, connected: Reach, actor: string, on: { view(view: Json): void; call(call: Heard): void }): (() => void) => {
  const controller = new AbortController()
  const read = () =>
    connected
      .read("/", actor)
      .then((view) => view !== undefined && on.view(view))
      .catch(() => {})
  const listen = async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
          headers: { ...headersFor(endpoint, actor), accept: "text/event-stream" },
          signal: controller.signal,
        })
        const decoder = new TextDecoder()
        let buffer = ""

        for await (const chunk of response.body!) {
          buffer += decoder.decode(chunk, { stream: true })

          const blocks = buffer.split("\n\n")

          buffer = blocks.pop() ?? ""
          for (const block of blocks) {
            const event = /^event: (.*)$/m.exec(block)?.[1]
            const data = /^data: (.*)$/m.exec(block)?.[1]

            if (event === "change") void read()
            if (event === "call" && data) on.call(JSON.parse(data) as Heard)
          }
        }
      } catch {
        /* the door is away; try again after a moment */
      }
      await new Promise((done) => setTimeout(done, PAGE_POLL_MS))
    }
  }

  void read()
  void listen()

  return () => controller.abort()
}

/** The app runtimes a workspace's state holds, stopped, and waited for until gone or a few seconds pass. */
const stopRuntimes = async (state: string) => {
  const sessions = join(state, "sessions")
  const pids = (existsSync(sessions) ? readdirSync(sessions) : [])
    .flatMap((id) =>
      readdirSync(join(sessions, id), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => readJsonFile<Endpoint>(endpointFile(join(sessions, id, entry.name)))?.pid)
    )
    .filter((pid): pid is number => typeof pid === "number")
  const running = (pid: number) => {
    try {
      process.kill(pid, 0)

      return true
    } catch {
      return false
    }
  }

  for (const pid of pids.filter(running)) process.kill(pid, "SIGTERM")
  for (const until = Date.now() + RUNTIME_STOP_MS; pids.some(running) && Date.now() < until;) await new Promise((done) => setTimeout(done, 100))
}

/** How long a trashed workspace's app runtimes are given to drain and exit before it moves. */
const RUNTIME_STOP_MS = 5000

type Held = { agent?: Agent; stopped: boolean; abort: AbortController; done: Promise<void> }

/**
 * The playground's ports: the apps under the project; their workspaces under `base`, the author's data unless given,
 * trashed into `trash`, the person's system trash unless given; the agent held in this process by its session's key. An
 * agent runs in its workspace: files/ its working directory, home/ its HOME, state/ the base of the app it loads, so
 * that app's runtime is found there and its state goes on when the session is resumed.
 */
export const agents = (app: { name: string }, project: string, where: { base?: string; trash?: string } = {}): PlaygroundPorts => {
  const held = new Map<string, Held>()
  const base = () => where.base ?? baseDir(app)

  return {
    discover: async () => discoverApps(project),
    scan: async (appDir) => ({
      ...(await scanScenarios(appDir)),
      skills: [readPromptware(appDir, appDir).skill].map((s) => ({ name: s.name, description: s.description })),
    }),
    models: (harness) => harnessModels(harness),
    workspaces: async (appDir) => listWorkspaces(base(), appDir),
    create: async (appDir, preset, scenario) => {
      const from = preset === EMPTY ? undefined : join(appDir, PRESETS_DIR, preset)

      if (from && !existsSync(from)) throw new Error(`no preset ${preset} under ${PRESETS_DIR}/`)

      return createWorkspace(base(), { app: appDir, preset, ...(from && { from }), ...(scenario && { scenario }) })
    },
    // What runs in it is stopped and waited for first, so nothing writes into it while it moves or after.
    trash: async (appDir, id) => {
      const w = readWorkspace(base(), appDir, id)

      if (!w) return

      const running = [...held].filter(([key]) => key.startsWith(`${id}/`))

      for (const [key, entry] of running) {
        held.delete(key)
        entry.stopped = true
        entry.abort.abort()
        entry.agent?.stop()
      }
      await Promise.all(running.map(([, entry]) => entry.done))
      await stopRuntimes(join(w.dir, STATE))
      trashWorkspace(w, where.trash ?? systemTrash())
    },
    session: async (appDir, id, n) => {
      const w = readWorkspace(base(), appDir, id)

      return w && readSession(w.dir, n)
    },
    record: (dir, session) => writeSession(dir, session),
    start: (key, options, onEvent, { app: appDir, state: stateBase, scenario }) => {
      const abort = new AbortController()
      let finished: () => void = () => {}
      const entry: Held = { stopped: false, abort, done: new Promise((done) => (finished = done)) }
      // Claude Code is given its session id, or resumes the one recorded, so the app's state is known before the first
      // message; Codex names a new thread with the first turn, and a resumed one is known.
      const given = options.resume ?? (options.harness === "claude-code" ? randomUUID() : undefined)
      let session: string | undefined = given
      let endpoint: Endpoint | undefined
      let unfollow: (() => void) | undefined
      let gone = false
      let connected: Promise<Reach> | undefined
      const connection = () =>
        (connected ??= (async () => {
          const { default: definition } = await import(pathToFileURL(join(appDir, "src/app.ts")).href)

          return connect(
            definition,
            { id: session!, cwd: options.cwd },
            { env: { ...process.env, BABAVOSS_HOME: stateBase }, entry: join(appDir, "scripts/open.ts") }
          )
        })())
      const turns = new Set<{ done(): void; fail(error: Error): void }>()
      const echoes: { key: string; at: number }[] = []
      const echoOf = (path: string, handle: string, args: unknown) => `${path} ${handle} ${JSON.stringify(args ?? {})}`

      held.set(key, entry)
      mkdirSync(stateBase, { recursive: true })

      const heardCall = (call: Heard) => {
        if (call.actor !== PERSON) return

        const now = Date.now()
        const key = echoOf(call.path, call.handle, call.args)

        echoes.splice(0, echoes.length, ...echoes.filter((e) => now - e.at < ECHO_MS))

        const own = echoes.findIndex((e) => e.key === key)

        if (own !== -1) return void echoes.splice(own, 1)
        onEvent({
          kind: "call",
          by: "person",
          path: call.path,
          handle: call.handle,
          input: call.args,
          ...(call.refused !== undefined && { refused: call.refused }),
        })
      }
      const look = async () => {
        if (gone || endpoint || !session) return

        const { default: definition } = await import(pathToFileURL(join(appDir, "src/app.ts")).href)
        const found = await findService(stateDir(definition, { id: session }, { BABAVOSS_HOME: stateBase })).catch(() => undefined)

        if (gone || endpoint) return
        if (!found) return void setTimeout(look, PAGE_POLL_MS).unref()
        endpoint = found
        onEvent({ kind: "page", url: `http://127.0.0.1:${found.port}` })
        unfollow = follow(found, await connection(), `agent:${session}`, { view: (view) => onEvent({ kind: "view", view }), call: heardCall })
      }
      /** The app runtime, connected when a scenario needs it before the agent opens it. */
      const door = async (): Promise<Endpoint> => {
        if (endpoint) return endpoint
        if (!session) throw new Error("Codex starts its session with the first message: say something before calling or reading")
        await connection()
        await look()

        const until = Date.now() + DOOR_WAIT_MS

        while (!endpoint) {
          if (abort.signal.aborted) throw new Error("stopped")
          if (gone) throw new Error("the agent exited")
          if (Date.now() > until) throw new Error(`the app's runtime did not come up in ${DOOR_WAIT_MS / 1000}s`)
          await new Promise((done) => setTimeout(done, 100))
        }

        return endpoint
      }
      const live = () => {
        if (abort.signal.aborted) throw new Error("stopped")
        if (gone) throw new Error("the agent exited")
      }
      const user = (agent: Agent): ScenarioUser => ({
        say(text) {
          live()
          onEvent({ kind: "you", text })

          return new Promise<void>((done, fail) => {
            const waiter = { done: () => (turns.delete(waiter), done()), fail: (error: Error) => (turns.delete(waiter), fail(error)) }

            turns.add(waiter)
            agent.send(text)
          })
        },
        async call(path, handle, input) {
          live()

          await door()

          echoes.push({ key: echoOf(path, handle, input), at: Date.now() })

          const answer = await (await connection()).call(path, handle, input, PERSON)

          onEvent({
            kind: "call",
            by: "scenario",
            path,
            handle,
            input,
            ...(answer.outcome === "refused" ? { refused: answer.reason } : { result: answer.view }),
          })

          return answer
        },
        async read(path) {
          live()

          await door()

          const view = await (await connection()).read(path, PERSON)

          onEvent({ kind: "read", path, view: view ?? null })

          return view
        },
        note(text) {
          live()
          onEvent({ kind: "note", text })
        },
      })
      const drive = async (agent: Agent, loaded: Scenario) => {
        try {
          await loaded.run(user(agent))
          live()
          onEvent({ kind: "scenario", state: "done" })
        } catch (error) {
          onEvent({ kind: "scenario", state: "failed", error: message(error) })
        }
      }

      abort.signal.addEventListener("abort", () => {
        for (const t of turns) t.fail(new Error("stopped"))
      })

      void (async () => {
        let loaded: Scenario | undefined
        let problem: string | undefined

        // The workspace was filled from its preset when it was made; a scenario's file is imported afresh.
        try {
          mkdirSync(options.cwd, { recursive: true })
          if (scenario) {
            loaded = await loadScenario(scenario.file)
            for (const key of ["setup", "preset"] as const)
              if ((loaded[key] ?? undefined) !== (scenario[key] ?? undefined))
                onEvent({
                  kind: "note",
                  text: `the file now names ${key} ${loaded[key] ?? "none"}; this run is under the one scanned; rescan and run again to change it`,
                })
          }
        } catch (error) {
          problem = message(error)
        }
        if (entry.stopped) {
          finished()

          return onEvent({ kind: "exited", code: null, error: "stopped before it started" })
        }

        const agent = startAgent(
          { ...options, ...(given && !options.resume && { sessionId: given }), env: { ...(options.env ?? process.env), BABAVOSS_HOME: stateBase } },
          (event) => {
            if (event.kind === "started" && !session) {
              session = event.session
              void look()
            }
            if (event.kind === "turn-done") for (const t of turns) t.done()
            if (event.kind === "exited") {
              gone = true
              unfollow?.()
              for (const t of turns) t.fail(new Error("the agent exited"))
              if (held.get(key) === entry) held.delete(key)
            }
            onEvent(event)
            if (event.kind === "exited") finished()
          }
        )

        entry.agent = agent
        void look()
        if (problem !== undefined)
          onEvent(scenario ? { kind: "scenario", state: "failed", error: problem } : { kind: "note", text: `the workspace: ${problem}` })
        else if (loaded) void drive(agent, loaded)
      })()
    },
    send: (key, text) => held.get(key)?.agent?.send(text),
    tune: (key, tuning) => held.get(key)?.agent?.tune(tuning),
    stop: (key) => {
      const entry = held.get(key)

      if (!entry) return
      entry.stopped = true
      entry.abort.abort()
      entry.agent?.stop()
    },
  }
}

export const playground = (ports: PlaygroundPorts, defaults: { project: string }) =>
  util(
    "playground",
    "Run an agent with your app loaded, prompted by you or driven by a scenario, and watch what passes between it, the user and the app",
    playgroundSurface(ports, defaults)
  )
