// The settings' page, shown in their tab: the appearance, where the tabs stand, the preferences every page follows by
// convention, each a row of its choices, and the mark's motion among it, then the
// shortcuts, each as it is with the control that changes it, every change a call of the surface. A theme is chosen from swatches, each painted in its own theme; Dynamic
// shows the picker, which paints the page as it is dragged and keeps the numbers once let go. With one theme for both
// modes there is one choice, else one for each. A shortcut is rebound by clicking its keys and pressing new ones; Escape
// gives up, and a clash or keys that cannot be a binding is said on its row. Where the tabs stand asks next what the side
// chosen needs: the end the mark is at for a rail at a side, where a drawer opens for one along the top or bottom. Beside
// the mark's switch, the mark as it is while the agent works. As the surface says them, the settings are told to the page
// whole, which applies them at once. Last, the closed tabs: how long the archive keeps them and how large it may grow,
// the person's in every project as the rest is; then, set apart and named by the project's path, the two clears that act on
// this project alone, each saying what it frees, and asking once more before it is taken.
import { useEffect, useState, type ReactNode } from "react"
import { MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react"
import type { Handle } from "../../../core/index.ts"
import { Button } from "../../../kit/components/button"
import { ToggleGroup, ToggleGroupItem } from "../../../kit/components/toggle-group"
import { ThemePicker } from "../../../kit/components/theme-picker"
import { PRESETS, varsOf, type Theme } from "../../../kit/theme.ts"
import { announce, paintTheme, useSystemDark } from "../../ui/appearance.ts"
import { Logo } from "../../ui/mark.tsx"
import { mac, RECORDING_MARK } from "../../ui/shortcuts.ts"
import { useConventions, useLive, useTab } from "../../ui/tab.tsx"
import { chordOf, COMMANDS, isCommand, shown, type CommandId } from "../src/keys.ts"
import {
  choiceIn,
  nameOf,
  numbersOf,
  PREFERENCE_NAMES,
  PREFERENCES,
  resolveMode,
  settingsFromView,
  type Choice,
  type Preference,
  type Rail,
  type SettingsView,
} from "../src/settings.ts"

export const icon = <SettingsIcon aria-hidden />

type Root = SettingsView & { [P in Preference]?: Handle } & {
  unsaved?: string
  mode?: Handle
  theme?: Handle
  dynamic?: Handle
  same?: Handle
  rail?: Handle
  animate?: Handle
}
type Row = { command: CommandId; does: string; keys: string; default?: string }
type Shortcuts = { commands: Row[]; bind?: Handle; reset?: Handle }
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

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "Hyper", "Super"])

export default function Settings() {
  const root = useLive<Root>("/").view
  const shortcuts = useLive<Shortcuts>("/shortcuts").view
  const archive = useLive<Archive>("/archive").view
  const { call } = useTab()
  const systemDark = useSystemDark()
  const { motion } = useConventions()
  const [refused, setRefused] = useState<{ at: string; reason: string }>()
  const run = async (at: string, handle: Handle | undefined, args: Record<string, string | number | boolean>, path = "/") => {
    if (!handle) return false

    const answer = await call(path, handle.name, { ...handle.args, ...args })

    setRefused(answer.outcome === "refused" ? { at, reason: answer.reason } : undefined)

    return answer.outcome !== "refused"
  }

  // What the surface says is what the page applies, the whole of it, as soon as it says it.
  useEffect(() => {
    if (root) announce(settingsFromView(root))
  }, [root])

  if (!root) return <p className="p-6 text-muted-foreground">Reading the settings…</p>

  const { appearance } = settingsFromView(root)
  const mode = resolveMode(appearance, systemDark)
  const placed = appearance.rail
  const place = (change: Partial<Rail>) => void run("rail", root.rail, { ...placed, ...change })
  const atSide = placed.side === "left" || placed.side === "right"
  const changed = shortcuts?.commands.some((r) => r.default !== undefined) ?? false

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-7 px-5 py-8 text-body">
        <header className="flex flex-col gap-0.5">
          <h1 className="text-large font-semibold">Settings</h1>
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
          <Line label="Both modes in one theme" note={appearance.same ? "one theme, light and dark" : "a theme for each mode"}>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={appearance.same ? "on" : "off"}
              aria-label="Both modes in one theme"
              onValueChange={(value) => value && void run("same", root.same, { on: value === "on" })}
            >
              <ToggleGroupItem value="on">Same</ToggleGroupItem>
              <ToggleGroupItem value="off">Distinct</ToggleGroupItem>
            </ToggleGroup>
          </Line>
          {(appearance.same ? (["both"] as const) : (["light", "dark"] as const)).map((m) => (
            <ThemeChoice
              key={m}
              label={m === "both" ? "Theme" : m === "light" ? "Light theme" : "Dark theme"}
              note={m === mode ? "shown now" : undefined}
              choice={choiceIn(appearance, m === "both" ? mode : m)}
              dark={m === "both" ? mode === "dark" : m === "dark"}
              shown={m === "both" || m === mode}
              choose={(theme) => void run(`theme ${m}`, root.theme, { mode: m, theme })}
              keep={(t) => void run(`theme ${m}`, root.dynamic, { mode: m, ...t })}
            />
          ))}
          <Line label="Tabs" note="the side of the page the rail of tabs stands at">
            <Choose label="Where the tabs stand" value={placed.side} options={SIDE_OPTIONS} set={(side) => place({ side })} />
          </Line>
          {atSide ? (
            <Line label="Tabs start from" note="the end the mark is at; the newest tab is next to it">
              <Choose label="Where the tabs start" value={placed.from} options={END_OPTIONS} set={(from) => place({ from })} />
            </Line>
          ) : (
            <Line label="Drawer opens" note="the side a tab's drawer comes in from">
              <Choose label="Where a drawer opens" value={placed.drawer} options={DRAWER_OPTIONS} set={(drawer) => place({ drawer })} />
            </Line>
          )}
          {PREFERENCE_NAMES.map((name) => {
            const { label, does, choices, default: usual } = PREFERENCES[name]

            return (
              <Line key={name} label={label} note={does}>
                <Choose
                  label={label}
                  value={String(root.preferences[name])}
                  options={choices.map((value) => ({ value: String(value), label: choiceLabel(value) }))}
                  set={(value) => void run(name, root[name], { [name]: typeof usual === "number" ? Number(value) : value })}
                />
              </Line>
            )
          })}
          <Line
            label="Animate while the agent works"
            note={motion === "reduced" ? "still while motion is reduced, tinted" : root.logo.animate ? "the mark looks about" : "the mark stays still, tinted"}
          >
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
          {refused && (["mode", "rail", ...PREFERENCE_NAMES].includes(refused.at) || refused.at.startsWith("theme")) && <p className="text-destructive">{refused.reason}</p>}
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

        {archive && <ClosedTabs archive={archive} run={run} refused={refused?.at.startsWith("archive") ? refused.reason : undefined} />}
      </div>
    </div>
  )
}

