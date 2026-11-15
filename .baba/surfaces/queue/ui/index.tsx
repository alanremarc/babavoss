// The queue's page: the issues as one-liners in a sidebar on the right, grouped by where they stand, and the selected
// one in the content, with what it is about. The person approves or drops a draft here; anything else, they tell the agent.
import { useState } from "react"
import { CircleCheckIcon, CircleDashedIcon, CircleIcon, ListTodoIcon, LoaderCircleIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Plain, useLive, useTab } from "babavoss/shell/ui/index.ts"

type Status = "draft" | "backlog" | "lane" | "done"
type Issue = { n: number; title: string; about: string; status: Status; lane?: number; note?: string; approve?: Handle; drop?: Handle }
type Root = { lanes: number; free: number[]; issues: Issue[] }

export const icon = <ListTodoIcon aria-hidden />

const GROUPS: { status: Status; label: string }[] = [
  { status: "lane", label: "In progress" },
  { status: "backlog", label: "Backlog" },
  { status: "draft", label: "Drafts" },
  { status: "done", label: "Done" },
]
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
  const { call } = useTab()
  const [picked, setPicked] = useState<number>()
  const [refused, setRefused] = useState("")
  const issues = view?.issues ?? []
  const selected = issues.find((issue) => issue.n === picked) ?? issues[0]
  const busy = (view?.lanes ?? 0) - (view?.free.length ?? 0)
  const decide = async (handle: Handle) => {
    const answer = await call("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  return (
    <Plain label="Queue">
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          {selected ? (
            <article className="flex max-w-2xl flex-col gap-4 p-6">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Mark status={selected.status} />
                <span>{NAMES[selected.status]}</span>
                {selected.lane && <Lane lane={selected.lane} />}
                <span className="tabular-nums">#{selected.n}</span>
              </div>
              <h1 className="text-lg leading-snug font-medium text-balance">{selected.title}</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">{selected.about}</p>
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
                        onClick={() => setPicked(issue.n)}
                        aria-current={issue.n === selected?.n}
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
