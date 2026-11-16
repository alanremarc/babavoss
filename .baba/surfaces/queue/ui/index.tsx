// The queue's page: the session's work in three views, switched from the toolbar at its foot. The list has the open
// issues as one-liners in the sidebar on the right, grouped by where they stand, and the selected one in the content;
// the archive is the same over the issues that are done, grouped by narrative; the map has the issues as a plane of
// narratives in the content, and the selected one, or the narratives, in the sidebar. Both show an issue with the one
// Detail. Which view and what is selected is the tab's route, so a refresh and the agent's pointing land on it:
// /issues/N and /narratives/ID in the list, the same below /map in the map. The person approves or drops a draft here;
// anything else, they tell the agent. `drawers` ask for an issue to add or draft: a title, about as markdown, and where
// there is room for them, what it came out of and its narrative.
import { useEffect, useState } from "react"
import { ListTodoIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, DialogFooter, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Input, Textarea } from "babavoss/kit/index.ts"
import { useLive, useTab, type DrawerProps } from "babavoss/shell/ui/index.tsx"
import { Detail } from "./detail.tsx"
import { Narratives, Plane, type Node } from "./map.tsx"
import { Label, Lane, Line, Mark, Modes, hue, type Lens, type Root, type Row, type Status, type Told, type Whole } from "./parts.tsx"
import { Peek, usePeek } from "./peek.tsx"

export const icon = <ListTodoIcon aria-hidden />

const FIELD = "border-input dark:bg-input/30 h-8 w-full rounded-md border bg-transparent px-2.5 text-body outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3"

