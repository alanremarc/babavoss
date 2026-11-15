// The build util's page: the apps made in the project. The person asks the agent for one; nothing is typed here.
import { Plain, useLive, WorkbenchEmpty, WorkbenchNotice, WorkbenchPage, WorkbenchSection } from "babavoss/shell/ui/index.ts"

type Root = { project: string; reading?: boolean; making?: string; error?: string; apps: { name: string; dir: string; description?: string }[] }

export function Build() {
  const { view, error } = useLive<Root>("/")

  return (
    <Plain label="Build">
      {!view || view.reading ? (
        <WorkbenchEmpty>{error ?? "Reading the project."}</WorkbenchEmpty>
      ) : (
        <WorkbenchPage title="Apps" meta={`in ${view.project}`}>
          {view.error && <WorkbenchNotice>{view.error}</WorkbenchNotice>}
          {view.making && <WorkbenchNotice tone="note">Making {view.making}.</WorkbenchNotice>}
          {view.apps.map((app) => (
            <WorkbenchSection key={app.name} label={app.name} aside={`${app.dir}/`}>
              <p className="text-muted-foreground">{app.description ?? "No description yet."}</p>
            </WorkbenchSection>
          ))}
          {!view.apps.length && !view.making && <WorkbenchEmpty>Tell the agent what app you want. It shows here once it is made.</WorkbenchEmpty>}
        </WorkbenchPage>
      )}
    </Plain>
  )
}
