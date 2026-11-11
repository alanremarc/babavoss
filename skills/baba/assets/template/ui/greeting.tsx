// The util's page: it shows what the surface says and offers the person their decision. Anything else the person wants
// changed, they tell the agent; there is no form here.
import { useState } from "react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, Plain, useLive, useTab } from "babavoss/shell/ui/index.ts"

type Root = { greeting: string; proposed?: string; accept?: Handle; decline?: Handle }

export function Greeting() {
  const { view, error } = useLive<Root>("/")
  const { call } = useTab()
  const [refused, setRefused] = useState("")
  const decide = async (handle: Handle) => {
    const answer = await call("/", handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }

  return (
    <Plain label="Greeting">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 overflow-auto p-6">
        <h1 className="text-3xl font-medium">{view?.greeting}</h1>
        {view?.proposed !== undefined ? (
          <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Proposed greeting">
            <p className="text-muted-foreground">The agent proposes</p>
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
          <p className="text-muted-foreground">Ask the agent for another greeting. What it proposes shows here, for you to accept or decline.</p>
        )}
        {(refused || error) && (
          <p role="alert" className="text-destructive">
            {refused || error}
          </p>
        )}
      </div>
    </Plain>
  )
}
