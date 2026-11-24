// The keyboard shortcuts page and its key recorder.
import { useState } from "react"
import type { Handle } from "../../../core/index.ts"
import { Button } from "../../../kit/components/button"
import { mac, RECORDING_MARK } from "../../ui/shortcuts.ts"
import { useLive } from "../../ui/tab.tsx"
import { chordOf, COMMANDS, isCommand, shown, type CommandId } from "../src/keys.ts"
import { Section, useSettingAction } from "./parts.tsx"

type Row = { command: CommandId; does: string; keys: string; default?: string }
type Shortcuts = { commands: Row[]; bind?: Handle; reset?: Handle }
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "Hyper", "Super"])

export function KeyboardShortcuts() {
  const { view: shortcuts } = useLive<Shortcuts>("/shortcuts")
  const { run, refused, cancel } = useSettingAction("/shortcuts")
  const changed = shortcuts?.commands.some((row) => row.default !== undefined)

  return (
    <Section
      title="Key bindings"
      action={
        changed && (
          <Button variant="ghost" size="xs" onClick={() => void run("all", shortcuts?.reset, { command: "all" })}>
            Reset all
          </Button>
        )
      }
    >
      {(shortcuts?.commands ?? []).map((row) => (
        <Binding
          key={row.command}
          row={row}
          refused={refused?.at === row.command ? refused.reason : undefined}
          bind={(keys) => run(row.command, shortcuts?.bind, { command: row.command, keys })}
          reset={() => void run(row.command, shortcuts?.reset, { command: row.command })}
          cancel={cancel}
        />
      ))}
      <p className="text-meta text-muted-foreground">Click a shortcut, then press the keys; Escape gives up. They work anywhere but while you write in a field.</p>
      {refused?.at === "all" && <p role="alert" className="text-destructive">{refused.reason}</p>}
    </Section>
  )
}

/** One shortcut: what it does and its keys, which a click records anew; reset where the person changed it. */
function Binding({
  row,
  refused,
  bind,
  reset,
  cancel,
}: {
  row: Row
  refused?: string
  bind: (keys: string) => Promise<boolean>
  reset: () => void
  cancel: () => void
}) {
  const [recording, setRecording] = useState(false)
  const label = isCommand(row.command) ? row.command.charAt(0).toUpperCase() + row.command.slice(1) : row.command

  return (
    <div className="flex flex-col py-1">
      <div className="flex min-h-8 items-center justify-between gap-4">
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground">{label}</span>
          <span className="truncate text-meta text-muted-foreground">{COMMANDS[row.command]?.does ?? row.does}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {row.default !== undefined && (
            <Button variant="ghost" size="xs" title={`Back to ${shown(row.default, mac)}`} onClick={reset}>
              Reset
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            {...{ [RECORDING_MARK]: recording ? "" : undefined }}
            aria-label={recording ? `Press the keys for ${label}; Escape gives up` : `${label}: ${shown(row.keys, mac)}; click to change`}
            className="min-w-20 font-mono tabular-nums data-[recording]:border-primary data-[recording]:text-primary"
            data-recording={recording || undefined}
            onClick={() => setRecording(true)}
            onBlur={() => setRecording(false)}
            onKeyDown={(event) => {
              if (!recording) return
              event.preventDefault()
              event.stopPropagation()
              if (event.key === "Escape") {
                setRecording(false)
                cancel()

                return
              }
              if (MODIFIER_KEYS.has(event.key)) return

              const chord = chordOf(event, mac)

              if (chord) void bind(chord).then((ok) => ok && setRecording(false))
            }}
          >
            {recording ? "Press keys…" : shown(row.keys, mac)}
          </Button>
        </span>
      </div>
      {refused && (
        <p role="alert" className="text-meta text-destructive">
          {refused}
        </p>
      )}
    </div>
  )
}
