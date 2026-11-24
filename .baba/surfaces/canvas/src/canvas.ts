// The canvas: one record of one worktree's work, which every canvas tab of the worktree opens. A title; the brief and now,
// each markdown; tickets, each a unit of the work in
// a phase, worked by the main agent or by a subagent in its own worktree, with the short posts made as it went; asks, the
// decisions put to the person, each with its options and the answer once given; notes, the long material, each with a
// summary; and the journal, what happened, in order. Pure: no store, no clock.

export const SECTIONS = ["brief", "now"] as const
export type SectionName = (typeof SECTIONS)[number]
export type Section = { text: string; updatedAt?: string }
export type By = "main" | "worker" | "person"
export type Post = { at: string; by: By; text: string }
export type Status = "open" | "working" | "waiting" | "done" | "dropped"
export const STATUSES: Status[] = ["open", "working", "waiting", "done", "dropped"]
export type Worker = "main" | "subagent"
/** `order`: the canvas's clock when its status last changed, so a section keeps the order things arrived in it. */
export type Ticket = {
  n: number
  title: string
  about: string
  status: Status
  worker: Worker
  worktree?: string
  /** The phase of the work it belongs to, by name; phases are in the order they first appear among the tickets. */
  phase?: string
  posts: Post[]
  createdAt: string
  updatedAt: string
  order: number
}
/** A decision put to the person. `recommended`: the index of the option proposed. */
export type Ask = {
  n: number
  question: string
  context: string
  options: string[]
  recommended?: number
  createdAt: string
  answer?: { text: string; by: By; at: string }
  withdrawn?: string
}
export type Note = { n: number; title: string; summary: string; text: string; createdAt: string; updatedAt: string }
/** What happened: its first line is the headline, the rest markdown behind it. */
export type Entry = { at: string; by: By; text: string }
export type Canvas = {
  title: string
  sections: Record<SectionName, Section>
  tickets: Ticket[]
  asks: Ask[]
  notes: Note[]
  journal: Entry[]
  next: number
  nextAsk: number
  nextNote: number
  clock: number
  /** The phases in the order set; phases not named in it follow in the order they first appear among the tickets. */
  phaseOrder?: string[]
}

export const empty = (): Canvas => ({
  title: "",
  sections: { brief: { text: "" }, now: { text: "" } },
  tickets: [],
  asks: [],
  notes: [],
  journal: [],
  next: 1,
  nextAsk: 1,
  nextNote: 1,
  clock: 0,
})

/**
 * The canvas a value read from the record's file holds, or undefined where it holds none. A record kept before asks, notes
 * and the journal is taken as it is, with them empty; the agenda and recap it had become notes of those names.
 */
export function asCanvas(value: unknown): Canvas | undefined {
  const c = value as (Partial<Canvas> & { sections?: Record<string, Section | undefined> }) | undefined

  if (
    !c ||
    typeof c.title !== "string" ||
    !c.sections ||
    !SECTIONS.every((s) => typeof c.sections![s]?.text === "string") ||
    !Array.isArray(c.tickets) ||
    typeof c.next !== "number" ||
    typeof c.clock !== "number"
  )
    return undefined
  if (Array.isArray(c.asks) && Array.isArray(c.notes) && Array.isArray(c.journal) && typeof c.nextAsk === "number" && typeof c.nextNote === "number")
    return c as Canvas

  const notes: Note[] = []

  for (const [name, title] of [["agenda", "Agenda"], ["recap", "Recap"]] as const) {
    const s = c.sections[name]

    if (s?.text.trim()) {
      const t = s.updatedAt ?? new Date(0).toISOString()

      notes.push({ n: notes.length + 1, title, summary: `The ${name} as it was written before notes`, text: s.text, createdAt: t, updatedAt: t })
    }
  }

  return {
    ...(c as Canvas),
    sections: { brief: c.sections.brief!, now: c.sections.now! },
    asks: [],
    notes,
    journal: [],
    nextAsk: 1,
    nextNote: notes.length + 1,
  }
}

