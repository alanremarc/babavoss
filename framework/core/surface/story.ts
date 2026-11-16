// A surface tested at its boundary. A story's actors see views, call the handles those views offer, are told what changed
// and what was noticed;
// the world outside is held by the test, which settles each command the surface starts, or holds it open, sends its events
// one at a time and ends it. The model is never read.
import { randomUUID } from "node:crypto"
import { diff, tell, whole } from "../present/present.ts"
import { agentActor } from "../session.ts"
import { run, type Noticed, type Saved } from "./run.ts"
import type { Surface } from "./surface.ts"
import { handles, revealed, type Args, type Json } from "./view.ts"

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
  const heard: Noticed[] = []
  const hear = () => running.notices((notice) => void heard.push(notice))
  let running = start()

  hear()
  const barrier = () => running.settled()
  // Idle is when no finite work is left: a session command, as one that follows a store, runs on for the surface's life.
  const idle = async () => {
    await barrier()
    if (running.jobs().length)
      await new Promise<void>((resolve) => {
        const off = running.subscribe(() => {
          if (!running.jobs().length) {
            off()
            resolve()
          }
        })
      })
    await barrier()
  }
  const actor = (identity: string) => {
    let before: { view: Json | undefined } | undefined
    let since = 0
    // An actor reads the surface at its own paths, where detail is an ordinary value, as a tab's reader does.
    const sees = (path = "/") => revealed(running.read(path, identity))

    return {
      sees,
      offered: (path = "/") => handles(sees(path)).map((h) => h.name),
      call: (path: string, handle: string, args: Args = {}) => running.call(path, handle, args, identity),
      told: () => {
        const now = sees()
        const lines = before ? tell(diff(before.view, now)) : whole(now)

        before = { view: now }

        return lines
      },
      /** The notices since this actor was last asked, as its side is told them: what its own calls alone gave is not told back. */
      noticed: () => {
        const lines = heard.slice(since).filter((n) => !(n.cause.call && n.cause.actor === identity && identity !== "person"))

        since = heard.length

        return lines.map((n) => n.text)
      },
    }
  }
  const find = (target: Target<C> | undefined) => {
    const matches =
      target === undefined ? pending : pending.filter((p) => (typeof target === "function" ? (target as (c: C) => boolean)(p.command) : p.command === target))

    if (matches.length !== 1) throw new Error(`Expected one pending command, found ${matches.length}`)

    return matches[0]!
  }
  const finish = async (target: Target<C> | undefined, event?: E, error?: string) => {
    const entry = find(target)

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
  /** One event from a command that goes on running: the effect is held open, for the actors to see and be told, until it ends. */
  function send(event: E): Promise<void>
  function send(command: Target<C>, event: E): Promise<void>
  async function send(command: Target<C> | E, event?: E) {
    find(event === undefined ? undefined : (command as Target<C>)).send(event ?? (command as E))
    await barrier()
  }
  /** The end of a command held open, with no event of its own. */
  const end = (command?: Target<C>) => finish(command)

  return {
    agent: actor(agentActor({ id: randomUUID() })),
    person: actor("person"),
    world: { commands: () => pending.map((p) => p.command), settle, fail, send, end, idle },
    restart: async () => {
      await running.stop()
      running = start()
      hear()
    },
  }
}
