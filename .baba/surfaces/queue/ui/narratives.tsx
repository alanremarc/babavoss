// The narratives view: the list of narratives, and a narrative's page, its issues as an outline of what came out of what,
// read top to bottom. A row is an issue's number, its title with its note and links under it, and where it stands, on one
// grid for every row; the nesting is indentation with a quiet rule at each level. Links to other narratives are said, not
// drawn, and lead to the issue's place in its own narrative's page. A branch folds by its chevron; "Open" keeps the open
// issues and the path to them, as the view at /narratives/ID/open has them. Which narrative and whether open only is the
// tab's route; what is folded is the page's own.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button, WorkbenchEmpty, WorkbenchPage, WorkbenchSegments, WorkbenchSpacer, WorkbenchToolbar } from "babavoss/kit/index.ts"
import { useLive } from "babavoss/shell/ui/index.tsx"
import { branches, fold } from "../src/outline.ts"
import { Mark, across, type Listed, type Outline, type Placed, type Root } from "./parts.tsx"

/** Room under a page's last row for the toolbar that floats at its foot. */
const Foot = () => <div aria-hidden className="h-12 shrink-0" />

/** How many issues and how many are still open, the open ones in full voice. */
function Counts({ issues, open }: { issues: number; open: number }) {
  if (!issues) return <span className="text-muted-foreground">No issues</span>

  return (
    <span className="text-muted-foreground tabular-nums">
      {open ? <span className="text-foreground">{open} open</span> : "All done"} · {issues}
    </span>
  )
}

/** The narratives, those with open issues first: each its hue, title, what it is about and its counts; a click opens its page. */
export function Narratives({ root, colorOf, go }: { root: Root; colorOf: (id: string) => string; go: (route: string) => void }) {
  const { view } = useLive<Listed>("/narratives")
  const listed = view?.narratives ?? []

  if (!listed.length) return <WorkbenchEmpty>No narratives yet. The agent starts one when work goes its own way.</WorkbenchEmpty>

  return (
    <WorkbenchPage title="Narratives" aside={listed.length} meta={`${root.issues.length} issues, ${root.issues.filter((issue) => issue.status !== "done").length} open`}>
      <ul className="-mx-2 flex flex-col">
        {listed.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => go(x.at)}
              className="hover:bg-muted focus-visible:ring-ring grid w-full grid-cols-[0.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2"
            >
              <span className="size-2 translate-y-[-1px] self-center rounded-full" style={{ background: colorOf(x.id) }} />
              <span className={`text-large font-medium ${x.open ? "" : "text-muted-foreground"}`}>{x.title}</span>
              <span className="text-meta">
                <Counts issues={x.issues} open={x.open} />
              </span>
              {x.about && <span className="text-muted-foreground col-start-2 col-end-4 line-clamp-2">{x.about}</span>}
            </button>
          </li>
        ))}
      </ul>
      <Foot />
    </WorkbenchPage>
  )
}

const STANDS = { draft: "Draft", backlog: "Backlog", done: "Done" } as const

/** Where an issue stands, in words, for the row's last column: a lane in the primary colour, done quiet. */
function Stands({ issue }: { issue: Placed }) {
  if (issue.status === "lane") return <span className="text-primary font-medium">In lane {issue.lane}</span>

  return <span className={issue.status === "done" ? "text-muted-foreground/70" : "text-muted-foreground"}>{STANDS[issue.status]}</span>
}

/** Issue numbers, each a link to its place; `title` names the narrative they are on, where it is another. */
function Refs({ lead, ns, title, pick }: { lead: string; ns: number[]; title?: string; pick: (n: number) => void }) {
  return (
    <span className="min-w-0">
      {lead}{" "}
      {ns.map((n, i) => (
        <span key={n}>
          {i > 0 && ", "}
          <button
            type="button"
            className="text-foreground/80 hover:text-foreground tabular-nums underline decoration-foreground/20 underline-offset-2 outline-none hover:decoration-foreground/60 focus-visible:decoration-ring"
            onClick={(event) => {
              event.stopPropagation()
              pick(n)
            }}
          >
            #{n}
          </button>
        </span>
      ))}
      {title && <> in {title}</>}
    </span>
  )
}

