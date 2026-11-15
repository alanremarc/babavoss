// The foundations' specimens: the theming tokens as the kit defines them. Colour is every preset in both modes side by
// side, each cell given its theme, so the stylesheet derives the tokens in it as it does for the page; type,
// radius and the frame's sizes are drawn by their classes and measured as they render.
import { useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { derive, PRESETS, varsOf } from "babavoss/kit/index.ts"
import type { EntryOf } from "../src/catalogue.ts"
import { State, States } from "./frame.tsx"

/** The colour tokens, in the families defaults.css gives them: each a fill, with the text drawn on it where it has one. */
const COLOURS: { family: string; tokens: [string, string?][] }[] = [
  { family: "Ground", tokens: [["background", "foreground"], ["card", "card-foreground"], ["popover", "popover-foreground"], ["sidebar", "foreground"]] },
  { family: "Quiet", tokens: [["muted", "muted-foreground"], ["secondary", "secondary-foreground"], ["accent", "accent-foreground"]] },
  { family: "Live", tokens: [["primary", "primary-foreground"], ["ring"]] },
  { family: "States", tokens: [["destructive"], ["success"], ["warning"], ["info"]] },
  { family: "Lines", tokens: [["border"], ["input"]] },
  { family: "Series", tokens: [["chart-1"], ["chart-2"], ["chart-3"], ["chart-4"], ["chart-5"], ["thread-user"], ["thread-context"]] },
]
/** The presets, each in both modes: a column each, which takes its theme by data-theme and its numbers, so the kit's tokens derive in it. */
const COLUMNS = PRESETS.map((p) => ({ id: p.id, label: p.label, theme: p.theme }))

const told = ({ l, c, h, alpha }: { l: number; c: number; h: number; alpha: number }) =>
  `oklch(${+l.toFixed(3)} ${+c.toFixed(4)} ${+h.toFixed(1)}${alpha < 1 ? ` / ${alpha * 100}%` : ""})`

function Colour() {
  const root = document.documentElement
  const current = `${root.dataset.theme ?? "neutral"} ${root.classList.contains("dark") ? "dark" : "light"}`

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-max grid-cols-[7rem_repeat(7,minmax(6.5rem,1fr))] text-meta">
        <div />
        {COLUMNS.map((c) => (
          <div key={c.id} className="flex flex-col border-l px-2 py-1.5">
            <span className="font-medium">{c.label}</span>
            <span className="flex gap-1.5 font-mono text-badge text-muted-foreground">
              {(["light", "dark"] as const).map((mode) => (
                <span key={mode} className="flex flex-1 items-center gap-1">
                  {mode}
                  {`${c.id} ${mode}` === current && <span className="size-1.5 rounded-full bg-primary" title="In use on this page" />}
                </span>
              ))}
            </span>
          </div>
        ))}
        {COLOURS.map(({ family, tokens }) => tokens.map(([fill, ink], i) => <Row key={fill} first={i === 0} family={family} fill={fill} ink={ink} />))}
      </div>
    </div>
  )
}

