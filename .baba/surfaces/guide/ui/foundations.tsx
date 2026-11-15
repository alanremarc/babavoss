// The foundations' specimens: the theming tokens as the kit defines them. Colour is read from the page's own stylesheet,
// every palette in both modes side by side, each column given its palette's values so the kit's classes draw in it; type,
// radius and the frame's sizes are drawn by their classes and measured as they render.
import { useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
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
/** The palettes in both modes: the rules of the stylesheet each takes, in order, later over earlier. */
const COLUMNS: { theme: string; dark: boolean; rules: string[] }[] = [
  { theme: "neutral", dark: false, rules: [":root"] },
  { theme: "neutral", dark: true, rules: [":root", ".dark"] },
  { theme: "claude", dark: false, rules: [":root", ':root[data-theme="claude"]', ':root[data-theme="claude"]:not(.dark)'] },
  { theme: "claude", dark: true, rules: [":root", ".dark", ':root[data-theme="claude"]', ':root.dark[data-theme="claude"]'] },
]

/** A selector as written, whatever quoting and spacing the stylesheet was compiled with. */
const plain = (selector: string) => selector.replace(/["'\s]/g, "")

/** Every custom property the page's stylesheets set under each selector, rules nested in layers and media included. */
function declared(): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const set = out.get(plain(rule.selectorText)) ?? {}

        for (const name of rule.style) if (name.startsWith("--")) set[name] = rule.style.getPropertyValue(name).trim()
        out.set(plain(rule.selectorText), set)
      }
      if ("cssRules" in rule && rule.cssRules) walk(rule.cssRules as CSSRuleList)
    }
  }

  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules)
    } catch {
      // A sheet from elsewhere does not let itself be read; the kit's is the page's own.
    }
  }

  return out
}

/** Each column's values, read once the page's stylesheet is there. */
function usePalettes() {
  const [values, setValues] = useState<Record<string, string>[]>()

  useLayoutEffect(() => {
    const rules = declared()

    setValues(COLUMNS.map((c) => Object.assign({}, ...c.rules.map((r) => rules.get(plain(r)) ?? {}))))
  }, [])

  return values
}

function Colour() {
  const values = usePalettes()
  const root = document.documentElement
  const current = `${root.dataset.theme ?? "neutral"} ${root.classList.contains("dark") ? "dark" : "light"}`

  if (!values) return null

  return (
    <div className="grid grid-cols-[7rem_repeat(4,minmax(0,1fr))] overflow-hidden rounded-lg border text-meta">
      <div />
      {COLUMNS.map((c) => {
        const name = `${c.theme} ${c.dark ? "dark" : "light"}`

        return (
          <div key={name} className="flex items-center gap-1.5 border-l px-2 py-1.5 font-medium">
            {name}
            {name === current && <span className="size-1.5 rounded-full bg-primary" title="In use on this page" />}
          </div>
        )
      })}
      {COLOURS.map(({ family, tokens }) =>
        tokens.map(([fill, ink], i) => (
          <Row key={fill} first={i === 0} family={family} fill={fill} ink={ink} values={values} />
        ))
      )}
    </div>
  )
}

/** One token across the palettes: its name, then a swatch in each column, its text drawn on it where it has one. */
function Row({ first, family, fill, ink, values }: { first: boolean; family: string; fill: string; ink?: string; values: Record<string, string>[] }) {
  return (
    <>
      <div className={`flex flex-col justify-center px-2 ${first ? "border-t" : ""}`}>
        {first && <span className="text-badge tracking-wide text-muted-foreground/70 uppercase">{family}</span>}
        <span className="font-mono">{fill}</span>
      </div>
      {values.map((v, n) => (
        // The column's palette, set on it, so var() and the kit's classes inside resolve to it.
        <div key={n} className={`border-l bg-background p-1 ${first ? "border-t" : ""}`} style={v as CSSProperties}>
          <div
            className="flex h-7 items-center justify-between rounded-md px-2 ring-1 ring-border ring-inset"
            style={{ background: `var(--${fill})`, color: ink ? `var(--${ink})` : undefined }}
            title={`--${fill}: ${v[`--${fill}`] ?? ""}${ink ? `\n--${ink}: ${v[`--${ink}`] ?? ""}` : ""}`}
          >
            {ink && <span className="font-medium">Aa</span>}
            <span className="ml-auto truncate font-mono text-badge opacity-70" style={{ color: ink ? undefined : "var(--foreground)" }}>
              {(v[`--${fill}`] ?? "").replace(/^var\(--(.*)\)$/, "→ $1")}
            </span>
          </div>
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