type RowProps = {
  place: Placed
  color: string
  folded?: number
  branch: boolean
  lit: boolean
  titleOf: (id: string) => string
  toggle: () => void
  open: () => void
  here: (n: number) => void
  there: (id: string, n: number) => void
}

/** One issue on the outline's grid: its number; the rules of its depth, its chevron, mark, title, note and links; where it stands. */
function OutlineRow({ place, color, folded, branch, lit, titleOf, toggle, open, here, there }: RowProps) {
  const done = place.status === "done"
  const elsewhere = (lead: string, lines: string[] | undefined) =>
    across(lines).map(([id, ns]) => <Refs key={`${lead}${id}`} lead={lead} ns={ns} title={titleOf(id)} pick={(n) => there(id, n)} />)
  const links: ReactNode[] = [
    ...(place.also?.length ? [<Refs key="also" lead="also from" ns={place.also} pick={here} />] : []),
    ...elsewhere("from", place.from),
    ...elsewhere("led to", place.to),
  ]

  return (
    <li
      data-n={place.n}
      onClick={open}
      className={`col-span-3 grid cursor-default grid-cols-subgrid items-start rounded-md px-2 transition-colors duration-700 ${lit ? "bg-accent" : "hover:bg-muted"}`}
    >
      <span className="text-muted-foreground/70 py-1 text-meta leading-5 tabular-nums">#{place.n}</span>
      <div className="flex min-w-0 items-stretch">
        {Array.from({ length: place.depth }, (_, i) => (
          <span key={i} aria-hidden className="relative w-4 shrink-0 @max-md:w-3">
            <span className="bg-border absolute inset-y-0 left-[7px] w-px @max-md:left-[5px]" />
          </span>
        ))}
        {branch ? (
          <button
            type="button"
            aria-expanded={folded === undefined}
            aria-label={folded === undefined ? `Fold what came out of #${place.n}` : `Unfold what came out of #${place.n}`}
            className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring mt-1 grid size-5 shrink-0 place-items-center rounded-sm outline-none focus-visible:ring-2"
            onClick={(event) => {
              event.stopPropagation()
              toggle()
            }}
          >
            <ChevronRightIcon className={`size-glyph transition-transform ${folded === undefined ? "rotate-90" : ""}`} aria-hidden />
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 flex-col py-1 pl-1">
          <div className="flex min-w-0 items-start gap-2">
            <span className="flex h-5 shrink-0 items-center">
              <Mark status={place.status} color={color} />
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                open()
              }}
              className={`focus-visible:ring-ring min-w-0 rounded-sm text-left text-large text-pretty outline-none focus-visible:ring-2 ${done ? "text-muted-foreground" : "text-foreground font-medium"}`}
            >
              {place.title}
            </button>
            {folded !== undefined && <span className="text-muted-foreground bg-foreground/6 mt-0.5 shrink-0 rounded-sm px-1 text-meta tabular-nums">{folded} folded</span>}
          </div>
          {place.note && <p className={`line-clamp-2 pl-[1.375rem] text-body ${done ? "text-muted-foreground/70" : "text-muted-foreground"}`}>{place.note}</p>}
          {links.length > 0 && <p className="text-muted-foreground flex flex-wrap gap-x-3 pl-[1.375rem] text-meta">{links}</p>}
        </div>
      </div>
      <span className="py-1 pl-3 text-meta leading-5 whitespace-nowrap @max-md:hidden">
        <Stands issue={place} />
      </span>
    </li>
  )
}

/** The issue to show when a link leads to its narrative's page: lit, and scrolled to. */
export type Target = { id: string; n: number }

