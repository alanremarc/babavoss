// Inspect an app's promptware in the shell workbench, with reference text read on demand.
import { RefreshCwIcon, SparklesIcon } from "lucide-react"
import type { Handle } from "#babavoss/core/index.ts"
import {
  CodeBlock,
  CodeBlockContent,
  useLive,
  useTab,
  Workbench,
  WorkbenchEmpty,
  WorkbenchList,
  WorkbenchNotice,
  WorkbenchPage,
} from "#babavoss/shell/ui/index.ts"
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

const measure = (v: Text) => (v.chars === undefined ? v.status : `${v.chars} chars · ≈${v.tokens} tokens`)

function Document({ at }: { at: string }) {
  const { view } = useLive<Text>(at)

  if (!view || view.at !== at) return <WorkbenchEmpty>Reading promptware.</WorkbenchEmpty>

  return (
    <WorkbenchPage
      title={view.name ?? { "/description": "Description", "/skill": "Skill text", "/open": "Open answer" }[at] ?? at}
      meta={
        <>
          {measure(view)}
          {view.tookMs !== undefined && ` · ${view.tookMs} ms`}
        </>
      }
    >
      {view.status === "running" && <WorkbenchNotice>Running the app's open command.</WorkbenchNotice>}
      {view.error && <WorkbenchNotice>{view.error}</WorkbenchNotice>}
      <CodeBlock>
        <CodeBlockContent wrap>{view.status === "failed" ? (view.output ?? "") : (view.text ?? "")}</CodeBlockContent>
      </CodeBlock>
    </WorkbenchPage>
  )
}
export function AgentConfig() {
  const { call, route, navigate } = useTab()
  const { view } = useLive<Root>("/")
  const act = (at: string, handle: Handle) => void call(at, handle.name, handle.args ?? {})
  const rows = view?.app
    ? [
        { ...view.description!, name: "Description" },
        { ...view.skill!, name: "Skill text" },
        { ...view.answer!, name: "Open answer" },
        ...(view.references ?? []),
      ]
    : []
  const active = rows.some((r) => r.at === route) ? route : "/description"

  return (
    <Workbench
      label="Agent config"
      scopes={
        view
          ? {
              title: "Apps",
              hint: `Promptware under ${view.project}`,
              list: view.apps.map((p) => ({ id: p.id, label: p.name, description: [p.dir, p.description].filter(Boolean).join(" · ") })),
              current: view.app?.id,
              open: (id) => {
                const p = view.apps.find((p) => p.id === id)

                if (p) act(p.at, p.select)
                else if (view.back) act("/", view.back)
              },
            }
          : undefined
      }
      tools={[
        {
          id: "promptware",
          label: "Promptware",
          icon: SparklesIcon,
          actions: [{ id: "refresh", label: "Read files and compute open again", icon: RefreshCwIcon, run: () => view && act("/", view.refresh) }],
          content: (
            <>
              <WorkbenchList
                label="Promptware"
                rows={rows.map((r) => ({ id: r.at, label: r.name, detail: measure(r) }))}
                active={active}
                open={navigate}
                empty="Pick an app."
              />
              {view?.app && !view.references?.length && <WorkbenchNotice>No references.</WorkbenchNotice>}
            </>
          ),
        },
      ]}
      documents={
        view?.app
          ? {
              active,
              describe: (at) => ({ label: rows.find((r) => r.at === at)?.name ?? at }),
              open: (at) => navigate(at ?? "/"),
              empty: "Open promptware to read its text.",
            }
          : undefined
      }
      main={view?.app ? <Document key={`${view.app.id}:${active}`} at={active} /> : <WorkbenchEmpty>Pick an app to inspect its promptware.</WorkbenchEmpty>}
    />
  )
}
