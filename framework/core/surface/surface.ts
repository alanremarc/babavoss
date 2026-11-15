// A surface: an app's software. A model, an update, a view and its commands. `update` is pure and synchronous;
// every side effect is a command, run outside the loop, that reports back as an event. `view` answers the view at
// a path: `/` the whole, an object's path the object. A path is part of the address, never state; reading it moves nobody.
import type { Args, View } from "./view.ts"

/** A handle called by an actor at a path: the message every call becomes. `args` holds the handle's fixed args and the open ones. */
export interface Call {
  kind: "call"
  path: string
  handle: string
  args: Args
  actor: string
}

/** What an update returns: the next model with the commands to start, or a refusal that changes nothing. */
export type Update<M, C> = { model: M; commands?: C[] } | { refused: string }

export interface Surface<M, E extends { kind: string }, C> {
  description: string
  /** The first model, when nothing was kept. */
  init(): M
  /** The model from what was kept, validated or migrated; it throws when the saved state is unusable. The saved value as is by default. */
  restore?(saved: unknown): M
  /** The commands to start when the surface starts, over the model it starts from; none by default. */
  start?(model: M): C[]
  working?(model: M): boolean
  /** Commands that remain alive while idle, such as polling, are the surface's own background, nobody's job. */
  session?(command: C): boolean
  /** The one writer. A message is a call, or an event a command sent. Never awaits, never touches the outside. */
  update(model: M, message: Call | E): Update<M, C>
  /** The view at `path` for an actor, `/` the whole; undefined when nothing stands at the path. An actor may receive different handles. */
  view(model: M, path: string, actor?: string): View | undefined
  /** A command: the long or outside work. It sends events; it never writes the model. */
  run(command: C, send: (event: E) => void, signal: AbortSignal): Promise<void>
  /** The event for a command that threw, so a status written when it started is not left running. */
  failed(command: C, error: string): E
}

export const surface = <M, E extends { kind: string }, C>(s: Surface<M, E, C>): Surface<M, E, C> => s

// Deliberately any: this erases the type parameters, for code that holds one without knowing them.
export type AnySurface = Surface<any, any, any>
