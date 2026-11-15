// The queue's page: one vertical stack of issues, the lanes delivering first, then the backlog, then what is done. The
// person reads it; what they want changed in it, they tell the agent.
import { ListTodoIcon } from "lucide-react"
import { Plain, useLive } from "babavoss/shell/ui/index.ts"

type Issue = { n: number; title: string; status: "backlog" | "lane" | "done"; lane?: number; note?: string }
type Root = { lanes: number; free: number[]; issues: Issue[] }

export const icon = <ListTodoIcon aria-hidden />

const chip = "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium tabular-nums"

function Row({ issue }: { issue: Issue }) {
  const working = issue.status === "lane"
  const finished = issue.status === "done"

  return (
    <li className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${working ? "border-primary/40 bg-primary/5" : ""} ${finished ? "opacity-60" : ""}`}>
      <span className="text-muted-foreground w-8 shrink-0 pt-px text-right text-xs tabular-nums">#{issue.n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={finished ? "line-through decoration-1" : ""}>{issue.title}</span>
        {issue.note && <span className="text-muted-foreground text-xs">{issue.note}</span>}
      </div>
      {working ? (
        <span className={`${chip} bg-primary text-primary-foreground gap-1.5`}>
          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
          Lane {issue.lane}
        </span>
      ) : (
        <span className={`${chip} bg-secondary text-secondary-foreground`}>{finished ? "Done" : "Backlog"}</span>
      )}
    </li>
  )
}

function Section({ label, count, children }: { label: string; count: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <h2 className="text-muted-foreground flex items-baseline justify-between text-xs font-medium tracking-wide uppercase">
        {label}
        <span className="tabular-nums normal-case">{count}</span>
      </h2>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

export default function Queue() {
  const { view, error } = useLive<Root>("/")
  const issues = view?.issues ?? []
  const of = (status: Issue["status"]) => issues.filter((issue) => issue.status === status)
  const [working, backlog, finished] = [of("lane"), of("backlog"), of("done")]

  return (
    <Plain label="Queue">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 overflow-auto p-6">
        <Section label="In progress" count={`${working.length} of ${view?.lanes ?? 0} lanes`}>
          {working.map((issue) => (
            <Row key={issue.n} issue={issue} />
          ))}
          {(view?.free ?? []).map((lane) => (
            <li key={lane} className="text-muted-foreground flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs">
              <span className="pl-11">idle</span>
              <span className={`${chip} border`}>Lane {lane}</span>
            </li>
          ))}
        </Section>
        <Section label="Backlog" count={String(backlog.length)}>
          {backlog.map((issue) => (
            <Row key={issue.n} issue={issue} />
          ))}
          {!backlog.length && <li className="text-muted-foreground px-3 text-sm">Nothing waits. Tell the agent what to do next.</li>}
        </Section>
        {finished.length > 0 && (
          <Section label="Done" count={String(finished.length)}>
            {finished.map((issue) => (
              <Row key={issue.n} issue={issue} />
            ))}
          </Section>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </Plain>
  )
}