/** One token across the presets: its name, then a swatch in each mode of each, its text drawn on it where it has one. */
function Row({ first, family, fill, ink }: { first: boolean; family: string; fill: string; ink?: string }) {
  return (
    <>
      <div className={`flex flex-col justify-center px-2 ${first ? "border-t" : ""}`}>
        {first && <span className="text-badge tracking-wide text-muted-foreground/70 uppercase">{family}</span>}
        <span className="font-mono">{fill}</span>
      </div>
      {COLUMNS.map((c) => (
        <div key={c.id} className={`flex border-l ${first ? "border-t" : ""}`}>
          {(["light", "dark"] as const).map((mode) => {
            const made = derive(c.theme, mode) as Record<string, Parameters<typeof told>[0]>

            return (
              // The preset in this mode, set on the cell, so var() and the kit's classes inside resolve to it.
              <div key={mode} data-theme={c.id} className={`${mode} flex-1 bg-background p-1`} style={varsOf(c.theme) as CSSProperties}>
                <div
                  className="flex h-7 items-center justify-center rounded-md ring-1 ring-border ring-inset"
                  style={{ background: `var(--${fill})`, color: ink ? `var(--${ink})` : undefined }}
                  title={`--${fill}: ${made[fill] ? told(made[fill]) : ""}${ink && made[ink] ? `\n--${ink}: ${told(made[ink])}` : ""}`}
                >
                  {ink && <span className="font-medium">Aa</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

/** What a class gives an element as it renders, read from its computed style. */
function Measured({ read, children }: { read: (style: CSSStyleDeclaration) => string; children: (ref: (el: HTMLElement | null) => void, said: string) => ReactNode }) {
  const el = useRef<HTMLElement | null>(null)
  const [said, setSaid] = useState("")

  useLayoutEffect(() => {
    if (el.current) setSaid(read(getComputedStyle(el.current)))
  })

  return children((node) => void (el.current = node), said)
}

const TYPE = ["text-badge", "text-meta", "text-body", "text-large", "text-sm", "text-base", "text-lg", "text-xl"]
const FONTS = [
  { className: "font-sans", label: "sans" },
  { className: "font-heading", label: "heading" },
  { className: "font-mono", label: "mono" },
]

function Type() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y rounded-lg border">
        {TYPE.map((t) => (
          <Measured key={t} read={(s) => `${s.fontSize} / ${s.lineHeight}`}>
            {(ref, said) => (
              <div className="flex items-baseline gap-4 px-3 py-2">
                <span className="w-20 shrink-0 font-mono text-meta text-muted-foreground">{t.slice(5)}</span>
                <span ref={ref} className={`min-w-0 flex-1 truncate ${t}`}>
                  Whose move it is
                </span>
                <span className="shrink-0 font-mono text-meta text-muted-foreground tabular-nums">{said}</span>
              </div>
            )}
          </Measured>
        ))}
      </div>
      <States min={200}>
        {FONTS.map((f) => (
          <State key={f.label} label={f.label}>
            <div className={`flex flex-col gap-0.5 ${f.className}`}>
              <span className="text-large">Ag 0123 → baba</span>
              <span className="flex gap-3 text-body">
                <span className="font-normal">Regular</span>
                <span className="font-medium">Medium</span>
                <span className="font-semibold">Semibold</span>
              </span>
            </div>
          </State>
        ))}
      </States>
    </div>
  )
}

const RADII = ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-4xl"]

function Radius() {
  return (
    <States min={96}>
      {RADII.map((r) => (
        <Measured key={r} read={(s) => s.borderTopLeftRadius}>
          {(ref, said) => (
            <State label={`${r.slice(8)} · ${said}`} bare>
              <div ref={ref} className={`h-16 border-2 border-foreground/30 bg-muted ${r}`} />
            </State>
          )}
        </Measured>
      ))}
    </States>
  )
}

const HEIGHTS = [
  { className: "h-menubar", label: "menubar", use: "a compact header" },
  { className: "h-bar", label: "bar", use: "a bar, a toolbar" },
  { className: "h-row", label: "row", use: "a row, an icon button" },
]
const ICONS = [
  { className: "size-rail-icon", label: "rail-icon" },
  { className: "size-icon", label: "icon" },
  { className: "size-glyph", label: "glyph" },
]

function Frame() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {HEIGHTS.map((h) => (
          <Measured key={h.label} read={(s) => s.height}>
            {(ref, said) => (
              <div className="flex items-center gap-3">
                <div ref={ref} className={`flex w-72 shrink-0 items-center rounded-md bg-muted px-2 ${h.className}`}>
                  <span className="font-mono text-meta">{h.label}</span>
                  <span className="ml-auto font-mono text-meta text-muted-foreground tabular-nums">{said}</span>
                </div>
                <span className="text-meta text-muted-foreground">{h.use}</span>
              </div>
            )}
          </Measured>
        ))}
      </div>
      <States min={120}>
        {ICONS.map((i) => (
          <Measured key={i.label} read={(s) => s.width}>
            {(ref, said) => (
              <State label={`${i.label} · ${said}`}>
                <span ref={ref} className={`grid place-items-center rounded-sm bg-primary/15 ${i.className}`}>
                  <span className="size-full rounded-sm border border-primary/50" />
                </span>
              </State>
            )}
          </Measured>
        ))}
      </States>
    </div>
  )
}

export const foundations: Record<EntryOf<"foundations">, ComponentType> = { colour: Colour, type: Type, radius: Radius, frame: Frame }
