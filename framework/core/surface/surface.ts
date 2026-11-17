// A surface: a root's software. A model, an update, a view and its commands. `update` is pure and synchronous;
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
  /** When the call was admitted, in ms since the epoch: an update that keeps time takes it from here, never from a clock. */
  t?: number
  /** The caller's own name for the call, where it gave one: a program acting as the person finds what came of its call by it. */
  id?: string
}

/**
 * A notice: one short line saying what just happened, told once to each side and kept nowhere, neither in a view nor in the
 * model. `at` is the path it is about, where there is one; `from` names who says it, where one surface speaks for another.
 */
export type Notice = string | { text: string; at?: string; from?: string }

/**
 * What an update returns: the next model with the commands to start and the notices to tell, or a refusal that changes
 * nothing. `quiet`: the commit is the page's own bookkeeping, such as what the person has seen, and is told to the agent
 * in no way: not heard, not among the changes, not counted as waiting for it.
 */
export type Update<M, C> = { model: M; commands?: C[]; notices?: Notice[]; quiet?: true } | { refused: string }

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
  /**
   * The model once a call was refused, and why, where the surface keeps its refusals, as the shell keeps them in its
   * activity: committed as bookkeeping, told to the agent in no way. Undefined, or absent, keeps the model as it is.
   */
  refused?(model: M, call: Call, reason: string): M | undefined
  /**
   * The view at `path`, `/` the whole; undefined when nothing stands at the path. It offers the agent and the person the same
   * handles. `actor`, who reads, is given to a root alone, whose present for the agent is shaped as one; a tab's surface never has it.
   */
  view(model: M, path: string, actor?: string): View | undefined
  /** Why nothing stands at a path, where the surface can say more than that: what stood there and where it went. */
  absent?(model: M, path: string): string | undefined
  /** A command: the long or outside work. It sends events; it never writes the model. */
  run(command: C, send: (event: E) => void, signal: AbortSignal): Promise<void>
  /** The event for a command that threw, so a status written when it started is not left running. */
  failed(command: C, error: string): E
}

export const surface = <M, E extends { kind: string }, C>(s: Surface<M, E, C>): Surface<M, E, C> => s

// Deliberately any: this erases the type parameters, for code that holds one without knowing them.
export type AnySurface = Surface<any, any, any>
