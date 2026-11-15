// A glance at an issue from the sidebar: a small card of fixed size that stands at the sidebar's left, level with the line
// the cursor is on. It comes a second after the cursor rests on a line; once it is there, moving to another line moves
// it and changes what it says at once, and it stays while the cursor is on it, so its links can be followed.
import { useEffect, useRef, useState } from "react"
import { Lane, Mark, NAMES, type Root, type Row } from "./parts.tsx"

/** How long the cursor rests on a line before the card comes, and how long it stays once the cursor has left both. */
const COMES_MS = 1000
const GOES_MS = 180
const WIDTH = 288
const HEIGHT = 176

type Shown = { n: number; top: number; left: number }

/** What the sidebar's lines call as the cursor comes and goes, and the card itself. */
export function usePeek() {
  const [shown, setShown] = useState<Shown>()
  const warm = useRef(false)
  const timer = useRef(0)
  const over = (n: number, line: HTMLElement) => {
    const box = line.getBoundingClientRect()
    const list = line.closest("aside")?.getBoundingClientRect() ?? box
    const next = { n, left: list.left - WIDTH - 6, top: Math.max(52, Math.min(box.top - 8, window.innerHeight - HEIGHT - 8)) }

    clearTimeout(timer.current)
    if (warm.current) return setShown(next)
    timer.current = window.setTimeout(() => {
      warm.current = true
      setShown(next)
    }, COMES_MS)
  }
  const out = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      warm.current = false
      setShown(undefined)
    }, GOES_MS)
  }
  const stay = () => clearTimeout(timer.current)
  const close = () => {
    clearTimeout(timer.current)
    warm.current = false
    setShown(undefined)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return { shown, over, out, stay, close }
}

export type Peeking = ReturnType<typeof usePeek>

/** The card: the issue's narrative, where it stands, its title and note, and links to what it came out of and its narrative. */
export function Peek({ peek, root, colorOf, go }: { peek: Peeking; root: Root; colorOf: (id: string) => string; go: (route: string) => void }) {
  const issue = peek.shown && root.issues.find((row) => row.n === peek.shown!.n)

  if (!peek.shown || !issue) return null

  const narrative = root.narratives.find((x) => x.id === issue.narrative)
  const parents = (issue.from ?? []).map((n) => root.issues.find((row) => row.n === n)).filter((row): row is Row => !!row)
  const follow = (route: string) => {
    peek.close()
    go(route)
  }

  return (
    <div
      role="tooltip"
      onMouseEnter={peek.stay}
      onMouseLeave={peek.out}
      style={{ position: "fixed", top: peek.shown.top, left: peek.shown.left, width: WIDTH, height: HEIGHT }}
      className="bg-popover text-popover-foreground z-30 flex flex-col gap-2 overflow-hidden rounded-lg p-3 text-body shadow-lg ring-1 ring-foreground/10"
    >
      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-meta">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: colorOf(issue.narrative) }} />
        <button type="button" className="min-w-0 truncate outline-none hover:underline" onClick={() => follow(`/narratives/${issue.narrative}`)}>
          {narrative?.title ?? issue.narrative}
        </button>
        {narrative && (
          <span className="shrink-0 tabular-nums">
            · {narrative.open} open of {narrative.issues}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <Mark status={issue.status} color={colorOf(issue.narrative)} />
        <span className="text-muted-foreground shrink-0 text-meta">{NAMES[issue.status]}</span>
        {issue.lane && <Lane lane={issue.lane} />}
        <span className="text-muted-foreground/70 ml-auto shrink-0 text-meta tabular-nums">#{issue.n}</span>
      </div>
      <p className="line-clamp-2 font-medium">{issue.title}</p>
      {issue.note && <p className="text-muted-foreground line-clamp-2 text-meta">{issue.note}</p>}
      <div className="text-muted-foreground mt-auto flex min-w-0 items-center gap-1 text-meta">
        {parents.length > 0 && <span className="shrink-0">Came out of</span>}
        {parents.slice(0, 4).map((parent) => (
          <button
            key={parent.n}
            type="button"
            title={parent.title}
            className="bg-foreground/6 hover:bg-foreground/11 text-foreground shrink-0 rounded-sm px-1 tabular-nums outline-none"
            onClick={() => follow(`/issues/${parent.n}`)}
          >
            #{parent.n}
          </button>
        ))}
        <button type="button" className="text-foreground ml-auto shrink-0 outline-none hover:underline" onClick={() => follow(`/issues/${issue.n}`)}>
          Open
        </button>
      </div>
    </div>
  )
}
