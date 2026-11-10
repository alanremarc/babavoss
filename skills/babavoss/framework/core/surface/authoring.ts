// Authoring vocabulary: objects with identity, actions bound to subjects, a view composed from routes. The result runs through the ordinary loop.
import { route, type Routes } from "./routes.ts"
import type { Call, Update } from "./surface.ts"
import { handle, type Args, type Schema, type View } from "./view.ts"

/** Select public facts and relationships deliberately; references carry only the object's identity. */
export function object<S, Id extends Args>(identity: (subject: S) => Id, project: (subject: S) => View) {
  return { ref: identity, view: (subject: S): View => ({ ...project(subject), ...identity(subject) }) }
}

/** Caller and subject arguments use the same scalar vocabulary as handles. */
export type Inputs<S extends Schema> = { [K in keyof S]: { string: string; number: number; boolean: boolean }[S[K]] }

type Action<M, C> = { name: string; update(model: M, call: Call): Update<M, C> }

/** Define the contract and pure transition once, then bind the subject wherever the action is offered. */
export function action<M, const S extends Schema, const I extends Schema, C = never>(definition: {
  name: string
  description: string | ((subject: Inputs<S>) => string)
  subject: S
  inputs: I
  update(model: M, args: Inputs<S> & Inputs<I>, call: Call): Update<M, C>
}) {
  for (const key of Object.keys(definition.subject)) {
    if (key in definition.inputs) throw new Error(`${definition.name}: ${key} is both a subject and an input`)
  }

  return {
    name: definition.name,
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

  return {
    view: (model: M, path: string): View | undefined => {
      const at = route(routes, path)

      return at && at.project(model, at.params)
    },
    update: (model: M, call: Call): Update<M, C> => named.get(call.handle)?.update(model, call) ?? { refused: `${call.handle} is not a handle of this view` },
  }
}
