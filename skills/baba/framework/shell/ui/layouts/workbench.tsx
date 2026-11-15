// The workbench: a util's working layout for professional work, editors, inspectors, anything that navigates many
// things and works on one at a time, often in a narrow window beside the agent's chat. Three parts, each with one role:
// - The menu bar: the scope's menu, named by the open one, to switch scopes or return to the welcome page; the util's
//   own menus; and View, the workbench's, with every tool and Reset layout. Every action of the util and the frame is
//   in a menu.
// - Toolbars: each one stack of the util's tools (navigation, details, problems, settings), every tool in exactly one.
//   A toolbar pins to an edge, at most one per edge, or floats over the content. Collapsed, it is a strip of icons and
//   a tool opens beside it, against its edge; expanded, its tools stack along it, each resizable and folding to its title
//   bar from a click on its title or icon; on a side, a tool that fits starts as tall as what it holds, up to a share of
//   the toolbar, and the others share the rest. The person arranges them: a tool dragged by its header or icon goes among another
//   toolbar's tools, to an edge (joining the toolbar there), or off on its own as a new floating toolbar; a floating
//   toolbar dragged by its grip moves, pins to an edge or merges into another, and sized from its corner collapses
//   past a threshold. A right click offers the same, for the tool and the toolbar: detach, move, collapse or expand,
//   float, pin, merge. A pinned toolbar has no grip; it floats only from that menu.
// - The content: the strip of open documents and the active one's content, which draws its own toolbar and scrolls
//   itself. Opening adds a document or focuses the open one; only the person closes it.
// A util with several scopes (projects, repositories) works in one at a time; with none open, the content is the
// welcome page that lists them, and the tools are still at hand.
// The frame takes data, not markup: menus, tools, their actions and documents are typed. Only the content, and each
// tool's, are free-form, built from the parts so every util reads alike. Sizes are the theme's tokens (defaults.css).
// The layout and the open documents (per scope) are the person's presentation: kept in this browser, never on the surface.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { GripHorizontalIcon, GripVerticalIcon, SearchIcon, XIcon } from "lucide-react"
import { ContextMenu as Context } from "radix-ui"
import { Group, Panel, useDefaultLayout, type PanelImperativeHandle } from "react-resizable-panels"
import { Popover, PopoverAnchor, PopoverContent } from "../components/popover"
import { useTab } from "../tab.tsx"
import { BAND, EXPANDED, STRIP, UNFOLD, edges, moveBar, moveTool, names, ordered, settle, type Bar, type Drop, type Edge, type Float } from "./arrange.ts"
import { ContextKit, MenuBar, MenuItems, menuContent, type Menu, type MenuItem } from "./menu.tsx"
import {
  bar,
  Dismiss,
  iconButton,
  muted,
  ring,
  SearchField,
  WorkbenchButton,
  WorkbenchEmpty,
  WorkbenchSplitter,
  type WorkbenchAction,
  type WorkbenchIcon,
} from "./parts.tsx"
import { scopeMenu, Welcome, type Scopes } from "./welcome.tsx"

/**
 * A tool's filter, the first action of its header: a search button that opens a field across the whole header, closed
 * with the cross beside it or Escape, which clear it. While it holds text it stays open.
 */
export type WorkbenchFilter = { label: string; value: string; set: (value: string) => void }

/**
 * One tool of a toolbar: its icon, its header's actions and its content. A job tool works on what the util is about
 * (its routes, an item's details, its problems); a `meta` tool is about the tool itself (settings) and sits at the
 * toolbar's end. `badge` is a count or short mark on its icon and header, worth a glance; `tone: "error"` marks trouble.
 * `title` stands in its header for the label, such as a picker of the one thing of many the tool is about. A tool that
 * `fit`s holds a few rows: stacked with others in a toolbar on a side, it starts as long as they are, up to a share of
 * the toolbar, and keeps its length as the toolbar's changes; the tools that do not share the rest. Sized by the person,
 * it is as they left it.
 */
export type WorkbenchTool = {
  id: string
  label: string
  icon: WorkbenchIcon
  title?: ReactNode
  meta?: boolean
  fit?: boolean
  badge?: { value: string | number; tone?: "error" }
  filter?: WorkbenchFilter
  actions?: WorkbenchAction[]
  content: ReactNode
}

/** How an open document reads in the strip, as its row reads in a tool; `title` names it where the label is not plain
 * words. `attention` marks one with something to look at. */
export type WorkbenchDocument = { label: ReactNode; title?: string; attention?: boolean }

/**
 * The open documents: `active` is the one in view, which the util decides (its route, or the shared selection); the
 * workbench keeps which are open. `open` shows another, or nothing once the last one closes; `empty` is what the content
 * says then.
 */
export type WorkbenchDocuments = { active?: string; describe: (id: string) => WorkbenchDocument; open: (id: string | undefined) => void; empty: ReactNode }

// Kept in this browser.

/** A value kept in this browser under `key`, following changes made in its other windows. */
function useStored<T extends object>(key: string, defaults: T) {
  const [initial] = useState(defaults)
  const read = () => {
    try {
      return { ...initial, ...JSON.parse(localStorage.getItem(key) ?? "{}") } as T
    } catch {
      return initial
    }
  }
  const [value, setValue] = useState<T>(read)
  const update = (next: (current: T) => T) =>
    setValue((current) => {
      const changed = next(current)

      try {
        localStorage.setItem(key, JSON.stringify(changed))
      } catch {
        /* It still changes for this session without browser storage. */
      }

      return changed
    })

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === key && event.newValue) setValue(read())
    }

    window.addEventListener("storage", sync)

    return () => window.removeEventListener("storage", sync)
  })

  return [value, update] as const
}

