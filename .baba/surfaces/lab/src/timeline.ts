// A run's timeline: every chunk that entered the agent under test's context, in order, read from the events of its stream.
// Pure: `stream` takes the timeline and one event and answers with the next, so the surface's update stays the one writer.
import type { Json } from "babavoss/core/index.ts"

export type Tokens = { input: number; cache_write: number; cache_read: number; output: number }
export type Kind = "hook" | "message" | "word" | "tool" | "reply" | "thinking" | "turn" | "note"
/**
 * One chunk: `text` is what entered the context, in full; `call` is what a word or tool was asked; `context` and `growth`,
 * on the first chunk of an API call, are the tokens it was given and how many more than the call before.
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
  /** The last API call's message id and the tokens it was given, for the next one's growth. */
  call?: { id: string; context: number }
  /** Who sent each message not yet seen back in the stream, oldest first. */
  senders: string[]
  tokens: Tokens
  /** What the run has cost so far, as the stream reports it. */
  cost: number
  turns: number
}

export const NONE: Tokens = { input: 0, cache_write: 0, cache_read: 0, output: 0 }
export const empty = (): Timeline => ({ entries: [], senders: [], tokens: NONE, cost: 0, turns: 0 })

/** A Bash command that is the root's word: the command a project's root names for itself, or `bun run baba`. */
const WORD = /(^|[\s;&|(/])(\.babavoss\/bin\/(baba|bv)|bv)(\s|$)|\bbun run baba\b/

type O = { [key: string]: Json | undefined }
const obj = (value: Json | undefined): O => (value && typeof value === "object" && !Array.isArray(value) ? value : {})
const str = (value: Json | undefined): string => (typeof value === "string" ? value : "")
const num = (value: Json | undefined): number => (typeof value === "number" ? value : 0)
const list = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : [])

/** What a tool result or message carries, as text. */
const flat = (content: Json | undefined): string =>
  typeof content === "string" ? content : list(content).map((c) => (obj(c).type === "text" ? str(obj(c).text) : JSON.stringify(c))).join("\n")
/** What a hook added to the context: plain text, or the `additionalContext` of the JSON it printed. */
const injected = (stdout: string): string => {
  const text = stdout.trim()

  try {
    return str(obj(obj(JSON.parse(text) as Json).hookSpecificOutput).additionalContext) || text
  } catch {
    return text
  }
}
const tokensOf = (usage: Json | undefined): Tokens => {
  const u = obj(usage)

  return {
    input: num(u.input_tokens),
    cache_write: num(u.cache_creation_input_tokens),
    cache_read: num(u.cache_read_input_tokens),
    output: num(u.output_tokens),
  }
}
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

/** The timeline after one event of the stream, `t` ms into the run. */
export function stream(tl: Timeline, t: number, event: Json): Timeline {
  const e = obj(event)
  const type = str(e.type)
  const subtype = str(e.subtype)

  if (type === "system" && subtype === "init") {
    const { model, cwd, tools, skills, plugins, mcp_servers, slash_commands } = e
    const seen = { model, cwd, tools, skills, plugins, mcp_servers, slash_commands }

    const text = JSON.stringify(seen, null, 2)

    // Each turn begins with it; it is noted where it differs from the one before.
    if (tl.entries.findLast((entry) => entry.title.startsWith("init "))?.text === text) return tl

    return append(tl, t, { kind: "note", title: `init ${str(e.model)}`, text })
  }
  if (type === "system" && subtype === "hook_response") {
    const text = injected(str(e.stdout))

    if (!text) return tl

    return append(tl, t, { kind: "hook", title: str(e.hook_event) || str(e.hook_name), text, ...(num(e.exit_code) !== 0 && { error: true }) })
  }
  if (type === "user" && e.parent_tool_use_id == null) {
    const message = obj(e.message)
    const blocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : list(message.content)

    return blocks.reduce<Timeline>((next, block) => {
      const b = obj(block)

      if (b.type === "text") {
        const [by, ...rest] = next.senders

        return append({ ...next, senders: rest }, t, { kind: "message", title: by ?? "message", text: str(b.text) })
      }
      if (b.type === "tool_result") {
        const id = str(b.tool_use_id)
        const text = flat(b.content)

        return {
          ...next,
          entries: next.entries.map((entry) => (entry.id === id ? { ...entry, text, pending: false, ...(b.is_error === true && { error: true }) } : entry)),
        }
      }

      return next
    }, tl)
  }
  if (type === "assistant" && e.parent_tool_use_id == null) {
    const message = obj(e.message)
    const id = str(message.id)
    const fresh = id !== "" && id !== tl.call?.id
    const u = tokensOf(message.usage)
    const context = u.input + u.cache_write + u.cache_read
    const measured = fresh ? { context, growth: context - (tl.call?.context ?? 0) } : {}
    let next: Timeline = fresh ? { ...tl, call: { id, context } } : tl
    let first = true

    for (const block of list(message.content)) {
      const b = obj(block)
      const at = first ? measured : {}
      const before = next.entries.length

      if (b.type === "text" && str(b.text)) next = append(next, t, { kind: "reply", title: "reply", text: str(b.text), ...at })
      if (b.type === "thinking" && str(b.thinking)) next = append(next, t, { kind: "thinking", title: "thinking", text: str(b.thinking), ...at })
      if (b.type === "tool_use") {
        const name = str(b.name)
        const input = obj(b.input)
        const call = name === "Bash" ? str(input.command) : JSON.stringify(input)
        const word = name === "Bash" && WORD.test(call)

        next = append(next, t, { kind: word ? "word" : "tool", title: word ? "word" : name, call, text: "", id: str(b.id), pending: true, ...at })
      }
      if (next.entries.length > before) first = false
    }

    // A call whose chunks so far carried nothing, such as a thinking block left empty, is measured on its next one.
    return first ? tl : next
  }
  if (type === "result") {
    const tokens = tokensOf(e.usage)
    const total = num(e.total_cost_usd)
    const failed = subtype !== "success" || e.is_error === true
    // The result repeats the last reply, which is in the timeline already: a turn's text is only what went wrong.
    const text = failed ? [subtype, str(e.result)].filter(Boolean).join(": ") : ""

    return append({ ...tl, tokens: add(tl.tokens, tokens), cost: Math.max(tl.cost, total), turns: tl.turns + 1 }, t, {
      kind: "turn",
      title: `turn ${tl.turns + 1}`,
      text,
      tokens,
      cost: Math.max(0, total - tl.cost),
      ms: num(e.duration_ms),
      calls: num(e.num_turns),
      ...(failed && { error: true }),
    })
  }
  if (type === "control_response") return append(tl, t, { kind: "note", title: "control response", text: JSON.stringify(e.response ?? null) })

  return tl
}

/** An entry in one line: its first line of text, or of what it called, clipped. */
export const line = (entry: Entry, max = 100): string => {
  const one = (entry.kind === "word" || entry.kind === "tool" ? entry.call ?? "" : entry.text).replace(/\s+/g, " ").trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}
