// The theme picker: a theme's three numbers, each on a track to drag, the hue around its colours, tint from grey toward
// it and vividness from a grey accent to a full one. `onChange` is told every move, for the page to paint the theme as it
// is dragged; `onCommit` once it is let go, or for each key, to keep it. Each track is a native range: keys move it, and it
// is labelled with its name and value.
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "../cn.ts"
import { bounded, TINT_CHROMA, VIVID_CHROMA, type Theme } from "../theme.ts"

type Props = {
  value: Theme
  onChange?: (theme: Theme) => void
  onCommit?: (theme: Theme) => void
  disabled?: boolean
  className?: string
}

const HUE_STOPS = Array.from({ length: 13 }, (_, i) => `oklch(0.7 0.14 ${i * 30})`).join(", ")

function ThemePicker({ value, onChange, onCommit, disabled, className }: Props) {
  const [draft, setDraft] = useState<Theme>()
  const shown = draft ?? value
  const move = (part: keyof Theme, n: number) => {
    const next = bounded({ ...shown, [part]: n })

    setDraft(next)
    onChange?.(next)
  }
  const commit = (part: keyof Theme, n: number) => {
    const next = bounded({ ...shown, [part]: n })

    setDraft(undefined)
    onCommit?.(next)
  }
  const { hue } = shown

  return (
    <div data-slot="theme-picker" className={cn("flex flex-col gap-2", className)}>
      <Track
        label="Hue"
        max={360}
        value={shown.hue}
        shown={`${Math.round(shown.hue)}°`}
        disabled={disabled}
        background={`linear-gradient(to right, ${HUE_STOPS})`}
        onMove={(n) => move("hue", n)}
        onCommit={(n) => commit("hue", n)}
      />
      <Track
        label="Tint"
        max={100}
        value={shown.tint}
        shown={`${Math.round(shown.tint)}`}
        disabled={disabled}
        background={`linear-gradient(to right, oklch(0.9 0 ${hue}), oklch(0.9 ${TINT_CHROMA * 2} ${hue}))`}
        onMove={(n) => move("tint", n)}
        onCommit={(n) => commit("tint", n)}
      />
      <Track
        label="Vividness"
        max={100}
        value={shown.vivid}
        shown={`${Math.round(shown.vivid)}`}
        disabled={disabled}
        background={`linear-gradient(to right, oklch(0.55 0 ${hue}), oklch(0.55 ${VIVID_CHROMA} ${hue}))`}
        onMove={(n) => move("vivid", n)}
        onCommit={(n) => commit("vivid", n)}
      />
    </div>
  )
}

/** One number on a track: told as it moves, and committed by the native change, which a range fires on release and per key. */
function Track({
  label,
  max,
  value,
  shown,
  disabled,
  background,
  onMove,
  onCommit,
}: {
  label: string
  max: number
  value: number
  shown: string
  disabled?: boolean
  background: string
  onMove: (n: number) => void
  onCommit: (n: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)

  commit.current = onCommit
  useEffect(() => {
    const at = input.current

    if (!at) return

    const changed = () => commit.current(Number(at.value))

    at.addEventListener("change", changed)

    return () => at.removeEventListener("change", changed)
  }, [])

  return (
    <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-meta">
      <span className="text-muted-foreground">{label}</span>
      <input
        ref={input}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={shown}
        style={{ "--track": background } as CSSProperties}
        className={cn(
          "h-3 w-full cursor-pointer appearance-none rounded-full bg-(image:--track) ring-1 ring-foreground/10 ring-inset outline-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow",
          "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-foreground"
        )}
        onChange={(event) => onMove(Number(event.currentTarget.value))}
      />
      <span className="text-right tabular-nums text-muted-foreground">{shown}</span>
    </label>
  )
}

export { ThemePicker }