export const ticket = (c: Canvas, n: number) => c.tickets.find((t) => t.n === n)
export const ask = (c: Canvas, n: number) => c.asks.find((a) => a.n === n)
export const note = (c: Canvas, n: number) => c.notes.find((x) => x.n === n)
export const finished = (t: Ticket) => t.status === "done" || t.status === "dropped"
export const settled = (a: Ask) => !!a.answer || !!a.withdrawn
/** The phases of the tickets: in the order set, then the rest in the order they first appear among the tickets. */
export function phases(c: Canvas) {
  const used = [...new Set(c.tickets.flatMap((t) => (t.phase ? [t.phase] : [])))]
  const set = (c.phaseOrder ?? []).filter((p) => used.includes(p))

  return [...set, ...used.filter((p) => !set.includes(p))]
}

/** Options as given on one line, `a | *b | c`, the one marked `*` proposed; undefined where fewer than two are given. */
export function optionsOf(line: string): { options: string[]; recommended?: number } | undefined {
  const parts = line
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
  const marked = parts.flatMap((p, i) => (p.startsWith("*") ? [i] : []))
  const options = parts.map((p) => p.replace(/^\*\s*/, "")).filter(Boolean)

  if (options.length < 2 || options.length !== parts.length || marked.length > 1) return undefined

  return { options, ...(marked.length && { recommended: marked[0] }) }
}

/** A note as it is kept: a markdown file in the worktree's notes/, by its name without `.md`. */
export type NoteFile = { name: string; text: string; updatedAt: string }
/** A note as the canvas shows it: its title (the file's `# heading`), its summary (the paragraph after it), the rest, the
 * figures it embeds with what each holds (null where the file is not there), and what the figure rules find in it. */
export type Shown = { name: string; title: string; summary: string; text: string; figures: Record<string, string | null>; problems: string[]; updatedAt: string }

/** Where a note embeds a figure file: `![…](figures/NAME.html)`. */
const EMBED = /!\[[^\]]*\]\((figures\/[\w.-]+\.html)\)/g
/** A figure written in a note's text: a fenced block marked `html figure`. */
const INLINE = /^```html[ \t]+figure[^\n]*\n([\s\S]*?)\n```/gm

/** What breaks the figure rules in one figure's HTML: fixed colours, viewport heights, and anything loaded from outside. */
export function lint(html: string): string[] {
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), ...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1] ?? "").join("\n")
  const found: string[] = []
  const colour = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/i.exec(styles)

  if (colour) found.push(`uses a fixed colour (${colour[0]}); use the theme variables`)
  if (/\b\d+(?:\.\d+)?d?vh\b/i.test(styles)) found.push("uses vh units; let the content set the height")
  if (/<(?:script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /@import|url\(\s*["']?(?:https?:)?\/\//i.test(styles))
    found.push("loads something from outside; keep it self-contained")

  return found
}

/** A note file as the canvas shows it, with the figure files of notes/figures/ it embeds. */
export function show(file: NoteFile, figures: Record<string, string>): Shown {
  const lines = file.text.replace(/\r\n/g, "\n").split("\n")
  let at = 0
  const skip = () => {
    while (at < lines.length && !lines[at]!.trim()) at++
  }

  skip()
  const heading = /^#\s+(.+)$/.exec(lines[at] ?? "")
  const title = heading ? heading[1]!.trim() : file.name

  if (heading) at++
  skip()
  let summary = ""

  if (at < lines.length && /^[A-Za-z0-9*_`"'(]/.test(lines[at]!)) {
    const start = at

    while (at < lines.length && lines[at]!.trim()) at++
    summary = lines.slice(start, at).join(" ").trim()
  }
  const text = lines.slice(at).join("\n").trim()
  const embedded: Record<string, string | null> = {}
  const problems: string[] = []

  for (const [, ref] of text.matchAll(EMBED)) {
    const html = figures[ref!]

    embedded[ref!] = html ?? null
    if (html === undefined) problems.push(`${ref} is not there`)
    else problems.push(...lint(html).map((p) => `${ref} ${p}`))
  }
  ;[...text.matchAll(INLINE)].forEach(([, html], i) => problems.push(...lint(html ?? "").map((p) => `figure ${i + 1} in the text ${p}`)))

  return { name: file.name, title, summary, text, figures: embedded, problems, updatedAt: file.updatedAt }
}

/** A note kept in the record before notes were files, as the file it becomes. */
export const fileOf = (x: Note): NoteFile => ({
  name:
    x.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `note-${x.n}`,
  text: `# ${x.title}\n\n${x.summary ? `${x.summary}\n\n` : ""}${x.text}\n`,
  updatedAt: x.updatedAt,
})
