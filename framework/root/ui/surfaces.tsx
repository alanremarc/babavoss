// The picker's page: the surfaces in this .baba/, as the person reads them. They open one from the launcher, or ask the
// agent for a new one; nothing is typed here.
import { Plain, useLive, WorkbenchEmpty, WorkbenchNotice, WorkbenchPage, WorkbenchSection } from "../../shell/ui/index.ts"

type Root = { baba?: string; missing?: string; surfaces: { name: string; description: string }[] }

export function Surfaces() {
  const { view, error } = useLive<Root>("/")

  return (
    <Plain label="Surfaces">
      {!view ? (
        <WorkbenchEmpty>{error ?? "Reading the surfaces."}</WorkbenchEmpty>
      ) : (
        <WorkbenchPage title="Surfaces" meta={view.baba ? `in ${view.baba}` : undefined}>
          {view.missing && <WorkbenchNotice>{view.missing}</WorkbenchNotice>}
          {view.surfaces.map((surface) => (
            <WorkbenchSection key={surface.name} label={surface.name}>
              <p className="text-muted-foreground">{surface.description}</p>
            </WorkbenchSection>
          ))}
          {view.baba && !view.surfaces.length && <WorkbenchEmpty>No surfaces yet. Tell the agent what you want one for.</WorkbenchEmpty>}
        </WorkbenchPage>
      )}
    </Plain>
  )
}
