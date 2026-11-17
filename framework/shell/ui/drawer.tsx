// A tab's drawer, the same for every tab and for home: 360px over the content, which dims behind it, at the side the rail
// says (rail.ts). Its menu floats at its head as the island (island.tsx), and its activity fills it as a thread
// (thread.ts): newest at the foot, where it opens and stays as entries arrive unless the person scrolled up, its head kept
// clear so the oldest entry can be scrolled out from under the island, earlier entries read as the person scrolls up.
// The thread shows the highlights: each a message bubble under who raised it and when, ringed, where it goes under it, a
// click going there. Every other entry is folded between them where it happened, one line that says how many and by whom,
// opened in place to the entries as they are: a notice a bubble, the person's at the right, tinted, what was done under
// it; calls in a row, or a batch, one small centred line that opens to them; a refusal and a tab entry each one small
// centred line. The fold at the foot glances at its newest entry, faint, so what just happened is there without a click.
// What is opened is forgotten as the drawer closes. That the tab is broken is pinned at the foot with Reload; on home,
// what of the person's waits for the agent's next turn; and at the foot of home's thread, the closed tabs (closed.tsx),
// whose list and each one's log, read only, take the thread's place with a way back. The highlights the person had not
// opened as it opened keep a dot while it stays. Escape, a click outside, or the gesture that opened it closes it; the
// shell gives focus back to the tab. It opens with the cursor in its search.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "../../kit/cn.ts"
import type { MenuItem } from "../../kit/layouts/menu.tsx"
import { ArchiveHead, ClosedLine, ClosedList, CLOSED, usePaged, type Archive } from "./closed.tsx"
import { Island } from "./island.tsx"
import {
  agoOf,
  authorOf,
  batchParts,
  callsLine,
  closedLine,
  closedName,
  didOf,
  foldLine,
  glanceOf,
  itemsOf,
  keyOf,
  lineOf,
  partsOf,
  refusedLine,
  tabLine,
  type ClosedTab,
  type Item,
  type Pinned,
  type Row,
} from "./thread.ts"

/** How far the thread's head is kept clear of entries, so the oldest can be scrolled out from under the open island. */
const HEAD = "pt-[372px]"

const Ago = ({ when }: { when: string }) => (
  <time dateTime={when} title={new Date(when).toLocaleString()} className="tabular-nums opacity-70">
    {agoOf(new Date(when), new Date())}
  </time>
)

export type DrawerProps = {
  /** The tab's title, or the root's on home. */
  label: string
  side: "left" | "right"
  /** Home's drawer, whose entries are the shell's own, each naming its surface. */
  home?: boolean
  menu: { items: MenuItem[]; find?: (query: string) => MenuItem[]; empty?: string }
  /** The tab's entries, newest first; `loaded` once they are read; `more` reads earlier ones, where there are. */
  rows: Row[]
  loaded: boolean
  more?: () => void
  /** The highlights not opened before the drawer opened, which keep a dot while it stays. */
  stay: ReadonlySet<number>
  pinned?: Pinned
  /** On home, the person's calls that wait for the agent's next turn, newest first. */
  waiting?: Row[]
  /** On home, the archive of closed tabs, read by its door. */
  archive?: Archive
  /** Goes where an entry happened; `where` says that place in a few words, none where it is the tab itself. */
  go: (row: Row) => void
  where?: (row: Row) => string | undefined
  /** What it shows as it opens: its thread, unless a specimen asks for a view of the archive. */
  opening?: Body
  reload: () => void
  close: () => void
}

/** What home's drawer shows in the thread's place: its thread, the closed tabs, or one closed tab's log. */
export type Body = { kind: "thread" } | { kind: "closed" } | { kind: "log"; tab: ClosedTab }

