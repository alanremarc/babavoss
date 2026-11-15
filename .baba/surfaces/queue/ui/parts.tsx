// What the queue's two views share: the shapes of its views, the marks of where an issue stands, an issue as a one-liner,
// the switch between the list and the map, and each narrative's hue.
import type { ReactNode } from "react"
import { CircleCheckIcon, CircleDashedIcon, CircleIcon, LoaderCircleIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { ToggleGroup, ToggleGroupItem } from "babavoss/kit/index.ts"

export type Status = "draft" | "backlog" | "lane" | "done"
export type Row = { at: string; n: number; title: string; status: Status; lane?: number; narrative: string; from?: number[]; note?: string }
export type Story = { at: string; id: string; title: string; issues: number; open: number }
export type Root = { lanes: number; free: number[]; narratives: Story[]; issues: Row[] }
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

export function Mark({ status, className = "size-3.5" }: { status: Status; className?: string }) {
  const size = `${className} shrink-0`

  if (status === "lane") return <LoaderCircleIcon className={`${size} text-primary animate-spin [animation-duration:2.5s]`} aria-hidden />
  if (status === "done") return <CircleCheckIcon className={`${size} text-muted-foreground`} aria-hidden />
  if (status === "draft") return <CircleDashedIcon className={`${size} text-muted-foreground`} aria-hidden />

  return <CircleIcon className={size} aria-hidden />
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

export type Lens = "list" | "map"

/** The switch between the two views, at the top of the sidebar in both; the choice is the tab's route. */
export function Switch({ lens, onLens, children }: { lens: Lens; onLens: (lens: Lens) => void; children?: ReactNode }) {
  return (
    <div className="bg-muted/30 sticky top-0 z-10 flex h-9 shrink-0 items-center gap-2 border-b px-2 backdrop-blur">
      <ToggleGroup type="single" size="sm" variant="outline" value={lens} onValueChange={(value) => value && onLens(value as Lens)} aria-label="View">
        <ToggleGroupItem value="list" className="px-2.5 text-meta">
          List
        </ToggleGroupItem>
        <ToggleGroupItem value="map" className="px-2.5 text-meta">
          Map
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="ml-auto flex min-w-0 items-center">{children}</div>
    </div>
  )
}
