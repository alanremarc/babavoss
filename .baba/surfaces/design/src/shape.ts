// The demo project's shape, read from its surfaces rather than written beside them: each surface is run on its own, at its
// boundary as a story runs it, and explored as the person would. From its first state every handle offered is called once
// per place, an input filled with a sample, and each state reached is looked at along the paths its views name under `at`.
// What is kept is each place by its pattern, /tasks/:n, with the names of the facts it gives and the actions offered there:
// their inputs, whether one is an ask, the person's alone, and whether a call gives a notice. What a surface's own
// commands change is read from what it starts.
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { story, type Args, type Handle, type Json, type Schema, type Surface, type View } from "babavoss/core/index.ts"

export type Action = { name: string; description: string; inputs: string[]; ask?: true; notice?: true }
export type Place = { path: string; facts: string[]; actions: Action[] }
/** A surface as the demo has it: what it says of itself, its places, and the commands it starts, which change it by itself. */
export type Shape = { name: string; description: string; views: Place[]; itself?: string[] }

const DEMO = new URL("../demo/surfaces/", import.meta.url)
/** How far the exploration goes: calls in a row from the first state, and states looked at in all. */
const DEPTH = 4
const STATES = 40

type Call = { path: string; handle: string; args: Args }

const SAMPLE: Record<Schema[string], Json> = { string: "Example", number: 1, boolean: true }
const isHandle = (v: Json | undefined): v is Handle => !!v && typeof v === "object" && !Array.isArray(v) && v.kind === "handle"
const isRow = (v: Json | undefined): v is { [key: string]: Json | undefined } => !!v && typeof v === "object" && !Array.isArray(v) && !isHandle(v)

/** Facts by name, and for a list of rows the fields its rows have. */
export type Facts = Map<string, string[]>

/** A view's facts taken into `facts`, handles left out: each by its name, a list of rows with the fields of its rows. */
export function factsOf(view: View | Json | undefined, facts: Facts = new Map()): Facts {
  if (!isRow(view)) return facts
  for (const [k, v] of Object.entries(view)) {
    if (isHandle(v) || v === undefined) continue

    const fields = facts.get(k) ?? []

    if (Array.isArray(v)) for (const r of v.filter(isRow)) for (const [f, x] of Object.entries(r)) if (!isHandle(x) && !fields.includes(f)) fields.push(f)
    facts.set(k, fields)
  }

  return facts
}
/** Facts as a place lists them: `title`, or `tasks: at n title status`. */
export const said = (facts: Facts) => [...facts].map(([k, fields]) => (fields.length ? `${k}: ${fields.join(" ")}` : k))
/** Facts as listed, taken back. */
export const listed = (lines: string[]): Facts => new Map(lines.map((line) => [line.split(": ")[0]!, line.split(": ")[1]?.split(" ") ?? []]))

/** Every path a view names under `at`, with the row it names it in. */
function places(value: Json | undefined, out: { at: string; row: { [key: string]: Json | undefined } }[] = []) {
  if (Array.isArray(value)) value.forEach((v) => places(v, out))
  else if (isRow(value)) {
    if (typeof value.at === "string") out.push({ at: value.at, row: value })
    for (const [k, v] of Object.entries(value)) if (k !== "at") places(v, out)
  }

  return out
}

/** A path as a pattern: a segment that is the value of a field of the row naming it stands for that field, `/tasks/1` as `/tasks/:n`. */
function patternOf(path: string, row: { [key: string]: Json | undefined }) {
  return path
    .split("/")
    .map((seg) => {
      const field = Object.entries(row).find(([k, v]) => k !== "at" && (typeof v === "number" || typeof v === "string") && String(v) === seg && seg !== "")

      return field ? `:${field[0]}` : seg
    })
    .join("/")
}

/** One surface explored: every place it shows on the way, and every handle offered there tried once. */
export async function explore<M, E extends { kind: string }, C>(name: string, surface: Surface<M, E, C>): Promise<Shape> {
  const found = new Map<string, { facts: Facts; actions: Map<string, Action> }>()
  const tried = new Set<string>()
  const queue: Call[][] = [[]]
  let looked = 0

  const placeOf = (path: string) => {
    if (!found.has(path)) found.set(path, { facts: new Map(), actions: new Map() })

    return found.get(path)!
  }

  while (queue.length && looked < STATES) {
    const calls = queue.shift()!
    const { person } = story(surface)
    let reached = true

    looked++
    for (const c of calls) if ((await person.call(c.path, c.handle, c.args)).outcome === "refused") reached = false
    if (!reached) continue

    // The state's places, from / along the paths its views name.
    const seen = new Map<string, string>([["/", "/"]])
    const paths = ["/"]

    for (let i = 0; i < paths.length && i < 30; i++) {
      const path = paths[i]!
      const view = person.sees(path) as View | undefined

      if (!view) continue

      const place = placeOf(seen.get(path)!)

      factsOf(view, place.facts)
      for (const { at, row } of places(view))
        if (!seen.has(at)) {
          seen.set(at, patternOf(at, row))
          paths.push(at)
        }
      if (calls.length >= DEPTH) continue
      // Handles in a row of the view are the row's place's, offered there too; those of the view itself are tried here.
      for (const h of Object.values(view).filter(isHandle)) {
        const key = `${seen.get(path)} ${h.name}`

        if (tried.has(key)) continue
        tried.add(key)

        const args: Args = { ...h.args, ...Object.fromEntries(Object.entries(h.open).map(([k, t]) => [k, SAMPLE[t]])) }
        const probe = story(surface)

        for (const c of calls) await probe.person.call(c.path, c.handle, c.args)
        probe.agent.noticed()

        const answer = await probe.person.call(path, h.name, args)

        if (answer.outcome === "refused") continue
        placeOf(seen.get(path)!).actions.set(h.name, {
          name: h.name,
          description: h.description,
          inputs: Object.keys(h.open),
          ...(h.ask && { ask: true as const }),
          ...(probe.agent.noticed().length > 0 && { notice: true as const }),
        })
        queue.push([...calls, { path, handle: h.name, args }])
      }
    }
  }

  const first = surface.init()
  const itself = (surface.start?.(first) ?? []).map((c) => (c && typeof c === "object" && "kind" in c ? String(c.kind) : String(c)))

  return {
    name,
    description: surface.description,
    views: [...found].map(([path, p]) => ({ path, facts: said(p.facts), actions: [...p.actions.values()] })),
    ...(itself.length && { itself }),
  }
}

/** Every surface of the demo, explored, in the order of their names. */
export async function shape(): Promise<Shape[]> {
  const names = readdirSync(fileURLToPath(DEMO), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  return Promise.all(
    names.map(async (name) => {
      const surface = ((await import(fileURLToPath(new URL(`${name}/src/surface.ts`, DEMO)))) as { default: Surface<unknown, { kind: string }, unknown> }).default

      return explore(name, surface)
    }),
  )
}
