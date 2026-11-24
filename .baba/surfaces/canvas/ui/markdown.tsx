// Rich text as the canvas shows it: Markdown from the agent or the person, rendered without raw HTML. Links open in a new
// tab. Figures are drawn in themed frames. Styled by the theme's tokens alone.
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Children, cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from "react"
import { Figure } from "./figure.tsx"
import { useViewer } from "./viewer.tsx"

/** A node of the parsed text, as the renderer hands it: enough of hast to read a code block's language and text. */
type Hast = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; data?: { meta?: unknown }; children?: Hast[] }
const textOf = (n?: Hast): string => (n?.type === "text" ? (n.value ?? "") : (n?.children ?? []).map(textOf).join(""))

/** GitHub's alerts, `> [!NOTE]` and its kin, as callouts in the theme's tones. */
const CALLOUT: Record<string, { label: string; tone: string }> = {
  NOTE: { label: "Note", tone: "border-info bg-info/10 [&>p:first-child]:text-info" },
  TIP: { label: "Tip", tone: "border-success bg-success/10 [&>p:first-child]:text-success" },
  IMPORTANT: { label: "Important", tone: "border-primary bg-primary/5 [&>p:first-child]:text-primary" },
  WARNING: { label: "Warning", tone: "border-warning bg-warning/10 [&>p:first-child]:text-warning" },
  CAUTION: { label: "Caution", tone: "border-destructive bg-destructive/10 [&>p:first-child]:text-destructive" },
}
const MARK = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i

function Quote({ children }: { children?: ReactNode }) {
  const parts = Children.toArray(children)
  const at = parts.findIndex((c) => isValidElement(c))
  const first = parts[at] as ReactElement<{ children?: ReactNode }> | undefined
  const inner = first?.type === "p" ? Children.toArray(first.props.children) : []
  const lead = inner[0]
  const kind = typeof lead === "string" ? MARK.exec(lead)?.[1]?.toUpperCase() : undefined

  if (!kind || !first) return <blockquote>{children}</blockquote>
  const c = CALLOUT[kind]!
  const rest = [(lead as string).replace(MARK, ""), ...inner.slice(1)]
  const shown = [...parts.slice(0, at), ...(rest.some((r) => r !== "") ? [cloneElement(first, {}, ...rest)] : []), ...parts.slice(at + 1)]

  return (
    <aside className={`flex flex-col gap-1 rounded-md border-l-4 px-3 py-2 ${c.tone}`}>
      <p className="text-meta font-semibold">{c.label}</p>
      {shown}
    </aside>
  )
}

const prose = [
  "flex min-w-0 flex-col gap-2 leading-relaxed break-words",
  "[&_h1]:mt-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:font-semibold [&_h3]:mt-1 [&_h3]:font-medium [&_h4]:font-medium",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>ul]:mt-1 [&_li>ol]:mt-1 [&_li+li]:mt-0.5",
  "[&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-meta",
  "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
  "[&_hr]:my-1 [&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:align-middle",
].join(" ")

/** An embedded image, opened in the viewer on a click; its text where it has no address. */
function Embedded({ src: url, alt }: { src?: string; alt?: string }) {
  const viewer = useViewer()

  if (!url) return <span className="rounded bg-muted px-1 text-meta text-muted-foreground">image: {alt}</span>

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block w-fit max-w-full cursor-zoom-in no-underline"
      onClick={(event) => {
        if (!viewer || event.metaKey || event.ctrlKey) return
        event.preventDefault()
        viewer.open(url, alt)
      }}
    >
      <img src={url} alt={alt ?? ""} loading="lazy" className="max-h-96 max-w-full rounded-md border bg-muted object-contain" />
    </a>
  )
}

/** What the text of one Rich can embed: its figure files. */
const Embeds = createContext<{ figures?: Record<string, string | null> }>({})

// The renderers are made once, here, and read what they embed from context. Made inside Rich, each render would make new
// ones, and React would take every element they draw for a new kind and build it again: a figure's frame would reload,
// and blink, whenever the page draws again.
function Image({ src, alt }: { src?: unknown; alt?: string }) {
  const { figures } = useContext(Embeds)

  if (typeof src === "string" && figures && src in figures)
    return figures[src] === null ? <span className="rounded bg-warning/10 px-1 text-meta text-warning">figure not there: {src}</span> : <Figure html={figures[src]!} />

  return <Embedded src={typeof src === "string" ? src : undefined} alt={alt} />
}
const COMPONENTS: Components = {
  a: ({ node: _, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  img: ({ node: _, src, alt }) => <Image src={src} alt={alt} />,
  pre: ({ node, children }) => {
    const code = (node as Hast | undefined)?.children?.find((c) => c.tagName === "code")
    const classes = code?.properties?.className
    // ```html figure: a self-contained HTML fragment drawn in a themed frame, as T3 Code renders its pages.
    const figure = Array.isArray(classes) && classes.includes("language-html") && /(^|\s)figure(\s|$)/.test(String(code?.data?.meta ?? ""))

    return figure ? <Figure html={textOf(code)} /> : <pre>{children}</pre>
  },
  blockquote: ({ node: _, children }) => <Quote>{children}</Quote>,
}
const PLUGINS = [remarkGfm]

/**
 * `figures`: the figure files a note embeds as `![…](figures/NAME.html)`, each with its HTML, or null where the file is not
 * there; each is drawn as a figure.
 */
export function Rich({ text, empty = "Empty.", figures }: { text?: string; empty?: string; figures?: Record<string, string | null> }) {
  if (!text?.trim() || text === "(empty)") return <p className="text-muted-foreground italic">{empty}</p>

  return (
    <div className={prose}>
      <Embeds.Provider value={{ figures }}>
        <Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
          {text}
        </Markdown>
      </Embeds.Provider>
    </div>
  )
}
