// The parts of a surface's content the kit has an opinion on, so contents read alike: a toolbar with its spacer and
// segments, a document's page, an empty line, and whether a content is narrow.
import { useEffect, useState, type ReactNode } from "react"

const muted = "text-muted-foreground"
const ring = "outline-none focus-visible:ring-2 focus-visible:ring-ring"
/** A bar's height and row, as the shell's bars have. */
const bar = "flex h-bar shrink-0 items-center"

/**
 * Whether an element is narrower than `below` pixels, followed as it resizes: content that stacks its columns where its
 * tab or a split leaves it narrow. Give the element the returned ref; until it is measured, it is not narrow.
 */
export function useNarrow(below: number) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    if (!node) return

    const observer = new ResizeObserver(([entry]) => setNarrow(entry!.contentRect.width < below))

    observer.observe(node)

    return () => observer.disconnect()
  }, [node, below])

  return [setNode, narrow] as const
}

/** A content's toolbar, the first row of its area: groups of controls, a spacer between ends. */
export function WorkbenchToolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className={`${bar} gap-1 border-b px-2`}>
      {children}
    </div>
  )
}

/** Pushes what follows it in a toolbar to the far end. */
export const WorkbenchSpacer = () => <div className="flex-1" />

/** One choice among a few, shown side by side: a view, a lens. */
export function WorkbenchSegments<T extends string>({
  label,
  options,
  value,
  set,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  set: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-row shrink-0 rounded-md bg-foreground/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`flex-1 rounded-[5px] px-2 text-meta ${ring} ${value === o.id ? "bg-background text-foreground shadow-xs" : `${muted} hover:text-foreground`}`}
          onClick={() => set(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A document's page, under its toolbar: it scrolls itself, in one measured column, or across the whole width when
 * `wide`. `title` heads it, `aside` runs quieter after the title, `meta` is the line of facts under it. Its children are
 * its blocks.
 */
export function WorkbenchPage({
  title,
  aside,
  meta,
  wide,
  children,
}: {
  title?: ReactNode
  aside?: ReactNode
  meta?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <article className={`flex flex-col gap-4 px-4 pt-3 pb-8 ${wide ? "" : "mx-auto max-w-4xl"}`}>
        {(title !== undefined || meta !== undefined) && (
          <header className="flex flex-col gap-1">
            {title !== undefined && (
              <h2 className="flex flex-wrap items-baseline gap-x-2 text-large font-semibold">
                {title}
                {aside !== undefined && <span className={`font-normal ${muted}`}>{aside}</span>}
              </h2>
            )}
            {meta !== undefined && <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-meta ${muted}`}>{meta}</div>}
          </header>
        )}
        {children}
      </article>
    </div>
  )
}

/** A region's quiet line when it has nothing to show, centred in it. */
export const WorkbenchEmpty = ({ children }: { children: ReactNode }) => (
  <div className={`grid min-h-0 flex-1 place-items-center p-6 text-center ${muted}`}>
    <div className="max-w-72">{children}</div>
  </div>
)
