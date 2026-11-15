// An issue whole, the one component both views show it with: where it stands, what it is about as markdown, what it came
// out of and led to, the reasoning of each of its passes, the updates from its lane, and a draft's approve or drop. The list
// shows it in the content, the map in its panel; `roomy` is the list's.
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Handle } from "babavoss/core/index.ts"
import { Button } from "babavoss/kit/index.ts"
import { Label, Lane, Line, Mark, NAMES, type Status, type Whole } from "./parts.tsx"

/** Reading type for an issue's markdown: a measure of about 68 characters, loose leading, quiet headings and lists. */
const PROSE = [
  "max-w-[68ch] leading-relaxed text-foreground/85",
  "[&>*:first-child]:mt-0 [&_p]:my-3 [&_strong]:font-medium [&_strong]:text-foreground",
  "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-medium [&_h1]:text-foreground",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-foreground",
  "[&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-body [&_h3]:font-medium [&_h3]:text-muted-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1 [&_li::marker]:text-muted-foreground",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-body",
  "[&_th]:border-b [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_th:first-child]:pl-0",
  "[&_td]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top [&_td:first-child]:pl-0 [&_tr:last-child_td]:border-b-0",
  "[&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-5",
].join(" ")

/** When an update was posted, as the hour and minute of the day. */
const clock = (t?: number) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "")

export type DetailProps = {
  whole: Whole
  color: string
  colorOf: (n: number) => string
  laneOf: (n: number) => number | undefined
  go: (route: string) => void
  decide: (handle: Handle) => void
  refused?: string
  roomy?: boolean
}

export function Detail({ whole, color, colorOf, laneOf, go, decide, refused, roomy }: DetailProps) {
  const last = whole.iterations.length - 1
  const lines = (refs: Whole["from"]) => (
    <ul className="-mx-1.5">
      {refs.map((ref) => (
        <Line key={ref.n} to={{ ...ref, lane: laneOf(ref.n) }} color={colorOf(ref.n)} onPick={() => go(`/issues/${ref.n}`)} />
      ))}
    </ul>
  )

  return (
    <article className={`flex flex-col gap-4 ${roomy ? "max-w-3xl p-6" : "px-4 py-4"}`}>
      <div className="text-muted-foreground flex items-center gap-2 text-body">
        <Mark status={whole.status as Status} />
        <span>{NAMES[whole.status]}</span>
        {whole.lane && <Lane lane={whole.lane} />}
        <span className="tabular-nums">#{whole.n}</span>
        <button
          type="button"
          onClick={() => go(`/narratives/${whole.narrative.id}`)}
          title={`Narrative: ${whole.narrative.title}`}
          className="hover:text-foreground ml-auto flex min-w-0 items-center gap-1.5 text-meta outline-none"
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{whole.narrative.title}</span>
        </button>
      </div>
      <h1 className={`${roomy ? "text-lg" : "text-sm"} leading-snug font-medium text-balance`}>{whole.title}</h1>
      <div className={`${PROSE} ${roomy ? "text-large" : "text-body"}`}>
        <Markdown remarkPlugins={[remarkGfm]}>{whole.about}</Markdown>
      </div>
      {whole.note && (
        <p className={`border-primary/50 border-l-2 pl-3 ${roomy ? "text-sm" : "text-body"}`}>
          <span className="text-muted-foreground">Now: </span>
          {whole.note}
        </p>
      )}
      {whole.status === "draft" && (whole.approve || whole.drop) && (
        <div className="flex gap-2">
          {whole.approve && <Button onClick={() => decide(whole.approve!)}>Approve</Button>}
          {whole.drop && (
            <Button variant="ghost" onClick={() => decide(whole.drop!)}>
              Drop
            </Button>
          )}
        </div>
      )}
      {refused && (
        <p role="alert" className="text-destructive text-body">
          {refused}
        </p>
      )}
      {(whole.from.length > 0 || whole.to.length > 0) && (
        <div className={`grid gap-4 border-t pt-4 ${roomy ? "grid-cols-2" : "grid-cols-1"}`}>
          {whole.from.length > 0 && (
            <section className="flex min-w-0 flex-col gap-1">
              <Label>Came out of</Label>
              {lines(whole.from)}
            </section>
          )}
          {whole.to.length > 0 && (
            <section className="flex min-w-0 flex-col gap-1">
              <Label>Led to</Label>
              {lines(whole.to)}
            </section>
          )}
        </div>
      )}
      {whole.iterations.length > 0 && (
        <section aria-label="Iterations" className="flex flex-col gap-3 border-t pt-4">
          <Label>Iterations · {whole.iterations.length}</Label>
          <ol className="flex flex-col">
            {whole.iterations.map((it, i) => (
              <li key={it.n} className="relative flex gap-3 pb-5 last:pb-0">
                {i < last && <span className="bg-border absolute top-4 bottom-0 left-[4.5px] w-px" aria-hidden />}
                <span
                  className="relative mt-1 size-2.5 shrink-0 rounded-full border-2"
                  style={i === last ? { background: color, borderColor: color } : { borderColor: `color-mix(in oklab, ${color} 55%, var(--border))`, background: "var(--background)" }}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground text-meta tabular-nums">{it.n}</span>
                    <h4 className="text-large leading-snug font-medium">{it.title}</h4>
                  </div>
                  <dl className="flex flex-col gap-1.5 text-body leading-relaxed">
                    {(
                      [
                        ["Why", it.why],
                        ["Decided", it.decided],
                        ["Outcome", it.outcome],
                      ] as const
                    ).map(([label, text]) => (
                      <div key={label} className="grid grid-cols-[4.25rem_1fr] gap-2">
                        <dt className="text-muted-foreground/80 pt-px text-meta">{label}</dt>
                        <dd className={text ? "text-foreground/90" : "text-muted-foreground/60 italic"}>{text || (label === "Outcome" && i === last ? "Under way" : "Not said")}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!!whole.updates?.length && (
        <section aria-label="Updates" className="flex flex-col gap-2 border-t pt-4">
          <Label>Updates from the lane</Label>
          <ol className="flex flex-col gap-2">
            {[...whole.updates].reverse().map((update, i) => (
              <li key={whole.updates!.length - i} className="flex gap-3 text-body">
                <time className="text-muted-foreground/70 w-10 shrink-0 tabular-nums">{clock(update.t)}</time>
                <span className="min-w-0 flex-1 whitespace-pre-wrap">{update.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  )
}