/** A narrative's page: its title and what it is about, then its outline; `only` when the route asks for the open ones. */
export function Narrative({
  id,
  only,
  root,
  colorOf,
  go,
  target,
  aim,
}: {
  id: string
  only: boolean
  root: Root
  colorOf: (id: string) => string
  go: (route: string) => void
  target?: Target
  aim: (target: Target) => void
}) {
  const at = `/narratives/${id}${only ? "/open" : ""}`
  const { view, error } = useLive<Outline>(at)
  const [folds, setFolds] = useState<Record<string, ReadonlySet<number>>>({})
  const list = useRef<HTMLOListElement>(null)
  const shown = view && view.id === id && !!view.only === only ? view : undefined
  const titleOf = (other: string) => root.narratives.find((x) => x.id === other)?.title ?? other
  const folded = folds[id] ?? new Set<number>()
  const visible = shown ? fold(shown.outline, folded) : []
  const hidden = (i: number) => {
    let count = 0

    for (let j = shown!.outline.indexOf(visible[i]!) + 1; j < shown!.outline.length && shown!.outline[j]!.depth > visible[i]!.depth; j++) count++

    return count
  }
  const toggle = (n: number) =>
    setFolds((all) => {
      const next = new Set(all[id] ?? [])

      if (next.has(n)) next.delete(n)
      else next.add(n)

      return { ...all, [id]: next }
    })
  const lit = target?.id === id ? target.n : undefined

  // A link to an issue here shows it: what is folded opens, the whole outline where it is not open, and it is scrolled to.
  useEffect(() => {
    if (lit === undefined || !shown) return
    if (folded.size) return setFolds(({ [id]: _opened, ...rest }) => rest)
    if (!shown.outline.some((place) => place.n === lit)) return only ? go(`/narratives/${id}`) : undefined
    list.current?.querySelector(`[data-n="${lit}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [lit, shown, folded.size, id, only])

  const bar = (
    <WorkbenchToolbar label="Narrative">
      <Button variant="ghost" size="sm" className="min-w-0" onClick={() => go("/narratives")}>
        <ArrowLeftIcon aria-hidden />
        <span className="truncate">Narratives</span>
      </Button>
      <WorkbenchSpacer />
      <div className="[&_[role=radio]]:whitespace-nowrap">
        <WorkbenchSegments
          label="Show"
          options={[
            { id: "all", label: "All" },
            { id: "open", label: "Open only" },
          ]}
          value={only ? "open" : "all"}
          set={(value) => go(`/narratives/${id}${value === "open" ? "/open" : ""}`)}
        />
      </div>
    </WorkbenchToolbar>
  )

  if (!shown)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {bar}
        {view === undefined && error ? <WorkbenchEmpty>There is no narrative {id}.</WorkbenchEmpty> : null}
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bar}
      <WorkbenchPage
        title={
          <span className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="size-2 shrink-0 translate-y-[-1px] self-center rounded-full" style={{ background: colorOf(id) }} />
            {shown.title}
          </span>
        }
        meta={<Counts issues={shown.issues} open={shown.open} />}
      >
        {shown.about && <p className="text-foreground/85 -mt-2 max-w-[68ch] text-large">{shown.about}</p>}
        {!shown.issues ? (
          <p className="text-muted-foreground border-t pt-4">No issues on this narrative yet.</p>
        ) : !shown.outline.length ? (
          <p className="text-muted-foreground border-t pt-4">
            Nothing here is open: every issue is done.{" "}
            <button type="button" className="text-foreground underline underline-offset-2 outline-none" onClick={() => go(`/narratives/${id}`)}>
              Show all {shown.issues}
            </button>
          </p>
        ) : (
          <ol ref={list} aria-label={`Issues of ${shown.title}`} className="-mx-2 grid grid-cols-[2.75rem_minmax(0,1fr)_auto] border-t pt-2">
            {visible.map((place, i) => (
              <OutlineRow
                key={place.n}
                place={place}
                color={colorOf(id)}
                branch={branches(shown.outline, shown.outline.indexOf(place))}
                {...(folded.has(place.n) && { folded: hidden(i) })}
                lit={place.n === lit}
                titleOf={titleOf}
                toggle={() => toggle(place.n)}
                open={() => go(`/issues/${place.n}`)}
                here={(n) => aim({ id, n })}
                there={(other, n) => aim({ id: other, n })}
              />
            ))}
          </ol>
        )}
        <Foot />
      </WorkbenchPage>
    </div>
  )
}
