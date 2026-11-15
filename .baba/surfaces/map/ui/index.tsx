// The map's page: the issues as cards on a plane that grows out of one origin, a narrative in each direction, edges from
// what an issue came out of, and at the right a panel with the narratives or the selected issue's reasoning, iteration by
// iteration. What is selected is the tab's route, /issues/N or /narratives/ID, so a refresh and the agent's pointing land
// on it; panning, zooming, hovering and the panel's being open are the page's own.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  LoaderCircleIcon,
  MaximizeIcon,
  MinusIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PlusIcon,
  WaypointsIcon,
} from "lucide-react"
import { Button } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"
import { CARD, layout, type Point } from "./layout.ts"

type Status = "draft" | "backlog" | "lane" | "done"
type Row = { at: string; n: number; title: string; status: Status; from: number[]; iterations: number }
type Story = { at: string; id: string; title: string; issues: number; open: number }
type Root = { origin: string; narratives: Story[]; issues: number; open: number }
type Told = { id: string; title: string; about: string; issues: Row[] }
type Ref = { at: string; n: number; title: string }
type Iteration = { n: number; title: string; why: string; decided: string; outcome: string }
type Whole = { n: number; title: string; status: Status; narrative: { id: string; title: string }; from: Ref[]; to: Ref[]; iterations: Iteration[] }
type Node = Row & { narrative: string }
type View = { x: number; y: number; k: number }

export const icon = <WaypointsIcon aria-hidden />

const HUES = 6
const hue = (i: number) => `var(--map-${(i % HUES) + 1})`
const NAMES: Record<Status, string> = { lane: "In a lane", backlog: "Backlog", draft: "Draft", done: "Done" }
const ZOOM = { min: 0.15, max: 2.5 }
const clamp = (k: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, k))
const ease = (t: number) => 1 - (1 - t) ** 3

function Mark({ status, className = "size-3" }: { status: Status; className?: string }) {
  const size = `${className} shrink-0`

  if (status === "lane") return <LoaderCircleIcon className={`${size} text-primary animate-spin [animation-duration:2.5s]`} aria-hidden />
  if (status === "done") return <CircleCheckIcon className={`${size} text-muted-foreground/70`} aria-hidden />
  if (status === "draft") return <CircleDashedIcon className={`${size} text-muted-foreground`} aria-hidden />

  return <CircleIcon className={size} aria-hidden />
}

/** Every narrative's issues, kept current: one live read per narrative, since / lists only their counts. */
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

/** The path of reasoning through issue `n`: everything it came out of, and everything that came out of it. */
function lineage(n: number, nodes: Node[]): Set<number> {
  const by = new Map(nodes.map((node) => [node.n, node]))
  const out = new Set([n])
  const up = (m: number) => by.get(m)?.from.forEach((p) => !out.has(p) && (out.add(p), up(p)))
  const down = (m: number) => nodes.forEach((node) => node.from.includes(m) && !out.has(node.n) && (out.add(node.n), down(node.n)))

  up(n)
  down(n)

  return out
}

/** A curve from a parent's card to its child's, leaving and arriving along each one's narrative where that heads the right way. */
function curve(a: Point, b: Point, da: Point, db: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const k = Math.min(160, Math.max(30, length * 0.42))
  const chord = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  // A narrative's direction that points away from the other card would loop the curve: leave along the chord instead.
  const along = (d: Point) => (d.x * chord.x + d.y * chord.y < 0.2 ? chord : d)
  const out = along(da)
  const into = along(db)

  return `M${a.x},${a.y} C${a.x + out.x * k},${a.y + out.y * k} ${b.x - into.x * k},${b.y - into.y * k} ${b.x},${b.y}`
}

type CardProps = { node: Node; color: string; state: "lit" | "dim" | "plain"; picked: boolean; onPick: () => void; onHover: (on: boolean) => void }

