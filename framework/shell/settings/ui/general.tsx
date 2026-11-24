// Session behavior and Codex hook setup in the General page.
import { useEffect, useState } from "react"
import type { Handle } from "../../../core/index.ts"
import type { CodexHookReview } from "../../../core/harness/codex-hooks.ts"
import { Button } from "../../../kit/components/button"
import { ToggleGroup, ToggleGroupItem } from "../../../kit/components/toggle-group"
import { useLive, useTab } from "../../ui/tab.tsx"
import type { Settings } from "../src/settings.ts"
import { Line, Section, useSettingAction } from "./parts.tsx"

export function General() {
  const { view: root } = useLive<Pick<Settings, "runtime"> & { sleepAtEnd?: Handle }>("/general")
  const { active } = useTab()
  const { run, refused } = useSettingAction("/general")

  if (!root) return null

  return (
    <>
      <Section title="Sessions">
        <Line
          label="Sleep when the session ends"
          note={root.runtime.sleepAtEnd ? "a minute after it ends" : "only once idle or its page is hidden, for a harness that ends sessions it resumes"}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={root.runtime.sleepAtEnd ? "on" : "off"}
            aria-label="Sleep when the session ends"
            onValueChange={(value) => value && void run("sleepAtEnd", root.sleepAtEnd, { on: value === "on" })}
          >
            <ToggleGroupItem value="on">On</ToggleGroupItem>
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
          </ToggleGroup>
        </Line>
        {refused && <p role="alert" className="text-destructive">{refused.reason}</p>}
      </Section>
      <CodexHooks active={active} />
    </>
  )
}

/** A review of Codex's current commands, approved only by a direct gesture on this page. */
function CodexHooks({ active }: { active: boolean }) {
  const [review, setReview] = useState<CodexHookReview | null>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => new URLSearchParams(location.search).get("codexHookError"))
  const read = async (signal?: AbortSignal) => {
    setBusy(true)
    try {
      const result = await fetch("/_/codex-hooks", { signal })

      if (!signal?.aborted) setReview(result.status === 404 ? null : await result.json())
    } catch {
      if (!signal?.aborted) setReview({ status: "unavailable", reason: "Could not read Codex hook status. Run /hooks in an interactive Codex session." })
    } finally {
      if (!signal?.aborted) setBusy(false)
    }
  }

  useEffect(() => {
    if (!active) return

    const controller = new AbortController()

    void read(controller.signal)

    return () => controller.abort()
  }, [active])

  if (!review) return null

  return (
    <div id="codex-hooks">
      <Section title="Codex hooks" action={<Button size="xs" variant="ghost" disabled={busy} onClick={() => { setError(null); void read() }}>Refresh</Button>}>
        {error && review.status !== "approved" && <p role="alert" className="text-meta text-destructive">{error}</p>}
        <p role="status" className="text-meta">
          {review.status === "approved" ? "Approved" : review.status === "review" ? "Needs approval" : review.reason}
        </p>
        {review.status === "review" && (
          <>
            <ul className="space-y-1 text-meta text-muted-foreground">
              {review.hooks.map(({ eventName, sourcePath }, index) => <li key={index}>{eventName} · <span className="break-all">{sourcePath}</span></li>)}
            </ul>
            <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-meta">{review.hooks[0]?.command}</pre>
            {review.review && window.top === window.self ? (
              <form method="post" action={`/_/codex-hooks?review=${review.review}`} onSubmit={(event) => {
                if (!event.nativeEvent.isTrusted) event.preventDefault()
              }}>
                <Button type="submit" size="sm" disabled={busy}>Approve Baba hooks</Button>
              </form>
            ) : <p className="text-meta text-muted-foreground">Run <code>/hooks</code> in an interactive Codex session to approve these hooks.</p>}
          </>
        )}
      </Section>
    </div>
  )
}