const DAYS = [7, 14, 30, 90, 365]
const MEGABYTES = [50, 100, 200, 500, 1000]
/** A number's choices, with the one set where it is not among them, as the agent may set any. */
const around = (options: number[], value: number, label: (n: number) => string) =>
  [...new Set([...options, value])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: label(n) }))

/** What a clear frees, as the button says it. */
const freeing = (f: Freeing) =>
  [`${f.tabs} closed tab${f.tabs === 1 ? "" : "s"}`, ...(f.sessions ? [`${f.sessions} ended session${f.sessions === 1 ? "" : "s"}`] : []), f.size].join(" · ")

/**
 * The archive of closed tabs: its window, the person's everywhere; and the clears of this project, set apart under its path,
 * each a button that says what it frees and asks once more. What it would free is measured as the section is shown.
 */
function ClosedTabs({
  archive,
  run,
  refused,
}: {
  archive: Archive
  run: (at: string, handle: Handle | undefined, args: Record<string, string | number | boolean>, path?: string) => Promise<boolean>
  refused?: string
}) {
  const { days, megabytes } = archive.window
  const keep = (change: Partial<Archive["window"]>) => void run("archive keep", archive.keep, { days, megabytes, ...change }, "/archive")
  const measure = archive.measure

  // What a clear would free is measured again each time the section is shown, quietly.
  useEffect(() => {
    if (measure) void run("archive measure", measure, {}, "/archive")
  }, [measure?.name])

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
            clear={archive.clearSession && (() => run("archive clear", archive.clearSession, {}, "/archive"))}
          />
          <Clear
            label="Every session of this project"
            note={archive.wholeProject?.running ?? "every session no agent runs in now, and the folders of those that ended"}
            freeing={archive.wholeProject}
            busy={archive.clearing === "project"}
            clear={archive.clearProject && (() => run("archive clear", archive.clearProject, {}, "/archive"))}
          />
        </div>
      )}
      {refused && <p className="text-destructive">{refused}</p>}
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

const SIDE_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
] as const
const END_OPTIONS = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
] as const
const DRAWER_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const

/** A preference's choice as its row says it: a word as it is, capitalised, a share as a percentage. */
const choiceLabel = (value: string | number): string => (typeof value === "number" ? `${Math.round(value * 100)}%` : value.charAt(0).toUpperCase() + value.slice(1))

/** One choice among a few, as a row of toggles: the one chosen pressed. */
function Choose<T extends string>({ label, value, options, set }: { label: string; value: T; options: readonly { value: T; label: string }[]; set: (value: T) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={value} aria-label={label} onValueChange={(to) => to && to !== value && set(to as T)}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * A mode's theme: a swatch for each preset and Dynamic, each painted in its own theme in that mode, and under Dynamic the
 * picker. While it is dragged the page is painted in it, where this choice is what is shown; it is kept once let go.
 */
function ThemeChoice({
  label,
  note,
  choice,
  dark,
  shown,
  choose,
  keep,
}: {
  label: string
  note?: string
  choice: Choice
  dark: boolean
  shown: boolean
  choose: (theme: string) => void
  keep: (theme: Theme) => void
}) {
  const name = nameOf(choice)
  const numbers = numbersOf(choice)
  const options = [...PRESETS.map((p) => ({ id: p.id as string, label: p.label, theme: p.theme as Theme })), { id: "dynamic", label: "Dynamic", theme: numbers }]

  return (
    <div className="flex flex-col gap-2 py-1">
      <span className="flex min-w-0 flex-col">
        <span className="text-foreground">{label}</span>
        {note && <span className="text-meta text-muted-foreground">{note}</span>}
      </span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === name}
            onClick={() => o.id !== name && choose(o.id)}
            data-theme={o.id}
            style={varsOf(o.theme)}
            className={`${dark ? "dark" : "light"} flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-primary aria-checked:ring-1 aria-checked:ring-primary`}
          >
            <span className="flex shrink-0 -space-x-1" aria-hidden>
              <span className="size-3 rounded-full border border-background bg-muted" />
              <span className="size-3 rounded-full border border-background bg-primary" />
            </span>
            <span className="truncate text-meta">{o.label}</span>
          </button>
        ))}
      </div>
      {name === "dynamic" && <ThemePicker value={numbers} onChange={(t) => shown && paintTheme(t)} onCommit={keep} className="pt-1" />}
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