/** The open documents, which this browser keeps per tab and scope; the one in view joins them as it changes. */
function useOpened(key: string, documents?: WorkbenchDocuments) {
  const [opened, update] = useStored<{ ids: string[] }>(key, { ids: [] })
  const active = documents?.active
  // A document just closed stays closed while the util still names it, until the util moves on.
  const closed = useRef<string>(undefined)

  useEffect(() => {
    if (active !== closed.current) closed.current = undefined
    if (active === undefined || active === closed.current) return
    update((current) => (current.ids.includes(active) ? current : { ids: [...current.ids, active] }))
  }, [active]) // `update` is new each render; only `active` moves it

  const close = (id: string) => {
    const at = opened.ids.indexOf(id)
    const rest = opened.ids.filter((x) => x !== id)

    update((current) => ({ ids: current.ids.filter((x) => x !== id) }))
    if (id === active) {
      closed.current = id
      documents?.open(rest[at] ?? rest[at - 1])
    }
  }

  return { ids: opened.ids, close }
}

function Strip({ documents, opened }: { documents: WorkbenchDocuments; opened: ReturnType<typeof useOpened> }) {
  const current = useRef<HTMLButtonElement>(null)

  // Newer browsers return a promise from scrollIntoView; an effect may return only its clean-up.
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [documents.active])

  // Arrows move between documents and show the one reached; Home and End go to either end.
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const to = ({ ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: all.length - 1 } as Record<string, number>)[event.key]

    if (at < 0 || to === undefined || !all[to]) return
    event.preventDefault()
    all[to].focus()
    documents.open(opened.ids[to])
  }

  // The strip's bottom edge is drawn inside it, so the active document's background covers it and joins its content.
  return (
    <div className={`${bar} bg-sidebar shadow-[inset_0_-1px_0_var(--border)]`}>
      <div role="tablist" aria-label="Open documents" className="flex min-w-0 flex-1 [scrollbar-width:none] self-stretch overflow-x-auto" onKeyDown={move}>
        {opened.ids.map((id, i) => {
          const { label: name, title, attention } = documents.describe(id)
          const active = id === documents.active

          return (
            <div
              key={id}
              className={`group flex max-w-56 shrink-0 items-center gap-1 border-r ${active ? "bg-background text-foreground" : `${muted} hover:bg-foreground/4 hover:text-foreground`}`}
            >
              <button
                ref={active ? current : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={title}
                title={title}
                tabIndex={active || (!opened.ids.includes(documents.active ?? "") && i === 0) ? 0 : -1}
                className="flex h-full min-w-0 items-center gap-1.5 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                onClick={() => documents.open(id)}
                onAuxClick={(event) => event.button === 1 && opened.close(id)}
              >
                <span className="truncate">{name}</span>
                {attention && <span aria-label="needs attention" className="size-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
              <button
                type="button"
                aria-label={`Close ${title ?? id}`}
                className={`mr-1.5 grid size-4 shrink-0 place-items-center rounded-sm ${ring} group-hover:opacity-100 hover:bg-foreground/10 focus-visible:opacity-100 ${active ? "opacity-100" : "opacity-0"}`}
                onClick={() => opened.close(id)}
              >
                <XIcon aria-hidden className="size-glyph" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The content within a scope: its open documents, which this browser keeps per scope, and the active one's content. */
function Editor({ address, scope, documents, main }: { address: string; scope?: string; documents?: WorkbenchDocuments; main: ReactNode }) {
  const opened = useOpened(`babavoss.documents.${address}${scope === undefined ? "" : `.${scope}`}`, documents)

  return (
    <>
      {documents && <Strip documents={documents} opened={opened} />}
      <div className="flex min-h-0 flex-1 flex-col">
        {documents && documents.active === undefined ? <WorkbenchEmpty>{documents.empty}</WorkbenchEmpty> : main}
      </div>
    </>
  )
}

/** A tool's count or mark, on its icon or after its title. */
function Badge({ badge, small }: { badge: NonNullable<WorkbenchTool["badge"]>; small?: boolean }) {
  const tone = badge.tone === "error" ? "bg-destructive text-background" : "bg-foreground/15 text-foreground"

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-medium tabular-nums ${tone} ${small ? "absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-1 text-badge" : "h-4 min-w-4 px-1 text-meta"}`}
    >
      {badge.value}
    </span>
  )
}

/** Whether a tool in an expanded toolbar is folded to its title bar, and how its title toggles that. */
type Fold = { folded: boolean; toggle: () => void }

/** A tool's header: its icon and title, its badge and, at the end, its actions; an open filter takes the whole header.
 * Its bare part is where the tool is picked up to drag. */
function ToolHeader({ tool, grab, fold }: { tool: WorkbenchTool; grab?: (event: PointerEvent<HTMLElement>) => void; fold?: Fold }) {
  const { label, icon: Icon, badge, filter, actions = [] } = tool
  const [editing, setEditing] = useState(false)
  const search = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)
  const folded = fold?.folded === true
  const shown = filter !== undefined && !folded && (editing || filter.value !== "")
  const close = () => {
    filter?.set("")
    setEditing(false)
    returning.current = true
  }

  useEffect(() => {
    if (!shown && returning.current) {
      returning.current = false
      search.current?.focus()
    }
  }, [shown])

  return (
    <div
      className={`${bar} gap-1 border-b pr-1 ${shown ? "pl-1" : "pl-2.5"} ${grab ? "cursor-grab active:cursor-grabbing" : ""}`}
      onPointerDown={(event) => {
        if (grab && !(event.target as HTMLElement).closest("button, input")) grab(event)
      }}
    >
      {shown ? (
        <>
          <SearchField label={filter.label} value={filter.value} set={filter.set} autoFocus={editing} escape={close} />
          <button type="button" aria-label="Close filter" title="Close filter" className={iconButton} onClick={close}>
            <XIcon aria-hidden className="size-icon" />
          </button>
        </>
      ) : (
        <>
          {fold ? (
            // The icon folds too; where a title stands in for the label, it is the one way to, so it takes the keyboard.
            <span
              {...(tool.title !== undefined
                ? { role: "button", tabIndex: 0, "aria-expanded": !folded, "aria-label": folded ? `Unfold ${label}` : `Fold ${label}` }
                : { "aria-hidden": true })}
              title={folded ? `Unfold ${label}` : `Fold ${label}`}
              className={`grid shrink-0 cursor-pointer place-items-center rounded-sm ${ring}`}
              onClick={fold.toggle}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  fold.toggle()
                }
              }}
            >
              <Icon aria-hidden className={`size-icon ${muted}`} />
            </span>
          ) : (
            <Icon aria-hidden className={`size-icon shrink-0 ${muted}`} />
          )}
          <h2 className={`min-w-0 truncate font-medium select-none ${tool.title !== undefined ? "flex items-center" : ""}`}>
            {tool.title !== undefined ? (
              tool.title
            ) : fold ? (
              <span
                role="button"
                tabIndex={0}
                aria-expanded={!folded}
                title={folded ? `Unfold ${label}` : `Fold ${label}`}
                className={`cursor-pointer rounded-sm ${ring}`}
                onClick={fold.toggle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    fold.toggle()
                  }
                }}
              >
                {label}
              </span>
            ) : (
              label
            )}
          </h2>
          {badge && <Badge badge={badge} />}
          <span className="flex-1" />
          {!folded && filter && (
            <button ref={search} type="button" aria-label={filter.label} title={filter.label} className={iconButton} onClick={() => setEditing(true)}>
              <SearchIcon aria-hidden className="size-icon" />
            </button>
          )}
          {!folded && actions.map((a) => <WorkbenchButton key={a.id} action={a} />)}
        </>
      )}
    </div>
  )
}

/** One tool, open: its header and its scrolling content; folded, its header alone. One that fits wraps what it holds, so its length can be measured. */
const ToolSection = ({ tool, grab, fold, fit }: { tool: WorkbenchTool; grab?: (event: PointerEvent<HTMLElement>) => void; fold?: Fold; fit?: boolean }) => (
  <section aria-label={tool.label} data-tool={tool.id} data-folded={fold?.folded === true} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <ToolHeader tool={tool} grab={grab} fold={fold} />
    {!fold?.folded && (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {fit ? (
          <div data-fit className="flex flex-col">
            {tool.content}
          </div>
        ) : (
          tool.content
        )}
      </div>
    )}
  </section>
)

// Dragging: a tool by its header or icon, a toolbar by its grip.

/** A drag under way: what is carried, where the pointer is, and where it holds what it carries. */
type Drag = { kind: "tool" | "bar"; id: string; label: string; x: number; y: number; dx: number; dy: number }
type Grab = (event: PointerEvent<HTMLElement>, kind: Drag["kind"], id: string, label: string) => void

/** Where a drag over the content at (x, y) lands: near an edge pins, over a toolbar inserts or merges, else floats. */
function landing(area: HTMLElement, drag: Drag): Drop | undefined {
  const box = area.getBoundingClientRect()
  const { x, y } = drag

  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return undefined
  if (x - box.left < BAND) return { edge: "left" }
  if (box.right - x < BAND) return { edge: "right" }
  if (y - box.top < BAND) return { edge: "top" }
  if (box.bottom - y < BAND) return { edge: "bottom" }

  const over = document
    .elementsFromPoint(x, y)
    .map((e) => e.closest<HTMLElement>("[data-bar]"))
    .find((e) => e && area.contains(e) && !(drag.kind === "bar" && e.dataset.bar === drag.id))

  if (over) {
    const id = over.dataset.bar!

    if (drag.kind === "bar") return { bar: id, index: Number.POSITIVE_INFINITY }

    const column = over.dataset.axis === "column"
    const index = [...over.querySelectorAll<HTMLElement>("[data-tool]")].filter((t) => {
      const r = t.getBoundingClientRect()

      return column ? (r.top + r.bottom) / 2 < y : (r.left + r.right) / 2 < x
    }).length

    return { bar: id, index }
  }

  return { float: { x: Math.max(0, x - box.left - drag.dx), y: Math.max(0, y - box.top - drag.dy) } }
}

/** What a drag shows while under way: the edge bands, where a tool would go or the toolbar it would join, and what is
 * carried, at the pointer. */
function DragView({ area, drag, drop }: { area: HTMLElement; drag: Drag; drop?: Drop }) {
  const box = area.getBoundingClientRect()
  const rel = (r: DOMRect) => ({ left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height })
  const band = (edge: Edge) => {
    const on = drop && "edge" in drop && drop.edge === edge
    const at = {
      left: { left: 0, top: 0, bottom: 0, width: BAND },
      right: { right: 0, top: 0, bottom: 0, width: BAND },
      top: { left: 0, right: 0, top: 0, height: BAND },
      bottom: { left: 0, right: 0, bottom: 0, height: BAND },
    }[edge]

    return <div key={edge} data-band={edge} className={`absolute ${on ? "bg-ring/25" : "bg-ring/8"}`} style={at} />
  }
  let mark: ReactNode = null

  if (drop && "bar" in drop) {
    const target = area.querySelector<HTMLElement>(`[data-bar="${drop.bar}"]`)

    if (target && !Number.isFinite(drop.index)) mark = <div className="absolute bg-ring/25" style={rel(target.getBoundingClientRect())} />
    else if (target) {
      const column = target.dataset.axis === "column"
      const tools = [...target.querySelectorAll<HTMLElement>("[data-tool]")]
      const r = target.getBoundingClientRect()
      const at = tools[drop.index]?.getBoundingClientRect()
      const last = tools.at(-1)?.getBoundingClientRect()
      const line = column ? (at ? at.top : (last?.bottom ?? r.top)) : at ? at.left : (last?.right ?? r.left)

      mark = (
        <div
          className="absolute bg-ring"
          style={
            column
              ? { left: r.left - box.left, width: r.width, top: line - box.top - 1, height: 2 }
              : { top: r.top - box.top, height: r.height, left: line - box.left - 1, width: 2 }
          }
        />
      )
    }
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-40">
      {edges.map((e) => band(e.id))}
      {mark}
      <div
        className="absolute flex h-row items-center gap-1.5 rounded-md bg-popover px-2 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        style={{ left: drag.x - box.left + 12, top: drag.y - box.top + 12 }}
      >
        <GripVerticalIcon className={`size-glyph ${muted}`} />
        {drag.label}
      </div>
    </div>
  )
}

// Toolbars

type Side = "top" | "right" | "bottom" | "left"

/**
 * A collapsed toolbar: a strip of tool icons, meta tools at its far end. A tool opens in a popover beside the strip; it
 * closes on Escape, outside, or once something in it is opened. An icon is also where the tool is picked up to drag.
 */
function ToolStrip({
  tools,
  vertical,
  side,
  open,
  setOpen,
  grab,
}: {
  tools: WorkbenchTool[]
  vertical: boolean
  side: Side
  open?: string
  setOpen: (id: string | undefined) => void
  grab: Grab
}) {
  // Where an open tool sits: against the toolbar's edge on the side it opens to, and its start at the toolbar's start,
  // less the inset of its first button, so the first tool's lines up with the toolbar's start and its outline, drawn a
  // pixel outside it, lies on the hairline above. On the side it opens to, the frame's splitter is a hairline of its
  // own past the toolbar's edge, so the tool is moved out by one more to put its outline on it.
  const rail = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ reach: 0, inset: 0 })

  useLayoutEffect(() => {
    const button = open ? rail.current?.querySelector<HTMLElement>(`[data-tool="${CSS.escape(open)}"]`) : undefined
    const first = rail.current?.querySelector<HTMLElement>("[data-tool]")
    const edge = button?.closest("[data-edge]")?.getBoundingClientRect()
    const own = button?.getBoundingClientRect()
    const lead = first?.getBoundingClientRect()

    if (!edge || !own || !lead) return

    const reach = { right: edge.right - own.right, left: own.left - edge.left, bottom: edge.bottom - own.bottom, top: own.top - edge.top }[side]
    const inset = vertical ? lead.top - edge.top : lead.left - edge.left

    setPlace({ reach: Math.max(0, reach) + 1, inset: Math.max(0, inset) })
  }, [open, side, vertical])

  const button = (tool: WorkbenchTool) => {
    const Icon = tool.icon

    return (
      <Popover key={tool.id} open={open === tool.id} onOpenChange={(on) => setOpen(on ? tool.id : undefined)}>
        <PopoverAnchor asChild>
          <button
            type="button"
            data-tool={tool.id}
            aria-label={tool.label}
            title={tool.label}
            aria-expanded={open === tool.id}
            className={`relative grid size-7 shrink-0 place-items-center rounded-md ${ring} ${open === tool.id ? "bg-foreground/8 text-foreground" : `${muted} hover:bg-foreground/6 hover:text-foreground`}`}
            onPointerDown={(event) => grab(event, "tool", tool.id, tool.label)}
            onClick={() => setOpen(open === tool.id ? undefined : tool.id)}
          >
            <Icon aria-hidden className="size-rail-icon" />
            {tool.badge && <Badge badge={tool.badge} small />}
          </button>
        </PopoverAnchor>
        <PopoverContent
          side={side}
          align="start"
          sideOffset={place.reach}
          alignOffset={-place.inset}
          // A panel of the toolbar, against its edge: square, flat, there at once.
          className="flex h-[min(60vh,520px)] w-80 flex-col gap-0 overflow-hidden rounded-none p-0 shadow-none duration-0 data-open:animate-none data-closed:animate-none"
          // Focus leaving it, as when the menu that opened it hands focus back, is no reason to close it.
          onFocusOutside={(event) => event.preventDefault()}
        >
          <Dismiss.Provider value={() => setOpen(undefined)}>
            <ToolSection tool={tool} />
          </Dismiss.Provider>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div
      ref={rail}
      role="toolbar"
      aria-label="Tools"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={`flex min-h-0 min-w-0 flex-1 gap-0.5 p-1 ${vertical ? "flex-col items-center" : "flex-row items-center"}`}
    >
      {tools.filter((t) => !t.meta).map(button)}
      <span className="flex-1" />
      {tools.filter((t) => t.meta).map(button)}
    </div>
  )
}

/** The share of a toolbar a tool that fits takes at most, as it first sizes itself. */
const FIT = 0.4

/**
 * One tool's panel in an expanded toolbar. Folded, it keeps only its title bar; dragging it that small folds it too.
 * It follows the kept fold once in place, and keeps the person's when they resize it. One that fits keeps its length
 * when the toolbar's changes; while `fitting`, until the person sizes the stack, it is as long as what it holds, up to
 * two fifths of the toolbar.
 */
function FoldPanel({
  id,
  vertical,
  folded,
  setFolded,
  fit,
  fitting,
  children,
}: {
  id: string
  vertical: boolean
  folded: boolean
  setFolded: (folded: boolean) => void
  fit?: boolean
  fitting?: boolean
  children: ReactNode
}) {
  const panel = useRef<PanelImperativeHandle>(null)
  const element = useRef<HTMLDivElement>(null)
  const following = useRef(false)

  // The panel's group registers after its panels do, so the panel is brought in line on the next frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const handle = panel.current

      if (handle && handle.isCollapsed() !== folded) {
        if (folded) handle.collapse()
        else handle.expand()
      }
      following.current = true
    })

    return () => cancelAnimationFrame(frame)
  }, [folded])

  // Sized to what it holds, as that changes, until the person sizes the stack.
  useEffect(() => {
    const content = element.current?.querySelector<HTMLElement>("[data-fit]")

    if (!fitting || folded || !content) return

    const fitTo = () => {
      const handle = panel.current
      const header = element.current?.querySelector("section > :first-child")?.getBoundingClientRect().height ?? 0

      if (!handle || handle.isCollapsed()) return

      const { inPixels, asPercentage } = handle.getSize()
      const whole = asPercentage > 0 ? (inPixels / asPercentage) * 100 : 0
      const wanted = Math.ceil(header + content.getBoundingClientRect().height)

      if (whole > 0 && Math.abs(Math.min(wanted, whole * FIT) - inPixels) > 1) handle.resize(Math.min(wanted, whole * FIT))
    }
    const frame = requestAnimationFrame(fitTo)
    const observer = new ResizeObserver(fitTo)

    observer.observe(content)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [fitting, folded])

  return (
    <Panel
      id={id}
      panelRef={panel}
      elementRef={element}
      collapsible
      collapsedSize={vertical ? 32 : 120}
      minSize={vertical ? 64 : 160}
      groupResizeBehavior={fit ? "preserve-pixel-size" : undefined}
      onResize={() => {
        const now = panel.current?.isCollapsed() ?? false

        if (following.current && now !== folded) setFolded(now)
      }}
      className="flex flex-col"
    >
      {children}
    </Panel>
  )
}

/**
 * An expanded toolbar: every tool open, stacked along it, each resizable, each folding to its title bar. A tool that
 * fits, in a toolbar on a side, is as long as what it holds until the person sizes the stack; only what they do is kept.
 */
function ToolStack({
  tools,
  vertical,
  sizes,
  grab,
  folded,
  setFolded,
}: {
  tools: WorkbenchTool[]
  vertical: boolean
  sizes: string
  grab: Grab
  folded: string[]
  setFolded: (tool: string, folded: boolean) => void
}) {
  const all = ordered(tools)
  const layout = useDefaultLayout({ id: sizes, panelIds: all.map((t) => t.id), storage: localStorage, onlySaveAfterUserInteractions: true })
  const [sized, setSized] = useState(false)
  const fitting = vertical && !layout.defaultLayout && !sized

  return (
    <Group
      key={all.map((t) => t.id).join()}
      orientation={vertical ? "vertical" : "horizontal"}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={(next, meta) => {
        layout.onLayoutChanged(next, meta)
        if (meta.isUserInteraction) setSized(true)
      }}
      className="min-h-0 min-w-0 flex-1"
    >
      {all.flatMap((tool, i) => {
        const fold = folded.includes(tool.id)
        const fit = vertical && tool.fit === true

        return [
          ...(i > 0 ? [<WorkbenchSplitter key={`${tool.id}-edge`} orientation={vertical ? "vertical" : "horizontal"} />] : []),
          <FoldPanel key={tool.id} id={tool.id} vertical={vertical} folded={fold} setFolded={(on) => setFolded(tool.id, on)} fit={fit} fitting={fit && fitting}>
            <ToolSection
              tool={tool}
              grab={(event) => grab(event, "tool", tool.id, tool.label)}
              fold={{ folded: fold, toggle: () => setFolded(tool.id, !fold) }}
              fit={fit}
            />
          </FoldPanel>,
        ]
      })}
    </Group>
  )
}

/**
 * One toolbar: its tools, collapsed to a strip or expanded to a stack. Floating, it has a grip by which the whole of it
 * is dragged, to another place or onto an edge to pin it; pinned, it stays put until its right-click menu floats it. A
 * right click offers, for the tool under the pointer and for the toolbar, what dragging does.
 */
function Toolbar({
  bar: own,
  name,
  tools,
  vertical,
  side,
  open,
  setOpen,
  grab,
  menu,
  toggle,
  setFolded,
  sizes,
}: {
  bar: Bar
  name: string
  tools: WorkbenchTool[]
  vertical: boolean
  side: Side
  open?: string
  setOpen: (id: string | undefined) => void
  grab: Grab
  menu: (tool: string | undefined, x: number, y: number) => MenuItem[]
  /** Collapses or expands the toolbar, as a double click on a floating one's grip does. */
  toggle: () => void
  /** Folds or unfolds one tool of the expanded toolbar. */
  setFolded: (tool: string, folded: boolean) => void
  sizes: string
}) {
  const [items, setItems] = useState<MenuItem[]>([])
  const Grip = vertical ? GripHorizontalIcon : GripVerticalIcon

  return (
    <Context.Root>
      <Context.Trigger asChild>
        <aside
          aria-label={name}
          data-bar={own.id}
          data-axis={vertical ? "column" : "row"}
          data-edge={own.edge ?? "floating"}
          data-expanded={own.expanded}
          className={`flex min-h-0 min-w-0 flex-1 bg-sidebar ${vertical ? "flex-col" : "flex-row"}`}
          onContextMenu={(event) =>
            setItems(menu((event.target as HTMLElement).closest<HTMLElement>("[data-tool]")?.dataset.tool, event.clientX, event.clientY))
          }
        >
          {!own.edge && (
            <div
              aria-label={`Move ${name}`}
              title={`Move ${name}`}
              className={`flex shrink-0 cursor-grab items-center justify-center ${muted} active:cursor-grabbing ${vertical ? "h-row border-b" : "w-row border-r"}`}
              onPointerDown={(event) => grab(event, "bar", own.id, name)}
              onDoubleClick={toggle}
            >
              <Grip aria-hidden className="size-icon" />
            </div>
          )}
          {own.expanded ? (
            <ToolStack tools={tools} vertical={vertical} sizes={sizes} grab={grab} folded={own.folded ?? []} setFolded={setFolded} />
          ) : (
            <ToolStrip tools={tools} vertical={vertical} side={side} open={open} setOpen={setOpen} grab={grab} />
          )}
        </aside>
      </Context.Trigger>
      <Context.Portal>
        <Context.Content className={menuContent}>
          <MenuItems items={items} kit={ContextKit} />
        </Context.Content>
      </Context.Portal>
    </Context.Root>
  )
}

/** A pinned toolbar's panel: its collapsed size is the strip, so dragging it narrow collapses it and wider expands it.
 * It follows the toolbar's kept state once it is in place, and keeps it when the person resizes. */
function Dock({ bar: own, setExpanded, children }: { bar: Bar; setExpanded: (expanded: boolean) => void; children: ReactNode }) {
  const panel = useRef<PanelImperativeHandle>(null)
  // The placement the panel already follows; until it does, its sizes are the stored ones, not the person's choice.
  const following = useRef("")
  const placement = `${own.id}.${own.edge}`
  const side = own.edge === "left" || own.edge === "right"

  // The panel's group registers after its panels do, so the panel is brought in line on the next frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const handle = panel.current

      if (handle && handle.isCollapsed() === own.expanded) {
        if (own.expanded) handle.expand()
        else handle.collapse()
      }
      following.current = placement
    })

    return () => cancelAnimationFrame(frame)
  }, [own.expanded, placement])

  return (
    <Panel
      id={own.edge}
      panelRef={panel}
      collapsible
      collapsedSize={STRIP}
      defaultSize={side ? EXPANDED.side : EXPANDED.edge}
      minSize={side ? 200 : 140}
      groupResizeBehavior="preserve-pixel-size"
      onResize={() => {
        const now = !(panel.current?.isCollapsed() ?? false)

        if (following.current === placement && now !== own.expanded) setExpanded(now)
      }}
      className="flex flex-col"
    >
      {children}
    </Panel>
  )
}

/** A floating toolbar: a palette over the content, moved by its grip like any drag, sized from its corner. */
function Floating({
  bar: own,
  render,
  carried,
  setFloat,
}: {
  bar: Bar
  render: (bar: Bar) => ReactNode
  carried?: { x: number; y: number }
  setFloat: (float: Float, expanded: boolean) => void
}) {
  // While sized from its corner it follows the pointer; narrower than the threshold it collapses, wider it expands.
  const [sized, setSized] = useState<{ width: number; height: number; expanded: boolean }>()
  const self = useRef<HTMLDivElement>(null)
  const expanded = sized?.expanded ?? own.expanded
  const box = { ...own.float!, ...(sized && { width: sized.width, height: sized.height }), ...carried }
  const resize = (event: PointerEvent<HTMLElement>) => {
    const area = self.current?.parentElement?.getBoundingClientRect()
    const mine = self.current?.getBoundingClientRect()

    if (!area || !mine || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const start = { x: event.clientX, y: event.clientY, width: mine.width, height: mine.height }
    let last = { width: box.width, height: box.height, expanded }
    const move = (e: globalThis.PointerEvent) => {
      const width = Math.max(STRIP, Math.min(area.width - (mine.left - area.left), start.width + e.clientX - start.x))
      const height = Math.max(120, Math.min(area.height - (mine.top - area.top), start.height + e.clientY - start.y))

      last = width < UNFOLD ? { width: box.width, height: box.height, expanded: false } : { width, height: Math.max(160, height), expanded: true }
      setSized(last)
    }
    const end = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      setFloat({ ...own.float!, width: last.width, height: last.height }, last.expanded)
      setSized(undefined)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
  }

  return (
    <div
      ref={self}
      data-floating={own.id}
      className="absolute z-20 flex flex-col overflow-hidden rounded-lg border shadow-lg"
      style={{
        left: `min(${box.x}px, calc(100% - ${expanded ? Math.min(box.width, 200) : STRIP}px))`,
        top: `min(${box.y}px, calc(100% - 120px))`,
        maxWidth: "100%",
        maxHeight: `calc(100% - min(${box.y}px, calc(100% - 120px)))`,
        ...(expanded ? { width: box.width, height: box.height } : { width: STRIP }),
      }}
    >
      {render({ ...own, expanded })}
      <div aria-label="Resize toolbar" title="Resize toolbar" className="absolute right-0 bottom-0 z-10 size-3 cursor-nwse-resize" onPointerDown={resize} />
    </div>
  )
}

/**
 * The workbench. The util supplies its menus, its tools, the active document's content and its scopes where it has
 * several; the workbench owns the frame: the menu bar with its scope and View menus, the toolbars and how the person
 * arranges them, which documents are open, and the welcome page.
 */
export function Workbench({
  scopes,
  label,
  tools,
  documents,
  main,
  menus = [],
  viewMenu = [],
}: {
  /** The util's name: the menu bar's, where there are no scopes. */
  label: string
  tools: WorkbenchTool[]
  documents?: WorkbenchDocuments
  /** The active document's content: its own toolbar, if any, above what it scrolls. */
  main: ReactNode
  /** The util's menus, after the scope's and before View. */
  menus?: Menu[]
  /** The util's own entries at the top of the View menu, such as a lens. */
  viewMenu?: MenuItem[]
  scopes?: Scopes
}) {
  const { address, util } = useTab()
  // The toolbars are the util's: every tab of it opens as the person last arranged it.
  const [kept, setKept] = useStored<{ bars?: Bar[] }>(`babavoss.toolbars.${util}`, {})
  const bars = settle(kept.bars, tools)
  const change = (next: (bars: Bar[]) => Bar[]) => setKept((current) => ({ bars: next(settle(current.bars, tools)) }))
  const nameOf = names(bars)
  const byId = new Map(tools.map((t) => [t.id, t]))
  const [open, setOpen] = useState<string>()
  const [drag, setDrag] = useState<Drag>()
  // The content area, where toolbars dock and float and drags land; kept as state so drawing a drag can measure it.
  const [area, setArea] = useState<HTMLDivElement | null>(null)
  // A reset forgets the kept sizes and rebuilds the frame at its defaults.
  const [generation, setGeneration] = useState(0)
  const sizes = `babavoss.sizes.${util}`
  const drop = drag && area ? landing(area, drag) : undefined

  const apply = (kind: Drag["kind"], id: string, to: Drop) => change((current) => (kind === "tool" ? moveTool(current, id, to) : moveBar(current, id, to)))
  const reset = () => {
    setKept(() => ({}))
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(`react-resizable-panels:${sizes}.`)) localStorage.removeItem(key)
    } catch {
      /* Without browser storage there are no sizes kept. */
    }
    setOpen(undefined)
    setGeneration((n) => n + 1)
  }

  // A press becomes a drag once the pointer has moved a little; a drop applies where it lands, Escape abandons it, and
  // the click that ends a drag is swallowed so it opens nothing.
  const grab: Grab = (event, kind, id, label) => {
    if (event.button !== 0) return

    const start = { x: event.clientX, y: event.clientY }
    const holder = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-floating]")?.getBoundingClientRect()
    const dx = holder ? start.x - holder.left : 16
    const dy = holder ? start.y - holder.top : 12
    let current: Drag | undefined
    const move = (e: globalThis.PointerEvent) => {
      if (!current && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return
      current = { kind, id, label, x: e.clientX, y: e.clientY, dx, dy }
      setOpen(undefined)
      setDrag(current)
    }
    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("keydown", escape)
      setDrag(undefined)
    }
    const end = () => {
      stop()
      if (!current || !area) return

      const to = landing(area, current)
      const swallow = (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
      }

      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0)
      if (to) apply(kind, id, to)
    }
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        current = undefined
        stop()
      }
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("keydown", escape)
  }

  // A right click offers what a drag does: for the tool under the pointer, detaching it where the click was or moving it
  // to another toolbar; for the toolbar, collapsing or expanding it, floating or pinning it, merging it into another.
  const menuOf =
    (own: Bar) =>
    (tool: string | undefined, x: number, y: number): MenuItem[] => {
      const others = bars.filter((b) => b.id !== own.id)
      const box = area?.getBoundingClientRect()
      const here = { x: Math.max(0, x - (box?.left ?? 0) - 16), y: Math.max(0, y - (box?.top ?? 0) - 12) }
      const name = tool && byId.get(tool)?.label

      return [
        ...(tool && name
          ? [
              {
                kind: "action" as const,
                id: "detach",
                label: `Detach ${name}`,
                run: () => apply("tool", tool, { float: here }),
                disabled: !own.edge && own.tools.length === 1,
              },
              ...(others.length
                ? [
                    {
                      kind: "submenu" as const,
                      id: "move",
                      label: `Move ${name} to`,
                      items: others.map((b): MenuItem => ({
                        kind: "action",
                        id: b.id,
                        label: nameOf(b),
                        run: () => apply("tool", tool, { bar: b.id, index: b.tools.length }),
                      })),
                    },
                  ]
                : []),
              { kind: "separator" as const, id: "tool-edge" },
            ]
          : []),
        {
          kind: "action",
          id: "expand",
          label: own.expanded ? "Collapse" : "Expand",
          run: () => change((all) => all.map((b) => (b.id === own.id ? { ...b, expanded: !b.expanded } : b))),
        },
        ...(own.edge ? [{ kind: "action" as const, id: "float", label: "Float", run: () => apply("bar", own.id, { float: here }) }] : []),
        {
          kind: "submenu",
          id: "pin",
          label: "Pin to",
          items: edges
            .filter((e) => e.id !== own.edge)
            .map((e): MenuItem => ({ kind: "action", id: e.id, label: e.label, run: () => apply("bar", own.id, { edge: e.id }) })),
        },
        ...(others.length
          ? [
              {
                kind: "submenu" as const,
                id: "merge",
                label: "Merge into",
                items: others.map((b): MenuItem => ({
                  kind: "action",
                  id: b.id,
                  label: nameOf(b),
                  run: () => apply("bar", own.id, { bar: b.id, index: b.tools.length }),
                })),
              },
            ]
          : []),
      ]
    }

  // Showing a tool from the View menu: in an expanded toolbar it is brought into view; collapsed, its popover opens.
  const show = (id: string) => {
    const home = bars.find((b) => b.tools.includes(id))

    // From a menu, the popover opens once the menu has closed and handed focus back.
    if (home && !home.expanded) return void setTimeout(() => setOpen(id), 0)
    area?.querySelector<HTMLElement>(`[data-tool="${id}"]`)?.scrollIntoView({ block: "nearest" })
  }

  // View, the workbench's own menu: the util's entries, every tool, and a reset of how the toolbars are arranged.
  const view: Menu = {
    id: "view",
    label: "View",
    items: [
      ...(viewMenu.length ? [...viewMenu, { kind: "separator" as const, id: "util-edge" }] : []),
      ...ordered(tools).map((t): MenuItem => ({ kind: "action", id: `tool-${t.id}`, label: t.label, run: () => show(t.id) })),
      { kind: "separator", id: "reset-edge" },
      { kind: "action", id: "reset", label: "Reset layout", run: reset },
    ],
  }

  const content = (
    <section aria-label="Content" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {scopes && scopes.current === undefined ? (
        <Welcome scopes={scopes} />
      ) : (
        <Editor key={scopes?.current} address={address} scope={scopes?.current} documents={documents} main={main} />
      )}
    </section>
  )
  const toolbar = (own: Bar) => (
    <Toolbar
      key={own.id}
      bar={own}
      name={nameOf(own)}
      tools={own.tools.map((id) => byId.get(id)!)}
      vertical={own.edge !== "top" && own.edge !== "bottom"}
      side={own.edge ? ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[own.edge] : "right"}
      open={open}
      setOpen={setOpen}
      grab={grab}
      menu={menuOf(own)}
      toggle={() => change((all) => all.map((b) => (b.id === own.id ? { ...b, expanded: !b.expanded } : b)))}
      setFolded={(tool, on) =>
        change((all) =>
          all.map((b) =>
            b.id === own.id ? { ...b, folded: on ? [...(b.folded ?? []).filter((t) => t !== tool), tool] : (b.folded ?? []).filter((t) => t !== tool) } : b
          )
        )
      }
      sizes={`${sizes}.bar.${own.id}.${own.edge === "top" || own.edge === "bottom" ? "row" : "column"}`}
    />
  )
  const pinned = (edge: Edge) => bars.find((b) => b.edge === edge)
  const dock = (edge: Edge) => {
    const own = pinned(edge)

    return (
      own && (
        <Dock key={`${own.id}.${edge}`} bar={own} setExpanded={(expanded) => change((all) => all.map((b) => (b.id === own.id ? { ...b, expanded } : b)))}>
          {toolbar(own)}
        </Dock>
      )
    )
  }
  const [top, left, right, bottom] = (["top", "left", "right", "bottom"] as const).map(pinned)
  const outerIds = [...(top ? ["top"] : []), "middle", ...(bottom ? ["bottom"] : [])]
  const innerIds = [...(left ? ["left"] : []), "content", ...(right ? ["right"] : [])]
  const outer = useDefaultLayout({ id: `${sizes}.outer`, panelIds: outerIds, storage: localStorage })
  const inner = useDefaultLayout({ id: `${sizes}.inner`, panelIds: innerIds, storage: localStorage })
  const line = (vertical: boolean) => <WorkbenchSplitter orientation={vertical ? "horizontal" : "vertical"} />

  return (
    <div data-workbench={address} className="flex min-h-0 flex-1 flex-col text-body">
      <MenuBar label={scopes ? scopes.title : label} menus={[...(scopes ? [scopeMenu(scopes)] : []), ...menus, view]} />
      <div key={generation} ref={setArea} data-area className={`relative flex min-h-0 flex-1 ${drag ? "cursor-grabbing select-none" : ""}`}>
        <Group
          key={outerIds.join()}
          orientation="vertical"
          defaultLayout={outer.defaultLayout}
          onLayoutChanged={outer.onLayoutChanged}
          className="min-h-0 flex-1"
        >
          {dock("top")}
          {top && line(false)}
          <Panel id="middle" minSize={top || bottom ? 120 : 0} className="flex flex-col">
            <Group
              key={innerIds.join()}
              orientation="horizontal"
              defaultLayout={inner.defaultLayout}
              onLayoutChanged={inner.onLayoutChanged}
              className="min-h-0 flex-1"
            >
              {dock("left")}
              {left && line(true)}
              <Panel id="content" minSize={240} className="flex flex-col">
                {content}
              </Panel>
              {right && line(true)}
              {dock("right")}
            </Group>
          </Panel>
          {bottom && line(false)}
          {dock("bottom")}
        </Group>
        {bars
          .filter((b) => !b.edge)
          .map((own) => (
            <Floating
              key={own.id}
              bar={own}
              render={toolbar}
              carried={
                drag?.kind === "bar" && drag.id === own.id && area
                  ? { x: drag.x - area.getBoundingClientRect().left - drag.dx, y: drag.y - area.getBoundingClientRect().top - drag.dy }
                  : undefined
              }
              setFloat={(float, expanded) => change((all) => all.map((b) => (b.id === own.id ? { ...b, float, expanded } : b)))}
            />
          ))}
        {drag && area && <DragView area={area} drag={drag} drop={drop} />}
      </div>
    </div>
  )
}
