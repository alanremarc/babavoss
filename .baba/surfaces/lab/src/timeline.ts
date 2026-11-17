// A run's timeline: every chunk that entered the agent under test's context, in order, from the harness's normalised
// events, what the developing agent did on the page under test, as the person, and what the person did there. Pure: `stream` takes the timeline and
// one event and answers with the next, so the surface's update stays the one writer.
import { NONE, type HarnessEvent, type Tokens } from "babavoss/core/index.ts"

export type { Tokens }
export type Kind = "hook" | "message" | "word" | "tool" | "reply" | "thinking" | "turn" | "act" | "person" | "note"
/**
 * One chunk: `text` is what entered the context, in full; `call` is what a word or tool was asked, or what was done on the
 * page; `context` and `growth`, on the first chunk of an API call, are the tokens it was given and how many more than the
 * call before.
 */
export type Entry = {
  i: number
  t: number
  kind: Kind
  title: string
  text: string
  call?: string
  id?: string
  pending?: boolean
  error?: boolean
  context?: number
  growth?: number
  tokens?: Tokens
  cost?: number
  ms?: number
  calls?: number
}
export type Timeline = {
  entries: Entry[]
  /** The last API call's id and the tokens it was given, for the next one's growth. */
  call?: { id: string; context: number }
  /** Who sent each message not yet seen back in the stream, oldest first. */
  senders: string[]
  tokens: Tokens
  /** What the run has cost so far, as the harness reports it. */
  cost: number
  turns: number
  /** The hooks heard, by their event, in the order each was first heard: one that added nothing is heard too. */
  hooks: string[]
}

export const empty = (): Timeline => ({ entries: [], senders: [], tokens: NONE, cost: 0, turns: 0, hooks: [] })

/** The note a run is given when a turn ends and no hook was heard in it: the agent was never told of the surfaces. */
export const NO_HOOK = "no hook heard"
export const NO_HOOK_TEXT =
  "No hook of the harness ran in this run: the agent under test was told nothing by baba's hooks, at its start or with its " +
  "messages, so what it did, it did without the surfaces' words and present. This run does not show what an agent is told."
/** The timeline with a hook of `event` heard. */
const heard = (tl: Timeline, event: string): Timeline => (tl.hooks.includes(event) ? tl : { ...tl, hooks: [...tl.hooks, event] })

export const add = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  cache_write: a.cache_write + b.cache_write,
  cache_read: a.cache_read + b.cache_read,
  output: a.output + b.output,
})

/** The timeline with an entry appended, numbered from 1. */
export const append = (tl: Timeline, t: number, entry: Omit<Entry, "i" | "t">): Timeline => ({
  ...tl,
  entries: [...tl.entries, { i: tl.entries.length + 1, t, ...entry }],
})
/** The timeline with the pending entry `id` given its result. */
export const resolve = (tl: Timeline, id: string, text: string, error = false): Timeline => ({
  ...tl,
  entries: tl.entries.map((entry) => (entry.id === id ? { ...entry, text, pending: false, ...(error && { error: true }) } : entry)),
})

/** The timeline after one event of the harness, `t` ms into the run. */
export function stream(tl: Timeline, t: number, e: HarnessEvent): Timeline {
  if (e.kind === "started") {
    // The harness's adapter hands on nothing of the account's; what it loaded is copied as it said.
    const text = JSON.stringify(e.loaded, null, 2)

    // Each turn begins with it; it is noted where it differs from the one before.
    if (tl.entries.findLast((entry) => entry.title.startsWith("init "))?.text === text) return tl

    return append(tl, t, { kind: "note", title: `init ${e.loaded.model}`, text })
  }
  if (e.kind === "injected") return append(heard(tl, e.event), t, { kind: "hook", title: e.event, text: e.text, ...(e.error && { error: true }) })
  if (e.kind === "hook") return heard(tl, e.event)
  if (e.kind === "message") {
    const [by, ...rest] = tl.senders

    return append({ ...tl, senders: rest }, t, { kind: "message", title: by ?? "message", text: e.text })
  }
  if (e.kind === "result") return resolve(tl, e.id, e.text, e.error)
  if (e.kind === "call" || e.kind === "reply" || e.kind === "thinking") {
    const r = e.request
    // The first chunk of an API call is measured: the tokens it was given, and how many more than the call before.
    const fresh = r !== undefined && r.id !== tl.call?.id
    const at = fresh ? { context: r.context, growth: r.context - (tl.call?.context ?? 0) } : {}
    const next = fresh ? { ...tl, call: { id: r.id, context: r.context } } : tl

    if (e.kind === "call")
      return append(next, t, { kind: e.word ? "word" : "tool", title: e.word ? "word" : e.tool, call: e.input, text: "", id: e.id, pending: true, ...at })

    return append(next, t, { kind: e.kind, title: e.kind, text: e.text, ...at })
  }
  if (e.kind === "turn") {
    const next = append({ ...tl, tokens: add(tl.tokens, e.tokens), cost: Math.max(tl.cost, e.total), turns: tl.turns + 1 }, t, {
      kind: "turn",
      title: `turn ${tl.turns + 1}`,
      text: e.text,
      tokens: e.tokens,
      cost: Math.max(0, e.total - tl.cost),
      ms: e.ms,
      calls: e.calls,
      ...(!e.ok && { error: true }),
    })

    // Said once, at the first turn that ends with none heard; a hook heard later is on the timeline after it.
    return next.hooks.length || next.entries.some((entry) => entry.title === NO_HOOK)
      ? next
      : append(next, t, { kind: "note", title: NO_HOOK, text: NO_HOOK_TEXT, error: true })
  }

  return tl
}

/** An entry in one line: its first line of text, or of what it called, clipped. */
export const line = (entry: Entry, max = 100): string => {
  const one = (["word", "tool", "act", "person"].includes(entry.kind) ? (entry.call ?? "") : entry.text).replace(/\s+/g, " ").trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}