function Card({ node, color, state, picked, onPick, onHover }: CardProps) {
  const done = node.status === "done"
  const live = node.status === "lane"

  return (
    <button
      type="button"
      data-card
      onClick={onPick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      title={`#${node.n} ${node.title}`}
      style={{ width: CARD.w, height: CARD.h, ["--hue" as string]: color }}
      className={[
        "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2 text-left outline-none transition-[opacity,box-shadow,border-color] duration-200",
        "focus-visible:ring-ring focus-visible:ring-2",
        node.status === "draft"
          ? "border-dashed border-[var(--hue)]/70 bg-background"
          : done
            ? "bg-muted border-border/70"
            : "bg-card text-card-foreground border-[var(--hue)]/45 shadow-sm",
        live ? "map-live" : "",
        picked ? "ring-2 ring-[var(--hue)] ring-offset-2 ring-offset-background" : "",
        state === "dim" ? "opacity-25" : "",
      ].join(" ")}
    >
      <span className="flex h-3.5 shrink-0 items-center gap-1.5">
        <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: color, opacity: done ? 0.55 : 1 }} />
        <span className={`text-meta font-medium tabular-nums ${done ? "text-muted-foreground" : ""}`}>#{node.n}</span>
        <span className="ml-auto">
          <Mark status={node.status} />
        </span>
      </span>
      <span className={`line-clamp-2 shrink-0 text-body leading-snug ${done ? "text-muted-foreground" : "text-foreground"}`}>{node.title}</span>
      {node.iterations > 0 && (
        <span className="mt-auto flex items-center gap-1" aria-label={`${node.iterations} iteration${node.iterations > 1 ? "s" : ""}`}>
          {Array.from({ length: node.iterations }, (_, i) => (
            <span
              key={i}
              className="size-1.5 rounded-full border"
              style={i === node.iterations - 1 ? { background: color, borderColor: color } : { borderColor: `color-mix(in oklch, ${color} 60%, transparent)` }}
            />
          ))}
        </span>
      )}
    </button>
  )
}

const Label = ({ children }: { children: ReactNode }) => <h3 className="text-muted-foreground text-badge font-medium tracking-wide uppercase">{children}</h3>

function Link({ to, color, onPick }: { to: Ref & { status?: Status }; color: string; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={to.title}
        className="hover:bg-muted flex h-6 w-full items-center gap-2 rounded-sm px-1.5 text-left text-body outline-none"
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-muted-foreground w-6 shrink-0 text-meta tabular-nums">#{to.n}</span>
        <span className="min-w-0 flex-1 truncate">{to.title}</span>
        {to.status && <Mark status={to.status} />}
      </button>
    </li>
  )
}

/** The selected issue's reasoning: where it came from, where it led, and each iteration's why, decision and outcome. */
type IssueProps = { whole: Whole; color: string; colorOf: (n: number) => string; statusOf: (n: number) => Status | undefined; go: (route: string) => void }

