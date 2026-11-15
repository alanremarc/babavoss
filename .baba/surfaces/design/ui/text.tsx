// A told text on the page, two ways. Preview: its prose rendered as markdown, and what the framework prints dense, in
// monospace, coloured by the kind of each span (told.ts), its tables aligned, the lines that differ from the pin marked.
// Source: the text exactly as given, line by line, and where it differs from the pin the line diff, its marks in a gutter
// that is no part of the text. A path of a tab the step's page has is a button that shows that tab in the page preview.
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ReactNode } from "react"
import { lineDiff } from "../src/measure.ts"
import { parts, valueSpans, type Line, type Span } from "./told.ts"

export type Compare = "text" | "diff" | "side"

const PROSE = [
  "max-w-[80ch] text-body leading-relaxed text-foreground/85",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_strong]:font-medium [&_strong]:text-foreground",
  "[&_h1]:mt-4 [&_h1]:mb-1.5 [&_h1]:text-sm [&_h1]:font-medium [&_h1]:text-foreground",
  "[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-large [&_h2]:font-medium [&_h2]:text-foreground",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-body [&_h3]:font-medium [&_h3]:text-muted-foreground",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_li]:pl-0.5 [&_li::marker]:text-muted-foreground",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-meta",
  "[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-meta",
  "[&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_th:first-child]:pl-0",
  "[&_td]:px-2 [&_td]:py-0.5 [&_td]:align-top [&_td:first-child]:pl-0",
  "[&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-3",
].join(" ")

const SPAN: Record<Span["kind"], string> = {
  plain: "",
  path: "text-info",
  key: "text-muted-foreground",
  string: "text-foreground",
  number: "text-foreground tabular-nums",
  keyword: "text-foreground italic",
  command: "rounded-sm bg-muted px-0.5 text-foreground",
  description: "text-muted-foreground font-sans",
  sign: "font-medium",
  arrow: "text-muted-foreground",
  old: "text-muted-foreground line-through decoration-muted-foreground/50",
  who: "",
  surface: "text-muted-foreground",
}
const WHO: Record<NonNullable<Span["who"]>, string> = {
  person: "bg-warning/15 text-warning",
  surface: "bg-info/15 text-info",
  agent: "bg-primary/15 text-primary",
}
const LINE: Record<Line["kind"], string> = {
  blank: "h-2",
  lead: "font-sans text-muted-foreground italic",
  section: "pt-1 font-sans text-badge uppercase tracking-wide",
  heading: "pt-1 font-medium",
  fact: "",
  add: "bg-success/10 [&>[data-sign]]:text-success",
  remove: "bg-destructive/10 [&>[data-sign]]:text-destructive",
  head: "",
  row: "",
  notice: "font-sans text-foreground",
  plain: "text-foreground/85",
}

/** Where a click on a path goes: a tab of the step's page, or nowhere. */
export type OnPath = (path: string) => boolean

function Spans({ spans, onPath }: { spans: Span[]; onPath?: OnPath }) {
  return spans.map((s, i) => {
    if (s.kind === "who")
      return (
        <span key={i}>
          {s.text.match(/^ */)![0]}
          <span className={`rounded-sm px-1 font-sans text-badge ${WHO[s.who!]}`}>{s.text.trimStart()}</span>
        </span>
      )
    if (s.kind === "path" && onPath)
      return (
        <span
          key={i}
          role="button"
          tabIndex={-1}
          className={`${SPAN.path} cursor-pointer hover:underline`}
          onClick={(e) => {
            if (onPath(s.text)) e.stopPropagation()
          }}
        >
          {s.text}
        </span>
      )

    return (
      <span key={i} className={SPAN[s.kind]} {...(s.kind === "sign" && { "data-sign": "" })}>
        {s.text}
      </span>
    )
  })
}

