// The archive window and the project-specific controls for clearing closed tabs.
import { useEffect, useState } from "react"
import type { Handle } from "../../../core/index.ts"
import { Button } from "../../../kit/components/button"
import { useLive } from "../../ui/tab.tsx"
import { Choose, Line, Section, useSettingAction } from "./parts.tsx"

type Freeing = { tabs: number; sessions?: number; size: string; running?: string }
type Archive = {
  project: string
  window: { days: number; megabytes: number }
  keep?: Handle
  measure?: Handle
  session?: Freeing
  wholeProject?: Freeing
  clearing?: "session" | "project"
  clearSession?: Handle
  clearProject?: Handle
}

const DAYS = [7, 14, 30, 90, 365]
const MEGABYTES = [50, 100, 200, 500, 1000]
/** A number's choices, with the one set where it is not among them, as the agent may set any. */
const around = (options: number[], value: number, label: (n: number) => string) =>
  [...new Set([...options, value])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: label(n) }))

/** What a clear frees, as the button says it. */
const freeing = (f: Freeing) =>
  [`${f.tabs} closed tab${f.tabs === 1 ? "" : "s"}`, ...(f.sessions ? [`${f.sessions} ended session${f.sessions === 1 ? "" : "s"}`] : []), f.size].join(" · ")

export function Storage() {
  const { view: archive } = useLive<Archive>("/archive")
  const { run, refused } = useSettingAction("/archive")
  const measure = archive?.measure

  useEffect(() => {
    if (measure) void run("measure", measure, {})
  }, [measure?.name])

  if (!archive) return null

  const { days, megabytes } = archive.window
  const keep = (change: Partial<Archive["window"]>) => void run("keep", archive.keep, { days, megabytes, ...change })

  return (
    <Section title="Closed tabs">
      <p className="text-meta text-muted-foreground">
        A closed tab is kept read only, its state and its log, for the agent to read. How long, and how much, is yours in every project.
      </p>
      <Line label="Keep for" note="a closed tab, or a session that ended, goes this long after">
        <Choose label="Keep closed tabs for" value={String(days)} options={around(DAYS, days, (n) => `${n} d`)} set={(v) => keep({ days: Number(v) })} />
      </Line>
      <Line label="At most" note="past this, a project's oldest go first">
        <Choose
          label="Largest archive"
          value={String(megabytes)}
          options={around(MEGABYTES, megabytes, (n) => (n >= 1000 ? `${n / 1000} GB` : `${n} MB`))}
          set={(v) => keep({ megabytes: Number(v) })}
        />
      </Line>
      {archive.measure && (
        <div className="mt-2 flex flex-col gap-1 rounded-md border px-3 py-2" aria-label="Clear in this project">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">Clear in this project only</span>
            <span className="truncate font-mono text-meta text-muted-foreground" title={archive.project}>
              {archive.project}
            </span>
          </span>
          <Clear
            label="This session"
            note="the tabs closed in this session"
            freeing={archive.session}
            busy={archive.clearing === "session"}
            clear={archive.clearSession && (() => run("archive clear", archive.clearSession, {}))}
          />
          <Clear
            label="Every session of this project"
            note={archive.wholeProject?.running ?? "every session no agent runs in now, and the folders of those that ended"}
            freeing={archive.wholeProject}
            busy={archive.clearing === "project"}
            clear={archive.clearProject && (() => run("archive clear", archive.clearProject, {}))}
          />
        </div>
      )}
      {refused && <p className="text-destructive">{refused.reason}</p>}
    </Section>
  )
}

/** One clear: what it frees on its button, which asks once more before it is taken; nothing to free, nothing offered. */
function Clear({ label, note, freeing: what, busy, clear }: { label: string; note: string; freeing?: Freeing; busy: boolean; clear?: () => Promise<boolean> }) {
  const [asking, setAsking] = useState(false)
  const empty = !what || (!what.tabs && !what.sessions)

  return (
    <Line label={label} note={note}>
      {busy ? (
        <span className="text-muted-foreground">Clearing…</span>
      ) : empty ? (
        <span className="text-muted-foreground">{what ? "Nothing to clear" : "Measuring…"}</span>
      ) : asking ? (
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="xs" onClick={() => void clear?.().finally(() => setAsking(false))}>
            Clear {what.size} for good
          </Button>
        </span>
      ) : (
        <Button variant="outline" size="xs" disabled={!clear} onClick={() => setAsking(true)}>
          Clear {freeing(what)}
        </Button>
      )}
    </Line>
  )
}
