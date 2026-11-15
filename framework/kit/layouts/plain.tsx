// The plain layout: the content, which scrolls itself, for a util that is one page, a configuration, a list with what it
// opens inline. With scopes, a row to switch them heads the content, and the welcome page stands in for it until one is
// open. Nothing is kept in the browser: there is nothing to arrange.
import type { ReactNode } from "react"
import { ScopeBar, Welcome, type Scopes } from "./welcome.tsx"

export function Plain({ scopes, children }: { scopes?: Scopes; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col text-body">
      {scopes && <ScopeBar scopes={scopes} />}
      {scopes && scopes.current === undefined ? <Welcome scopes={scopes} /> : <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
    </div>
  )
}