function Issue({ whole, color, colorOf, statusOf, go }: IssueProps) {
  const last = whole.iterations.length - 1

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <header className="flex flex-col gap-1.5">
        <div className="text-muted-foreground flex items-center gap-2 text-meta">
          <span className="text-foreground font-medium tabular-nums">#{whole.n}</span>
          <span className="flex items-center gap-1">
            <Mark status={whole.status} />
            {NAMES[whole.status]}
          </span>
          <button
            type="button"
            onClick={() => go(`/narratives/${whole.narrative.id}`)}
            className="hover:text-foreground ml-auto flex min-w-0 items-center gap-1.5 outline-none"
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate">{whole.narrative.title}</span>
          </button>
        </div>
        <h2 className="text-sm leading-snug font-medium text-balance">{whole.title}</h2>
      </header>
      {(whole.from.length > 0 || whole.to.length > 0) && (
        <div className="flex flex-col gap-3">
          {whole.from.length > 0 && (
            <section className="flex flex-col gap-1">
              <Label>Came out of</Label>
              <ul className="-mx-1.5">
                {whole.from.map((ref) => (
                  <Link key={ref.n} to={{ ...ref, status: statusOf(ref.n) }} color={colorOf(ref.n)} onPick={() => go(`/issues/${ref.n}`)} />
                ))}
              </ul>
            </section>
          )}
          {whole.to.length > 0 && (
            <section className="flex flex-col gap-1">
              <Label>Led to</Label>
              <ul className="-mx-1.5">
                {whole.to.map((ref) => (
                  <Link key={ref.n} to={{ ...ref, status: statusOf(ref.n) }} color={colorOf(ref.n)} onPick={() => go(`/issues/${ref.n}`)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <section className="flex flex-col gap-3 border-t pt-4">
        <Label>{whole.iterations.length ? `Iterations · ${whole.iterations.length}` : "Iterations"}</Label>
        {whole.iterations.length === 0 && <p className="text-muted-foreground text-body">One pass, no reasoning recorded.</p>}
        <ol className="flex flex-col">
          {whole.iterations.map((it, i) => (
            <li key={it.n} className="relative flex gap-3 pb-5 last:pb-0">
              {i < last && <span className="bg-border absolute top-4 bottom-0 left-[4.5px] w-px" aria-hidden />}
              <span
                className="relative mt-1 size-2.5 shrink-0 rounded-full border-2"
                style={
                  i === last
                    ? { background: color, borderColor: color }
                    : { borderColor: `color-mix(in oklch, ${color} 55%, var(--border))`, background: "var(--background)" }
                }
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-meta tabular-nums">{it.n}</span>
                  <h4 className="text-large leading-snug font-medium">{it.title}</h4>
                </div>
                <dl className="flex flex-col gap-1.5 text-body leading-relaxed">
                  {(
                    [
                      ["Why", it.why],
                      ["Decided", it.decided],
                      ["Outcome", it.outcome],
                    ] as const
                  ).map(([label, text]) => (
                    <div key={label} className="grid grid-cols-[4.25rem_1fr] gap-2">
                      <dt className="text-muted-foreground/80 pt-px text-meta">{label}</dt>
                      <dd className={text ? "text-foreground/90" : "text-muted-foreground/60 italic"}>
                        {text || (label === "Outcome" && i === last ? "Under way" : "Not said")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

/** The narratives, or the one in focus with its issues, open first. */
type NarrativesProps = { root: Root; told: Record<string, Told>; focus?: string; colorOf: (id: string) => string; go: (route: string) => void }

function Narratives({ root, told, focus, colorOf, go }: NarrativesProps) {
  const one = focus ? told[focus] : undefined
  const rank: Record<Status, number> = { lane: 0, draft: 1, backlog: 2, done: 3 }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-large font-medium">Narratives</h2>
        <span className="text-muted-foreground text-meta tabular-nums">
          {root.open} open · {root.issues} issues
        </span>
      </header>
      <ul className="-mx-2 flex flex-col gap-0.5">
        {root.narratives.map((x) => {
          const on = x.id === focus

          return (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => go(on ? "/" : `/narratives/${x.id}`)}
                aria-current={on}
                className={`hover:bg-muted aria-[current=true]:bg-accent flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left outline-none ${focus && !on ? "opacity-55" : ""}`}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(x.id) }} />
                  <span className="min-w-0 flex-1 truncate text-body font-medium">{x.title}</span>
                  <span className="text-muted-foreground text-meta tabular-nums">
                    {x.open}/{x.issues}
                  </span>
                </span>
                {told[x.id]?.about && <span className="text-muted-foreground line-clamp-2 pl-4 text-meta leading-snug">{told[x.id]!.about}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {one && (
        <section className="flex flex-col gap-1 border-t pt-4">
          <Label>Issues in {one.title.toLowerCase()}</Label>
          <ul className="-mx-1.5">
            {[...one.issues]
              .sort((a, b) => rank[a.status] - rank[b.status] || a.n - b.n)
              .map((row) => (
                <Link key={row.n} to={row} color={colorOf(one.id)} onPick={() => go(`/issues/${row.n}`)} />
              ))}
          </ul>
        </section>
      )}
      <section className="text-muted-foreground mt-2 flex flex-col gap-1.5 border-t pt-4 text-meta">
        <Label>Legend</Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {(["lane", "draft", "backlog", "done"] as const).map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <Mark status={status} />
              {NAMES[status]}
            </span>
          ))}
          <span className="col-span-2 flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <span className="border-muted-foreground/60 size-1.5 rounded-full border" />
              <span className="bg-muted-foreground size-1.5 rounded-full" />
            </span>
            Iterations, the latest filled
          </span>
        </div>
      </section>
    </div>
  )
}

export default function WorkMap() {
  const { view: root } = useLive<Root>("/")
  const { route, navigate } = useTab()
  const told = useNarratives(root)
  const picked = Number(/^\/issues\/(\d+)$/.exec(route)?.[1]) || undefined
  const focus = /^\/narratives\/([^/]+)$/.exec(route)?.[1]
  const { view: whole } = useLive<Whole>(picked ? `/issues/${picked}` : "/")
  const [panel, setPanel] = useState(true)
  const [hovered, setHovered] = useState<number>()

  const ids = (root?.narratives ?? []).map((x) => x.id)
  const nodes: Node[] = ids.flatMap((id) => (told[id]?.issues ?? []).map((row) => ({ ...row, narrative: id })))
  const shape = nodes.map((node) => `${node.n}:${node.narrative}:${node.from.join(",")}`).join(" ")
  const placed = useMemo(() => layout(ids, nodes), [ids.join(" "), shape])
  const index = new Map(ids.map((id, i) => [id, i]))
  const colorOf = (id: string) => hue(index.get(id) ?? 0)
  const byN = new Map(nodes.map((node) => [node.n, node]))
  const ready = root !== undefined && ids.length > 0 && ids.every((id) => told[id])
  const known = picked !== undefined && byN.has(picked)
  // What stands out: the hovered issue's lineage, else the narrative in focus, else the selected issue's lineage.
  const lit =
    hovered !== undefined
      ? lineage(hovered, nodes)
      : focus
        ? new Set(nodes.filter((node) => node.narrative === focus).map((node) => node.n))
        : known
          ? lineage(picked!, nodes)
          : undefined

  // The plane: world points times k, plus x and y, is where they are drawn; written to the DOM directly, never through React.
  const frame = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const at = useRef<View>({ x: 0, y: 0, k: 1 })
  const motion = useRef(0)
  const apply = () => {
    const { x, y, k } = at.current

    if (world.current) world.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`
    if (frame.current) {
      frame.current.style.backgroundSize = `${24 * k}px ${24 * k}px`
      frame.current.style.backgroundPosition = `${x}px ${y}px`
    }
  }
  const stop = () => cancelAnimationFrame(motion.current)
  const glide = (to: View, ms = 480) => {
    stop()

    const from = { ...at.current }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = ease(Math.min(1, (now - t0) / ms))

      at.current = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, k: from.k + (to.k - from.k) * t }
      apply()
      if (t < 1) motion.current = requestAnimationFrame(step)
    }

    motion.current = requestAnimationFrame(step)
  }
  /** The view that frames these points with room around them, never closer than `most`. */
  const framing = (points: Point[], most = 1.1): View | undefined => {
    const box = frame.current?.getBoundingClientRect()

    if (!box || !box.width || !points.length) return undefined

    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const [x0, x1, y0, y1] = [Math.min(...xs) - CARD.w / 2, Math.max(...xs) + CARD.w / 2, Math.min(...ys) - CARD.h / 2, Math.max(...ys) + CARD.h / 2]
    const k = clamp(Math.min(most, (box.width - 64) / (x1 - x0), (box.height - 64) / (y1 - y0)))

    return { k, x: box.width / 2 - ((x0 + x1) / 2) * k, y: box.height / 2 - ((y0 + y1) / 2) * k }
  }
  /** What fit frames: the origin, every card, and each narrative's label, about 150 wide on the side it reads from. */
  const everything = () => [
    { x: 0, y: 0 },
    ...placed.at.values(),
    ...ids.map((id) => {
      const { x, y, d } = far(id)

      return { x: x + (d.x < -0.3 ? CARD.w / 2 - 150 : d.x > 0.3 ? 150 - CARD.w / 2 : 0), y }
    }),
  ]
  const fit = (ms?: number) => {
    const to = framing(everything())

    if (to) ms === 0 ? ((at.current = to), apply()) : glide(to, ms)
  }
  const zoomBy = (factor: number, about?: Point) => {
    const box = frame.current?.getBoundingClientRect()

    if (!box) return

    const c = about ?? { x: box.width / 2, y: box.height / 2 }
    const { x, y, k } = at.current
    const next = clamp(k * factor)

    return { k: next, x: c.x - ((c.x - x) / k) * next, y: c.y - ((c.y - y) / k) * next }
  }

  // Frame the whole map once it is first drawn, then ease to what the route selects.
  const fitted = useRef(false)

  useEffect(() => {
    if (!ready || fitted.current) return
    fitted.current = true
    fit(0)
  }, [ready])

  // The route moved: ease the selected issue into view, or frame the narrative in focus.
  useEffect(() => {
    if (!ready) return

    const box = frame.current?.getBoundingClientRect()

    if (known && box) {
      const p = placed.at.get(picked!)!
      const k = Math.max(at.current.k, 0.95)
      const sx = p.x * at.current.k + at.current.x
      const sy = p.y * at.current.k + at.current.y
      const inside = sx > CARD.w && sx < box.width - CARD.w && sy > CARD.h && sy < box.height - CARD.h

      if (!inside || at.current.k < 0.95) glide({ k, x: box.width / 2 - p.x * k, y: box.height / 2 - p.y * k })
    } else if (focus) {
      const to = framing(nodes.filter((node) => node.narrative === focus).map((node) => placed.at.get(node.n)!), 1)

      if (to) glide(to)
    }
  }, [ready, picked, focus])

  // Keep the map in place on the screen as the panel opens or the window resizes: its centre stays its centre.
  const size = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const el = frame.current

    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry!.contentRect

      if (size.current.w) {
        at.current = { ...at.current, x: at.current.x + (w - size.current.w) / 2, y: at.current.y + (h - size.current.h) / 2 }
        apply()
      }
      size.current = { w, h }
    })

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  // The wheel: a pinch or a mouse wheel zooms about the pointer, a trackpad's two fingers pan.
  useEffect(() => {
    const el = frame.current

    if (!el) return

    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      stop()

      const box = el.getBoundingClientRect()
      const notch = event.deltaMode !== 0 || (event.deltaX === 0 && Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 50)

      if (event.ctrlKey || event.metaKey || notch) {
        const to = zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022)), { x: event.clientX - box.left, y: event.clientY - box.top })

        if (to) at.current = to
      } else at.current = { ...at.current, x: at.current.x - event.deltaX, y: at.current.y - event.deltaY }
      apply()
    }

    el.addEventListener("wheel", wheel, { passive: false })

    return () => el.removeEventListener("wheel", wheel)
  }, [])

  // Dragging pans, from anywhere; two pointers pinch. A drag that moved does not count as a click on the card under it.
  const pointers = useRef(new Map<number, Point>())
  const dragged = useRef(false)
  const down = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    stop()
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    dragged.current = false
  }
  const moveTo = (event: ReactPointerEvent) => {
    const last = pointers.current.get(event.pointerId)

    if (!last) return

    const now = { x: event.clientX, y: event.clientY }

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const before = Math.hypot(a!.x - b!.x, a!.y - b!.y)

      pointers.current.set(event.pointerId, now)

      const [c, d] = [...pointers.current.values()]
      const after = Math.hypot(c!.x - d!.x, c!.y - d!.y)
      const box = frame.current!.getBoundingClientRect()
      const to = before > 0 && zoomBy(after / before, { x: (c!.x + d!.x) / 2 - box.left, y: (c!.y + d!.y) / 2 - box.top })

      if (to) at.current = to
      dragged.current = true
      apply()

      return
    }
    if (!dragged.current && Math.hypot(now.x - last.x, now.y - last.y) < 4) return
    if (!dragged.current) frame.current?.setPointerCapture(event.pointerId)
    dragged.current = true
    pointers.current.set(event.pointerId, now)
    at.current = { ...at.current, x: at.current.x + now.x - last.x, y: at.current.y + now.y - last.y }
    apply()
  }
  const up = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (frame.current?.hasPointerCapture(event.pointerId)) frame.current.releasePointerCapture(event.pointerId)
  }

  const go = (to: string) => navigate(to)
  const status = (n: number) => byN.get(n)?.status
  /** Where a narrative's label stands: past its outermost card along its direction, level with the middle of its cards. */
  const far = (id: string) => {
    const theta = placed.angle.get(id) ?? 0
    const d = { x: Math.cos(theta), y: Math.sin(theta) }
    const mine = nodes.filter((node) => node.narrative === id).map((node) => placed.at.get(node.n)!)
    const reach = Math.max(0, ...mine.map((p) => p.x * d.x + p.y * d.y))
    const across = mine.length ? mine.reduce((s, p) => s + (p.x * -d.y + p.y * d.x), 0) / mine.length : 0
    const beyond = reach + Math.abs((CARD.w / 2) * d.x) + Math.abs((CARD.h / 2) * d.y) + 18

    return { x: d.x * beyond - d.y * across, y: d.y * beyond + d.x * across, d }
  }
  const roots = (id: string) => nodes.filter((node) => node.narrative === id && !node.from.some((p) => byN.get(p)?.narrative === id))
  const edgeState = (a: number, b: number) => (!lit ? "plain" : lit.has(a) && lit.has(b) ? "lit" : "dim")

  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={frame}
        className="relative min-w-0 flex-1 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        style={{ backgroundImage: "radial-gradient(circle, var(--map-dot) 1px, transparent 1.2px)" }}
        onPointerDown={down}
        onPointerMove={moveTo}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(event) => {
          if (dragged.current) {
            event.stopPropagation()
            dragged.current = false
          }
        }}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("[data-card],[data-control]") && route !== "/") go("/")
        }}
      >
        <div ref={world} className="absolute top-0 left-0 origin-top-left will-change-transform">
          <svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden>
            {ids.map((id) =>
              roots(id).map((node) => {
                const p = placed.at.get(node.n)!
                const d = placed.direction(node.n)
                const state = !lit ? "plain" : lit.has(node.n) ? "lit" : "dim"

                return (
                  <path
                    key={`o${node.n}`}
                    d={curve({ x: 0, y: 0 }, p, d, d)}
                    fill="none"
                    stroke={colorOf(id)}
                    strokeWidth={1.25}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                    opacity={state === "dim" ? 0.12 : 0.55}
                    className="transition-opacity duration-200"
                  />
                )
              })
            )}
            {nodes.flatMap((node) =>
              node.from
                .filter((p) => placed.at.has(p))
                .map((p) => {
                  const state = edgeState(p, node.n)
                  const done = node.status === "done" && byN.get(p)?.status === "done"

                  return (
                    <path
                      key={`${p}-${node.n}`}
                      d={curve(placed.at.get(p)!, placed.at.get(node.n)!, placed.direction(p), placed.direction(node.n))}
                      fill="none"
                      stroke={colorOf(node.narrative)}
                      strokeWidth={state === "lit" ? 2.25 : 1.5}
                      strokeLinecap="round"
                      opacity={state === "dim" ? 0.1 : state === "lit" ? 0.95 : done ? 0.4 : 0.8}
                      className="transition-opacity duration-200"
                    />
                  )
                })
            )}
          </svg>
          {ids.map((id) => {
            const { x, y, d } = far(id)
            const dimmed = lit && !nodes.some((node) => node.narrative === id && lit.has(node.n))

            return (
              <button
                key={id}
                type="button"
                data-control
                onClick={() => go(focus === id ? "/" : `/narratives/${id}`)}
                className={`absolute flex items-center gap-1.5 text-meta font-medium whitespace-nowrap transition-opacity duration-200 outline-none hover:underline ${dimmed ? "opacity-25" : ""}`}
                style={{ left: x, top: y, color: colorOf(id), transform: `translate(${d.x < -0.3 ? "-100%" : d.x > 0.3 ? "0" : "-50%"}, -50%)` }}
              >
                <span className="size-1.5 rounded-full" style={{ background: colorOf(id) }} />
                {root?.narratives.find((x) => x.id === id)?.title}
              </button>
            )
          })}
          <div
            className="bg-background text-muted-foreground absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-meta whitespace-nowrap shadow-sm"
          >
            <span className="bg-foreground size-1.5 rounded-full" />
            {root?.origin}
          </div>
          {nodes.map((node) => {
            const p = placed.at.get(node.n)!

            return (
              <div key={node.n} className="absolute" style={{ left: p.x, top: p.y }}>
                <Card
                  node={node}
                  color={colorOf(node.narrative)}
                  state={!lit ? "plain" : lit.has(node.n) ? "lit" : "dim"}
                  picked={node.n === picked}
                  onPick={() => go(`/issues/${node.n}`)}
                  onHover={(on) => setHovered((h) => (on ? node.n : h === node.n ? undefined : h))}
                />
              </div>
            )
          })}
        </div>
        <div
          data-control
          className="bg-background/90 absolute bottom-3 left-3 flex items-center rounded-lg border p-0.5 shadow-sm backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" onClick={() => glide(zoomBy(1.3)!, 200)}>
            <PlusIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" onClick={() => glide(zoomBy(1 / 1.3)!, 200)}>
            <MinusIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fit the map" title="Fit the map" onClick={() => fit()}>
            <MaximizeIcon />
          </Button>
        </div>
        {!panel && (
          <div
            data-control
            className="bg-background/90 absolute top-3 right-3 rounded-lg border p-0.5 shadow-sm backdrop-blur"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Show the panel" title="Show the panel" onClick={() => setPanel(true)}>
              <PanelRightOpenIcon />
            </Button>
          </div>
        )}
      </div>
      {panel && (
        <aside className="bg-muted/30 relative flex w-80 shrink-0 flex-col overflow-auto border-l" aria-label={known ? `Issue ${picked}` : "Narratives"}>
          <div className="bg-muted/30 sticky top-0 z-10 flex h-8 shrink-0 items-center gap-1 border-b px-2 backdrop-blur">
            {route !== "/" ? (
              <Button variant="ghost" size="xs" className="min-w-0" onClick={() => go(known ? `/narratives/${byN.get(picked!)!.narrative}` : "/")}>
                <span className="truncate">← {known ? (told[byN.get(picked!)!.narrative]?.title ?? "Narrative") : "All narratives"}</span>
              </Button>
            ) : (
              <span className="text-muted-foreground px-2 text-meta">Map</span>
            )}
            <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Hide the panel" title="Hide the panel" onClick={() => setPanel(false)}>
              <PanelRightCloseIcon />
            </Button>
          </div>
          {known && whole?.iterations ? (
            <Issue whole={whole} color={colorOf(whole.narrative.id)} colorOf={(n) => colorOf(byN.get(n)?.narrative ?? "")} statusOf={status} go={go} />
          ) : (
            root && <Narratives root={root} told={told} focus={focus && told[focus] ? focus : undefined} colorOf={colorOf} go={go} />
          )}
        </aside>
      )}
    </div>
  )
}