export function Drawer({ label, side, home = false, menu, rows, loaded, more, stay, pinned, waiting = [], archive, go, where, opening, reload, close }: DrawerProps) {
  const field = useRef<HTMLInputElement | null>(null)
  const [body, setBody] = useState<Body>(opening ?? { kind: "thread" })
  // The closed tabs are read as the drawer opens, for the line at the thread's foot, and again as their list is shown: its
  // path changes by what is shown, past the part the door reads.
  const closed = usePaged<ClosedTab>(archive?.read ?? none, archive && body.kind !== "log" ? `${CLOSED}#${body.kind}` : undefined, "tabs")

  useEffect(() => {
    field.current?.focus()
  }, [])

  return (
    <>
      <button type="button" aria-label="Close the drawer" tabIndex={-1} className="absolute inset-0 z-30 cursor-default bg-background/40 duration-150 animate-in fade-in-0 motion-reduce:animate-none" onClick={close} />
      <aside
        role="dialog"
        aria-label={`${label}: its menu and its activity`}
        data-drawer={side}
        className={cn(
          "absolute inset-y-0 z-40 flex w-[360px] max-w-[calc(100%-24px)] flex-col border-border/60 bg-background text-body shadow-xl duration-150 animate-in fade-in-0 motion-reduce:animate-none",
          side === "left" ? "left-0 border-r slide-in-from-left-2" : "right-0 border-l slide-in-from-right-2"
        )}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.defaultPrevented) return
          e.preventDefault()
          e.stopPropagation()
          close()
        }}
      >
        <Island
          items={menu.items}
          {...(menu.find && { find: menu.find })}
          {...(menu.empty && { empty: menu.empty })}
          label={`Menu for ${label}`}
          done={close}
          field={(input) => void (field.current = input)}
        />
        {body.kind === "thread" && (
          <>
            <Thread
              label={label}
              home={home}
              rows={rows}
              loaded={loaded}
              {...(more && { more })}
              stay={stay}
              go={go}
              {...(where && { where })}
              settle={`${pinned?.text ?? ""} ${waiting.length} ${closed.kept}`}
              after={archive && closed.kept > 0 && <ClosedLine kept={closed.kept} open={() => setBody({ kind: "closed" })} />}
            />
            {(pinned || waiting.length > 0) && (
              <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
                {waiting.length > 0 && <Waiting rows={waiting} />}
                {pinned && <Pin pinned={pinned} reload={reload} />}
              </div>
            )}
          </>
        )}
        {archive && body.kind === "closed" && (
          <>
            <ArchiveHead back={() => setBody({ kind: "thread" })} label={`Back to ${label}`} title="Closed tabs" line="Read only: a closed tab is never opened again with its state." />
            <ClosedList tabs={closed.items} loaded={closed.loaded} {...(closed.more && { more: closed.more })} icon={archive.icon} open={(tab) => setBody({ kind: "log", tab })} />
          </>
        )}
        {archive && body.kind === "log" && <ClosedLog archive={archive} tab={body.tab} back={() => setBody({ kind: "closed" })} />}
      </aside>
    </>
  )
}

/** No archive: nothing is read. */
const none = <V,>(): Promise<V> => Promise.reject(new Error("no archive"))

/** A closed tab's log, read only, as a thread: its head says what it was, when it closed and by whom, with the way back. */
function ClosedLog({ archive, tab, back }: { archive: Archive; tab: ClosedTab; back: () => void }) {
  const log = usePaged<Row>(archive.read, tab.at, "entries")
  const name = closedName(tab)

  return (
    <>
      <ArchiveHead back={back} label="Closed tabs" title={name} icon={archive.icon(tab.surface)} line={`${closedLine(tab, new Date())} · read only`} />
      <Thread label={name} home={false} rows={log.items} loaded={log.loaded} {...(log.more && { more: log.more })} stay={EMPTY} head="pt-2" settle="" />
    </>
  )
}

const EMPTY: ReadonlySet<number> = new Set()

/**
 * A thread: its highlights, and the folds between them, newest at the foot. `go` goes where an entry happened, none in a
 * closed tab's log; `after` stands at its foot, under the newest; `settle` changes as what stands under it does, which
 * keeps the foot in view.
 */
