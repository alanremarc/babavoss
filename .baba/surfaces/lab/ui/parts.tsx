// What the lab's page shares: the shapes of the surface's views, how figures are written, how an entry is read whole,
// and how a text that entered the agent's context is shown.
import { useEffect, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Handle } from "babavoss/core/index.ts"
import { useTab } from "babavoss/shell/ui/index.tsx"

export type Kind = "hook" | "message" | "word" | "tool" | "reply" | "thinking" | "turn" | "act" | "person" | "note"
export type Tokens = { input: number; cache_write: number; cache_read: number; output: number }
export type Row = { at: string; i: number; kind: Kind; title: string; size: number; line: string; context?: number | null; growth?: number | null }
export type Whole = Row & { t: number; text: string; call?: string; error?: boolean; pending?: boolean; tokens?: Tokens; cost?: number; ms?: number; calls?: number }
export type Status = "no run" | "starting" | "idle" | "working" | "ended" | "closing" | "closed" | "cleared"
export type Root = {
  status: Status
  run?: string | null
  model?: string
  checkout?: string
  commit?: string
  uncommitted?: number
  page?: string
  ended?: string
  turns?: number
  tokens?: Tokens
  cost?: number
  runs?: { count: number }
  start?: Handle
  start_from?: Handle
  say?: Handle
  end_move?: Handle
  stop?: Handle
  close?: Handle
}
export type Past = {
  id: string
  began: string
  model: string
  status: Status
  checkout?: string
  commit?: string
  uncommitted?: number
  turns: number
  cost: number
  shown?: boolean
  open?: Handle
  forget?: Handle
}

/** The models a run may take, as the surface's start says; haiku the cheapest. */
export const MODELS = ["haiku", "sonnet", "opus"]
/** What the surface sends when the person ends their move on the page under test. */
export const END_MOVE = "[The person ended their move on the page.]"

export const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
/** About how many tokens a text of `chars` characters is: a quarter, the usual rule for English and code. */
export const approx = (chars: number) => `~${k(Math.max(1, Math.round(chars / 4)))}`
export const money = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`)
export const seconds = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`)
export const total = (t: Tokens) => t.input + t.cache_write + t.cache_read + t.output
export const breakdown = (t: Tokens) => `in ${k(t.input)} · cache ${k(t.cache_read)} read, ${k(t.cache_write)} written · out ${k(t.output)}`

/** An entry whole, read once and again only when it grows, as a tool's result arrives; nothing until `wanted`. */
export function useEntry(path: string, size: number, wanted = true) {
  const { read } = useTab()
  const [entry, setEntry] = useState<Whole>()

  useEffect(() => {
    if (!wanted) return

    let stale = false

    void read<Whole>(path).then((e) => !stale && setEntry(e), () => {})

    return () => {
      stale = true
    }
  }, [read, path, size, wanted])

  return entry
}

/**
 * A text as it entered the agent's context, a hook's or a command's answer: dense, monospace, wrapped, scrolled where
 * long, as the agent read it; where it is written as markdown, it can be read rendered too.
 */
export function Told({ text, error }: { text: string; error?: boolean }) {
  const [rendered, setRendered] = useState(false)
  const markdown = /^#{1,3} |^- |\*\*|`[^`]+`/m.test(text)

  return (
    <div className="group/told relative">
      {markdown && (
        <button
          type="button"
          onClick={() => setRendered(!rendered)}
          className="absolute top-1 right-1 z-10 rounded-sm bg-background/80 px-1.5 py-0.5 text-badge text-muted-foreground opacity-0 ring-1 ring-border transition-opacity group-hover/told:opacity-100 hover:text-foreground focus-visible:opacity-100"
        >
          {rendered ? "Source" : "Rendered"}
        </button>
      )}
      {rendered ? (
        <div className={`${PROSE} max-h-96 overflow-auto rounded-md bg-muted/50 px-3 py-2 text-body`}>
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      ) : (
        <pre
          className={`max-h-96 overflow-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-meta whitespace-pre-wrap break-words ${error ? "text-destructive" : "text-foreground/85"}`}
        >
          {text || "(empty)"}
        </pre>
      )}
    </div>
  )
}

/** Reading type for the agent's replies, as the queue's issues read: loose leading, quiet headings, lists and code. */
export const PROSE = [
  "max-w-[72ch] leading-relaxed text-foreground",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_strong]:font-medium",
  "[&_h1]:mt-4 [&_h1]:mb-1.5 [&_h1]:text-sm [&_h1]:font-medium [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-large [&_h2]:font-medium",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-medium [&_h3]:text-muted-foreground",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5 [&_li::marker]:text-muted-foreground",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-meta",
  "[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse",
  "[&_th]:border-b [&_th]:px-2.5 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_th:first-child]:pl-0",
  "[&_td]:border-b [&_td]:px-2.5 [&_td]:py-1 [&_td]:align-top [&_td:first-child]:pl-0 [&_tr:last-child_td]:border-b-0",
  "[&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-4",
].join(" ")
