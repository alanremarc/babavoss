// The guide's own frame around what it shows: a specimen, its name and files over its states; a state, the thing itself
// with a word under it; and a row of states. It draws nothing of the framework's: what stands inside is the real thing.
import type { ReactNode } from "react"
import { cn } from "babavoss/kit/cn.ts"

/** A specimen: its name, the framework's files it shows, quietly, and its states. */
export function Specimen({ id, title, files, children }: { id: string; title: string; files: readonly string[]; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="flex scroll-mt-3 flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="text-large font-medium">{title}</h3>
        <span className="flex flex-wrap gap-x-2 font-mono text-meta text-muted-foreground/70">
          {files.map((file) => (
            <span key={file} title={file}>
              {file.split("/").at(-1)}
            </span>
          ))}
        </span>
      </header>
      {children}
    </section>
  )
}

/**
 * One state of a specimen: the thing, on the page's ground, and its word under it. `wide` gives it the row; `bare` draws it
 * without a box, for what has its own edges, such as the strip; `className` sets its ground, as a height or a padding.
 */
export function State({ label, wide, bare, className = "", children }: { label: string; wide?: boolean; bare?: boolean; className?: string; children: ReactNode }) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-1", wide && "col-span-full")}>
      <div className={cn(!bare && "flex min-h-14 flex-wrap items-center gap-2 rounded-lg border bg-background p-3", "min-w-0", className)}>{children}</div>
      <figcaption className="text-meta text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

/** States side by side, as many as fit, each at least `min` wide. */
export function States({ min = 160, children }: { min?: number; children: ReactNode }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  )
}
