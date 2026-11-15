// The map: the work on babavoss as a graph of issues, each on a narrative, an effort going in its own direction, with
// edges to the issues it came out of, and the reasoning of each of its iterations: why, what was decided, what came of it.
// The agent keeps it current as the work branches; the person reads where each narrative stands on the page.
import { action, surface, view, type Update } from "babavoss/core/index.ts"
import * as seed from "./seed.ts"

export type Status = "draft" | "backlog" | "lane" | "done"
export type Iteration = { title: string; why: string; decided: string; outcome: string }
export type Node = { n: number; title: string; status: Status; narrative: string; from: number[]; iterations: Iteration[] }
export type Narrative = { id: string; title: string; about: string }
export type Model = { origin: string; narratives: Narrative[]; nodes: Node[]; next: number }
type Result = Update<Model, never>

const STATUSES: Status[] = ["draft", "backlog", "lane", "done"]
const open = (node: Node) => node.status !== "done"
const find = (m: Model, n: number) => m.nodes.find((node) => node.n === n)
const changed = (m: Model, n: number, change: (node: Node) => Node): Model => ({ ...m, nodes: m.nodes.map((node) => (node.n === n ? change(node) : node)) })

/** Whether `to` is reachable from `n` along "came out of" edges, read forwards: linking `to` from `n` would then close a cycle. */
function reaches(m: Model, n: number, to: number): boolean {
  const seen = new Set<number>()
  const walk = (at: number): boolean => {
    if (at === to) return true
    if (seen.has(at)) return false
    seen.add(at)

    return m.nodes.filter((node) => node.from.includes(at)).some((node) => walk(node.n))
  }

  return walk(n)
}

/** The issues a comma list names, or why it cannot be read: "9, 26" → [9, 26]. */
function parents(m: Model, list: string): number[] | string {
  const ns = list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  const missing = ns.find((n) => !Number.isInteger(n) || !find(m, n))

  return missing === undefined ? [...new Set(ns)] : `There is no issue ${missing}`
}

const add = action({
  name: "add",
  description: "Put an issue on the map: a short imperative title, the narrative id it belongs to, and from, the issues it came out of as a comma list, or empty",
  subject: {},
  inputs: { title: "string", narrative: "string", from: "string" },
  update(m: Model, { title, narrative, from }): Result {
    if (!title.trim()) return { refused: "An issue needs a title" }
    if (!m.narratives.some((x) => x.id === narrative.trim())) return { refused: `There is no narrative ${narrative.trim()}` }

    const ns = parents(m, from)

    if (typeof ns === "string") return { refused: ns }

    const node: Node = { n: m.next, title: title.trim(), status: "backlog", narrative: narrative.trim(), from: ns, iterations: [] }

    return {
      model: { ...m, nodes: [...m.nodes, node], next: m.next + 1 },
      notices: [{ text: `Issue ${node.n}, ${node.title}, is on the map`, at: `/issues/${node.n}` }],
    }
  },
})
const narrate = action({
  name: "narrate",
  description: "Start a narrative, an effort going in its own direction: a short lower-case id, a title, and a line on what it is about",
  subject: {},
  inputs: { id: "string", title: "string", about: "string" },
  update(m: Model, { id, title, about }): Result {
    if (!/^[a-z][a-z0-9-]*$/.test(id.trim())) return { refused: "An id is lower-case letters, digits and dashes" }
    if (m.narratives.some((x) => x.id === id.trim())) return { refused: `There is a narrative ${id.trim()} already` }
    if (!title.trim()) return { refused: "A narrative needs a title" }

    return { model: { ...m, narratives: [...m.narratives, { id: id.trim(), title: title.trim(), about: about.trim() }] } }
  },
})
const link = action({
  name: "link",
  description: ({ n }) => `Say issue ${n} came out of another issue as well`,
  subject: { n: "number" },
  inputs: { from: "number" },
  update(m: Model, { n, from }): Result {
    if (!find(m, from)) return { refused: `There is no issue ${from}` }
    if (from === n) return { refused: "An issue cannot come out of itself" }
    if (find(m, n)!.from.includes(from)) return { refused: `Issue ${n} already came out of ${from}` }
    if (reaches(m, n, from)) return { refused: `Issue ${from} came out of ${n}, so ${n} cannot come out of it` }

    return { model: changed(m, n, (node) => ({ ...node, from: [...node.from, from] })) }
  },
})
const unlink = action({
  name: "unlink",
  description: ({ n }) => `Say issue ${n} did not come out of one of the issues it names`,
  subject: { n: "number" },
  inputs: { from: "number" },
  update: (m: Model, { n, from }): Result =>
    find(m, n)!.from.includes(from)
      ? { model: changed(m, n, (node) => ({ ...node, from: node.from.filter((x) => x !== from) })) }
      : { refused: `Issue ${n} did not come out of ${from}` },
})
const iterate = action({
  name: "iterate",
  description: ({ n }) => `Begin a new iteration of issue ${n}: a short title, and why, one sentence on why another pass is needed`,
  subject: { n: "number" },
  inputs: { title: "string", why: "string" },
  update: (m: Model, { n, title, why }): Result =>
    title.trim() && why.trim()
      ? {
          model: changed(m, n, (node) => ({ ...node, iterations: [...node.iterations, { title: title.trim(), why: why.trim(), decided: "", outcome: "" }] })),
          notices: [{ text: `Issue ${n} begins iteration ${find(m, n)!.iterations.length + 1}: ${title.trim()}`, at: `/issues/${n}` }],
        }
      : { refused: "An iteration needs a title and why" },
})
/** Write one part of the latest iteration's reasoning. */
const latest = (name: "decide" | "conclude", part: "decided" | "outcome", says: string) =>
  action({
    name,
    description: ({ n }) => `Say ${says} in the latest iteration of issue ${n}, in one sentence`,
    subject: { n: "number" },
    inputs: { text: "string" },
    update: (m: Model, { n, text }): Result =>
      text.trim()
        ? {
            model: changed(m, n, (node) => ({
              ...node,
              iterations: node.iterations.map((x, i) => (i === node.iterations.length - 1 ? { ...x, [part]: text.trim() } : x)),
            })),
          }
        : { refused: "Say it in a sentence" },
  })
