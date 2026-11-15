// The kit's theming: theme.css is what theme.ts writes from its steps, Neutral is the neutral palette as it was, and every
// theme, the presets and a sweep of hues at the extremes of tint and vividness, keeps its text legible on what it sits on,
// in both modes, however the browser brings a colour beyond sRGB into it.
import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { css, derive, PRESETS, presetOf, type Mode, type Oklch, type Theme, type Token } from "../../framework/kit/theme.ts"

type Rgb = [number, number, number]

/** OKLCH to linear sRGB, unclipped. */
function linear({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)
const clip = (rgb: Rgb): Rgb => rgb.map((v) => Math.min(1, Math.max(0, v))) as Rgb

/** The two ways a browser brings a colour into sRGB: clipping each channel, or lowering its chroma until it fits. */
function shown(colour: Oklch): Rgb[] {
  let lo = 0
  let hi = colour.c

  if (inGamut(linear(colour))) return [linear(colour)]
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2

    if (inGamut(linear({ ...colour, c: mid }))) lo = mid
    else hi = mid
  }

  return [clip(linear(colour)), clip(linear({ ...colour, c: lo }))]
}

const luminance = (rgb: Rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
/** A translucent colour over an opaque one, blended as the browser does, in gamma-encoded sRGB. */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb => top.map((v, i) => decode(alpha * encode(v) + (1 - alpha) * encode(under[i]!))) as Rgb

/** The WCAG 2 contrast ratio, the lowest of every way the two may be shown. */
function contrast(text: Oklch, ground: Oklch): number {
  let lowest = Infinity

  for (const t of shown(text)) {
    for (const g of shown(ground)) {
      const [a, b] = [luminance(t), luminance(g)].sort((x, y) => y - x) as [number, number]

      lowest = Math.min(lowest, (a + 0.05) / (b + 0.05))
    }
  }

  return lowest
}

/** What text sits on, and the least contrast it must keep: 4.5 for text, 3 for an accent or a state seen as a mark or short label. */
const PAIRS: [text: Token, ground: Token, least: number][] = [
  ["foreground", "background", 7],
  ["foreground", "sidebar", 7],
  ["foreground", "muted", 4.5],
  ["card-foreground", "card", 7],
  ["popover-foreground", "popover", 7],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "popover", 4.5],
  ["muted-foreground", "sidebar", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "accent", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["ring", "background", 2],
  ["destructive", "background", 4.5],
  ["success", "background", 4.5],
  ["warning", "background", 4.5],
  ["info", "background", 4.5],
  ["destructive", "card", 4.5],
  ["thread-user", "background", 4.5],
  ["thread-context", "background", 4.5],
]

const HUES = Array.from({ length: 36 }, (_, i) => i * 10)
const SWEEP: [string, Theme][] = HUES.flatMap((hue) =>
  [0, 100].flatMap((tint) => [0, 50, 100].map((vivid): [string, Theme] => [`hue ${hue} tint ${tint} vivid ${vivid}`, { hue, tint, vivid }]))
)
const THEMES: [string, Theme][] = [...PRESETS.map((p): [string, Theme] => [p.id, p.theme]), ...SWEEP]

describe("the theme", () => {
  it("is written to theme.css as theme.ts derives it: run bun framework/kit/theme.ts after changing a step", () => {
    expect(readFileSync(new URL("../../framework/kit/theme.css", import.meta.url), "utf8")).toBe(css())
  })

  it("makes, as Neutral, the neutral palette: greys, and the states as they were", () => {
    const light = derive(presetOf("neutral"), "light")
    const dark = derive(presetOf("neutral"), "dark")

    expect(light.background).toEqual({ l: 1, c: 0, h: 0, alpha: 1 })
    expect(light.primary).toEqual({ l: 0.205, c: 0, h: 0, alpha: 1 })
    expect(light["muted-foreground"]).toEqual({ l: 0.54, c: 0, h: 0, alpha: 1 })
    expect(dark.border).toEqual({ l: 1, c: 0, h: 0, alpha: 0.1 })
    expect(dark.primary).toEqual({ l: 0.922, c: 0, h: 0, alpha: 1 })
    expect(light.destructive).toEqual({ l: 0.577, c: 0.245, h: 27.325, alpha: 1 })
    for (const mode of ["light", "dark"] as const) {
      for (const [token, colour] of Object.entries(derive(presetOf("neutral"), mode))) {
        if (!["destructive", "success", "warning", "info", "thread-user", "thread-context"].includes(token)) expect(colour.c).toBe(0)
      }
    }
  })

  it("keeps the states' colours whatever the theme, so they always mean the same", () => {
    for (const mode of ["light", "dark"] as const) {
      const neutral = derive(presetOf("neutral"), mode)

      for (const [, theme] of THEMES) {
        const made = derive(theme, mode)

        for (const token of ["destructive", "success", "warning", "info", "thread-user", "thread-context"] as const) expect(made[token]).toEqual(neutral[token])
      }
    }
  })

  for (const mode of ["light", "dark"] as Mode[]) {
    it(`keeps text legible on what it sits on in ${mode}, for every preset and for every hue at the extremes`, () => {
      const short: string[] = []

      for (const [name, theme] of THEMES) {
        const made = derive(theme, mode)

        for (const [text, ground, least] of PAIRS) {
          const ratio = contrast(made[text], made[ground])

          if (ratio < least) short.push(`${name}: ${text} on ${ground} is ${ratio.toFixed(2)}, under ${least}`)
        }
      }

      expect(short).toEqual([])
    })
  }

  it("keeps the dark mode's translucent lines visible over every ground they are drawn on", () => {
    for (const [, theme] of THEMES) {
      const made = derive(theme, "dark")

      for (const ground of ["background", "card", "sidebar"] as const) {
        const under = clip(linear(made[ground]))
        const line = over(clip(linear(made.border)), made.border.alpha, under)

        expect((luminance(line) + 0.05) / (luminance(under) + 0.05)).toBeGreaterThan(1.15)
      }
    }
  })
})
