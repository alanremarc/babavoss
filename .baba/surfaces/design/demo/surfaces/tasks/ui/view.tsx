// The tasks page as a function of its view at /: the tasks as rows, each by its status, the asks of one in review beside
// it, and who is waited for above them. Its own page draws it with the live view; the design document draws it with a view
// a play recorded, and gives no `call`, so nothing in it acts.
import { CircleCheckIcon, CircleDotIcon, CircleIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button } from "babavoss/kit/index.ts"

type Status = "todo" | "review" | "done"
type Row = { at: string; n: number; title: string; status: Status; approve?: Handle; reopen?: Handle }
export type TasksView = { title?: string; tasks?: Row[]; attention?: { who: string; why: string } }
export type Props = { view: TasksView; call?: (path: string, handle: Handle) => void }

const NAMES: Record<Status, string> = { todo: "to do", review: "in review", done: "done" }

function Mark({ status }: { status: Status }) {
  if (status === "done") return <CircleCheckIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
  if (status === "review") return <CircleDotIcon className="text-warning size-3.5 shrink-0" aria-hidden />

  return <CircleIcon className="size-3.5 shrink-0" aria-hidden />
}

export default function TasksPage({ view, call }: Props) {
  const tasks = view.tasks ?? []

  return (
    <div className="flex flex-col gap-2 p-3 text-body">
      {view.attention && (
        <p data-fact="attention" className="bg-warning/10 text-warning rounded-md px-2 py-1 text-meta">
          Waiting for the {view.attention.who}: {view.attention.why}
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center">No tasks yet.</p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((t) => (
            <li key={t.at} data-at={t.at} className="flex h-row items-center gap-2 rounded-sm px-1.5">
              <Mark status={t.status} />
              <span className="text-muted-foreground w-4 shrink-0 text-right text-meta tabular-nums">{t.n}</span>
              <span className={`min-w-0 flex-1 truncate ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
              {t.approve || t.reopen ? (
                <span className="flex shrink-0 gap-1">
                  {[t.approve, t.reopen].map(
                    (h) =>
                      h && (
                        <Button key={h.name} size="xs" variant={h.name === "approve" ? "default" : "ghost"} title={`${h.description}: yours to decide`} onClick={() => call?.(t.at, h)}>
                          {h.name === "approve" ? "Approve" : "Reopen"}
                        </Button>
                      ),
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground shrink-0 text-meta">{NAMES[t.status]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