/** A table of the shape `key: col col`, its rows by tab, aligned, with a quiet head. */
function Table({ head, rows, changed, onPath }: { head: Line; rows: { line: Line; n: number }[]; changed: Set<number>; onPath?: OnPath }) {
  const columns = head.spans.at(-1)!.text.split("\t")

  return (
    <div className="py-0.5">
      <div>
        <Spans spans={head.spans.slice(0, 2)} />
      </div>
      <div className="overflow-x-auto pl-[2ch]">
        <table className="border-collapse">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="text-muted-foreground/80 pr-4 text-left font-sans text-badge font-normal uppercase">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, n }) => (
              <tr key={n} className={changed.has(n) ? "bg-warning/10" : ""}>
                {line.text.split("\t").map((cell, i) => (
                  <td key={i} className="max-w-[48ch] truncate pr-4 align-top whitespace-nowrap" title={cell}>
                    <Spans spans={valueSpans(cell)} onPath={onPath} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** A printed part, line by line; a table's lines together. `from` is its first line's number in the text. */
function Shaped({ lines, from, changed, wrap, onPath }: { lines: Line[]; from: number; changed: Set<number>; wrap: boolean; onPath?: OnPath }) {
  const out: ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const n = from + i

    if (line.kind === "head") {
      const rows: { line: Line; n: number }[] = []

      while (lines[i + 1]?.kind === "row") rows.push({ line: lines[++i]!, n: from + i })
      out.push(<Table key={n} head={line} rows={rows} changed={changed} onPath={onPath} />)
      continue
    }
    out.push(
      <div
        key={n}
        className={`${LINE[line.kind]} ${wrap ? "pl-[2ch] -indent-[2ch] break-words whitespace-pre-wrap" : "whitespace-pre"} ${changed.has(n) ? "shadow-[inset_2px_0_0_var(--warning)] bg-warning/10" : ""}`}
      >
        <Spans spans={line.spans} onPath={onPath} />
      </div>,
    )
  }

  return <div className={`font-mono text-meta leading-5 ${wrap ? "" : "overflow-x-auto"}`}>{out}</div>
}

/** The lines of `text` that are not in `pinned`, by number. */
function changedLines(text: string, pinned?: string): { changed: Set<number>; gone: number } {
  const changed = new Set<number>()
  let j = 0
  let gone = 0

  if (pinned === undefined) return { changed, gone }
  for (const d of lineDiff(pinned, text)) {
    if (d.op === "+") changed.add(j)
    if (d.op === "-") gone++
    else j++
  }

  return { changed, gone }
}

export function Preview({ text, pinned, wrap, onPath }: { text: string; pinned?: string; wrap: boolean; onPath?: OnPath }) {
  const { changed, gone } = changedLines(text, pinned)

  return (
    <div className="flex flex-col gap-2">
      {parts(text).map((p) => {
        if (p.kind === "shaped") return <Shaped key={p.from} lines={p.lines} from={p.from} changed={changed} wrap={wrap} onPath={onPath} />

        const lines = p.text.split("\n").length
        const moved = [...changed].some((n) => n >= p.from && n < p.from + lines)

        return (
          <div key={p.from} className={`${PROSE} ${moved ? "border-warning border-l-2 pl-2" : ""}`}>
            <Markdown remarkPlugins={[remarkGfm]}>{p.text}</Markdown>
          </div>
        )
      })}
      {gone > 0 && (
        <p className="text-muted-foreground text-meta">
          {gone} {gone === 1 ? "line" : "lines"} of the pinned text {gone === 1 ? "is" : "are"} gone: see Source
        </p>
      )}
    </div>
  )
}

/** Lines as they are, each in its own row; marks, where there are any, in a gutter that is no part of them. */
function Lines({ lines, wrap, marks }: { lines: string[]; wrap: boolean; marks?: (" " | "+" | "-")[] }) {
  return (
    <pre className={`font-mono text-meta leading-5 ${wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre"}`}>
      {lines.map((line, i) => {
        const mark = marks?.[i]

        return (
          <div key={i} className={`flex ${mark === "+" ? "bg-success/10 text-success" : mark === "-" ? "bg-destructive/10 text-destructive line-through decoration-destructive/40" : ""}`}>
            {marks && (
              <span className="text-muted-foreground w-[2ch] shrink-0 select-none" aria-hidden>
                {mark === " " ? "" : mark}
              </span>
            )}
            <span className={`min-w-0 flex-1 ${wrap ? "pl-[2ch] -indent-[2ch]" : ""}`}>{line || " "}</span>
          </div>
        )
      })}
    </pre>
  )
}

export function Source({ text, pinned, compare, wrap }: { text: string; pinned?: string; compare: Compare; wrap: boolean }) {
  if (pinned === undefined || compare === "text") return <Lines lines={text.split("\n")} wrap={wrap} />
  if (compare === "side")
    return (
      <div className="grid grid-cols-2 gap-3">
        {[
          ["pinned", pinned],
          ["now", text],
        ].map(([label, t]) => (
          <div key={label} className="min-w-0">
            <div className="text-muted-foreground/80 pb-0.5 text-badge uppercase">{label}</div>
            <Lines lines={t!.split("\n")} wrap={wrap} />
          </div>
        ))}
      </div>
    )

  const diff = lineDiff(pinned, text)

  return <Lines lines={diff.map((d) => d.line)} marks={diff.map((d) => d.op)} wrap={wrap} />
}
