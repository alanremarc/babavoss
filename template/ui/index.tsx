// The surface's page, shown in its tab: what the surface says, live, and the same actions the agent is offered. The
// shell gives the tab a drawer with its menu, every action with a form of its declared inputs, its places and its log,
// so the page is its content alone; `icon` and `drawers`, where exported, are the tab's icon and a page's own form for
// an action. It is drawn with the kit and the theme's tokens, so it follows the person's theme, mode, text size and
// motion unasked; a page that moves by script or has a sidebar reads `useConventions()` for the rest.
import { useState } from "react"
import type { Handle } from "babavoss/core/index.ts"
import { Button } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"

type Root = { greeting: string; proposed?: string; accept?: Handle; decline?: Handle }

export default function Greeting() {
  const { view, error } = useLive<Root>("/")
  const { call } = useTab()
  const [refused, setRefused] = useState("")
  const decide = async (handle: Handle) => {
    const answer = await call("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 overflow-auto p-6">
      <h1 className="text-3xl font-medium">{view?.greeting}</h1>
      {view?.proposed !== undefined ? (
        <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Proposed greeting">
          <p className="text-muted-foreground">Proposed</p>
          <p className="text-xl">{view.proposed}</p>
          <div className="flex gap-2">
            {view.accept && <Button onClick={() => void decide(view.accept!)}>Accept</Button>}
            {view.decline && (
              <Button variant="outline" onClick={() => void decide(view.decline!)}>
                Decline
              </Button>
            )}
          </div>
        </section>
      ) : (
        <p className="text-muted-foreground">A greeting proposed shows here, to accept or decline, here or in the conversation.</p>
      )}
      {(refused || error) && (
        <p role="alert" className="text-destructive">
          {refused || error}
        </p>
      )}
    </div>
  )
}
