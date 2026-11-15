// The queue's page: the issues as one-liners in a sidebar on the right, grouped by where they stand, and the selected
// one in the content, with what it is about, read as markdown. The person approves or drops a draft here; anything else, they tell the agent.
import { useState } from "react"
import { CircleCheckIcon, CircleDashedIcon, CircleIcon, ListTodoIcon, LoaderCircleIcon } from "lucide-react"
import Markdown from "react-markdown"
import type { Handle } from "babavoss/core/index.ts"
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Plain } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.ts"

type Status = "draft" | "backlog" | "lane" | "done"
type Issue = { at: string; n: number; title: string; status: Status; lane?: number; note?: string }
type Whole = Issue & { about: string; approve?: Handle; drop?: Handle }
type Root = { lanes: number; free: number[]; issues: Issue[] }

export const icon = <ListTodoIcon aria-hidden />

const GROUPS: { status: Status; label: string }[] = [
  { status: "lane", label: "In progress" },
  { status: "backlog", label: "Backlog" },
  { status: "draft", label: "Drafts" },
  { status: "done", label: "Done" },
]
/** Reading type for an issue's markdown: a measure of about 68 characters, loose leading, quiet headings and lists. */
const PROSE = [
  "max-w-[68ch] text-[13.5px] leading-[1.65] text-foreground/85",
  "[&>*:first-child]:mt-0 [&_p]:my-3 [&_strong]:font-medium [&_strong]:text-foreground",
  "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-medium [&_h1]:text-foreground",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-foreground",
  "[&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-muted-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1 [&_li::marker]:text-muted-foreground",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-5",
].join(" ")
const NAMES: Record<Status, string> = { lane: "In progress", backlog: "Backlog", draft: "Draft", done: "Done" }

function Mark({ status }: { status: Status }) {
  const size = "size-3.5 shrink-0"

  if (status === "lane") return <LoaderCircleIcon className={`${size} text-primary animate-spin [animation-duration:2.5s]`} aria-hidden />
  if (status === "done") return <CircleCheckIcon className={`${size} text-muted-foreground`} aria-hidden />
  if (status === "draft") return <CircleDashedIcon className={`${size} text-muted-foreground`} aria-hidden />

  return <CircleIcon className={size} aria-hidden />
}

const Lane = ({ lane }: { lane: number }) => (
  <span className="bg-primary text-primary-foreground inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-[10px] font-medium tabular-nums">L{lane}</span>
)

export default function Queue() {
  const { view, error } = useLive<Root>("/")
  // The selected issue is the tab's route, /issues/N, so it is in the address and survives a refresh.
  const { call, route, navigate } = useTab()
  const picked = Number(/^\/issues\/(\d+)$/.exec(route)?.[1])
  const [refused, setRefused] = useState("")
  const issues = view?.issues ?? []
  const current = issues.find((issue) => issue.n === picked) ?? issues[0]
  const { view: selected } = useLive<Whole>(current ? `/issues/${current.n}` : "/")
  const busy = (view?.lanes ?? 0) - (view?.free.length ?? 0)
  const decide = async (handle: Handle) => {
    const answer = await call(`/issues/${current?.n}`, handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  return (
    <Plain label="Queue">
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          {current && selected?.about !== undefined ? (
            <article className="flex max-w-3xl flex-col gap-4 p-6">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Mark status={selected.status} />
                <span>{NAMES[selected.status]}</span>
                {selected.lane && <Lane lane={selected.lane} />}
                <span className="tabular-nums">#{selected.n}</span>
              </div>
              <h1 className="text-lg leading-snug font-medium text-balance">{selected.title}</h1>
              <div className={PROSE}>
                <Markdown>{selected.about}</Markdown>
              </div>
              {selected.note && (
                <p className="border-primary/50 border-l-2 pl-3 text-sm">
                  <span className="text-muted-foreground">Now: </span>
                  {selected.note}
                </p>
              )}
              {selected.status === "draft" && (
                <div className="flex gap-2 pt-1">
                  {selected.approve && <Button onClick={() => void decide(selected.approve!)}>Approve</Button>}
                  {selected.drop && (
                    <Button variant="ghost" onClick={() => void decide(selected.drop!)}>
                      Drop
                    </Button>
                  )}
                </div>
              )}
              {(refused || error) && (
                <p role="alert" className="text-destructive text-sm">
                  {refused || error}
                </p>
              )}
            </article>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No issues</EmptyTitle>
                <EmptyDescription>Tell the agent what to do next.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </main>
        <aside className="bg-muted/30 flex w-80 shrink-0 flex-col overflow-auto border-l py-2" aria-label="Issues">
          {GROUPS.map(({ status, label }) => {
            const rows = issues.filter((issue) => issue.status === status)

            if (!rows.length && status !== "lane") return null

            return (
              <section key={status} aria-label={label} className="pb-2">
                <h2 className="text-muted-foreground flex h-6 items-center justify-between px-3 text-[11px] font-medium">
                  {label}
                  {status === "lane" ? (
                    <span className="flex items-center gap-0.5" aria-label={`${busy} of ${view?.lanes ?? 0} lanes busy`}>
                      {Array.from({ length: view?.lanes ?? 0 }, (_, i) => (
                        <span key={i} className={`h-1.5 w-3 rounded-full ${view?.free.includes(i + 1) ? "bg-border" : "bg-primary"}`} />
                      ))}
                    </span>
                  ) : (
                    <span className="tabular-nums">{rows.length}</span>
                  )}
                </h2>
                {!rows.length && <p className="text-muted-foreground/70 px-3 text-xs">All lanes idle</p>}
                <ul>
                  {rows.map((issue) => (
                    <li key={issue.n}>
                      <button
                        type="button"
                        onClick={() => navigate(`/issues/${issue.n}`)}
                        aria-current={issue.n === current?.n}
                        title={issue.title}
                        className={`hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground flex h-7 w-full items-center gap-2 px-3 text-left text-xs outline-none ${status === "done" || status === "draft" ? "text-muted-foreground" : ""}`}
                      >
                        <Mark status={issue.status} />
                        <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                        {issue.lane && <Lane lane={issue.lane} />}
                        <span className="text-muted-foreground/70 text-[10px] tabular-nums">#{issue.n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </aside>
      </div>
    </Plain>
  )
}