export function Thread({
  label,
  home,
  rows,
  loaded,
  more,
  stay,
  go,
  where,
  after,
  head = HEAD,
  settle,
}: {
  label: string
  home: boolean
  rows: Row[]
  loaded: boolean
  more?: () => void
  stay: ReadonlySet<number>
  go?: (row: Row) => void
  where?: (row: Row) => string | undefined
  after?: ReactNode
  head?: string
  settle: string
}) {
  const thread = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  // Whether the person is at the foot, where the thread stays as entries arrive; and how tall it was, to hold the place when earlier ones come in above.
  const atFoot = useRef(true)
  const was = useRef({ height: 0, newest: 0 })
  // The entries of the folds the person opened: a fold is open while any of them is in it, as it grows.
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())
  const parts = partsOf(rows)
  const newest = rows[0]?.n ?? 0

  useLayoutEffect(() => {
    const element = thread.current

    if (!element) return
    if (atFoot.current) element.scrollTop = element.scrollHeight
    // Earlier entries came in above, the newest the same: what the person looked at stays where it was.
    else if (was.current.newest === newest) element.scrollTop += element.scrollHeight - was.current.height
    was.current = { height: element.scrollHeight, newest }
  }, [rows.length, newest, settle])

  // Earlier entries are read as the head of the thread comes into view, until there are none or it is out of view.
  useEffect(() => {
    const element = top.current

    if (!element || !more || !loaded) return

    const observer = new IntersectionObserver((seen) => seen.some((s) => s.isIntersecting) && more(), { root: thread.current })

    observer.observe(element)

    return () => observer.disconnect()
  }, [more, loaded, rows.length])

  const flip = (fold: Row[], open: boolean) =>
    setOpened((was) => {
      const now = new Set(was)

      for (const r of fold) open ? now.add(r.n) : now.delete(r.n)

      return now
    })

  return (
    <div
      ref={thread}
      role="log"
      aria-label={`What happened in ${label}, newest last`}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin]",
        "[mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%-16px),transparent)]",
        head
      )}
      onScroll={(e) => {
        const element = e.currentTarget

        atFoot.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
      }}
    >
      <div className="mt-auto flex flex-col gap-2.5">
        <div ref={top} aria-hidden className="h-px" />
        {!loaded ? (
          <p className="py-6 text-center text-meta text-muted-foreground">Reading…</p>
        ) : (
          !parts.length && <p className="py-6 text-center text-meta text-muted-foreground">Nothing has happened {home ? "here" : `in ${label}`} yet.</p>
        )}
        {[...parts].reverse().map((part, i, all) =>
          part.kind === "highlight" ? (
            <Notice
              key={keyOf(part)}
              row={part.row}
              author={authorOf(part.row.who, part.row.by, home ? part.row.surface : label)}
              fresh={stay.has(part.row.n)}
              {...(where?.(part.row) && { where: where(part.row) })}
              {...(go && { go: () => go({ ...part.row, at: part.row.saidAt ?? part.row.at }) })}
            />
          ) : (
            <Fold
              key={keyOf(part)}
              rows={part.rows}
              open={part.rows.some((r) => opened.has(r.n))}
              flip={(open) => flip(part.rows, open)}
              glance={i === all.length - 1}
              label={label}
              home={home}
              {...(go && { go })}
            />
          )
        )}
        {after}
      </div>
    </div>
  )
}

/**
 * The ordinary entries between two highlights, folded: one line, how many and by whom, between hairlines, which opens
 * them in place; the fold at the foot, `glance`, shows its newest entry's line under it, faint, until it is opened.
 */
