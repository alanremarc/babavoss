// The queue: the session's work as issues, each a draft, in the backlog, in a lane or done, and each on a narrative, an
// effort going its own way, with the issues it came out of and the reasoning of its iterations. The agent orchestrates up
// to five lanes, each a subagent in its own worktree delivering one issue at a time, and keeps this current as the work
// moves; the person reads it on the page, as a list or by narrative. Nothing here does the work: it says who is delivering what
// and why. The work is the session's, not a tab's: every queue tab of the session opens the one record (store.ts) and
// writes through to it, so a second tab shows the same work and a closed one loses nothing. A tab keeps a copy of the work
// as it last heard it, so it shows at once, and a new one says it is reading until it first hears it; a tab kept from
// before brings its issues into the record once (migrate.ts).
import { action, admit, detail, sessionDir, surface, view, type Call, type Surface, type Update } from "babavoss/core/index.ts"
import { adopt, isLegacy } from "./migrate.ts"
import { openOnly, outline, type Elsewhere, type Place } from "./outline.ts"
import { fileIn, store as kept, type Store } from "./store.ts"
import { DEFAULT, empty, find, isWork, parents, reaches, union, withDefault, type Issue, type Narrative, type Status, type Work } from "./work.ts"

export const LANES = 5
/** How many updates an issue's channel keeps: the latest. */
const KEPT = 200

/**
 * `brings`: work kept from before, to merge into the session's when the tab opens it; `trouble`: why the record cannot be
 * reached; `reading`: a new tab has not heard the record yet, so the work it holds is no one's and is not shown as none.
 */
export type Model = { work: Work; brings?: Work; trouble?: string; reading?: true }
export type Event = { kind: "heard"; work: Work } | { kind: "failed"; command: string; error: string }
export type Command = { kind: "open"; brings?: Work } | { kind: "apply"; call: Call }
type Result = Update<Work, never>

/** The work with issue `n` changed. */
const changed = (w: Work, n: number, change: (issue: Issue) => Issue): Work => ({ ...w, issues: w.issues.map((issue) => (issue.n === n ? change(issue) : issue)) })
/** The work with issue `n` changed and stamped, so each section keeps the order things arrived in it. */
const moved = (w: Work, n: number, change: (issue: Issue) => Issue): Work => ({
  ...changed(w, n, (issue) => ({ ...change(issue), order: w.clock })),
  clock: w.clock + 1,
})

/** A notice of what happened to issue `n`, about its path, which a dropped one no longer has: "Issue 3, Title, is done". */
const said = (w: Work, n: number, what: string) => {
  const issue = find(w, n)!

  return { text: `${issue.status === "draft" ? "Draft" : "Issue"} ${n}, ${issue.title}, ${what}`, at: `/issues/${n}` }
}

/** A new issue: on the narrative named, else its first parent's, else the default one. */
function made(w: Work, args: { title: string; about: string; from?: string; narrative?: string }, status: Status): Result {
  const title = args.title.trim()
  const about = args.about.trim()

  if (!title || !about) return { refused: "An issue needs a title and a line about it" }

  const from = parents(w, args.from ?? "")

  if (typeof from === "string") return { refused: from }

  const named = args.narrative?.trim()

  if (named && !w.narratives.some((x) => x.id === named)) return { refused: `There is no narrative ${named}` }

  const narrative = named || (from.length ? find(w, from[0]!)!.narrative : DEFAULT.id)
  const issue: Issue = { n: w.next, title, about, status, order: w.clock, narrative, from, iterations: [] }
  const placed = narrative === DEFAULT.id ? withDefault(w) : w

  return { model: { ...placed, issues: [...placed.issues, issue], next: w.next + 1, clock: w.clock + 1 } }
}

