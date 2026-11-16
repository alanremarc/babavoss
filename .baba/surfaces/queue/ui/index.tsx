// The queue's page: the session's work in three views, switched from the toolbar at its foot. The list has the open
// issues as one-liners in the sidebar on the right, grouped by where they stand, and the selected one in the content;
// the archive is the same over the issues that are done, grouped by narrative; the narratives are a list, and a page for
// each with its issues as an outline (narratives.tsx), from which an issue opens in the list. Which view and what is
// selected is the tab's route, the same as the views' paths, so a refresh and the agent's pointing land on it: /issues/N
// in the list, below /archive in the archive, /narratives, /narratives/ID and /narratives/ID/open. The person approves or drops a draft here;
// anything else, they tell the agent. `drawers` ask for an issue to add or draft: a title, about as markdown, and where
// there is room for them, what it came out of and its narrative.
import { useEffect, useState } from "react"
import { ListTodoIcon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, DialogFooter, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Input, Textarea } from "babavoss/kit/index.ts"
import { useLive, useTab, type DrawerProps } from "babavoss/shell/ui/index.tsx"
import { Detail } from "./detail.tsx"
import { Narrative, Narratives, type Target } from "./narratives.tsx"
import { Lane, Mark, Modes, hue, type Lens, type Root, type Row, type Status, type Whole } from "./parts.tsx"
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

/** How long an issue a link led to stays lit on its narrative's page. */
const LIT_MS = 2400

export default function Queue() {
  const { view: root, error } = useLive<Root>("/")
  const { call, route, navigate } = useTab()
  const lens: Lens = route === "/narratives" || route.startsWith("/narratives/") ? "narratives" : route === "/archive" || route.startsWith("/archive/") ? "archive" : "list"
  const prefix = lens === "archive" ? "/archive" : ""
  const place = route.slice(prefix.length) || "/"
  const named = Number(/^\/issues\/(\d+)$/.exec(place)?.[1]) || undefined
  const narrated = /^\/narratives\/([^/]+)(\/open)?$/.exec(route)
  const issues = root?.issues ?? []
  const index = new Map((root?.narratives ?? []).map((x, i) => [x.id, i]))
  const colorOf = (id: string) => hue(index.get(id) ?? 0)
  const sections = root ? (lens === "archive" ? archive(root, colorOf) : open(root)) : []
  // The list and the archive always show an issue: the one in the route, else the first their sidebar lists, open work in
  // the list and done in the archive.
  const first = sections.flatMap((section) => section.rows)[0] ?? (lens === "list" ? issues[0] : undefined)
  const picked = lens === "narratives" ? undefined : (issues.find((issue) => issue.n === named)?.n ?? first?.n)
  const { view: whole } = useLive<Whole>(picked ? `/issues/${picked}` : "/")
  const [refused, setRefused] = useState("")
  const [target, setTarget] = useState<Target>()
  // An issue opens in the view it is picked in; a narrative's page is where it is in every view.
  const go = (to: string) => navigate(to.startsWith("/issues/") ? `${prefix}${to}` : to)
  const aim = (next: Target) => {
    setTarget(next)
    if (narrated?.[1] !== next.id) navigate(`/narratives/${next.id}`)
  }
  // Another view begins at its own first place.
  const switchTo = (next: Lens) => navigate(next === "list" ? "/" : `/${next}`)
  const byN = new Map(issues.map((issue) => [issue.n, issue]))

  useEffect(() => {
    if (!target) return

    const timer = setTimeout(() => setTarget(undefined), LIT_MS)

    return () => clearTimeout(timer)
  }, [target])

  const decide = async (handle: Handle) => {
    const answer = await call(`/issues/${picked}`, handle.name, handle.args)

    setRefused(answer.outcome === "refused" ? answer.reason : "")
  }
  const shown = picked !== undefined && whole?.n === picked && whole.about !== undefined ? whole : undefined
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

  if (lens === "narratives")
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Modes lens={lens} onLens={switchTo} />
        {heard &&
          (narrated ? (
            <Narrative id={narrated[1]!} only={!!narrated[2]} root={heard} colorOf={colorOf} go={navigate} target={target} aim={aim} />
          ) : (
            <Narratives root={heard} colorOf={colorOf} go={navigate} />
          ))}
      </div>
    )

  return (
    <div className="relative flex min-h-0 flex-1">
      <Modes lens={lens} onLens={switchTo} />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {(shown && (
          <Detail
            whole={shown}
            color={colorOf(shown.narrative.id)}
            colorOf={(n) => colorOf(byN.get(n)?.narrative ?? "")}
            laneOf={(n) => byN.get(n)?.lane}
            go={go}
            decide={(handle) => void decide(handle)}
            refused={refused || error}
          />
        )) ??
          (!issues.length && empty)}
      </main>
      <aside className="bg-muted/30 flex w-80 shrink-0 flex-col overflow-auto border-l" aria-label={lens === "archive" ? "Archive" : "Issues"}>
        {heard && <Stack root={heard} sections={sections} {...(lens === "archive" && { none: "Nothing is done yet" })} picked={picked} colorOf={colorOf} go={go} />}
      </aside>
    </div>
  )
}
