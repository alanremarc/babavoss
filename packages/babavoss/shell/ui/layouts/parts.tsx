// The parts a util's content and its tools are built from, so every util reads alike: an icon button, a content toolbar,
// segments, properties, a setting, lists and trees of one row anatomy whose rows tip their facts, a document's page with
// its sections and folds, a notice, a mark, a meter, a search field, an empty line, a splitter, and whether a content is
// narrow. What is not needed at a glance goes into a row's tip or a fold, never into the row.
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CircleAlertIcon, InfoIcon, SearchIcon } from "lucide-react"
import { Separator } from "react-resizable-panels"
import { CodeBlock, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle } from "../components/code-block"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/tooltip"

export type WorkbenchIcon = ComponentType<{ className?: string }>

/**
 * Something to do, drawn as an icon button named by its label. `busy` spins its icon while it works. One that `choose`s
 * opens its options to pick from instead of running, as starting a session asks under what.
 */
export type WorkbenchAction = { id: string; label: string; icon: WorkbenchIcon; run: () => void; disabled?: boolean; busy?: boolean; choose?: WorkbenchChoice }
/** What an action opens to pick from: its options, the one in force marked, and what a pick does. */
export type WorkbenchChoice = { label: string; value?: string; options: WorkbenchOption[]; set: (id: string) => void }

export const muted = "text-muted-foreground"
export const ring = "outline-none focus-visible:ring-2 focus-visible:ring-ring"
export const iconButton = `grid size-row shrink-0 place-items-center rounded-md ${muted} ${ring} hover:bg-foreground/6 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 aria-pressed:text-foreground aria-expanded:bg-foreground/6`
/** Every bar of the frame below the menu bar: document strip, tool headers, toolbars. */
export const bar = "flex h-bar shrink-0 items-center"

const separator = "bg-border outline-none hover:bg-ring/60 focus-visible:bg-ring data-[separator=active]:bg-ring"

/**
 * Closes the popover a tool opened in; a list or tree in it calls it once it opens something, and so does a row a tool
 * draws itself: `useContext(Dismiss)()`. Outside a popover it does nothing.
 */
export const Dismiss = createContext<() => void>(() => {})

/** The line between two panels of a react-resizable-panels `Group`, dragged to resize them; `orientation` is the group's. */
export const WorkbenchSplitter = ({ orientation }: { orientation: "horizontal" | "vertical" }) => (
  <Separator className={`${orientation === "vertical" ? "h-px" : "w-px"} ${separator}`} />
)

/**
 * Whether an element is narrower than `below` pixels, followed as it resizes: content that stacks its columns where the
 * workbench leaves it narrow. Give the element the returned ref; until it is measured, it is not narrow.
 */
export function useNarrow(below: number) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    if (!node) return

    const observer = new ResizeObserver(([entry]) => setNarrow(entry!.contentRect.width < below))

    observer.observe(node)

    return () => observer.disconnect()
  }, [node, below])

  return [setNode, narrow] as const
}

/**
 * An icon button running an action, named and tipped by its label, or opening what it chooses from; what else it is
 * given passes on, so it can open a popover.
 */
export function WorkbenchButton({ action: { choose, ...action }, ...rest }: { action: WorkbenchAction } & Omit<ComponentProps<"button">, "children">) {
  const { label, icon: Icon, run, disabled, busy } = action

  if (choose)
    return (
      <WorkbenchPicker
        label={choose.label}
        value={choose.value}
        options={choose.options}
        set={choose.set}
        align="end"
        disabled={disabled}
        trigger={<WorkbenchButton action={{ ...action, run: () => {} }} {...rest} />}
      />
    )

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={iconButton}
      {...rest}
      onClick={(event) => {
        rest.onClick?.(event)
        run()
      }}
    >
      <Icon aria-hidden className={`size-icon ${busy ? "animate-spin" : ""}`} />
    </button>
  )
}

/** A content's toolbar, the first row of its area: groups of controls, a spacer between ends. */
export function WorkbenchToolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className={`${bar} gap-1 border-b px-2`}>
      {children}
    </div>
  )
}

/** Pushes what follows it in a toolbar to the far end. */
export const WorkbenchSpacer = () => <div className="flex-1" />

