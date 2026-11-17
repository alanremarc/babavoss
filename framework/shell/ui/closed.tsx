// Home's drawer's way into the archive of closed tabs: a line at the foot of its thread, how many there are; their list,
// the latest closed first, each with its surface's icon, its title, when it closed and who closed it, more read as the
// person scrolls down; and a closed tab's log, read only, which the drawer draws as it draws a thread (drawer.tsx). A
// closed tab is never opened again with its state, and its list says so. What it reads, it reads by `read`: the shell's
// door, or a sample's.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { closedLine, closedName, type ClosedTab } from "./thread.ts"

/** Where the archive of closed tabs is read (surface.ts). */
export const CLOSED = "/activity/closed"

/** What the drawer reads the archive by, and the icon a surface's tab has. */
export type Archive = { read: <V>(path: string) => Promise<V>; icon: (surface: string) => ReactNode }

/** A page of the archive: its list, or a closed tab's log, as `field` names it; the page after, where there is one; how many it keeps. */
type Paged = { kept?: number; earlier?: { at: string } } & Record<string, unknown>

/** What is read at `path`, a page at a time, under `field`: what it holds, how many it keeps, and `more`, the next page, where there is one. */
export function usePaged<T>(read: Archive["read"], path: string | undefined, field: string) {
  const [items, setItems] = useState<T[]>([])
  const [kept, setKept] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [next, setNext] = useState<string>()
  const reading = useRef(false)
  const take = useCallback(
    async (at: string, fresh: boolean) => {
      if (reading.current) return
      reading.current = true

      const page = await read<Paged>(at).catch(() => undefined)

      reading.current = false
      setLoaded(true)
      if (!page) return

      const got = Array.isArray(page[field]) ? (page[field] as T[]) : []

      setNext(page.earlier?.at)
      setKept(typeof page.kept === "number" ? page.kept : 0)
      setItems((was) => (fresh ? got : [...was, ...got]))
    },
    [read, field]
  )

  useEffect(() => {
    if (path) void take(path, true)
  }, [path, take])

  return { items, kept, loaded, ...(next !== undefined && { more: () => void take(next, false) }) }
}

/** The line at the foot of home's thread: how many closed tabs the archive keeps, which opens their list. */
export function ClosedLine({ kept, open }: { kept: number; open: () => void }) {
  return (
    <button
      type="button"
      className="mt-2 flex h-row w-full shrink-0 cursor-pointer items-center gap-2 rounded-full border-t border-transparent px-3 text-left text-meta text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/8"
      onClick={open}
    >
      <span className="flex-1 truncate">
        {kept === 1 ? "1 closed tab" : `${kept} closed tabs`}, read only
      </span>
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
    </button>
  )
}

/** The head of a view of the archive, under the island: the way back, what it is, and a line under it. */
export function ArchiveHead({ back, label, title, icon, line }: { back: () => void; label: string; title: string; icon?: ReactNode; line: string }) {
  return (
    <div className="mt-[52px] flex shrink-0 flex-col gap-1.5 border-b border-border/60 px-3 pb-2.5">
      <button
        type="button"
        className="-ml-1.5 flex h-6 w-fit cursor-pointer items-center gap-0.5 rounded-full pr-2 pl-1 text-meta text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:bg-foreground/8"
        onClick={back}
      >
        <ChevronLeftIcon aria-hidden className="size-3.5" />
        {label}
      </button>
      <span className="flex min-w-0 items-center gap-2 px-0.5">
        {icon && <span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/6 text-foreground [&_svg]:size-3.5">{icon}</span>}
        <span className="min-w-0 truncate font-medium text-foreground">{title}</span>
      </span>
      <span className="px-0.5 text-meta text-muted-foreground">{line}</span>
    </div>
  )
}

/** The closed tabs, the latest closed first, each opening its log; more are read as the foot comes into view. */
export function ClosedList({ tabs, loaded, more, icon, open }: { tabs: ClosedTab[]; loaded: boolean; more?: () => void; icon: Archive["icon"]; open: (tab: ClosedTab) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const now = new Date()

  useEffect(() => {
    const element = foot.current

    if (!element || !more) return

    const observer = new IntersectionObserver((seen) => seen.some((s) => s.isIntersecting) && more(), { root: list.current })

    observer.observe(element)

    return () => observer.disconnect()
  }, [more, tabs.length])

  return (
    <div ref={list} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1.5 py-1.5 [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-16px),transparent)]">
      {!loaded ? (
        <p className="py-6 text-center text-meta text-muted-foreground">Reading…</p>
      ) : (
        !tabs.length && <p className="py-6 text-center text-meta text-muted-foreground">No tab has closed yet.</p>
      )}
      {tabs.map((tab) => (
        <button
          key={tab.n}
          type="button"
          className="flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none hover:bg-foreground/6 focus-visible:bg-foreground/8"
          onClick={() => open(tab)}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/6 text-foreground [&_svg]:size-4">
            {icon(tab.surface) ?? <span className="size-2.5 rounded-full bg-foreground/30" aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-foreground">{closedName(tab)}</span>
            <span className="truncate text-meta text-muted-foreground">
              <time dateTime={tab.closed} title={new Date(tab.closed).toLocaleString()}>
                {closedLine(tab, now)}
              </time>
            </span>
          </span>
          <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ))}
      <div ref={foot} aria-hidden className="h-px shrink-0" />
    </div>
  )
}
