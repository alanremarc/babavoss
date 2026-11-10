// A surface tested at its boundary. A story's actors see views, call the handles those views offer and are told what changed;
// the world outside is held by the test, which settles each command the surface starts. The model is never read.
import { randomUUID } from "node:crypto"
import { flatten, changes } from "../present/present.ts"
import { agentActor } from "../session.ts"
import { run, type Saved } from "./run.ts"
import type { Surface } from "./surface.ts"
import { handles, type Args } from "./view.ts"

type Pending<C, E> = { command: C; send(event: E): void; end(error?: string): void }
type Target<C> = C | ((command: C) => boolean)

export function story<M, E extends { kind: string }, C>(surface: Surface<M, E, C>, options: { model?: M; effects?: "real" } = {}) {
  let saved: Saved | undefined = Object.hasOwn(options, "model") ? structuredClone({ model: options.model }) : undefined
  const pending: Pending<C, E>[] = []
  const ports = {
    load: () => structuredClone(saved),
    save: (value: { model: M }) => {
      saved = structuredClone(value)
    },
  }
  const start = () =>
    run(
      {
        ...surface,
        run:
          options.effects === "real"
            ? (command, send, signal) => surface.run(command, send, signal)
            : (command, send, signal) =>
                new Promise<void>((resolve, reject) => {
                  const entry: Pending<C, E> = {
                    command,
                    send,
                    end: (error) => {
                      const index = pending.indexOf(entry)

                      if (index < 0) return
                      pending.splice(index, 1)
                      if (error === undefined) resolve()
                      else reject(new Error(error))
                    },
                  }

                  pending.push(entry)
                  signal.addEventListener("abort", () => entry.end(), { once: true })
                }),
      },
      ports
    )
  let running = start()
  const barrier = () => running.settled()
  const idle = async () => {
    await barrier()
    if (running.busy() || running.jobs().length)
      await new Promise<void>((resolve) => {
        const off = running.subscribe(() => {
          if (!running.busy() && !running.jobs().length) {
            off()
            resolve()
          }
        })
      })
    await barrier()
  }
  const actor = (identity: string) => {
    let before: Map<string, string> | undefined
    const sees = (path = "/") => running.read(path, identity)

    return {
      sees,
      offered: (path = "/") => handles(sees(path)).map((h) => h.name),
      call: (path: string, handle: string, args: Args = {}) => running.call(path, handle, args, identity),
      told: () => {
        const now = flatten(sees())
        const lines = before ? changes(before, now) : [...now].map(([k, v]) => `${k}: ${v}`)

        before = now

        return lines
      },
    }
  }
  const finish = async (target: Target<C> | undefined, event?: E, error?: string) => {
    const matches =
      target === undefined ? pending : pending.filter((p) => (typeof target === "function" ? (target as (c: C) => boolean)(p.command) : p.command === target))

    if (matches.length !== 1) throw new Error(`Expected one pending command, found ${matches.length}`)

    const entry = matches[0]!

    if (event !== undefined) entry.send(event)
    entry.end(error)
    // Rejection first passes through the runner's failed handler before it queues its event.
    await Promise.resolve()
    await barrier()
  }

  function settle(event: E): Promise<void>
  function settle(command: Target<C>, event: E): Promise<void>
  function settle(command: Target<C> | E, event?: E) {
    return event === undefined ? finish(undefined, command as E) : finish(command as Target<C>, event)
  }
  function fail(error: string): Promise<void>
  function fail(command: Target<C>, error: string): Promise<void>
  function fail(command: Target<C> | string, error?: string) {
    return error === undefined ? finish(undefined, undefined, command as string) : finish(command as Target<C>, undefined, error)
  }

  return {
    agent: actor(agentActor({ id: randomUUID() })),
    person: actor("person"),
    world: { commands: () => pending.map((p) => p.command), settle, fail, idle },
    restart: async () => {
      await running.stop()
      running = start()
    },
  }
}