/** One choice among a few, shown side by side: a view, a lens. */
export function WorkbenchSegments<T extends string>({
  label,
  options,
  value,
  set,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  set: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-row shrink-0 rounded-md bg-foreground/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`flex-1 rounded-[5px] px-2 text-meta ${ring} ${value === o.id ? "bg-background text-foreground shadow-xs" : `${muted} hover:text-foreground`}`}
          onClick={() => set(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Terms and their values: a block of properties, or what a row's tip says. */
export type WorkbenchFacts = [string, ReactNode][]

/** The facts as terms beside values; `columns` is the grid's, fixed where blocks must align. */
const Terms = ({ rows, columns, gap }: { rows: WorkbenchFacts; columns: string; gap: string }) => (
  <dl className={`grid ${columns} gap-x-3 ${gap}`}>
    {rows.map(([term, value]) => (
      <div key={term} className="contents">
        <dt className={`truncate ${muted}`} title={term}>
          {term}
        </dt>
        <dd className="min-w-0 break-words">{value}</dd>
      </div>
    ))}
  </dl>
)

/**
 * Terms and their values, for an inspector or a page's details, on one fixed term column so blocks stacked in a region
 * align. A value may run to several lines. `titled` shows the label as the block's heading.
 */
export function WorkbenchProperties({ label, rows, titled }: { label: string; rows: WorkbenchFacts; titled?: boolean }) {
  const id = useId()

  return (
    <section aria-labelledby={id} className="flex flex-col px-3 py-2">
      <h3 id={id} className={titled ? `flex h-row items-center text-meta ${muted}` : "sr-only"}>
        {label}
      </h3>
      <Terms rows={rows} columns="grid-cols-[88px_1fr]" gap="gap-y-1.5" />
    </section>
  )
}

/** Text as it is, in mono: a command, an output, a source. `title` names it, `copy` adds the button; long text scrolls inside. */
export function WorkbenchCode({ title, text, tone, copy }: { title?: string; text: string; tone?: "error"; copy?: boolean }) {
  return (
    <CodeBlock size="sm" variant={tone === "error" ? "destructive" : "default"}>
      {(title || copy) && (
        <CodeBlockHeader>
          {title && <CodeBlockTitle>{title}</CodeBlockTitle>}
          {copy && <CodeBlockCopyButton value={text} className="ms-auto" />}
        </CodeBlockHeader>
      )}
      <CodeBlockContent wrap className="max-h-72">
        {text || " "}
      </CodeBlockContent>
    </CodeBlock>
  )
}

/** The facts about what is in view, behind one button: terms and values in a popover, so a toolbar carries none of them. */
export function WorkbenchInfo({ label, rows, icon: Icon = InfoIcon }: { label: string; rows: WorkbenchFacts; icon?: WorkbenchIcon }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} title={label} className={iconButton}>
          <Icon aria-hidden className="size-icon" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <Terms rows={rows} columns="grid-cols-[auto_minmax(0,1fr)]" gap="gap-y-1.5" />
      </PopoverContent>
    </Popover>
  )
}

/** One of a list to pick: its name, a line about it, a quieter detail at its end. */
export type WorkbenchOption = { id: string; label: string; description?: string; detail?: string }

/**
 * One choice among many, shown as its name and opened to pick: a model, an effort, the workspace worked in. `value` is
 * the option in force, `none` what the button says when there is none. A `trigger` opens it in place of that button, for
 * a choice that is an act, such as what to start a session under. `actions` follow the options, what is done about them,
 * such as making another. Arrows move between the options; a pick closes it.
 */
export function WorkbenchPicker({
  label,
  value,
  options,
  set,
  none = "none",
  disabled,
  trigger,
  align = "start",
  actions = [],
}: {
  label: string
  value?: string
  options: WorkbenchOption[]
  set: (id: string) => void
  none?: string
  disabled?: boolean
  trigger?: ReactElement
  align?: "start" | "end"
  actions?: (WorkbenchAction & { description?: string })[]
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.id === value)
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option], [role=menuitem]")]
    const to = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[event.key]

    if (to === undefined || !all.length) return
    event.preventDefault()
    all[(all.indexOf(document.activeElement as HTMLButtonElement) + to + all.length) % all.length]!.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={`${label}: ${current?.label ?? none}`}
            title={label}
            disabled={disabled || (!options.length && !actions.length)}
            className={`flex h-row max-w-full min-w-0 shrink items-center gap-1 rounded-md px-1.5 ${ring} hover:bg-foreground/6 disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-foreground/6`}
          >
            <span className={`min-w-0 truncate ${current ? "" : muted}`}>{current?.label ?? none}</span>
            <ChevronDownIcon aria-hidden className={`size-glyph shrink-0 ${muted}`} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <div className="flex max-h-80 flex-col overflow-y-auto" onKeyDown={move}>
          <div role="listbox" aria-label={label} className="flex flex-col">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                autoFocus={o.id === value}
                className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] items-baseline gap-x-1.5 rounded-sm px-1.5 py-1 text-left ${ring} hover:bg-foreground/6 focus-visible:bg-foreground/6`}
                onClick={() => {
                  set(o.id)
                  setOpen(false)
                }}
              >
                <CheckIcon aria-hidden className={`size-glyph self-center ${o.id === value ? "" : "invisible"}`} />
                <span className="min-w-0 truncate">{o.label}</span>
                {o.detail !== undefined && <span className={`text-meta tabular-nums ${muted}`}>{o.detail}</span>}
                {o.description && <span className={`col-start-2 col-end-4 text-meta ${muted}`}>{o.description}</span>}
              </button>
            ))}
          </div>
          {options.length > 0 && actions.length > 0 && <div role="separator" className="-mx-1 my-1 h-px shrink-0 bg-border" />}
          {actions.length > 0 && (
            <div role="menu" aria-label={`${label}: more`} className="flex flex-col">
              {actions.map(({ id, label: name, description, icon: Icon, run, disabled: off }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  disabled={off}
                  autoFocus={!options.length && id === actions[0]!.id}
                  className={`grid grid-cols-[1rem_minmax(0,1fr)] items-baseline gap-x-1.5 rounded-sm px-1.5 py-1 text-left ${ring} hover:bg-foreground/6 focus-visible:bg-foreground/6 disabled:pointer-events-none disabled:opacity-50`}
                  onClick={() => {
                    run()
                    setOpen(false)
                  }}
                >
                  <Icon aria-hidden className={`size-glyph self-center ${muted}`} />
                  <span className="min-w-0 truncate">{name}</span>
                  {description && (
                    <span title={description} className={`col-start-2 truncate text-meta ${muted}`}>
                      {description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** An icon and a word in a line of facts: a state. `busy` spins the icon; `tone: "error"` marks trouble. */
export function WorkbenchMark({ icon: Icon, busy, tone, children }: { icon?: WorkbenchIcon; busy?: boolean; tone?: "error"; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 ${tone === "error" ? "text-destructive" : ""}`}>
      {Icon && <Icon aria-hidden className={`size-glyph shrink-0 ${busy ? "animate-spin" : ""}`} />}
      {children}
    </span>
  )
}

