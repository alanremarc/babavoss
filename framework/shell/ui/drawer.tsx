// A tab's drawer, the same for every tab and for home: 360px over the content, which dims behind it, at the side the rail
// says (rail.ts). Its menu floats at its head as the island (island.tsx), and its activity fills it as a thread
// (thread.ts): newest at the foot, where it opens and stays as entries arrive unless the person scrolled up, its head kept
// clear so the oldest entry can be scrolled out from under the island, earlier entries read as the person scrolls up. A
// notice is a message bubble under its author and time, the person's at the right, tinted; calls in a row by one author
// are one small centred line that opens to them; a tab entry is one small centred line. What the tab needs, or that it is
// broken, is pinned at the foot with its one action; on home, what of the person's waits for the agent's next turn, and
// that the session's hooks are not heard. The notices that were new as it opened keep a dot while it stays. Escape, a
// click outside, or the gesture that opened it closes it; the shell gives focus back to the tab. It opens with the cursor
// in its search.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "../../kit/cn.ts"
import type { MenuItem } from "../../kit/layouts/menu.tsx"
import { Island } from "./island.tsx"
import { agoOf, authorOf, callsLine, itemsOf, keyOf, tabLine, type Item, type Pinned, type Row } from "./thread.ts"

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
  /** The notices new as the drawer opened, which keep a dot while it stays. */
  stay: ReadonlySet<number>
  pinned?: Pinned
  /** On home, the person's calls that wait for the agent's next turn, newest first. */
  waiting?: Row[]
  /** Goes where an entry happened, or to a place in the tab, as Go there does. */
  go: (row: Row) => void
  goThere: (at: string) => void
  reload: () => void
  close: () => void
}

export function Drawer({ label, side, home = false, menu, rows, loaded, more, stay, pinned, waiting = [], go, goThere, reload, close }: DrawerProps) {
  const thread = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement | null>(null)
  // Whether the person is at the foot, where the thread stays as entries arrive; and how tall it was, to hold the place when earlier ones come in above.
  const atFoot = useRef(true)
  const was = useRef({ height: 0, newest: 0 })
  const items = itemsOf(rows)
  const newest = rows[0]?.n ?? 0

  useEffect(() => {
    field.current?.focus()
  }, [])

  useLayoutEffect(() => {
    const element = thread.current

    if (!element) return
    if (atFoot.current) element.scrollTop = element.scrollHeight
    // Earlier entries came in above, the newest the same: what the person looked at stays where it was.
    else if (was.current.newest === newest) element.scrollTop += element.scrollHeight - was.current.height
    was.current = { height: element.scrollHeight, newest }
  }, [rows.length, newest, pinned?.text, waiting.length])

  // Earlier entries are read as the head of the thread comes into view, until there are none or it is out of view.
  useEffect(() => {
    const element = top.current

    if (!element || !more || !loaded) return

    const observer = new IntersectionObserver((seen) => seen.some((s) => s.isIntersecting) && more(), { root: thread.current })

    observer.observe(element)

    return () => observer.disconnect()
  }, [more, loaded, rows.length])

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
        <div
          ref={thread}
          role="log"
          aria-label={`What happened in ${label}, newest last`}
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin]",
            "[mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%-16px),transparent)]",
            HEAD
          )}
          onScroll={(e) => {
            const element = e.currentTarget

            atFoot.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
          }}
        >
          <div className="mt-auto flex flex-col gap-2">
            <div ref={top} aria-hidden className="h-px" />
            {!loaded ? (
              <p className="py-6 text-center text-meta text-muted-foreground">Reading…</p>
            ) : (
              !items.length && <p className="py-6 text-center text-meta text-muted-foreground">Nothing has happened {home ? "here" : `in ${label}`} yet.</p>
            )}
            {[...items].reverse().map((item) => (
              <Line key={keyOf(item)} item={item} label={label} home={home} fresh={item.kind === "notice" && stay.has(item.row.n)} go={go} />
            ))}
          </div>
        </div>
        {(pinned || waiting.length > 0) && (
          <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
            {waiting.length > 0 && <Waiting rows={waiting} />}
            {pinned && <Pin pinned={pinned} reload={reload} goThere={goThere} />}
          </div>
        )}
      </aside>
    </>
  )
}

/** One line of the thread: a notice's bubble, calls folded into one line, or a tab entry. */
export function Line({ item, label, home, fresh, go }: { item: Item; label: string; home: boolean; fresh: boolean; go: (row: Row) => void }) {
  const [open, setOpen] = useState(false)

  if (item.kind === "notice") return <Notice row={item.row} author={authorOf(item.row.who, home ? item.row.surface : label)} fresh={fresh} go={() => go(item.row)} />
  if (item.kind === "tab")
    return (
      <p className="py-1 text-center text-meta text-muted-foreground/80">
        {tabLine(item.row, home)} · <Ago when={item.row.when} />
      </p>
    )

  const first = item.rows[0]!

  return (
    <div className="flex flex-col items-center gap-1 py-0.5">
      <button
        type="button"
        aria-expanded={open}
        className="cursor-pointer rounded-full px-2 py-0.5 text-meta text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/8"
        onClick={() => setOpen(!open)}
      >
        {callsLine(item, label)} · <Ago when={first.when} />
      </button>
      {open && (
        <div className="flex w-full flex-col gap-0.5 rounded-lg bg-foreground/4 px-2.5 py-1.5">
          {[...item.rows].reverse().map((row) => (
            <span key={row.n} className="font-mono text-meta break-words text-muted-foreground">
              {row.what}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** A notice as a message: its author and time above, its words in a bubble that goes where it happened; the person's at the right, tinted. */
export function Notice({ row, author, fresh, go }: { row: Row; author: string; fresh: boolean; go: () => void }) {
  const mine = row.who === "person"

  return (
    <div className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}>
      <span className="flex items-center gap-1.5 px-1 text-meta text-muted-foreground">
        {fresh && <span aria-label="new" className="size-1.5 rounded-full bg-primary" />}
        <span>{author}</span>
        <Ago when={row.when} />
      </span>
      <button
        type="button"
        title="Go where this happened"
        className={cn(
          "max-w-[85%] cursor-pointer rounded-2xl px-3 py-2 text-left leading-snug wrap-anywhere text-foreground outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/60 dark:hover:brightness-125",
          mine ? "rounded-br-md bg-primary/15" : "rounded-bl-md bg-foreground/6"
        )}
        onClick={go}
      >
        {row.what}
      </button>
    </div>
  )
}

/** What is pinned at the foot: why the tab is marked, and its one action. */
export function Pin({ pinned, reload, goThere }: { pinned: Pinned; reload: () => void; goThere: (at: string) => void }) {
  const { does } = pinned

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-2xl px-3 py-2",
        pinned.tone === "broken" ? "bg-destructive/8 ring-1 ring-destructive/20" : pinned.tone === "person" ? "bg-primary/10 ring-1 ring-primary/20" : "bg-foreground/5"
      )}
    >
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", pinned.tone === "broken" ? "bg-destructive" : pinned.tone === "person" ? "bg-primary" : "bg-muted-foreground/70")} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn(pinned.tone === "broken" && "text-destructive")}>{pinned.text}</span>
        {pinned.detail && <span className="text-meta break-words text-muted-foreground">{pinned.detail}</span>}
      </span>
      {does && (
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-meta font-medium text-primary outline-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-ring/60"
          onClick={() => (does.label === "Reload" ? reload() : goThere(does.at))}
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
            {row.what}
          </span>
        ))}
    </div>
  )
}
