// The settings' page, shown in their tab: the appearance, the shortcuts and the mark, each as it is with the control that
// changes it, every change a call of the surface. A shortcut is rebound by clicking its keys and pressing new ones; Escape
// gives up, and a clash or keys that cannot be a binding is said on its row. Beside the mark's switch, the mark as it is
// while the agent works. As the surface says them, the settings are told to the page, which applies them at once.
import { useEffect, useState, type ReactNode } from "react"
import { MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react"
import type { Handle } from "../../../core/index.ts"
import { Button } from "../../../kit/components/button"
import { ToggleGroup, ToggleGroupItem } from "../../../kit/components/toggle-group"
import { announce, useSystemDark } from "../../ui/appearance.ts"
import { Logo } from "../../ui/mark.tsx"
import { mac, RECORDING_MARK } from "../../ui/shortcuts.ts"
import { useLive, useTab } from "../../ui/tab.tsx"
import { chordOf, COMMANDS, isCommand, shown, type CommandId } from "../src/keys.ts"
import { resolveMode, settingsOf, THEMES, type Mode } from "../src/settings.ts"

export const icon = <SettingsIcon aria-hidden />

type Root = {
  appearance: { mode: Mode | "system"; light: string; dark: string }
  shortcuts: Record<CommandId, string>
  logo: { animate: boolean }
  unsaved?: string
  mode?: Handle
  theme?: Handle
  animate?: Handle
}
type Row = { command: CommandId; does: string; keys: string; default?: string }
type Shortcuts = { commands: Row[]; bind?: Handle; reset?: Handle }

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "Hyper", "Super"])

export default function Settings() {
  const root = useLive<Root>("/").view
  const shortcuts = useLive<Shortcuts>("/shortcuts").view
  const { call } = useTab()
  const systemDark = useSystemDark()
  const [refused, setRefused] = useState<{ at: string; reason: string }>()
  const run = async (at: string, handle: Handle | undefined, args: Record<string, string | boolean>, path = "/") => {
    if (!handle) return false

    const answer = await call(path, handle.name, { ...handle.args, ...args })

    setRefused(answer.outcome === "refused" ? { at, reason: answer.reason } : undefined)

    return answer.outcome !== "refused"
  }

  // What the surface says is what the page applies, as soon as it says it.
  useEffect(() => {
    if (!root || !shortcuts) return

    const keys = Object.fromEntries(shortcuts.commands.filter((r) => r.default !== undefined).map((r) => [r.command, r.keys]))

    announce(
      settingsOf({ appearance: { mode: root.appearance.mode, themes: { light: root.appearance.light, dark: root.appearance.dark } }, keys, logo: root.logo })
    )
  }, [root, shortcuts])

  if (!root) return <p className="p-6 text-muted-foreground">Reading the settings…</p>

  const mode = resolveMode({ mode: root.appearance.mode, themes: { light: root.appearance.light, dark: root.appearance.dark } }, systemDark)
  const changed = shortcuts?.commands.some((r) => r.default !== undefined) ?? false

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-7 px-5 py-8 text-body">
        <header className="flex flex-col gap-0.5">
          <h1 className="text-sm font-semibold">Settings</h1>
          <p className="text-muted-foreground">Yours, the same in every session and project. The agent can change them too.</p>
          {root.unsaved && <p className="text-destructive">{root.unsaved}</p>}
        </header>

        <Section title="Appearance">
          <Line label="Mode">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={root.appearance.mode}
              aria-label="Colour mode"
              onValueChange={(value) => value && void run("mode", root.mode, { mode: value })}
            >
              <ToggleGroupItem value="light">
                <SunIcon data-icon="inline-start" />
                Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <MoonIcon data-icon="inline-start" />
                Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system">
                <MonitorIcon data-icon="inline-start" />
                System
              </ToggleGroupItem>
            </ToggleGroup>
          </Line>
          {(["light", "dark"] as const).map((m) => (
            <Line key={m} label={`${m === "light" ? "Light" : "Dark"} theme`} note={m === mode ? "shown now" : undefined}>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={root.appearance[m]}
                aria-label={`${m} theme`}
                onValueChange={(value) => value && void run(`theme ${m}`, root.theme, { mode: m, theme: value })}
              >
                {THEMES[m].map((t) => (
                  <ToggleGroupItem key={t.id} value={t.id}>
                    {t.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Line>
          ))}
          {refused && (refused.at === "mode" || refused.at.startsWith("theme")) && <p className="text-destructive">{refused.reason}</p>}
        </Section>

        <Section
          title="Shortcuts"
          action={
            changed && (
              <Button variant="ghost" size="xs" onClick={() => void run("all", shortcuts?.reset, { command: "all" }, "/shortcuts")}>
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
              bind={(keys) => run(row.command, shortcuts?.bind, { command: row.command, keys }, "/shortcuts")}
              reset={() => void run(row.command, shortcuts?.reset, { command: row.command }, "/shortcuts")}
              cancel={() => setRefused(undefined)}
            />
          ))}
          <p className="text-meta text-muted-foreground">Click a shortcut, then press the keys; Escape gives up. They work anywhere but while you write in a field.</p>
        </Section>

        <Section title="Logo">
          <Line label="Animate while the agent works" note={root.logo.animate ? "the mark looks about" : "the mark stays still, tinted"}>
            <span className="flex items-center gap-3">
              <span className="grid size-7 place-items-center rounded-full bg-foreground/3 text-muted-foreground" aria-label="The mark while the agent works" role="img">
                <Logo standing={{ state: "working", waiting: 0, said: "" }} animate={root.logo.animate} />
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={root.logo.animate ? "on" : "off"}
                aria-label="Animate the mark"
                onValueChange={(value) => value && void run("animate", root.animate, { on: value === "on" })}
              >
                <ToggleGroupItem value="on">On</ToggleGroupItem>
                <ToggleGroupItem value="off">Off</ToggleGroupItem>
              </ToggleGroup>
            </span>
          </Line>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <div className="flex h-row items-center justify-between border-b pb-1">
        <h2 className="text-large font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Line({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 py-1">
      <span className="flex min-w-0 flex-col">
        <span className="text-foreground">{label}</span>
        {note && <span className="text-meta text-muted-foreground">{note}</span>}
      </span>
      {children}
    </div>
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
