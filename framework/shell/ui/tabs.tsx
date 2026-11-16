// A tab's panel, under the rail: the tab's content, or what stands in its place where its surface is broken, its page
// threw while it was drawn, or it has no page.
import { type ReactNode } from "react"
import { CircleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../../kit/components/alert"
import { Button } from "../../kit/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../kit/components/empty"
import { contentId, tabId } from "./rail.tsx"

export function TabContent({ address, hidden, children }: { address: string; hidden: boolean; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col" hidden={hidden} role="tabpanel" id={contentId(address)} aria-labelledby={tabId(address)}>
      {children}
    </section>
  )
}

/** A tab whose surface fails on what it keeps, in place of its page: why. */
export const TabBroken = ({ why }: { why: string }) => (
  <Alert variant="destructive" className="m-3 w-auto">
    <AlertTitle>This tab is broken</AlertTitle>
    <AlertDescription>{why}</AlertDescription>
  </Alert>
)

/** A tab whose page threw while it was drawn: what it threw, and drawing it again. */
export const TabFailed = ({ error, retry }: { error: string; retry: () => void }) => (
  <Alert variant="destructive" className="m-3 w-auto">
    <AlertTitle>The surface's page failed</AlertTitle>
    <AlertDescription>{error}</AlertDescription>
    <Button variant="outline" onClick={retry}>
      Try again
    </Button>
  </Alert>
)

/** A tab of a surface that has no page, and where to give it one. */
export const TabNoPage = ({ surface }: { surface: string }) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <CircleAlertIcon />
      </EmptyMedia>
      <EmptyTitle>{surface} has no page</EmptyTitle>
      <EmptyDescription>Give it one: the default export of its ui/index.tsx.</EmptyDescription>
    </EmptyHeader>
  </Empty>
)
