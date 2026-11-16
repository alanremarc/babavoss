// What the queue's two views share: the shapes of its views, the marks of where an issue stands, an issue as a one-liner,
// the toolbar that switches between the list, the map and the archive, and each narrative's hue.
import type { ReactNode } from "react"
import { ArchiveIcon, CircleCheckIcon, CircleDashedIcon, CircleIcon, ListIcon, LoaderCircleIcon, WaypointsIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"

export type Status = "draft" | "backlog" | "lane" | "done"
export type Row = { at: string; n: number; title: string; status: Status; lane?: number; narrative: string; from?: number[]; note?: string }
export type Story = { at: string; id: string; title: string; issues: number; open: number }
/** `reading`: a new tab has not heard the session's work yet. */
export type Root = { lanes: number; free: number[]; narratives: Story[]; issues: Row[]; reading?: true }
export type Told = { id: string; title: string; about: string; issues: (Row & { iterations: number })[] }
export type Ref = { at: string; n: number; title: string; status: Status }
export type Iteration = { n: number; title: string; why: string; decided: string; outcome: string }
export type Whole = Omit<Row, "narrative" | "from"> & {
  about: string
  narrative: { id: string; title: string }
  from: Ref[]
  to: Ref[]
  iterations: Iteration[]
  updates?: { t?: number; text: string }[]
  approve?: Handle
  drop?: Handle
}

export const NAMES: Record<Status, string> = { lane: "In progress", backlog: "Backlog", draft: "Draft", done: "Done" }

const HUES = 6
/** A narrative's hue, by its place among the narratives: the surface's own tokens, a step lighter in dark mode. */
export const hue = (i: number) => `var(--map-${(Math.max(0, i) % HUES) + 1})`

/** Where an issue stands, as an icon; in `color`, its narrative's hue, where one is given. */
export function Mark({ status, className = "size-3.5", color }: { status: Status; className?: string; color?: string }) {
  const size = `${className} shrink-0`
  const style = color ? { color } : undefined

  if (status === "lane") return <LoaderCircleIcon className={`${size} ${color ? "" : "text-primary"} animate-spin [animation-duration:2.5s]`} style={style} aria-hidden />
  if (status === "done") return <CircleCheckIcon className={`${size} ${color ? "" : "text-muted-foreground"}`} style={style} aria-hidden />
  if (status === "draft") return <CircleDashedIcon className={`${size} ${color ? "" : "text-muted-foreground"}`} style={style} aria-hidden />

  return <CircleIcon className={size} style={style} aria-hidden />
}

export const Lane = ({ lane }: { lane: number }) => (
  <span className="bg-primary text-primary-foreground inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-badge font-medium tabular-nums">L{lane}</span>
)

export const Label = ({ children }: { children: ReactNode }) => <h3 className="text-muted-foreground text-meta font-medium">{children}</h3>

/** An issue as one line that selects it: its hue, number, title and where it stands. */
export function Line({ to, color, onPick }: { to: { n: number; title: string; status?: Status; lane?: number }; color: string; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} title={to.title} className="hover:bg-muted flex h-6 w-full items-center gap-2 rounded-sm px-1.5 text-left text-body outline-none">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-muted-foreground w-6 shrink-0 text-meta tabular-nums">#{to.n}</span>
        <span className="min-w-0 flex-1 truncate">{to.title}</span>
        {to.lane && <Lane lane={to.lane} />}
        {to.status && <Mark status={to.status} className="size-3" />}
      </button>
    </li>
  )
}

export type Lens = "list" | "map" | "archive"

const LENSES: { lens: Lens; label: string; icon: ReactNode }[] = [
  { lens: "list", label: "List", icon: <ListIcon aria-hidden /> },
  { lens: "map", label: "Map", icon: <WaypointsIcon aria-hidden /> },
  { lens: "archive", label: "Archive", icon: <ArchiveIcon aria-hidden /> },
]

/** The modes of the page, as a toolbar that floats at its foot: an icon each, the one shown lit; the choice is the tab's route. */
export function Modes({ lens, onLens }: { lens: Lens; onLens: (lens: Lens) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="bg-popover absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1 shadow-lg ring-1 ring-foreground/10">
      {LENSES.map((mode) => (
        <button
          key={mode.lens}
          type="button"
          role="radio"
          aria-checked={lens === mode.lens}
          aria-label={mode.label}
          title={mode.label}
          onClick={() => onLens(mode.lens)}
          className="text-muted-foreground hover:bg-foreground/8 hover:text-foreground aria-checked:bg-primary aria-checked:text-primary-foreground grid size-8 place-items-center rounded-lg outline-none focus-visible:bg-foreground/8 [&_svg]:size-4"
        >
          {mode.icon}
        </button>
      ))}
    </div>
  )
}
