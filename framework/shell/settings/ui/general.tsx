// Session behavior, connection status, and Codex hook setup in the General page.
import { useEffect, useState } from "react"
import type { Handle } from "../../../core/index.ts"
import type { CodexHookReview } from "../../../core/harness/codex-hooks.ts"
import { Button } from "../../../kit/components/button"
import { ToggleGroup, ToggleGroupItem } from "../../../kit/components/toggle-group"
import { useLive, useTab } from "../../ui/tab.tsx"
import type { HarnessConnection } from "../../src/harness-connection.ts"
import type { Settings } from "../src/settings.ts"
import { Line, Section, useSettingAction } from "./parts.tsx"

export function General() {
  const { view: root } = useLive<Pick<Settings, "runtime"> & {
    sleepAtEnd?: Handle
    checkConnection?: Handle
    changeHarness?: Handle
    connection?: HarnessConnection | null
    changingHarness?: string
    harnessError?: string
  }>("/general")
  const { active } = useTab()
  const { run, refused } = useSettingAction("/general")

  if (!root) return null
  const codex = root.connection?.hooks.find((hook) => hook.name === "codex")

  return (
    <>
      {root.checkConnection && (
        <Connection
          connection={root.connection}
          busy={!!root.changingHarness}
          error={root.harnessError ?? (refused?.at === "changeHarness" ? refused.reason : undefined)}
          refresh={() => void run("checkConnection", root.checkConnection, {})}
          change={(harness, on) => void run("changeHarness", root.changeHarness, { harness, on })}
        />
      )}
      <Section title="Sessions">
        <Line
          label="Sleep when the session ends"
          note={root.runtime.sleepAtEnd ? "a minute after Baba hears the session end" : "Baba follows its inactivity timer"}
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
        {refused?.at === "sleepAtEnd" && <p role="alert" className="text-destructive">{refused.reason}</p>}
      </Section>
      {codex?.status === "configured" && <CodexHooks active={active} />}
    </>
  )
}

const INSTALLATION = { configured: "Configured", missing: "Needs provisioning", disabled: "Disabled", "no-events": "No events enabled", unreadable: "Could not read" }

function Connection({ connection, busy, error, refresh, change }: {
  connection?: HarnessConnection | null
  busy: boolean
  error?: string
  refresh: () => void
  change: (name: string, on: boolean) => void
}) {
  const pending = connection === null ? "Unavailable" : "Checking…"
  const startupNote = connection?.recovered ? "The first prompt recovered the shell."
    : connection && !connection.startupHeard ? "Check project trust and hook approval before starting a new session." : undefined

  return (
    <Section title="Harness connection" action={<Button size="xs" variant="ghost" onClick={refresh} disabled={busy}>Refresh</Button>}>
      {connection ? connection.hooks.map(({ name, title, status }) => (
        <Line key={name} label={title} note={INSTALLATION[status]}>
          <div className="flex shrink-0 gap-2">
            {(status === "missing" || status === "disabled") && (
              <Button size="xs" variant="outline" aria-label={`Add ${title}`} disabled={busy} onClick={() => change(name, true)}>Add</Button>
            )}
            {(status === "configured" || status === "missing" || status === "no-events") && (
              <Button size="xs" variant="outline" aria-label={`Remove ${title}`} disabled={busy} onClick={() => change(name, false)}>Remove</Button>
            )}
          </div>
        </Line>
      )) : <Line label="Project hooks"><span className="text-meta">{pending}</span></Line>}
      {connection && <p className="text-meta text-muted-foreground">Start a new harness session after changing its project hooks.</p>}
      {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
      <Line label="Startup hook" note={startupNote}>
        <span className="text-meta">{connection ? connection.startupHeard ? "Heard" : "Not heard" : pending}</span>
      </Line>
      <Line label="Agent command" note={connection && !connection.commandReached ? "Ask the agent to read the Baba root in this session, then refresh." : undefined}>
        <span className="text-meta">{connection ? connection.commandReached ? "Reached Baba" : "Not seen yet" : pending}</span>
      </Line>
    </Section>
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

  if (review === null) return null

  return (
    <div id="codex-hooks">
      <Section title="Codex hooks" action={<Button size="xs" variant="ghost" disabled={busy} onClick={() => { setError(null); void read() }}>Refresh</Button>}>
        {error && review?.status !== "approved" && <p role="alert" className="text-meta text-destructive">{error}</p>}
        <p role="status" className="text-meta">
          {review?.status === "approved" ? "Approved" : review?.status === "review" ? "Needs approval" : review?.reason ?? "Checking approval…"}
        </p>
        {review?.status === "review" && (
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
