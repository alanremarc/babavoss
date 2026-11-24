// A figure as a page shows it: a self-contained HTML fragment (a diagram, a chart, a table drawn by hand) in a sandboxed
// frame, the way T3 Code renders its html_render pages. The frame's :root carries the theme as the same CSS variables T3
// gives its pages (--background, --foreground, --muted, --card, --border, --primary, --accent, --success, --warning, --info,
// --destructive, --chart-1…6, --radius, --font-sans, --font-mono, with -foreground and -surface kin), read from the page's
// own tokens, so a fragment checked with T3's html_preview draws the same here, light or dark. A small script in the frame
// reports its height, and the frame fits it. Scripts run sandboxed: no access to this page, its storage or its cookies.
import { useConventions } from "babavoss/shell/ui/index.tsx"
import { useEffect, useMemo, useRef, useState } from "react"

/** The page's tokens the frame takes as they are, by T3's names. */
const SAME = [
  "background",
  "foreground",
  "muted",
  "muted-foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "secondary",
  "secondary-foreground",
  "border",
  "input",
  "ring",
  "primary",
  "primary-foreground",
  "destructive",
  "warning",
  "success",
  "info",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "radius",
  "font-mono",
]
/** T3's names the page has no token of, made from the ones it has. Its --accent is the brand colour, as T3's is. */
const MADE: Record<string, string> = {
  accent: "var(--primary)",
  "accent-foreground": "var(--primary-foreground)",
  "accent-surface": "color-mix(in oklab, var(--primary) 12%, var(--background))",
  "accent-surface-foreground": "var(--foreground)",
  "destructive-foreground": "var(--destructive)",
  "destructive-surface": "color-mix(in oklab, var(--destructive) 12%, var(--background))",
  "warning-foreground": "var(--warning)",
  "warning-surface": "color-mix(in oklab, var(--warning) 14%, var(--background))",
  "success-foreground": "var(--success)",
  "info-foreground": "var(--info)",
  "code-background": "var(--muted)",
  "code-foreground": "var(--foreground)",
  "chart-6": "color-mix(in oklab, var(--chart-1) 50%, var(--chart-3))",
}
const SANS = `"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`

/** T3's base sheet: the frame's background, text and font, an 8px gutter for rings and shadows, and no scrollbars. */
const BASE =
  "html{box-sizing:border-box;padding:8px;background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;scrollbar-width:none}html::-webkit-scrollbar{display:none}*,*::before,*::after{box-sizing:inherit}body{margin:0}code,kbd,pre,samp{font-family:var(--font-mono)}"
/** Reports the content's height to the page whenever it changes. */
const SIZE = `<script>(function(){var h;function z(){var r=document.documentElement,v=Math.ceil(r.getBoundingClientRect().height);if(v===h)return;h=v;parent.postMessage({figure:"size",height:v},"*")}new ResizeObserver(z).observe(document.documentElement);addEventListener("load",z);document.addEventListener("DOMContentLoaded",function(){new ResizeObserver(z).observe(document.body);z()})})()</script>`

/** The theme as a :root rule, read from the tokens where the figure stands. */
function theme(at: Element, dark: boolean) {
  const style = getComputedStyle(at)
  const vars = SAME.map((name) => [name, style.getPropertyValue(`--${name}`).trim()] as const).filter(([, v]) => v)

  return `:root{color-scheme:${dark ? "dark" : "light"};${vars.map(([n, v]) => `--${n}:${v};`).join("")}--font-sans:${SANS};${Object.entries(MADE)
    .map(([n, v]) => `--${n}:${v};`)
    .join("")}}`
}

const LIMIT = 4000

/** The height each figure last took, by its HTML and width, kept for the tab's session: a figure drawn again, as after a
 * reload, starts at its own height, so nothing below it moves. */
const key = (html: string, width: number) => {
  let h = 0

  for (let i = 0; i < html.length; i++) h = (Math.imul(31, h) + html.charCodeAt(i)) | 0

  return `figure:${h}:${Math.round(width / 40)}`
}
const recall = (k: string) => {
  try {
    const v = Number(sessionStorage.getItem(k))

    return v > 0 ? v : undefined
  } catch {
    return undefined
  }
}
const keep = (k: string, v: number) => {
  try {
    sessionStorage.setItem(k, String(v))
  } catch {
    // Storage refused: the figure still sizes, only later.
  }
}

export function Figure({ html }: { html: string }) {
  const { mode } = useConventions()
  const frame = useRef<HTMLIFrameElement>(null)
  const [root, setRoot] = useState<string>()
  const [height, setHeight] = useState<number>()
  const [width, setWidth] = useState(0)
  const remembered = width ? recall(key(html, width)) : undefined

  // The theme is read once the page wears the mode, so a switch redraws the figure in the new one.
  useEffect(() => {
    if (frame.current) setRoot(theme(frame.current, mode === "dark"))
  }, [mode])
  useEffect(() => {
    const el = frame.current

    if (!el) return
    setWidth(el.clientWidth)
    const seen = new ResizeObserver(() => setWidth(el.clientWidth))

    seen.observe(el)

    return () => seen.disconnect()
  }, [])
  useEffect(() => {
    const heard = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.figure !== "size" || typeof e.data.height !== "number") return
      const v = Math.min(LIMIT, Math.max(40, Math.ceil(e.data.height)))

      setHeight(v)
      if (frame.current) keep(key(html, frame.current.clientWidth), v)
    }

    addEventListener("message", heard)

    return () => removeEventListener("message", heard)
  }, [html])
  const doc = useMemo(
    () =>
      root &&
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>${root}${BASE}</style>${SIZE}</head><body>${html}</body></html>`,
    [root, html],
  )

  return (
    <iframe
      ref={frame}
      title="Figure"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      // Until it has its height, a figure takes the one it had before, or a little room, and is not seen half drawn.
      style={{ height: height ?? remembered ?? 160, visibility: height || remembered ? "visible" : "hidden" }}
      className="my-1 block w-full rounded-md border-0 bg-transparent"
    />
  )
}
