// The kit's theming: a theme is three numbers, a hue, how strongly the greys are tinted toward it and how vivid its accent
// is, and every colour token is derived from them over lightness steps fixed per mode, so contrast holds for any hue. The
// steps here are the one source: theme.css, the derivation as CSS that the page computes as the numbers change, is
// written from them (`bun framework/kit/theme.ts`), and a spec keeps the two equal and checks the contrast of what they make.
// The presets are named themes, a row each.

export type Mode = "light" | "dark"
/** `hue` 0–360; `tint`, how strongly the greys lean to it, and `vivid`, how coloured the accent is, 0–100. */
export type Theme = { hue: number; tint: number; vivid: number }

/** The presets, the first the default. Adding one is adding its row. */
export const PRESETS = [
  { id: "neutral", label: "Neutral", theme: { hue: 0, tint: 0, vivid: 0 } },
  { id: "claude", label: "Claude", theme: { hue: 40, tint: 36, vivid: 68 } },
  { id: "slate", label: "Slate", theme: { hue: 255, tint: 32, vivid: 22 } },
  { id: "sand", label: "Sand", theme: { hue: 78, tint: 55, vivid: 8 } },
  { id: "moss", label: "Moss", theme: { hue: 145, tint: 28, vivid: 50 } },
  { id: "ocean", label: "Ocean", theme: { hue: 235, tint: 22, vivid: 72 } },
  { id: "plum", label: "Plum", theme: { hue: 335, tint: 30, vivid: 55 } },
] as const satisfies readonly { id: string; label: string; theme: Theme }[]

export type PresetId = (typeof PRESETS)[number]["id"]

export const isPreset = (id: unknown): id is PresetId => PRESETS.some((p) => p.id === id)
export const presetOf = (id: PresetId): Theme => PRESETS.find((p) => p.id === id)!.theme

/** The chroma of the greys at tint 100, and of the accent at vivid 100. */
export const TINT_CHROMA = 0.03
export const VIVID_CHROMA = 0.2
/** The vividness at which a step that moves with the accent has reached its other lightness. */
export const VIVID_FULL = 60
/** The hue at which a vivid colour is brightest for its OKLCH lightness, cyan; a step's dip is whole there and none opposite it, at red. */
export const BRIGHT_HUE = 200

/**
 * A step: lightness `l`, which moves to `to` as the accent grows vivid (reached at VIVID_FULL), and less by `dip` near
 * BRIGHT_HUE, where a colour is brightest for its lightness, so text on it keeps its contrast; chroma, `c` times the
 * greys' and `v` times the accent's; the theme's hue; `alpha` where it is translucent. A fixed step keeps its own colour,
 * `chroma` and `hue`, whatever the theme: what it means must not change with it.
 */
export type Step = { l: number; to?: number; dip?: number; c?: number; v?: number; alpha?: number } | { l: number; chroma: number; hue: number }

export const TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "success",
  "warning",
  "info",
  "border",
  "input",
  "ring",
  "sidebar",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "thread-user",
  "thread-context",
] as const

export type Token = (typeof TOKENS)[number]

// Charts are a ramp of the accent, in order from light to dark; with no accent, the greys they always were.
const CHARTS = { "chart-1": { l: 0.87, v: 0.5 }, "chart-2": { l: 0.556, v: 0.8 }, "chart-3": { l: 0.439, v: 0.8 }, "chart-4": { l: 0.371, v: 0.7 }, "chart-5": { l: 0.269, v: 0.6 } }

/** The lightness steps of each mode: at tint and vivid 0, the neutral palette exactly. */
export const STEPS: Record<Mode, Record<Token, Step>> = {
  light: {
    background: { l: 1, c: 0.5 },
    foreground: { l: 0.145, c: 1 },
    card: { l: 1, c: 0.4 },
    "card-foreground": { l: 0.145, c: 1 },
    popover: { l: 1, c: 0.4 },
    "popover-foreground": { l: 0.145, c: 1 },
    primary: { l: 0.205, to: 0.557, dip: 0.08, c: 1, v: 1 },
    "primary-foreground": { l: 0.985, c: 0.6 },
    secondary: { l: 0.97, c: 1 },
    "secondary-foreground": { l: 0.205, c: 1 },
    muted: { l: 0.97, c: 1.3 },
    "muted-foreground": { l: 0.54, c: 1.2 },
    accent: { l: 0.97, c: 1.3 },
    "accent-foreground": { l: 0.205, c: 1 },
    destructive: { l: 0.577, chroma: 0.245, hue: 27.325 },
    success: { l: 0.53, chroma: 0.14, hue: 150 },
    warning: { l: 0.56, chroma: 0.14, hue: 65 },
    info: { l: 0.55, chroma: 0.16, hue: 255 },
    border: { l: 0.922, c: 1.4 },
    input: { l: 0.922, c: 1.6 },
    ring: { l: 0.708, c: 0.5, v: 0.8 },
    sidebar: { l: 0.985, c: 1 },
    ...CHARTS,
    "thread-user": { l: 0.55, chroma: 0.16, hue: 255 },
    "thread-context": { l: 0.56, chroma: 0.12, hue: 65 },
  },
  dark: {
    background: { l: 0.145, c: 0.8 },
    foreground: { l: 0.985, c: 0.5 },
    card: { l: 0.205, c: 1 },
    "card-foreground": { l: 0.985, c: 0.5 },
    popover: { l: 0.205, c: 1.2 },
    "popover-foreground": { l: 0.985, c: 0.5 },
    primary: { l: 0.922, to: 0.672, c: 1, v: 1 },
    "primary-foreground": { l: 0.205, c: 1.6 },
    secondary: { l: 0.269, c: 1.2 },
    "secondary-foreground": { l: 0.985, c: 0.5 },
    muted: { l: 0.269, c: 2 },
    "muted-foreground": { l: 0.708, c: 1.6 },
    accent: { l: 0.269, c: 2 },
    "accent-foreground": { l: 0.985, c: 0.5 },
    destructive: { l: 0.704, chroma: 0.191, hue: 22.216 },
    success: { l: 0.74, chroma: 0.15, hue: 150 },
    warning: { l: 0.8, chroma: 0.14, hue: 75 },
    info: { l: 0.72, chroma: 0.13, hue: 255 },
    border: { l: 1, c: 1.4, alpha: 0.1 },
    input: { l: 1, c: 1.6, alpha: 0.15 },
    ring: { l: 0.556, c: 0.5, v: 0.8 },
    sidebar: { l: 0.205, c: 1 },
    ...CHARTS,
    "thread-user": { l: 0.72, chroma: 0.13, hue: 255 },
    "thread-context": { l: 0.78, chroma: 0.12, hue: 75 },
  },
}