/** How much of a limit is used, `share` from 0 to 1: a thin bar before the words that say it. `tone: "error"` once it is too much. */
export function WorkbenchMeter({ share, tone, title, children }: { share: number; tone?: "error"; title?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${tone === "error" ? "text-destructive" : ""}`} title={title}>
      <span aria-hidden className="relative h-1 w-12 shrink-0 overflow-hidden rounded-full bg-foreground/10">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${tone === "error" ? "bg-destructive" : "bg-foreground/40"}`}
          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
        />
      </span>
      {children}
    </span>
  )
}

/**
 * Something the person should read before going on: a problem, a refusal, a caution. In a tool or a page it is a
 * rounded line; as a `bar` it runs across the top of a content. `dismiss` gives it a way out.
 */
export function WorkbenchNotice({
  tone = "error",
  icon: Icon = tone === "error" ? CircleAlertIcon : InfoIcon,
  bar: across,
  dismiss,
  children,
}: {
  tone?: "error" | "note"
  icon?: WorkbenchIcon
  bar?: boolean
  dismiss?: () => void
  children: ReactNode
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-1.5 px-2 py-1 ${across ? "shrink-0 border-b" : "rounded-md"} ${tone === "error" ? "bg-destructive/10 text-destructive" : `bg-foreground/5 ${muted}`}`}
    >
      <Icon aria-hidden className="mt-0.5 size-glyph shrink-0" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {dismiss && (
        <button type="button" className={`shrink-0 rounded-sm text-meta underline ${ring}`} onClick={dismiss}>
          Dismiss
        </button>
      )}
    </p>
  )
}

/**
 * A document's page, under its toolbar: it scrolls itself, in one measured column, or across the whole width when
 * `wide`. `title` heads it, `aside` runs quieter after the title, `meta` is the line of facts under it. Its children are
 * blocks: sections, folds, code, a notice.
 */
export function WorkbenchPage({
  title,
  aside,
  meta,
  wide,
  children,
}: {
  title?: ReactNode
  aside?: ReactNode
  meta?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <article className={`flex flex-col gap-4 px-4 pt-3 pb-8 ${wide ? "" : "mx-auto max-w-4xl"}`}>
        {(title !== undefined || meta !== undefined) && (
          <header className="flex flex-col gap-1">
            {title !== undefined && (
              <h2 className="flex flex-wrap items-baseline gap-x-2 text-large font-semibold">
                {title}
                {aside !== undefined && <span className={`font-normal ${muted}`}>{aside}</span>}
              </h2>
            )}
            {meta !== undefined && <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-meta ${muted}`}>{meta}</div>}
          </header>
        )}
        {children}
      </article>
    </div>
  )
}