const decide = latest("decide", "decided", "what was decided")
const conclude = latest("conclude", "outcome", "what came of it")
const status = action({
  name: "status",
  description: ({ n }) => `Set where issue ${n} stands: draft, backlog, lane or done`,
  subject: { n: "number" },
  inputs: { to: "string" },
  update(m: Model, { n, to }): Result {
    const next = to.trim() as Status

    if (!STATUSES.includes(next)) return { refused: "An issue is draft, backlog, lane or done" }

    return {
      model: changed(m, n, (node) => ({ ...node, status: next })),
      notices: [{ text: `Issue ${n}, ${find(m, n)!.title}, is ${next}`, at: `/issues/${n}` }],
    }
  },
})
const move = action({
  name: "move",
  description: ({ n }) => `Move issue ${n} to another narrative, by its id`,
  subject: { n: "number" },
  inputs: { narrative: "string" },
  update: (m: Model, { n, narrative }): Result =>
    m.narratives.some((x) => x.id === narrative.trim())
      ? { model: changed(m, n, (node) => ({ ...node, narrative: narrative.trim() })) }
      : { refused: `There is no narrative ${narrative.trim()}` },
})

/** An issue as a narrative lists it: one line, with the path that has its reasoning. */
const row = (node: Node) => ({
  at: `/issues/${node.n}`,
  n: node.n,
  title: node.title,
  status: node.status,
  from: node.from,
  iterations: node.iterations.length,
})
/** An issue another names, by its number and title, so the frame's Go can list it. */
const ref = (node: Node) => ({ at: `/issues/${node.n}`, n: node.n, title: node.title })
/** How the frame's menu for an issue groups its actions: its reasoning, its place in the graph, where it stands. */
const menu = [
  { label: "Reasoning", actions: ["iterate", "decide", "conclude"] },
  { label: "Graph", actions: ["link", "unlink", "move"] },
  { label: "Status", actions: ["status"] },
]

const pages = view([add, narrate, link, unlink, iterate, decide, conclude, status, move], {
  "/": (m) => ({
    title: "Map",
    how: "Each issue sits on a narrative, an effort going its own way, and names the issues it came out of. When an issue needs another pass, iterate it and say what was decided and what came of it, so its reasoning stays readable. A narrative's path lists its issues; an issue's path has its reasoning and what can be done with it.",
    origin: m.origin,
    narratives: m.narratives.map((x) => {
      const mine = m.nodes.filter((node) => node.narrative === x.id)

      return { at: `/narratives/${x.id}`, id: x.id, title: x.title, issues: mine.length, open: mine.filter(open).length }
    }),
    issues: m.nodes.length,
    open: m.nodes.filter(open).length,
    add: add.bind({}),
    narrate: narrate.bind({}),
  }),
  "/narratives/:id": (m, { id }) => {
    const x = m.narratives.find((x) => x.id === id)

    return x && { title: x.title, id: x.id, about: x.about, issues: m.nodes.filter((node) => node.narrative === x.id).map(row) }
  },
  "/issues/:n": (m, { n }) => {
    const node = find(m, Number(n))

    if (!node) return undefined

    const x = m.narratives.find((x) => x.id === node.narrative)
    const subject = { n: node.n }

    return {
      n: node.n,
      title: node.title,
      status: node.status,
      narrative: { at: `/narratives/${node.narrative}`, id: node.narrative, title: x?.title ?? node.narrative },
      from: node.from.flatMap((p) => (find(m, p) ? [ref(find(m, p)!)] : [])),
      to: m.nodes.filter((other) => other.from.includes(node.n)).map(ref),
      iterations: node.iterations.map((x, i) => ({ n: i + 1, ...x })),
      menu,
      iterate: iterate.bind(subject),
      ...(node.iterations.length && { decide: decide.bind(subject), conclude: conclude.bind(subject) }),
      status_: status.bind(subject),
      link: link.bind(subject),
      ...(node.from.length && { unlink: unlink.bind(subject) }),
      move: move.bind(subject),
    }
  },
})

export const init = (): Model => ({
  origin: "babavoss experience",
  narratives: seed.narratives,
  nodes: seed.nodes,
  next: Math.max(...seed.nodes.map((node) => node.n)) + 1,
})

export default surface<Model, { kind: "none" }, never>({
  description: "See the work on babavoss as a map: issues on narratives that branch, each with the reasoning of its iterations. Use when asking where an effort stands, what led to an issue, or recording another pass on one.",
  init,
  // State that is not a map's, as from an earlier shape, starts again from the seed.
  restore: (saved) => (Array.isArray((saved as Partial<Model> | undefined)?.nodes) && Array.isArray((saved as Model).narratives) ? (saved as Model) : init()),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
