// The roles util's page: the roles in this .baba/, as the person reads them. They ask the agent for one; nothing is typed here.
import { Plain, useLive, WorkbenchEmpty, WorkbenchNotice, WorkbenchPage, WorkbenchSection } from "../../shell/ui/index.ts"

type Root = { baba?: string; missing?: string; error?: string; roles: { name: string; description: string }[] }

export function Roles() {
  const { view, error } = useLive<Root>("/")

  return (
    <Plain label="Roles">
      {!view ? (
        <WorkbenchEmpty>{error ?? "Reading the roles."}</WorkbenchEmpty>
      ) : (
        <WorkbenchPage title="Roles" meta={view.baba ? `in ${view.baba}` : undefined}>
          {(view.error || view.missing) && <WorkbenchNotice>{view.error || view.missing}</WorkbenchNotice>}
          {view.roles.map((role) => (
            <WorkbenchSection key={role.name} label={role.name}>
              <p className="text-muted-foreground">{role.description}</p>
            </WorkbenchSection>
          ))}
          {view.baba && !view.roles.length && <WorkbenchEmpty>No roles yet. Tell the agent what you want one for.</WorkbenchEmpty>}
        </WorkbenchPage>
      )}
    </Plain>
  )
}