/** A named block of a page, always shown; `aside` runs quieter after its name. */
export function WorkbenchSection({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId()

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-1.5">
      <h3 id={id} className="flex flex-wrap items-baseline gap-x-2 font-medium">
        {label}
        {aside !== undefined && <span className={`text-meta font-normal tabular-nums ${muted}`}>{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

/**
 * A named block of a page that opens on demand: what is worth having and not worth reading every time. `aside` says in
 * a few words what is inside, so it need not be opened to know; `open` is how it starts.
 */
export function WorkbenchFold({ label, aside, open: initial = false, children }: { label: string; aside?: ReactNode; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex min-w-0 flex-col">
      <CollapsibleTrigger className={`-ml-1 flex h-row w-fit max-w-full items-center gap-1 rounded-md pr-2 pl-1 text-left ${ring} hover:bg-foreground/5`}>
        <ChevronRightIcon aria-hidden className={`size-glyph shrink-0 ${muted} transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 font-medium">{label}</span>
        {aside !== undefined && <span className={`min-w-0 truncate pl-1 text-meta tabular-nums ${muted}`}>{aside}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-1.5">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** One setting in a Settings tool: its name, what it changes, and its control. */
export function WorkbenchSetting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className={muted}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * One row of a list or tree: its label, a quieter detail after it, a badge at the end. A row says what it is and no
 * more: `icon` is a mark before the label, for a state worth a glance, spinning while `busy`; `tone: "error"` marks a row
 * in trouble; `tip` is everything else about it, terms and values shown beside the row on hover or focus; `actions` are
 * what can be done to it, shown at its end while it is pointed at. In a list, `description` runs under the row in full,
 * wrapped, where a detail would be cut short.
 */
export type WorkbenchRow = {
  id: string
  label: ReactNode
  title?: string
  icon?: WorkbenchIcon
  busy?: boolean
  detail?: ReactNode
  description?: ReactNode
  badge?: ReactNode
  tone?: "error"
  tip?: WorkbenchFacts
  /** What can be done to it without opening it, as icon buttons at its end, shown while it is pointed at or holds focus. */
  actions?: WorkbenchAction[]
}

/** Rows under a heading that counts them. */
export type WorkbenchGroup = { id: string; label: string; rows: WorkbenchRow[] }

/** A row's mark, label, detail and badge, the same in every list and tree. */
const RowBody = ({ row }: { row: WorkbenchRow }) => (
  <>
    {row.icon && <row.icon aria-hidden className={`size-glyph shrink-0 self-center ${row.busy ? "animate-spin" : ""}`} />}
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="min-w-0 truncate">{row.label}</span>
      {row.detail !== undefined && <span className={`min-w-0 shrink-[8] truncate text-meta ${muted}`}>{row.detail}</span>}
    </span>
    {row.badge !== undefined && <span className={`shrink-0 text-meta tabular-nums ${muted}`}>{row.badge}</span>}
  </>
)

/** A row's actions at its far end, inside its highlight: there while the row is pointed at or something in it holds focus. */
const RowActions = ({ row }: { row: WorkbenchRow }) =>
  row.actions?.length ? (
    <span className="hidden shrink-0 items-start group-focus-within/row:flex group-hover/row:flex">
      {row.actions.map((action) => (
        <WorkbenchButton key={action.id} action={action} />
      ))}
    </span>
  ) : null

/** How wide a tip may be, with its offset and a margin from the window's edge: where a row has less beside it, the tip goes under it. */
const TIP_ROOM = 320 + 6 + 8

/**
 * A row with its tip beside it, or under it where the row spans the window, as in a toolbar at the bottom; the row is
 * the one element given.
 */
function Tipped({ row, children }: { row: WorkbenchRow; children: ReactNode }) {
  const [side, setSide] = useState<"right" | "bottom">("right")
  const measure = (event: { currentTarget: Element }) => {
    const box = event.currentTarget.getBoundingClientRect()

    setSide(Math.max(window.innerWidth - box.right, box.left) >= TIP_ROOM ? "right" : "bottom")
  }

  if (!row.tip?.length) return children

  return (
    <Tooltip>
      <TooltipTrigger asChild onPointerEnter={measure} onFocus={measure}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} align="start" collisionPadding={8}>
        <Terms rows={row.tip} columns="grid-cols-[auto_minmax(0,1fr)]" gap="gap-y-1" />
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The list every region uses: rows of one anatomy, optionally in groups. Given `open`, a click or Enter opens a row and
 * arrows move between rows; without it the rows only report. `active` marks the row of the document in view.
 */
export function WorkbenchList({
  label,
  rows,
  groups,
  active,
  open,
  empty,
}: {
  label: string
  rows?: WorkbenchRow[]
  groups?: WorkbenchGroup[]
  active?: string
  open?: (id: string) => void
  empty: string
}) {
  const dismiss = useContext(Dismiss)
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-row]")]
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const to = ({ ArrowDown: at + 1, ArrowUp: at - 1 } as Record<string, number>)[event.key]

    if (at < 0 || to === undefined || !all[to]) return
    event.preventDefault()
    all[to].focus()
  }
  const list = (items: WorkbenchRow[], name: string) =>
    items.length ? (
      <ul aria-label={name} className="flex flex-col">
        {items.map((row) => {
          const described = row.description !== undefined
          const look = `flex w-full min-w-0 rounded-md pr-2 text-left ${described ? "flex-col py-1" : "h-row items-center gap-2"} ${row.tone === "error" ? "text-destructive" : ""}`
          const body = described ? (
            <>
              <span className="flex w-full min-w-0 items-baseline gap-2">
                <RowBody row={row} />
              </span>
              <span className={`text-meta break-words ${muted}`}>{row.description}</span>
            </>
          ) : (
            <RowBody row={row} />
          )

          return (
            <li
              key={row.id}
              className={`group/row flex min-w-0 rounded-md ${row.id === active ? "bg-foreground/10" : open || row.actions?.length ? "hover:bg-foreground/5" : ""}`}
            >
              <Tipped row={row}>
                {open ? (
                  <button
                    type="button"
                    data-row
                    aria-current={row.id === active ? "true" : undefined}
                    title={row.title}
                    className={`${look} pl-2 ${ring}`}
                    onClick={() => {
                      open(row.id)
                      dismiss()
                    }}
                  >
                    {body}
                  </button>
                ) : (
                  <div title={row.title} className={`${look} pl-2`}>
                    {body}
                  </div>
                )}
              </Tipped>
              <RowActions row={row} />
            </li>
          )
        })}
      </ul>
    ) : (
      <p className={`px-2 py-1 ${muted}`}>{empty}</p>
    )

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1 p-1" onKeyDown={move}>
        {groups ? groups.map((g) => <ListGroup key={g.id} group={g} list={list} />) : list(rows ?? [], label)}
      </div>
    </TooltipProvider>
  )
}

function ListGroup({ group, list }: { group: WorkbenchGroup; list: (rows: WorkbenchRow[], name: string) => ReactNode }) {
  const id = useId()

  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className={`flex h-row items-center justify-between px-2 text-meta ${muted}`}>
        {group.label}
        <span className="tabular-nums">{group.rows.length}</span>
      </h3>
      {list(group.rows, group.label)}
    </section>
  )
}

/**
 * A node of a tree: a row, with the rows under it. A `folder` is a branch that only holds its rows, as in a file tree:
 * it is no document, so a click or Enter opens and closes it and never calls `open`.
 */
export type WorkbenchNode = WorkbenchRow & { children?: WorkbenchNode[]; folder?: boolean }

/**
 * Rows nested under rows, each branch opened or closed by its twisty; all start open. A click or Enter opens a row, or
 * opens and closes a folder; Up and Down move between the rows shown, Right opens a branch or enters it, Left closes it
 * or goes up to its parent. While `filtered`, every branch shows open, so each match stays in view. `active` marks the
 * row of the document in view.
 */
export function WorkbenchTree({
  label,
  nodes,
  active,
  open,
  empty,
  filtered,
}: {
  label: string
  nodes: WorkbenchNode[]
  active?: string
  open: (id: string) => void
  empty: string
  filtered?: boolean
}) {
  const dismiss = useContext(Dismiss)
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const branch = (node: WorkbenchNode) => !!node.children?.length
  const expanded = (node: WorkbenchNode) => branch(node) && (filtered || !closed.has(node.id))
  const toggle = (id: string, next: boolean) =>
    setClosed((current) => {
      const changed = new Set(current)

      if (next) changed.delete(id)
      else changed.add(id)

      return changed
    })
  const choose = (node: WorkbenchNode) => {
    if (node.folder) return filtered || toggle(node.id, !expanded(node))
    open(node.id)
    dismiss()
  }
  const shown: { node: WorkbenchNode; level: number; parent?: string }[] = []
  const walk = (list: WorkbenchNode[], level: number, parent?: string) => {
    for (const node of list) {
      shown.push({ node, level, parent })
      if (expanded(node)) walk(node.children!, level + 1, node.id)
    }
  }

  walk(nodes, 1)

  const focusable = shown.some((s) => s.node.id === active) ? active : shown[0]?.node.id
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const here = shown[at]

    if (!here) return

    const focus = (i: number) => items[i]?.focus()
    const { node, parent } = here

    switch (event.key) {
      case "ArrowDown":
        focus(at + 1)
        break
      case "ArrowUp":
        focus(at - 1)
        break
      case "Home":
        focus(0)
        break
      case "End":
        focus(items.length - 1)
        break
      case "ArrowRight":
        if (branch(node) && !expanded(node)) toggle(node.id, true)
        else if (expanded(node)) focus(at + 1)
        break
      case "ArrowLeft":
        if (expanded(node) && !filtered) toggle(node.id, false)
        else if (parent !== undefined) focus(shown.findIndex((s) => s.node.id === parent))
        break
      case "Enter":
      case " ":
        choose(node)
        break
      default:
        return
    }
    event.preventDefault()
  }

  if (!shown.length) return <p className={`px-3 py-1 ${muted}`}>{empty}</p>

  return (
    <TooltipProvider>
      <div role="tree" aria-label={label} className="flex flex-col p-1" onKeyDown={move}>
        {shown.map(({ node, level }) => (
          <Tipped key={node.id} row={node}>
            <div
              role="treeitem"
              aria-level={level}
              aria-expanded={branch(node) ? expanded(node) : undefined}
              aria-current={node.id === active ? "true" : undefined}
              tabIndex={node.id === focusable ? 0 : -1}
              title={node.title}
              className={`flex h-row w-full min-w-0 cursor-default items-center gap-1 rounded-md pr-2 ${ring} ${node.id === active ? "bg-foreground/10" : "hover:bg-foreground/5"} ${node.tone === "error" ? "text-destructive" : ""}`}
              style={{ paddingLeft: 2 + (level - 1) * 12 }}
              onClick={() => choose(node)}
            >
              {branch(node) ? (
                <span
                  aria-hidden
                  className={`grid size-4 shrink-0 place-items-center rounded-sm ${muted} hover:bg-foreground/10 hover:text-foreground`}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!filtered) toggle(node.id, !expanded(node))
                  }}
                >
                  <ChevronRightIcon className={`size-glyph transition-transform ${expanded(node) ? "rotate-90" : ""}`} />
                </span>
              ) : (
                <span aria-hidden className="size-4 shrink-0" />
              )}
              <RowBody row={node} />
            </div>
          </Tipped>
        ))}
      </div>
    </TooltipProvider>
  )
}

/** The one inline search field: a welcome page's filter and an open tool filter. */
export function SearchField({
  label,
  value,
  set,
  autoFocus,
  escape,
}: {
  label: string
  value: string
  set: (value: string) => void
  autoFocus?: boolean
  escape?: () => void
}) {
  return (
    <label className="flex h-row min-w-0 flex-1 items-center gap-1.5 rounded-md bg-foreground/5 px-1.5">
      <SearchIcon aria-hidden className={`size-icon shrink-0 ${muted}`} />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        value={value}
        onChange={(event) => set(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && escape) {
            event.preventDefault()
            escape()
          }
        }}
      />
    </label>
  )
}

/** A region's quiet line when it has nothing to show, centred in it: a tool's, or the content's. */
export const WorkbenchEmpty = ({ children }: { children: ReactNode }) => (
  <div className={`grid min-h-0 flex-1 place-items-center p-6 text-center ${muted}`}>
    <div className="max-w-72">{children}</div>
  </div>
)