/** A colour in OKLCH, `alpha` 1 where opaque. */
export type Oklch = { l: number; c: number; h: number; alpha: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A theme within its bounds: the hue turned into 0–360, tint and vivid held to 0–100. */
export const bounded = (t: Theme): Theme => ({ hue: ((t.hue % 360) + 360) % 360, tint: clamp(t.tint, 0, 100), vivid: clamp(t.vivid, 0, 100) })

/** A step's colour in a theme, as theme.css computes it. */
export function colourOf(step: Step, theme: Theme): Oklch {
  if ("chroma" in step) return { l: step.l, c: step.chroma, h: step.hue, alpha: 1 }

  const { hue, tint, vivid } = bounded(theme)
  const reach = Math.min(1, vivid / VIVID_FULL)
  const bright = (1 + Math.cos(((hue - BRIGHT_HUE) * Math.PI) / 180)) / 2
  const l = step.l + ((step.to ?? step.l) - step.l) * reach - (step.dip ?? 0) * reach * bright

  return { l, c: (step.c ?? 0) * (tint / 100) * TINT_CHROMA + (step.v ?? 0) * (vivid / 100) * VIVID_CHROMA, h: hue, alpha: step.alpha ?? 1 }
}

/** Every token's colour in a theme and mode. */
export const derive = (theme: Theme, mode: Mode): Record<Token, Oklch> =>
  Object.fromEntries(TOKENS.map((token) => [token, colourOf(STEPS[mode][token], theme)])) as Record<Token, Oklch>

/** The custom properties a theme is given to the page by, on the element whose tokens follow it. */
export const VARS = { hue: "--theme-hue", tint: "--theme-tint", vivid: "--theme-vivid" } as const

/** A theme as those properties. */
export const varsOf = (theme: Theme): Record<string, string> => {
  const t = bounded(theme)

  return { [VARS.hue]: String(t.hue), [VARS.tint]: String(t.tint), [VARS.vivid]: String(t.vivid) }
}

const num = (n: number) => String(Number(n.toFixed(4)))

/** A step as CSS, over the properties: what the browser computes whenever they change. */
function cssOf(step: Step): string {
  if ("chroma" in step) return `oklch(${num(step.l)} ${num(step.chroma)} ${num(step.hue)})`

  const moves = [step.to !== undefined && step.to !== step.l && ` + ${num(step.to - step.l)} * var(--vivid-reach)`, step.dip && ` - ${num(step.dip)} * var(--vivid-reach) * var(--bright)`]
  const l = moves.some(Boolean) ? `calc(${num(step.l)}${moves.filter(Boolean).join("")})` : num(step.l)
  const weighted = (name: string, w: number | undefined) => (w ? (w === 1 ? `var(${name})` : `var(${name}) * ${num(w)}`) : "")
  const parts = [weighted("--tint-chroma", step.c), weighted("--vivid-chroma", step.v)].filter(Boolean)
  const c = parts.length === 0 ? "0" : `calc(${parts.join(" + ")})`

  return `oklch(${l} ${c} var(${VARS.hue})${step.alpha === undefined ? "" : ` / ${num(step.alpha * 100)}%`})`
}

/**
 * theme.css: the derivation, for the page's root and for any element that takes a theme of its own by data-theme and the
 * numbers, in the mode of the page, or in its own by the class dark or light.
 */
export function css(): string {
  const block = (mode: Mode) => TOKENS.map((token) => `  --${token}: ${cssOf(STEPS[mode][token])};`).join("\n")
  const helpers = [
    `  --tint-chroma: calc(clamp(0, var(${VARS.tint}), 100) / 100 * ${TINT_CHROMA});`,
    `  --vivid-chroma: calc(clamp(0, var(${VARS.vivid}), 100) / 100 * ${VIVID_CHROMA});`,
    `  --vivid-reach: min(1, clamp(0, var(${VARS.vivid}), 100) / ${VIVID_FULL});`,
    `  --bright: calc((1 + cos((var(${VARS.hue}) - ${BRIGHT_HUE}) * 1deg)) / 2);`,
  ].join("\n")

  return [
    "/* Written by framework/kit/theme.ts from its steps, which a spec keeps it equal to: change them there and run it. */",
    "/* The theme's numbers, Neutral's by default, which the shell sets on the page's root as the person chose. */",
    `:root {\n  ${VARS.hue}: 0;\n  ${VARS.tint}: 0;\n  ${VARS.vivid}: 0;\n}`,
    "",
    `:root,\n[data-theme] {\n${helpers}\n${block("light")}\n}`,
    "",
    `.dark,\n.dark [data-theme]:not(.light) {\n${block("dark")}\n}`,
    "",
  ].join("\n")
}

if (import.meta.main) void Bun.write(new URL("./theme.css", import.meta.url), css())
