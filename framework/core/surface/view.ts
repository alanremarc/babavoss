// A view is structured facts with offered handles embedded where they belong. Presentation belongs to clients.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined }
export type Args = Record<string, Json>
export type Schema = Record<string, "string" | "number" | "boolean">
export type View = { [key: string]: Json | undefined }

/**
 * `kind: "handle"` is reserved in views. Fixed args and open inputs are data, never more offered handles. A handle is offered
 * to whoever reads the view: the agent and the person are offered the same.
 */
export type Handle = { kind: "handle"; name: string; args: Args; open: Schema; description: string }

export const handle = (name: string, description: string, args: Args = {}, open: Schema = {}): Handle => ({ kind: "handle", name, args, open, description })

/**
 * `kind: "detail"` is reserved in views too: a fact or a row that is detail. It is told where it stands, at its own path
 * and to the person as an ordinary value, but kept out of the present at / and its changes there, which count it instead.
 */
export type Detail = { kind: "detail"; value: Json }

/** A fact or a row marked as detail: the agent reads it at its tab's path, and the present at / says only how much there is. */
export const detail = (value: Json): Detail => ({ kind: "detail", value })
export const isDetail = (value: Json | undefined): value is Detail =>
  !!value && typeof value === "object" && !Array.isArray(value) && value.kind === "detail" && Object.hasOwn(value, "value")

/** A view with its detail as ordinary values, as every reader but the present at / sees it. */
export function revealed<V extends Json | undefined>(value: V): V {
  if (isDetail(value)) return revealed(value.value) as V
  if (Array.isArray(value)) return value.map((v) => revealed(v)) as V
  if (!value || typeof value !== "object" || value.kind === "handle") return value

  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revealed(v)])) as V
}

/** Every offered handle, in traversal order; a handle is a terminal value. */
export function handles(value: Json | undefined): Handle[] {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(handles)
  if (value.kind === "handle") return [value as Handle]

  return Object.values(value).flatMap(handles)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Admission of a call against the view at its path: the offered handle, or why the call is refused. A view that says
 * `broken`, why it offers what it would not otherwise, has it said in the refusal. */
export function admit(view: View, path: string, name: string, args: Args): Handle | string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "args must be a JSON object"

  const offered = handles(view)
  const h = offered.find((x) => x.name === name && Object.entries(x.args).every(([k, v]) => same(args[k], v)))

  if (!h) {
    const list = offered.map((x) => x.name + (Object.keys(x.args).length ? " " + JSON.stringify(x.args) : "")).join(", ") || "nothing"

    return `${name} ${JSON.stringify(args)} is not offered at ${path}; offered: ${list}${typeof view.broken === "string" ? `; ${view.broken}` : ""}`
  }
  for (const [k, type] of Object.entries(h.open)) if (typeof args[k] !== type) return `${name}: ${k} must be a ${type}`
  for (const k of Object.keys(args)) if (!Object.hasOwn(h.args, k) && !Object.hasOwn(h.open, k)) return `${name} takes no ${k}`

  return h
}

/** A JSON value as text: a string as is, anything else serialized. */
export const text = (value: Json | undefined): string => (typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value))
