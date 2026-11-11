// An app's promptware as the agent reads it, in the order it reaches the agent: the description, always in context;
// SKILL.md and what open answers with, when the app is opened; the references, read when needed. A list of them with
// their sizes, and the one in view.
import type { Handle } from "babavoss/core/index.ts"
import {
  CodeBlock,
  CodeBlockContent,
  Plain,
  useLive,
  useNarrow,
  useTab,
  WorkbenchEmpty,
  WorkbenchList,
  WorkbenchNotice,
  WorkbenchPage,
} from "babavoss/shell/ui/index.ts"
import { MarkdownBody } from "../../../ui/markdown.tsx"

type Text = { at: string; text?: string; chars?: number; tokens?: number; name?: string; status?: string; tookMs?: number; error?: string; output?: string }
type App = { id: string; name: string; dir: string; description?: string; at: string; select: Handle }
type Root = {
  project: string
  app: App | null
  apps: App[]
  refresh: Handle
  back?: Handle
  description?: Text
  skill?: Text
  references?: Text[]
  answer?: Text
}

const NAMES: Record<string, string> = { "/description": "Description", "/skill": "SKILL.md", "/open": "Open answer" }
const tokens = (n: number) => (n < 1000 ? `≈${n}` : `≈${(n / 1000).toFixed(1)}k`)
const measure = (v: Text) => (v.tokens === undefined ? v.status : `${tokens(v.tokens)} tokens`)

function Document({ at }: { at: string }) {
  const { view } = useLive<Text>(at)

  if (!view || view.at !== at) return <WorkbenchEmpty>Reading.</WorkbenchEmpty>

  const name = view.name ?? NAMES[at] ?? at
  const text = view.status === "failed" ? (view.output ?? "") : (view.text ?? "")
  const prose = at === "/skill" || /\.(md|markdown)$/.test(name)

  return (
    <WorkbenchPage
      title={name}
      meta={
        <>
          {view.chars !== undefined && `${view.chars} characters · ${measure(view)}`}
          {view.tookMs !== undefined && ` · ${view.tookMs} ms`}
        </>
      }
    >
      {view.status === "running" && <WorkbenchNotice tone="note">Running the app's open command.</WorkbenchNotice>}
      {view.error && <WorkbenchNotice>{view.error}</WorkbenchNotice>}
      {at === "/description" ? (
        <p className="text-large">{text}</p>
      ) : prose ? (
        <MarkdownBody text={text} />
      ) : (
        <CodeBlock size="sm">
          <CodeBlockContent wrap>{text}</CodeBlockContent>
        </CodeBlock>
      )}
    </WorkbenchPage>
  )
}

export function Promptware() {
  const { call, route, navigate } = useTab()
  const { view } = useLive<Root>("/")
  // In a narrow window the list stands above the document.
  const [frame, narrow] = useNarrow(640)
  const act = (at: string, handle: Handle) => void call(at, handle.name, handle.args ?? {})
  const row = (v: Text, label: string) => ({ id: v.at, label, badge: measure(v), ...(v.status === "failed" && { tone: "error" as const }) })
  const groups = view?.app
    ? [
        { id: "always", label: "Always in context", rows: [row(view.description!, "Description")] },
        { id: "opened", label: "When opened", rows: [row(view.skill!, "SKILL.md"), row(view.answer!, "Open answer")] },
        { id: "needed", label: "Read when needed", rows: (view.references ?? []).map((r) => row(r, r.name ?? r.at)) },
      ]
    : []
  const ids = groups.flatMap((g) => g.rows.map((r) => r.id))
  const active = ids.includes(route) ? route : "/skill"
  const opened = (view?.description?.tokens ?? 0) + (view?.skill?.tokens ?? 0) + (view?.answer?.tokens ?? 0)
  const needed = (view?.references ?? []).reduce((sum, r) => sum + (r.tokens ?? 0), 0)

  return (
    <Plain
      label="Promptware"
      scopes={
        view
          ? {
              title: "Apps",
              hint: `Promptware under ${view.project}`,
              list: view.apps.map((p) => ({ id: p.id, label: p.name, description: [p.dir, p.description].filter(Boolean).join(" · ") })),
              current: view.app?.id,
              ...(view.apps.length === 1 && { all: false as const }),
              open: (id) => {
                const p = view.apps.find((p) => p.id === id)

                if (p) act(p.at, p.select)
                else if (view.back) act("/", view.back)
              },
            }
          : undefined
      }
      menus={[
        {
          id: "promptware",
          label: "Promptware",
          items: [{ kind: "action", id: "refresh", label: "Read the files again", run: () => view && act("/", view.refresh) }],
        },
      ]}
    >
      {view?.app ? (
        <div ref={frame} className={`flex min-h-0 flex-1 ${narrow ? "flex-col" : "flex-row"}`}>
          <aside className={`flex shrink-0 flex-col gap-2 overflow-y-auto p-2 ${narrow ? "max-h-56 border-b" : "w-64 border-r"}`}>
            <WorkbenchList label="Promptware" groups={groups} active={active} open={navigate} empty="No promptware." />
            <p className="px-2 text-meta text-muted-foreground">
              {tokens(opened)} tokens once opened{needed > 0 && `, ${tokens(needed)} more in references`}
            </p>
          </aside>
          <Document key={`${view.app.id}:${active}`} at={active} />
        </div>
      ) : (
        <WorkbenchEmpty>Reading the project's apps.</WorkbenchEmpty>
      )}
    </Plain>
  )
}
