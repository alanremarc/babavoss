// The reference books surface's page: the books by status, each with its status to set.
import type { Handle } from "babavoss/core/index.ts"
import { Button } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"

type Row = { at: string; id: number; title: string; status: string }
type Root = Record<"to-read" | "reading" | "read", Row[]> & { add?: Handle }

const STATUSES = ["to-read", "reading", "read"] as const

export default function Books() {
  const { view } = useLive<Root>("/")
  const { call } = useTab()

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 overflow-auto p-6">
      {STATUSES.map((s) => (
        <section key={s} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{s}</h2>
          {view?.[s].map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-md border p-2">
              <span className="flex-1">{b.title}</span>
              {STATUSES.filter((x) => x !== s).map((x) => (
                <Button key={x} size="sm" variant="outline" onClick={() => void call(b.at, "mark", { id: b.id, status: x })}>
                  {x}
                </Button>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
