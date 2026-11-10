// Run a surface: one model, one queue. The loop: a message at a time, `update`, the model saved, the subscribers told,
// the commands started; a command's events join the same queue with the actor whose message started it. A surface that
// cannot keep memory and disk in agreement fails once: it stops, refuses calls with the error and ignores events.
// A session's surface runs here inside its runtime; a spec or a tool runs one in its own process the same way, a door never.
import { admit, type Args, type View } from "./view.ts"
import type { Call, Surface } from "./surface.ts"

export type Answer = { outcome: "written"; view: View } | { outcome: "refused"; reason: string }
export type Saved = { model: unknown }
export type Ports<M> = {
  /** What was kept, or undefined the first time. */
  load(): Saved | undefined
  /** Keeps the model whole or not at all; throws when it cannot. */
  save(saved: { model: M }): void
  log?: (line: string) => void
}

export interface Running<M> {
  model(): M
  /** How many commits so far; a change stream carries it. */
  version(): number
  /** The view at `path` as an actor sees it; the person by default. */
  read(path: string, actor?: string): View | undefined
  /** An actor's call: refused unless the view at `path` offers the handle with these fixed args and the open args fit. */
  call(path: string, name: string, args: Args, actor: string): Promise<Answer>
  /** Told after every change of the model, every command started or ended, and once on failure. */
  subscribe(fn: () => void): () => void
  /** Running commands. */
  busy(): number
  /** The actor of each item of finite work: a running command that is not a session command, or a queued event of one. */
  jobs(): string[]
  /** Queued messages and work. */
  active(): number
  /** Resolves once every message queued so far has been taken: a point after which the views show them. */
  settled(): Promise<void>
  /** Why the surface failed, once it has. */
  failure(): string | undefined
  /** Aborts every running command and waits for them at most STOP_MS; late events are dropped. The model stays. */
  stop(): Promise<void>
}

export const STOP_MS = 5_000
/** The actor of commands a surface starts on its own, and of their events. */
export const SURFACE_ACTOR = "surface"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const refused = (reason: string): Answer => ({ outcome: "refused", reason })

export function run<M, E extends { kind: string }, C>(surface: Surface<M, E, C>, ports: Ports<M>): Running<M> {
  const log = ports.log ?? (() => {})
  let model = undefined as M
  let queue: Promise<unknown> = Promise.resolve()
  let runs = 0
  let queued = 0
  let version = 0
  let stopped = false
  let failure: string | undefined
  const running = new Map<number, { ctrl: AbortController; session: boolean; actor: string; done: Promise<void> }>()
  const pending = new Map<string, number>()
  const count = (actor: string, by: number) => {
    const n = (pending.get(actor) ?? 0) + by

    if (n) pending.set(actor, n)
    else pending.delete(actor)
  }
  const listeners = new Set<() => void>()

  const tell = () => {
    for (const fn of Array.from(listeners))
      try {
        fn()
      } catch (e) {
        log(`subscriber failed: ${message(e)}`)
      }
  }
  const halt = () => {
    stopped = true
    for (const r of running.values()) r.ctrl.abort()
  }
  const fail = (e: unknown) => {
    if (failure !== undefined) return
    failure = message(e)
    halt()
    log(`surface failed: ${failure}`)
    tell()
  }
  const enqueue = <T>(fn: () => T): Promise<T> => {
    queued++

    const p = queue.then(() => {
      queued--

      return fn()
    })

    queue = p.catch(() => {})

    return p
  }
  const read = (path: string, actor = "person") => surface.view(model, path, actor)
  const commit = (next: M) => {
    ports.save({ model: next })
    model = next
    version++
  }

  const event = (e: E, actor: string) => {
    if (stopped) return

    let r: ReturnType<typeof surface.update>

    try {
      r = surface.update(model, e)
      if ("refused" in r) {
        log(`event ${e.kind} refused: ${r.refused}`)
        tell()

        return
      }
      commit(r.model)
    } catch (error) {
      fail(error)

      return
    }
    for (const c of r.commands ?? []) start(c, actor)
    tell()
  }

  const start = (command: C, actor: string) => {
    if (stopped) return

    const id = runs++
    const ctrl = new AbortController()
    let session = false

    try {
      session = surface.session?.(command) ?? false
    } catch (e) {
      log(`session check failed: ${message(e)}`)
    }

    const owner = session ? SURFACE_ACTOR : actor
    const entry = { ctrl, session, actor: owner, done: Promise.resolve() }
    const send = (e: E) => {
      if (stopped) return
      count(owner, 1)
      void enqueue(() => {
        count(owner, -1)
        event(e, owner)
      })
    }

    let ran: Promise<void>

    running.set(id, entry)
    try {
      ran = surface.run(command, send, ctrl.signal)
    } catch (e) {
      ran = Promise.reject(e)
    }
    entry.done = ran
      .catch((e: unknown) => {
        try {
          send(surface.failed(command, message(e)))
        } catch (error) {
          log(`failed event could not be made: ${message(error)}`)
        }
      })
      .finally(() => {
        running.delete(id)
        tell()
      })
  }

  try {
    const saved = ports.load()

    model = saved ? (surface.restore ? surface.restore(saved.model) : (saved.model as M)) : surface.init()
    if (!saved) ports.save({ model })
  } catch (e) {
    fail(e)
  }
  if (!stopped) {
    try {
      for (const c of surface.start?.(model) ?? []) start(c, SURFACE_ACTOR)
    } catch (e) {
      log(`start commands failed: ${message(e)}`)
    }
  }

  return {
    model: () => model,
    version: () => version,
    failure: () => failure,
    read,
    call: (path, name, args, actor) =>
      enqueue((): Answer => {
        if (stopped) return refused(failure ?? "surface stopped")

        let view: View | undefined

        try {
          view = read(path, actor)
        } catch (e) {
          fail(e)

          return refused(failure!)
        }
        if (!view) return refused(`nothing at ${path}`)

        const admitted = admit(view, path, name, args)

        if (typeof admitted === "string") return refused(admitted)

        const call: Call = { kind: "call", path, handle: name, args, actor }
        let r: ReturnType<typeof surface.update>

        try {
          r = surface.update(model, call)
        } catch (e) {
          return refused(message(e))
        }
        if ("refused" in r) return refused(r.refused)

        let answer: View

        try {
          answer = surface.view(r.model, path, actor) ?? view
          commit(r.model)
        } catch (e) {
          fail(e)

          return refused(failure!)
        }
        for (const c of r.commands ?? []) start(c, actor)
        tell()

        return { outcome: "written", view: answer }
      }),
    subscribe: (fn) => {
      listeners.add(fn)

      return () => {
        listeners.delete(fn)
      }
    },
    busy: () => running.size,
    jobs: () => [...[...running.values()].filter((r) => !r.session).map((r) => r.actor), ...[...pending].flatMap(([actor, n]) => Array<string>(n).fill(actor))],
    settled: () => enqueue(() => {}),
    active: () => {
      let working = false

      try {
        working = !stopped && (surface.working?.(model) ?? false)
      } catch (e) {
        log(`working check failed: ${message(e)}`)
      }

      return queued + [...running.values()].filter((r) => !r.session).length + Number(working)
    },
    stop: async () => {
      halt()

      let timer: ReturnType<typeof setTimeout> | undefined

      await Promise.race([
        Promise.all([...running.values()].map((r) => r.done)).then(() => queue),
        new Promise<void>((done) => {
          timer = setTimeout(done, STOP_MS)
        }),
      ])
      clearTimeout(timer)
    },
  }
}