/** An issue to add or draft: its title, what it is about as markdown, and for add_from and draft_from its parents and narrative. */
function IssueDrawer({ handle, view, submit, close }: DrawerProps) {
  const [title, setTitle] = useState("")
  const [about, setAbout] = useState("")
  const [from, setFrom] = useState("")
  const [narrative, setNarrative] = useState("")
  const [busy, setBusy] = useState(false)
  const branch = "from" in handle.open
  const drafting = handle.name.startsWith("draft")
  const narratives = ((view as Partial<Root> | undefined)?.narratives ?? []) as Root["narratives"]
  const ready = title.trim() !== "" && about.trim() !== "" && !busy
  const send = async () => {
    if (!ready) return
    setBusy(true)
    await submit(branch ? { title, about, from, narrative } : { title, about }).finally(() => setBusy(false))
  }

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <p className="text-muted-foreground">{drafting ? "A draft waits for your approval before it joins the backlog." : "It joins the bottom of the backlog."}</p>
      <label className="flex flex-col gap-1">
        <span className="text-meta text-muted-foreground">Title</span>
        <Input autoFocus placeholder="A short imperative title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {branch && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-meta text-muted-foreground">Came out of</span>
            <Input placeholder="Issue numbers, as 31, 33" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-meta text-muted-foreground">Narrative</span>
            <select className={FIELD} value={narrative} onChange={(e) => setNarrative(e.target.value)}>
              <option value="">Its first parent's</option>
              {narratives.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-meta text-muted-foreground">About, in markdown</span>
        <Textarea
          rows={12}
          className="min-h-48 font-mono"
          placeholder="What changes and why"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          {drafting ? "Draft" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export const drawers = { add: IssueDrawer, add_from: IssueDrawer, draft: IssueDrawer, draft_from: IssueDrawer }

/** A section of a sidebar: its rows, under a label; `lanes` for the one of the work in lanes, which shows them even when idle. */
type Section = { key: string; label: string; rows: Row[]; lanes?: true; color?: string }
/** What the list shows: the work that is open, by where it stands. */
const OPEN: { status: Status; label: string }[] = [
  { status: "lane", label: "In progress" },
  { status: "backlog", label: "Backlog" },
  { status: "draft", label: "Drafts" },
]
const open = (root: Root): Section[] =>
  OPEN.map(({ status, label }) => ({ key: status, label, rows: root.issues.filter((issue) => issue.status === status), ...(status === "lane" && { lanes: true as const }) }))
/**
 * What the archive shows: the work that is done, by narrative in the narratives' order, newest first within each, as the
 * view lists them. The one place the archive is grouped: another grouping is another function of the root here.
 */
const archive = (root: Root, colorOf: (id: string) => string): Section[] =>
  root.narratives.map((x) => ({ key: x.id, label: x.title, color: colorOf(x.id), rows: root.issues.filter((issue) => issue.status === "done" && issue.narrative === x.id) }))

/** Every narrative's view, kept current: its about, and how many passes each of its issues had, which / does not list. */
function useNarratives(root: Root | undefined) {
  const { live } = useTab()
  const [told, setTold] = useState<Record<string, Told>>({})
  const ats = (root?.narratives ?? []).map((x) => x.at).join(" ")

  useEffect(() => {
    const stops = ats
      .split(" ")
      .filter(Boolean)
      .map((at) => live<Told>(at, (view) => setTold((previous) => ({ ...previous, [view.id]: view }))))

    return () => stops.forEach((stop) => stop())
  }, [live, ats])

  return told
}

/**
 * The issues as a sidebar has them, in sections: the list's by where they stand, the lanes first with how many are busy;
 * the archive's by narrative. A line is the issue's standing as an icon in its narrative's hue, its number and its title;
 * resting on one brings a glance at it. `none` is said where no section has a row.
 */
function Stack({ root, sections, none, picked, colorOf, go }: { root: Root; sections: Section[]; none?: string; picked?: number; colorOf: (id: string) => string; go: (route: string) => void }) {
  const busy = root.lanes - root.free.length
  const peek = usePeek()

  return (
    <div className="py-2" onMouseLeave={peek.out}>
      <Peek peek={peek} root={root} colorOf={colorOf} go={go} />
      {none && !sections.some((section) => section.rows.length) && <p className="text-muted-foreground/70 px-3 py-1 text-body">{none}</p>}
      {sections.map(({ key, label, rows, lanes, color }) => {
        if (!rows.length && !lanes) return null

        return (
          <section key={key} aria-label={label} className="pb-2">
            <h2 className="text-muted-foreground flex h-6 items-center justify-between gap-2 px-3 text-meta font-medium">
              <span className="flex min-w-0 items-center gap-2">
                {color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
                <span className="truncate">{label}</span>
              </span>
              {lanes ? (
                <span className="flex items-center gap-0.5" aria-label={`${busy} of ${root.lanes} lanes busy`}>
                  {Array.from({ length: root.lanes }, (_, i) => (
                    <span key={i} className={`h-1.5 w-3 rounded-full ${root.free.includes(i + 1) ? "bg-border" : "bg-primary"}`} />
                  ))}
                </span>
              ) : (
                <span className="tabular-nums">{rows.length}</span>
              )}
            </h2>
            {!rows.length && <p className="text-muted-foreground/70 px-3 text-body">All lanes idle</p>}
            <ul>
              {rows.map((issue) => (
                <li key={issue.n}>
                  <button
                    type="button"
                    onClick={() => {
                      peek.close()
                      go(`/issues/${issue.n}`)
                    }}
                    onMouseEnter={(event) => peek.over(issue.n, event.currentTarget)}
                    aria-current={issue.n === picked}
                    className="hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground flex h-7 w-full items-center gap-2 px-3 text-left text-body outline-none"
                  >
                    <Mark status={issue.status} color={colorOf(issue.narrative)} />
                    <span className="text-muted-foreground/70 w-7 shrink-0 text-meta tabular-nums">#{issue.n}</span>
                    <span className={`min-w-0 flex-1 truncate ${issue.status === "done" || issue.status === "draft" ? "text-muted-foreground" : ""}`}>{issue.title}</span>
                    {issue.lane && <Lane lane={issue.lane} />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** A narrative in the list's content: what it is about and its issues. */
function Narrative({ told, color, go }: { told: Told; color: string; go: (route: string) => void }) {
  return (
    <article className="flex max-w-3xl flex-col gap-4 p-6">
      <div className="text-muted-foreground flex items-center gap-2 text-body">
        <span className="size-2 rounded-full" style={{ background: color }} />
        Narrative
      </div>
      <h1 className="text-lg leading-snug font-medium">{told.title}</h1>
      {told.about && <p className="text-large text-foreground/85">{told.about}</p>}
      <section className="flex flex-col gap-1 border-t pt-4">
        <Label>Issues · {told.issues.length}</Label>
        <ul className="-mx-1.5 max-w-xl">
          {told.issues.map((row) => (
            <Line key={row.n} to={row} color={color} onPick={() => go(`/issues/${row.n}`)} />
          ))}
        </ul>
      </section>
    </article>
  )
}

export default function Queue() {
  const { view: root, error } = useLive<Root>("/")
  const { call, route, navigate } = useTab()
  const told = useNarratives(root)
  const lens: Lens = (["map", "archive"] as const).find((name) => route === `/${name}` || route.startsWith(`/${name}/`)) ?? "list"
  const prefix = lens === "list" ? "" : `/${lens}`
  const place = route.slice(prefix.length) || "/"
  const named = Number(/^\/issues\/(\d+)$/.exec(place)?.[1]) || undefined
  const focus = /^\/narratives\/([^/]+)$/.exec(place)?.[1]
  const issues = root?.issues ?? []
  const index = new Map((root?.narratives ?? []).map((x, i) => [x.id, i]))
  const colorOf = (id: string) => hue(index.get(id) ?? 0)
  const sections = root ? (lens === "archive" ? archive(root, colorOf) : open(root)) : []
  // The list and the archive always show an issue: the one in the route, else the first their sidebar lists, open work in
  // the list and done in the archive; the map shows one only where the route names it.
  const first = sections.flatMap((section) => section.rows)[0] ?? (lens === "list" ? issues[0] : undefined)
  const picked = issues.find((issue) => issue.n === named)?.n ?? (lens !== "map" && !focus ? first?.n : undefined)
  const { view: whole } = useLive<Whole>(picked ? `/issues/${picked}` : "/")
  const [refused, setRefused] = useState("")
  const go = (to: string) => navigate(prefix ? `${prefix}${to === "/" ? "" : to}` : to)
  // Another view begins at its own first issue, but for the map, which keeps what was selected.
  const switchTo = (next: Lens) => navigate(next === "list" ? "/" : next === "map" ? `/map${place === "/" ? "" : place}` : "/archive")
  const byN = new Map(issues.map((issue) => [issue.n, issue]))
  const nodes: Node[] = issues.map((issue) => ({ ...issue, iterations: told[issue.narrative]?.issues.find((row) => row.n === issue.n)?.iterations ?? 0 }))
  const decide = async (handle: Handle) => {
    const answer = await call(`/issues/${picked}`, handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }
  const shown = picked !== undefined && whole?.n === picked && whole.about !== undefined ? whole : undefined
  const detail = (roomy: boolean) =>
    shown && (
      <Detail
        whole={shown}
        color={colorOf(shown.narrative.id)}
        colorOf={(n) => colorOf(byN.get(n)?.narrative ?? "")}
        laneOf={(n) => byN.get(n)?.lane}
        go={go}
        decide={(handle) => void decide(handle)}
        refused={refused || error}
        roomy={roomy}
      />
    )
  // A new tab that has not heard the session's work yet shows its ground alone: the work it holds is no one's, not none.
  const heard = root && !root.reading ? root : undefined
  const empty = heard && (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No issues</EmptyTitle>
        <EmptyDescription>Tell the agent what to do next.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )

  if (lens === "map")
    return (
      <div className="relative flex min-h-0 flex-1">
        <Modes lens={lens} onLens={switchTo} />
        {issues.length ? (
          <Plane stories={root!.narratives} nodes={nodes} picked={picked} focus={focus} origin="This session's work" colorOf={colorOf} go={go} />
        ) : (
          <main className="flex min-w-0 flex-1 flex-col">{empty}</main>
        )}
        <aside className="bg-muted/30 flex w-96 shrink-0 flex-col overflow-auto border-l" aria-label={shown ? `Issue ${shown.n}` : "Narratives"}>
          {place !== "/" && (
            <div className="bg-muted/30 sticky top-0 z-10 flex h-9 shrink-0 items-center border-b px-2 backdrop-blur">
              <Button variant="ghost" size="sm" className="min-w-0" onClick={() => go(shown && !focus ? `/narratives/${shown.narrative.id}` : "/")}>
                <span className="truncate">← {shown ? shown.narrative.title : "All narratives"}</span>
              </Button>
            </div>
          )}
          {detail(false) ?? (heard && <Narratives root={heard} told={told} focus={focus && told[focus] ? focus : undefined} colorOf={colorOf} go={go} />)}
        </aside>
      </div>
    )

  return (
    <div className="relative flex min-h-0 flex-1">
      <Modes lens={lens} onLens={switchTo} />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {focus && told[focus] ? <Narrative told={told[focus]!} color={colorOf(focus)} go={go} /> : (detail(true) ?? (!issues.length && empty))}
      </main>
      <aside className="bg-muted/30 flex w-80 shrink-0 flex-col overflow-auto border-l" aria-label={lens === "archive" ? "Archive" : "Issues"}>
        {heard && <Stack root={heard} sections={sections} {...(lens === "archive" && { none: "Nothing is done yet" })} picked={focus ? undefined : picked} colorOf={colorOf} go={go} />}
      </aside>
    </div>
  )
}
