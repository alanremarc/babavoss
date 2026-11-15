// Authoring vocabulary: objects with identity, actions bound to subjects, a view composed from routes. The result runs through the ordinary loop.
import { isPerson } from "../session.ts"
import { route, type Routes } from "./routes.ts"
import type { Call, Update } from "./surface.ts"
import { handle, type Args, type Json, type Schema, type View } from "./view.ts"

/** Select public facts and relationships deliberately; references carry only the object's identity. */
export function object<S, Id extends Args>(identity: (subject: S) => Id, project: (subject: S) => View) {
  return { ref: identity, view: (subject: S): View => ({ ...project(subject), ...identity(subject) }) }
}

/** Caller and subject arguments use the same scalar vocabulary as handles. */
export type Inputs<S extends Schema> = { [K in keyof S]: { string: string; number: number; boolean: boolean }[S[K]] }

type Action<M, C> = { name: string; ask: boolean; update(model: M, call: Call): Update<M, C> }

/**
 * Define the contract and pure transition once, then bind the subject wherever the action is offered. An ask is offered to
 * the person only: bind it where the decision stands, and say in a fact what is waited for, so the agent knows to wait.
 */
export function action<M, const S extends Schema, const I extends Schema, C = never>(definition: {
  name: string
  description: string | ((subject: Inputs<S>) => string)
  subject: S
  inputs: I
  ask?: boolean
  update(model: M, args: Inputs<S> & Inputs<I>, call: Call): Update<M, C>
}) {
  for (const key of Object.keys(definition.subject)) {
    if (key in definition.inputs) throw new Error(`${definition.name}: ${key} is both a subject and an input`)
  }

  return {
    name: definition.name,
    ask: definition.ask ?? false,
    bind: (subject: Inputs<S>) =>
      handle(
        definition.name,
        typeof definition.description === "string" ? definition.description : definition.description(subject),
        subject,
        definition.inputs
      ),
    // The loop has already checked the fixed subject, inputs and current availability.
    update: (model: M, call: Call) => definition.update(model, call.args as Inputs<S> & Inputs<I>, call),
  }
}

/** Compose the view with normal functions and arrays, one projection per route. Dispatch only calls admitted by the loop. */
export function view<M, C>(actions: readonly Action<M, C>[], routes: Routes<M>) {
  const named = new Map(actions.map((a) => [a.name, a]))

  if (named.size !== actions.length) throw new Error("A view's action names must be unique")
  for (const pattern of Object.keys(routes)) {
    if (!pattern.startsWith("/")) throw new Error(`A route is a path: ${pattern}`)
    if (pattern.split("/").some((segment) => segment.startsWith("_"))) throw new Error(`A segment may not start with _, that prefix is the page's: ${pattern}`)
  }

  const asks = new Set(actions.filter((a) => a.ask).map((a) => a.name))
  /** The view without the handles that are the person's alone. */
  const unasked = (value: Json | undefined): Json | undefined => {
    if (Array.isArray(value)) return value.map((v) => unasked(v) ?? null)
    if (!value || typeof value !== "object" || value.kind === "handle") return value

    return Object.fromEntries(
      Object.entries(value).flatMap(([k, v]) =>
        v && typeof v === "object" && !Array.isArray(v) && v.kind === "handle" && asks.has(String(v.name)) ? [] : [[k, unasked(v)]]
      )
    )
  }

  return {
    /** The view at a path for an actor: the same facts for all, an ask among its handles for the person only. */
    view: (model: M, path: string, actor?: string): View | undefined => {
      const at = route(routes, path)
      const shown = at && at.project(model, at.params)

      return shown && asks.size && !(actor !== undefined && isPerson(actor)) ? (unasked(shown) as View) : shown
    },
    update: (model: M, call: Call): Update<M, C> => named.get(call.handle)?.update(model, call) ?? { refused: `${call.handle} is not a handle of this view` },
  }
}
