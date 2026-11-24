// The rows, groups and action feedback shared by the Settings pages.
import { useState, type ReactNode } from "react"
import type { Args, Handle } from "../../../core/index.ts"
import { ToggleGroup, ToggleGroupItem } from "../../../kit/components/toggle-group"
import { useTab } from "../../ui/tab.tsx"

export function useSettingAction(path: string) {
  const { call } = useTab()
  const [refused, setRefused] = useState<{ at: string; reason: string }>()

  const run = async (at: string, handle: Handle | undefined, args: Args) => {
    if (!handle) return false

    const answer = await call(path, handle.name, { ...handle.args, ...args })

    setRefused(answer.outcome === "refused" ? { at, reason: answer.reason } : undefined)

    return answer.outcome === "written"
  }

  return { run, refused, cancel: () => setRefused(undefined) }
}

/** One choice among a few, as a row of toggles: the one chosen pressed. */
export function Choose<T extends string>({ label, value, options, set }: { label: string; value: T; options: readonly { value: T; label: string }[]; set: (value: T) => void }) {
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
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <div className="flex h-row items-center justify-between border-b pb-1">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Line({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
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
