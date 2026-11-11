// The build util's page: an app's brief as one sheet the person reads, and the one decision that is theirs, approving it.
// What they want changed, they tell the agent; nothing is typed here.
import { useState } from "react"
import { CheckIcon, CircleDashedIcon, CircleHelpIcon, CircleIcon } from "lucide-react"
import type { Handle } from "#babavoss/core/index.ts"
import { Button, Plain, useLive, useTab, WorkbenchEmpty, WorkbenchMark, WorkbenchNotice, WorkbenchPage, WorkbenchSection } from "#babavoss/shell/ui/index.ts"

type Row = { at: string; name: string; job: string; state: string; unanswered?: number; next: string }
type Root = { project: string; reading?: boolean; error?: string; briefs: (Row & { steps?: string })[] }
type Question = { n: number; text: string; answer?: string }
type Step = { n: number; text: string; status: "todo" | "doing" | "done" }
type Brief = Row & {
  agent: string[]
  sees: string[]
  decides: string[]
  needs: string[]
  questions: Question[]
  steps: Step[]
  approved: boolean
  dir?: string
  error?: string
  approve?: Handle
}

const ICONS = { todo: CircleIcon, doing: CircleDashedIcon, done: CheckIcon }

function Lines({ label, lines, empty }: { label: string; lines: string[]; empty: string }) {
  return (
    <WorkbenchSection label={label}>
      {lines.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-4">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </WorkbenchSection>
  )
}

function Sheet({ at }: { at: string }) {
  const { view, error } = useLive<Brief>(at)
  const { call } = useTab()
  const [refused, setRefused] = useState("")

  if (!view) return <WorkbenchEmpty>{error ?? "Reading the brief."}</WorkbenchEmpty>

  const open = view.questions.filter((q) => q.answer === undefined)
  const approve = async (handle: Handle) => {
    const answer = await call(at, handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  return (
    <WorkbenchPage title={view.name} aside={view.state} meta={view.dir ? `in ${view.dir}/` : "not made yet"}>
      {(view.error || refused) && <WorkbenchNotice>{view.error || refused}</WorkbenchNotice>}
      <p className="text-large">{view.job}</p>
      <div className="grid gap-4 @2xl:grid-cols-3">
        <Lines label="The agent" lines={view.agent} empty="Not written yet." />
        <Lines label="You see" lines={view.sees} empty="Nothing yet." />
        <Lines label="You decide" lines={view.decides} empty="Nothing yet." />
      </div>
      {view.needs.length > 0 && <Lines label="It needs" lines={view.needs} empty="" />}
      {view.questions.length > 0 && (
        <WorkbenchSection label="Questions" aside={open.length ? `${open.length} for you, in chat` : "all answered"}>
          <ul className="flex flex-col gap-2">
            {view.questions.map((q) => (
              <li key={q.n} className="flex flex-col gap-0.5">
                <WorkbenchMark icon={q.answer === undefined ? CircleHelpIcon : CheckIcon}>{q.text}</WorkbenchMark>
                {q.answer !== undefined && <span className="pl-5 text-muted-foreground">{q.answer}</span>}
              </li>
            ))}
          </ul>
        </WorkbenchSection>
      )}
      {view.steps.length > 0 && (
        <WorkbenchSection label="Steps" aside={`${view.steps.filter((s) => s.status === "done").length} of ${view.steps.length} done`}>
          <ol className="flex flex-col gap-1">
            {view.steps.map((s) => (
              <li key={s.n} className={s.status === "done" ? "text-muted-foreground" : s.status === "doing" ? "font-medium" : ""}>
                <WorkbenchMark icon={ICONS[s.status]} busy={s.status === "doing"}>
                  {s.text}
                </WorkbenchMark>
              </li>
            ))}
          </ol>
        </WorkbenchSection>
      )}
      {view.approve ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <Button onClick={() => void approve(view.approve!)}>Approve</Button>
          <span className="text-muted-foreground">Approve when this is the app you want. To change it, tell the agent.</span>
        </div>
      ) : (
        !view.approved && (
          <WorkbenchNotice tone="note">{open.length ? "The agent has questions for you in chat." : "The agent is still writing this brief."}</WorkbenchNotice>
        )
      )}
    </WorkbenchPage>
  )
}

export function Build() {
  const { route, navigate } = useTab()
  const { view } = useLive<Root>("/")
  const briefs = view?.briefs ?? []
  const current = /^\/briefs\/([^/]+)$/.exec(route)?.[1] ?? (briefs.length === 1 ? briefs[0]!.name : undefined)

  return (
    <Plain
      label="Build"
      scopes={
        briefs.length
          ? {
              title: "Briefs",
              hint: `Apps being built in ${view?.project}`,
              list: briefs.map((b) => ({
                id: b.name,
                label: b.name,
                description: b.job,
                aside: [b.state, b.steps && `${b.steps} steps`].filter(Boolean).join(" · "),
              })),
              current: current && briefs.some((b) => b.name === current) ? current : undefined,
              ...(briefs.length === 1 && { all: false as const }),
              open: (id) => navigate(id ? `/briefs/${encodeURIComponent(id)}` : "/"),
            }
          : undefined
      }
    >
      {current ? (
        <Sheet key={current} at={`/briefs/${current}`} />
      ) : (
        <WorkbenchEmpty>
          {view?.error ??
            (view?.reading
              ? "Reading the project."
              : "Tell the agent what app you want. Its brief shows here for you to read and approve before anything is built.")}
        </WorkbenchEmpty>
      )}
    </Plain>
  )
}
