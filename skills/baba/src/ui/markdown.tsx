import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

const external = (href?: string) => !!href && /^https?:\/\//.test(href)

// Relative links and images point into files the browser cannot reach; they stay readable as text.
const components: Components = {
  a: ({ href, children }) =>
    external(href) ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <span title={href}>{children}</span>
    ),
  img: ({ src, alt }) => (typeof src === "string" && external(src) ? <img src={src} alt={alt ?? ""} /> : <span>{alt}</span>),
}

/** GitHub-flavoured markdown in the canonical `markdown-body` style of github-markdown-css. */
export function MarkdownBody({ text, className = "" }: { text: string; className?: string }) {
  return (
    // github-markdown-css leaves list markers to the browser's defaults, which the shell's reset removes.
    <div className={`markdown-body [&_ol]:list-decimal [&_ul]:list-disc ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  )
}