export function Fold({ rows, open, flip, glance, label, home, go }: { rows: Row[]; open: boolean; flip: (open: boolean) => void; glance: boolean; label: string; home: boolean; go?: (row: Row) => void }) {
  const items = itemsOf(rows)
  const newest = rows[0]!

  return (
    <div className="flex flex-col gap-2" data-fold={open ? "open" : "folded"}>
      <button type="button" aria-expanded={open} className="group flex w-full cursor-pointer items-center gap-2 outline-none" onClick={() => flip(!open)}>
        <span aria-hidden className="h-px min-w-3 flex-1 bg-border/70" />
        <span className="flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-meta text-muted-foreground group-hover:bg-foreground/6 group-hover:text-foreground group-focus-visible:bg-foreground/8 group-focus-visible:text-foreground">
          <ChevronRightIcon aria-hidden className={cn("size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
          <span className="truncate">{foldLine(rows)}</span>
        </span>
        <span aria-hidden className="h-px min-w-3 flex-1 bg-border/70" />
      </button>
      {glance && !open && (
        <button
          type="button"
          tabIndex={-1}
          title="Open the fold"
          className="-mt-1.5 cursor-pointer truncate px-4 text-center text-meta text-muted-foreground/60 outline-none hover:text-muted-foreground"
          onClick={() => flip(true)}
        >
          {glanceOf(newest, home)} · <Ago when={newest.when} />
        </button>
      )}
      {open && [...items].reverse().map((item) => <Line key={keyOf(item)} item={item} label={label} home={home} {...(go && { go })} />)}
    </div>
  )
}

/** One line of an opened fold: a notice's bubble, calls or a batch folded into one line, a refusal, or a tab entry. */
export function Line({ item, label, home, go }: { item: Item; label: string; home: boolean; go?: (row: Row) => void }) {
  const [open, setOpen] = useState(false)

  if (item.kind === "notice")
    return (
      <Notice
        row={item.row}
        author={authorOf(item.row.who, item.row.by, home ? item.row.surface : label)}
        fresh={false}
        {...(go && { go: () => go({ ...item.row, at: item.row.saidAt ?? item.row.at }) })}
      />
    )
  if (item.kind === "refused")
    return (
      <p className="py-1 text-center text-meta break-words text-muted-foreground/80">
        {refusedLine(item.row)} · <Ago when={item.row.when} />
      </p>
    )
  if (item.kind === "tab")
    return (
      <p className="py-1 text-center text-meta text-muted-foreground/80">
        {tabLine(item.row, home)} · <Ago when={item.row.when} />
      </p>
    )

  const first = item.rows[0]!
  const batch = item.kind === "batch" ? batchParts(item) : undefined

  return (
    <div className="flex flex-col items-center gap-1 py-0.5">
      <button
        type="button"
        aria-expanded={open}
        className="max-w-full cursor-pointer rounded-full px-2 py-0.5 text-center text-meta text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/8"
        onClick={() => setOpen(!open)}
      >
        {item.kind === "calls" ? callsLine(item) : batch!.head}
        {batch?.stop && <span className="text-destructive/90">, {batch.stop}</span>} · <Ago when={first.when} />
      </button>
      {open &&
        (item.kind === "calls" ? (
          <div className="flex w-full flex-col gap-0.5 rounded-lg bg-foreground/4 px-2.5 py-1.5">
            {[...item.rows].reverse().map((row) => (
              <span key={row.n} className="font-mono text-meta break-words text-muted-foreground">
                {didOf(row)}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 rounded-xl bg-foreground/4 p-2">
            {[...itemsOf(item.rows, false)].reverse().map((inner) => (
              <Line key={keyOf(inner)} item={inner} label={label} home={home} {...(go && { go })} />
            ))}
          </div>
        ))}
    </div>
  )
}

/**
 * A notice as a message: its author and time above, its words in a bubble that goes where it happened, where it can; the
 * person's at the right, tinted; a highlight ringed and named so, with where it goes under it in place of what was done.
 */
export function Notice({ row, author, fresh, where, go }: { row: Row; author: string; fresh: boolean; where?: string; go?: () => void }) {
  const mine = row.who === "person"
  // The agent's own highlight says nothing its words do not: what was done is said only of a surface's.
  const did = row.did && !(row.highlight && row.did.startsWith("highlight ")) ? didOf(row) : undefined
  const under = [where && `→ ${where}`, did].filter(Boolean).join(" · ")
  const words = row.said!.map((text, i) => (
    <span key={i} className="block">
      {text}
    </span>
  ))
  const bubble = cn(
    "max-w-[85%] rounded-2xl px-3 py-2 text-left leading-snug wrap-anywhere text-foreground",
    mine ? "rounded-br-md bg-primary/15" : "rounded-bl-md bg-foreground/6",
    row.highlight && "bg-primary/10 ring-1 ring-primary/40"
  )

  return (
    <div className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")} data-highlight={row.highlight || undefined}>
      <span className="flex items-center gap-1.5 px-1 text-meta text-muted-foreground">
        {fresh && <span aria-label="new" className="size-1.5 rounded-full bg-primary" />}
        {row.highlight && <span className="font-medium text-primary">Highlight</span>}
        <span>{author}</span>
        <Ago when={row.when} />
      </span>
      {go ? (
        <button
          type="button"
          title={where ? `Go to ${where}` : "Go where this happened"}
          className={cn(bubble, "cursor-pointer outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/60 dark:hover:brightness-125")}
          onClick={go}
        >
          {words}
        </button>
      ) : (
        <div className={bubble}>{words}</div>
      )}
      {under && (
        <span className="max-w-[85%] truncate px-1 font-mono text-badge text-muted-foreground/80" title={under}>
          {under}
        </span>
      )}
    </div>
  )
}

/** What is pinned at the foot: that the tab is broken, and Reload. */
export function Pin({ pinned, reload }: { pinned: Pinned; reload: () => void }) {
  const { does } = pinned

  return (
    <div role="status" className="flex items-start gap-2 rounded-2xl bg-destructive/8 px-3 py-2 ring-1 ring-destructive/20">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-destructive">{pinned.text}</span>
        {pinned.detail && <span className="text-meta break-words text-muted-foreground">{pinned.detail}</span>}
      </span>
      {does && (
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-meta font-medium text-primary outline-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-ring/60"
          onClick={reload}
        >
          {does.label}
        </button>
      )}
    </div>
  )
}

/** On home, the person's calls that wait for the agent's next turn: how many, which open to each, set in type for code. */
export function Waiting({ rows }: { rows: Row[] }): ReactNode {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-foreground/5 px-3 py-2">
      <button type="button" aria-expanded={open} className="cursor-pointer text-left outline-none focus-visible:underline" onClick={() => setOpen(!open)}>
        The agent sees {rows.length === 1 ? "1 change" : `${rows.length} changes`} of yours <span className="text-muted-foreground">with your next message</span>
      </button>
      {open &&
        rows.map((row) => (
          <span key={row.n} className="font-mono text-meta break-words text-muted-foreground">
            {lineOf(row)}
          </span>
        ))}
    </div>
  )
}
