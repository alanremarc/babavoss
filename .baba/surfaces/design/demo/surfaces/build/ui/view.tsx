// The build page as a function of its view at /: its status, why it failed, how many runs, and who is waited for. Its own
// page draws it with the live view; the design document draws it with a view a play recorded.
import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react"

type Status = "idle" | "running" | "passed" | "failed"
export type BuildView = { title?: string; status?: Status; why?: string; runs?: number; attention?: { who: string; why: string } }

const SAID: Record<Status, string> = { idle: "No run yet", running: "Running", passed: "Passed", failed: "Failed" }

function Mark({ status }: { status: Status }) {
  const size = "size-4 shrink-0"

  if (status === "running") return <LoaderCircleIcon className={`${size} text-primary animate-spin [animation-duration:2.5s]`} aria-hidden />
  if (status === "passed") return <CircleCheckIcon className={`${size} text-success`} aria-hidden />
  if (status === "failed") return <CircleXIcon className={`${size} text-destructive`} aria-hidden />

  return <CircleDashedIcon className={`${size} text-muted-foreground`} aria-hidden />
}

export default function BuildPage({ view }: { view: BuildView }) {
  const status = view.status ?? "idle"

  return (
    <div className="flex flex-col gap-2 p-3 text-body">
      <div data-fact="status" className="flex items-center gap-2">
        <Mark status={status} />
        <span className="text-large font-medium">{SAID[status]}</span>
        <span data-fact="runs" className="text-muted-foreground ml-auto text-meta tabular-nums">
          {view.runs ?? 0} {view.runs === 1 ? "run" : "runs"}
        </span>
      </div>
      {view.why && (
        <p data-fact="why" className="text-destructive font-mono text-meta">
          {view.why}
        </p>
      )}
      {view.attention && (
        <p data-fact="attention" className="bg-warning/10 text-warning rounded-md px-2 py-1 text-meta">
          Waiting for the {view.attention.who}: {view.attention.why}
        </p>
      )}
    </div>
  )
}