const ABOUT = "a short imperative title, and about, brief markdown on what changes and why"
const BRANCH = "; from, the issues it came out of as a comma list, or empty; narrative, its id, or empty for its first parent's"
const add = action({
  name: "add",
  description: `Add an issue the person asked for to the bottom of the backlog: ${ABOUT}`,
  subject: {},
  inputs: { title: "string", about: "string" },
  update: (w: Work, args): Result => made(w, args, "backlog"),
})
const addFrom = action({
  name: "add_from",
  description: `Add an issue the person asked for, as add does, with what it came out of: ${ABOUT}${BRANCH}`,
  subject: {},
  inputs: { title: "string", about: "string", from: "string", narrative: "string" },
  update: (w: Work, args): Result => made(w, args, "backlog"),
})
const draft = action({
  name: "draft",
  description: "Suggest an issue the person has not asked for, as a draft: title and about as for add; it is theirs to look at, on the page or with you",
  subject: {},
  inputs: { title: "string", about: "string" },
  update: (w: Work, args): Result => made(w, args, "draft"),
})
const draftFrom = action({
  name: "draft_from",
  description: `Suggest an issue as a draft, as draft does, with what it came out of: ${ABOUT}${BRANCH}`,
  subject: {},
  inputs: { title: "string", about: "string", from: "string", narrative: "string" },
  update: (w: Work, args): Result => made(w, args, "draft"),
})
const narrate = action({
  name: "narrate",
  description: "Start a narrative, an effort going in its own direction: a short lower-case id, a title, and a line on what it is about",
  subject: {},
  inputs: { id: "string", title: "string", about: "string" },
  update(w: Work, { id, title, about }): Result {
    if (!/^[a-z][a-z0-9-]*$/.test(id.trim())) return { refused: "An id is lower-case letters, digits and dashes" }
    if (w.narratives.some((x) => x.id === id.trim())) return { refused: `There is a narrative ${id.trim()} already` }
    if (!title.trim()) return { refused: "A narrative needs a title" }

    return { model: { ...w, narratives: [...w.narratives, { id: id.trim(), title: title.trim(), about: about.trim() }] } }
  },
})
const approve = action({
  name: "approve",
  description: ({ n }) => `Approve draft ${n} into the backlog: the person does on the page, and you do once they tell you to go ahead with it`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, (issue) => ({ ...issue, status: "backlog" })), notices: [said(w, n, "approved: it joins the backlog")] }),
})
const describe = action({
  name: "describe",
  description: ({ n }) => `Rewrite what issue ${n} is about, as brief markdown`,
  subject: { n: "number" },
  inputs: { about: "string" },
  update: (w: Work, { n, about }): Result => (about.trim() ? { model: changed(w, n, (issue) => ({ ...issue, about: about.trim() })) } : { refused: "Say what it is about" }),
})
const note = action({
  name: "note",
  description: ({ n }) => `Say where issue ${n} stands in one line: what is being done, or what it waits for; empty text clears it`,
  subject: { n: "number" },
  inputs: { text: "string" },
  update: (w: Work, { n, text }): Result => ({ model: changed(w, n, (issue) => ({ ...issue, note: text.trim() })) }),
})
const post = action({
  name: "post",
  description: ({ n }) => `Post an update on issue ${n} to its channel, as its lane's worker: a line or two on what was just found, done or decided; the person reads them to follow the work`,
  subject: { n: "number" },
  inputs: { text: "string" },
  update: (w: Work, { n, text }, call): Result =>
    text.trim()
      ? { model: changed(w, n, (issue) => ({ ...issue, updates: [...(issue.updates ?? []), { t: call.t, text: text.trim() }].slice(-KEPT) })) }
      : { refused: "Say what happened" },
})
const start = action({
  name: "start",
  description: ({ n }) => `Give issue ${n} to a lane, 1 to ${LANES}, when a subagent begins on it; a draft the person said to build starts the same way`,
  subject: { n: "number" },
  inputs: { lane: "number" },
  update(w: Work, { n, lane }): Result {
    if (!Number.isInteger(lane) || lane < 1 || lane > LANES) return { refused: `There are lanes 1 to ${LANES}` }

    const busy = w.issues.find((issue) => issue.status === "lane" && issue.lane === lane)

    if (busy) return { refused: `Lane ${lane} is delivering issue ${busy.n}` }

    return { model: moved(w, n, (issue) => ({ ...issue, status: "lane", lane })), notices: [said(w, n, `started in lane ${lane}`)] }
  },
})
const done = action({
  name: "done",
  description: ({ n }) => `Mark issue ${n} done: its work is merged into main, where the person can see it`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "done" })), notices: [said(w, n, "is done")] }),
})
const back = action({
  name: "back",
  description: ({ n }) => `Return issue ${n} to the backlog`,
  subject: { n: "number" },
  inputs: {},
  update: (w: Work, { n }): Result => ({ model: moved(w, n, ({ lane: _lane, ...issue }) => ({ ...issue, status: "backlog" })) }),
})
const drop = action({
  name: "drop",
  description: ({ n }) => `Remove issue ${n}: it will not be done`,
  subject: { n: "number" },
  inputs: {},
  // What came out of it no longer names it, so the graph keeps no edge to nothing.
  update: (w: Work, { n }): Result => ({
    model: { ...w, issues: w.issues.filter((issue) => issue.n !== n).map((issue) => ({ ...issue, from: issue.from.filter((p) => p !== n) })) },
    notices: [said(w, n, "dropped").text],
  }),
})
const link = action({
  name: "link",
  description: ({ n }) => `Say issue ${n} came out of another issue as well`,
  subject: { n: "number" },
  inputs: { from: "number" },
  update(w: Work, { n, from }): Result {
    if (!find(w, from)) return { refused: `There is no issue ${from}` }
    if (from === n) return { refused: "An issue cannot come out of itself" }
    if (find(w, n)!.from.includes(from)) return { refused: `Issue ${n} already came out of ${from}` }
    if (reaches(w, n, from)) return { refused: `Issue ${from} came out of ${n}, so ${n} cannot come out of it` }

    return { model: changed(w, n, (issue) => ({ ...issue, from: [...issue.from, from] })) }
  },
})
const unlink = action({
  name: "unlink",
  description: ({ n }) => `Say issue ${n} did not come out of one of the issues it names`,
  subject: { n: "number" },
  inputs: { from: "number" },
  update: (w: Work, { n, from }): Result =>
    find(w, n)!.from.includes(from)
      ? { model: changed(w, n, (issue) => ({ ...issue, from: issue.from.filter((x) => x !== from) })) }
      : { refused: `Issue ${n} did not come out of ${from}` },
})
const move = action({
  name: "move",
  description: ({ n }) => `Move issue ${n} to another narrative, by its id`,
  subject: { n: "number" },
  inputs: { narrative: "string" },
  update: (w: Work, { n, narrative }): Result =>
    w.narratives.some((x) => x.id === narrative.trim())
      ? { model: changed(w, n, (issue) => ({ ...issue, narrative: narrative.trim() })) }
      : { refused: `There is no narrative ${narrative.trim()}` },
})
const iterate = action({
  name: "iterate",
  description: ({ n }) => `Begin another pass at issue ${n}: a short title, and why, one sentence on why another pass is needed`,
  subject: { n: "number" },
  inputs: { title: "string", why: "string" },
  update: (w: Work, { n, title, why }): Result =>
    title.trim() && why.trim()
      ? {
          model: changed(w, n, (issue) => ({ ...issue, iterations: [...issue.iterations, { title: title.trim(), why: why.trim(), decided: "", outcome: "" }] })),
          notices: [{ text: `Issue ${n} begins iteration ${find(w, n)!.iterations.length + 1}: ${title.trim()}`, at: `/issues/${n}` }],
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
    update: (w: Work, { n, text }): Result =>
      text.trim()
        ? { model: changed(w, n, (issue) => ({ ...issue, iterations: issue.iterations.map((x, i, all) => (i === all.length - 1 ? { ...x, [part]: text.trim() } : x)) })) }
        : { refused: "Say it in a sentence" },
  })
const decide = latest("decide", "decided", "what was decided")
const conclude = latest("conclude", "outcome", "what came of it")

const by = (a: Issue, b: Issue) => a.order - b.order
const open = (issue: Issue) => issue.status !== "done"
/** An issue as the stack lists it: one line, with the path that has the rest. */
const row = (issue: Issue) => ({
  at: `/issues/${issue.n}`,
  n: issue.n,
  title: issue.title,
  status: issue.status,
  ...(issue.lane && { lane: issue.lane }),
  narrative: issue.narrative,
  ...(issue.from.length && { from: issue.from }),
  ...(issue.note && { note: issue.note }),
})
/** An issue another names, by its number and title, so the menu's Go can list it. */
const ref = (issue: Issue) => ({ at: `/issues/${issue.n}`, n: issue.n, title: issue.title, status: issue.status })
/** A narrative as a list names it: what it is about, and how many of its issues there are and are open. */
function counted(w: Work, x: Narrative) {
  const mine = w.issues.filter((issue) => issue.narrative === x.id)

  return { at: `/narratives/${x.id}`, id: x.id, title: x.title, about: x.about, issues: mine.length, open: mine.filter(open).length }
}
/** Issues on other narratives as a table's cell has them, a line per narrative: ["leftovers: 50, 51"]. */
const across = (by: Elsewhere) => Object.entries(by).map(([id, ns]) => `${id}: ${ns.join(", ")}`)
/** An issue in its place in a narrative's outline: how deep it stands, and what else it came out of and led to. */
const placed = ({ issue, depth, also, from, to }: Place) => {
  const { at, n, narrative: _narrative, from: _from, ...line } = row(issue)

  return {
    at,
    n,
    depth,
    ...line,
    ...(also.length && { also }),
    ...(Object.keys(from).length && { from: across(from) }),
    ...(Object.keys(to).length && { to: across(to) }),
  }
}
const READS =
  "Its outline, its issues read top to bottom: depth 0 for an issue that came out of none here, else it stands under the nearest " +
  "issue above it one less deep, the first here it came out of; also, the others here it came out of; from and to, what it came out " +
  "of and led to on other narratives, a line per narrative."
/** A narrative whole: its outline, every issue or, when `only`, those open and the path to them. */
function narrative(w: Work, id: string | undefined, only: boolean) {
  const x = w.narratives.find((x) => x.id === id)

  if (!x) return undefined

  const all = outline(w, x.id)

  return {
    ...counted(w, x),
    reads: READS,
    ...(only ? { only: "open", all: { at: `/narratives/${x.id}` } } : { open_only: { at: `/narratives/${x.id}/open` } }),
    outline: (only ? openOnly(all) : all).map(placed),
  }
}
/** How the page's menu for an issue groups its actions: moving it along, its words and edges, its reasoning. */
const menu = [
  { label: "Move", actions: ["start", "done", "back", "move"] },
  { label: "Edit", actions: ["describe", "note", "link", "unlink"] },
  { label: "Reasoning", actions: ["iterate", "decide", "conclude"] },
]
/** An issue whole, at its own path: what it is about, where it came from and led, its reasoning, and what can be done with it now. */
function whole(w: Work, issue: Issue) {
  const subject = { n: issue.n }
  const x = w.narratives.find((x) => x.id === issue.narrative)

  return {
    ...row(issue),
    about: issue.about,
    narrative: { at: `/narratives/${issue.narrative}`, id: issue.narrative, title: x?.title ?? issue.narrative },
    from: issue.from.flatMap((p) => (find(w, p) ? [ref(find(w, p)!)] : [])),
    to: w.issues.filter((other) => other.from.includes(issue.n)).map(ref),
    iterations: issue.iterations.map((x, i) => ({ n: i + 1, ...x })),
    ...(issue.updates?.length && { updates: issue.updates }),
    menu,
    ...(issue.status === "draft" && { attention: { who: "person", why: "to look at this draft" }, approve: approve.bind(subject) }),
    describe: describe.bind(subject),
    note_: note.bind(subject),
    ...((issue.status === "backlog" || issue.status === "draft") && { start: start.bind(subject) }),
    ...(issue.status === "lane" && { post: post.bind(subject) }),
    ...(issue.status !== "done" && { done: done.bind(subject) }),
    ...((issue.status === "lane" || issue.status === "done") && { back: back.bind(subject) }),
    move: move.bind(subject),
    link: link.bind(subject),
    ...(issue.from.length && { unlink: unlink.bind(subject) }),
    iterate: iterate.bind(subject),
    ...(issue.iterations.length && { decide: decide.bind(subject), conclude: conclude.bind(subject) }),
    drop: drop.bind(subject),
  }
}
const actions = [add, addFrom, draft, draftFrom, narrate, approve, describe, note, post, start, done, back, drop, link, unlink, move, iterate, decide, conclude]
const pages = view(actions, {
  "/": (w) => {
    const lanes = w.issues.filter((issue) => issue.status === "lane").sort((a, b) => a.lane! - b.lane!)
    const backlog = w.issues.filter((issue) => issue.status === "backlog").sort(by)
    const drafts = w.issues.filter((issue) => issue.status === "draft").sort(by)
    const finished = w.issues.filter((issue) => issue.status === "done").sort((a, b) => b.order - a.order)

    return {
      title: "Queue",
      how:
        "The session's work as the person follows it, so it is worth keeping true as the work moves. What the person asks for is added " +
        "as an issue; what you would suggest is a draft, theirs to look at. Once they say to go ahead with a draft, on the page or in " +
        "the conversation, it is as good as approved: start it like any issue. A lane is a subagent delivering one issue; a note says " +
        "where an issue stands, and its worker can post to it as it goes. Done means merged into main. add_from and draft_from also name " +
        "what an issue came out of and its narrative, an effort going its own way; another pass at an issue is an iteration, with why, " +
        `what was decided and how it ended. An issue's path has the rest. There are ${LANES} lanes; the backlog's top is next.`,
      lanes: LANES,
      free: Array.from({ length: LANES }, (_, i) => i + 1).filter((lane) => !lanes.some((issue) => issue.lane === lane)),
      narratives: w.narratives.map((x) => {
        const { about: _about, ...named } = counted(w, x)

        return named
      }),
      // What is done is detail: read at the tab's path, and only counted in the shell's present.
      issues: [...[...lanes, ...backlog, ...drafts].map(row), ...finished.map((issue) => detail(row(issue)))],
      ...(drafts.length && { attention: { who: "person", why: `to look at ${drafts.length} draft${drafts.length > 1 ? "s" : ""}` } }),
      add: add.bind({}),
      add_from: addFrom.bind({}),
      draft: draft.bind({}),
      draft_from: draftFrom.bind({}),
      narrate: narrate.bind({}),
    }
  },
  // Those with open issues first, each kept in the order it began.
  "/narratives": (w) => ({ title: "Narratives", narratives: w.narratives.map((x) => counted(w, x)).sort((a, b) => Number(!a.open) - Number(!b.open)) }),
  "/narratives/:id": (w, { id }) => narrative(w, id, false),
  "/narratives/:id/open": (w, { id }) => narrative(w, id, true),
  "/issues/:n": (w, { n }) => {
    const issue = find(w, Number(n))

    return issue && whole(w, issue)
  },
})
/** The archive's places are the list's, below /archive, so the tab's route keeps which view it is in and the menu offers the same there. */
const listed = (path: string) => path.replace(/^\/archive(?=\/|$)/, "") || "/"
const viewAt = (w: Work, path: string) => pages.view(w, listed(path))

/** The queue, with where the session's work is kept given: the session's file in the runtime, memory in its stories. */
export function queue(work: Store): Surface<Model, Event, Command> {
  return surface<Model, Event, Command>({
    description:
      "Track the session's work as issues, each in the backlog, in a lane or done, on a narrative with what it came out of and the reasoning of each pass, " +
      "seen as a list or by narrative. Use when work is asked for, starts, moves, branches, needs another pass or lands.",
    init: () => ({ work: empty(), reading: true }),
    // A tab kept from before holds the queue's issues itself: they are brought into the session's work. State that is
    // neither, as when the surface was still the template it began as, starts empty.
    restore(saved) {
      const tab = saved as Partial<Model> | undefined

      // What a tab holds is brought too, so the record never has fewer issues than a tab showed, even where its file is gone.
      if (tab && isWork(tab.work)) return { work: tab.work, brings: tab.brings && isWork(tab.brings) ? union(tab.brings, tab.work) : tab.work }
      if (isLegacy(saved)) {
        const brought = adopt(saved)

        return { work: brought, brings: brought }
      }

      return { work: empty() }
    },
    start: (m) => [{ kind: "open", ...(m.brings && { brings: m.brings }) }],
    session: (c) => c.kind === "open",
    update(m, message): Update<Model, Command> {
      if (message.kind === "heard") return { model: { work: message.work } }
      if (message.kind === "failed") {
        const { reading: _reading, ...held } = m

        return { model: { ...held, trouble: `${message.command}: ${message.error}` } }
      }

      const at = { ...message, path: listed(message.path) }
      const r = pages.update(m.work, at)

      if ("refused" in r) return r

      return { model: { ...m, work: r.model }, commands: [{ kind: "apply", call: at }], ...(r.notices && { notices: r.notices }) }
    },
    view(m, path) {
      const seen = viewAt(m.work, path)

      if (!seen || path !== "/") return seen
      if (m.trouble) return { ...seen, broken: `the session's work cannot be kept: ${m.trouble}` }

      return m.reading ? { ...seen, reading: true } : seen
    },
    async run(c, send, signal) {
      if (c.kind === "open") return work.open(c.brings, (w) => send({ kind: "heard", work: w }), signal)
      // The record may have moved since this tab last heard it: what is no longer offered there is not applied, and every tab
      // hears the record as it is.
      work.apply((w) => {
        const { path, handle, args } = c.call
        const seen = viewAt(w, path)

        if (!seen || typeof admit(seen, path, handle, args) === "string") return undefined

        const r = pages.update(w, c.call)

        return "refused" in r ? undefined : r.model
      })
    },
    // The map was a view the page had; what it showed, the narratives now show, each as an outline of its issues.
    absent: (_m, path) => (/^\/map(?=\/|$)/.test(path) ? `the map is gone: the narratives are at /narratives, each an outline of its issues at /narratives/ID` : undefined),
    failed: (c, error) => ({ kind: "failed", command: c.kind, error }),
  })
}

export default queue(kept(() => fileIn(sessionDir())))
