// The eval's tasks, as data: each a name, a kind, the prompt said to the agent, a check on the fixture's work as the run left
// it, and a script the dry run plays instead of an agent. A prompt says what the person wants and never how to do it: whether
// the agent writes a program for a batch is what is measured. A check reads the work the run began with from the root, not
// from the fixture's seed, so a variant that changes the seed is checked against its own; an answer is the agent's last words.
// A probe needs what only baba's words or the present teach: a surface not yet open, an action not offered or refused, a
// place shown to the person, the surface rather than its files, a second message after the person acted between the two or
// after the agent's own call, a decision that is the person's, the root put to sleep, and intent carried rather than taken
// from a surface's words. A check settles what was done; how many reads it took is measured beside it, not checked.
import type { Json } from "babavoss/core/index.ts"
import type { Issue, Work } from "./fixture/queue/src/surface.ts"
import type { Checklist } from "./fixture/release/src/surface.ts"
import { FRESH } from "./fresh.ts"
import { ADAPTING } from "./adapting.ts"
import { JUDGMENT } from "./judgment.ts"

export type Kind = "single" | "find" | "read" | "batch" | "probe"
export type Verdict = { pass: boolean; reason: string }
/** A tool call of the agent's, as its stream names it: the turn it is in, from 0, and its result's text, cut. */
export type Call = { tool: string; input: string; turn?: number; result?: string }
/** The shell as the run left it: the highlights the agent raised, each place and why, and each tab's surface and model. */
export type Shell = { highlights: { at: string; text: string }[]; tabs: { surface: string; model: unknown }[] }
/** A command's exit code and the end of what it said. */
export type Ran = { code: number; out: string }
/**
 * What a fresh project held as the run left it: its surfaces by name; the files under .baba/surfaces/, its configuration
 * and the task's own, by their path in the project; `stale`, where the root said its code changed and was not restarted;
 * `bun check` and `bun test` in .baba/; each surface's answer to being opened after a
 * restart; the root's page built; and the world's entries the log heard once the rig touched the task's files.
 */
export type Look = {
  surfaces: string[]
  files: Record<string, string>
  stale: boolean
  /** Whether each of the paths a set-up project has is there: .baba/, the harnesses' files, the root's command. */
  there: Record<string, boolean>
  /** The root's answer at `/`, read before anything else. */
  present: string
  check: Ran
  test: Ran
  opened: Record<string, string>
  page: Ran
  heard: { by: string; did: string; surface: string }[]
  /** The judge's specs run on their own, where the task gives any. */
  judged?: Ran
}
/**
 * A project made by `baba init` alone, with no fixture: `files`, by their path in the project, written after it; `was`, the
 * release they were written for, committed as such before the variant is taken; `touch`, files the rig changes by hand
 * after the agent's turn, as the person would, each by a function of its text; `empty`, a repository where nothing was run,
 * for the agent to install babavoss in, the public install's command sent to the variant; `judge`, specs the rig writes
 * once the agent's turn ends, by their path in the project, which settle whether what the agent left still behaves as before.
 */
export type Fresh = { files?: Record<string, string>; was?: string; touch?: Record<string, (text: string) => string>; empty?: true; judge?: Record<string, string> }
/** `files`, the task's own files as the run left them, by their path in the project; `look`, a fresh project's. */
export type Checked = { seed: Work; final: Work; answer: string; shell?: Shell; calls?: Call[]; files?: Record<string, string>; look?: Look }
/** What the dry run does in the agent's place: its command's arguments, one call each, files it writes in the project, and its last words. */
export type Dry = { calls: string[][]; writes?: Record<string, string>; answer?: string }
/** What the person does on the page: a handle called at a path of the root. */
export type Act = { path: string; handle: string; args: Record<string, Json> }
export type Task = {
  name: string
  kind: Kind
  prompt: string
  check: (run: Checked) => Verdict
  dry: Dry
  /** Files the project holds beside .baba/, by their path in it, committed with it. */
  files?: Record<string, string>
  /** What the person does before the agent starts, once the fixture's tab is open. */
  before?: Act[]
  /** Later messages in the same session, each said once the turn before ends and the person has taken its `acts`. */
  then?: Later[]
  /** A project made by `baba init` alone, in place of the fixture's. */
  fresh?: Fresh
}
/** A later message: what the person does first, what they say, and the dry run's script for it; COMPACT compacts the session. */
export type Later = { acts?: Act[]; prompt: string; dry: Dry }
/** The message that compacts the session, as the person would type it: Claude Code's own command. */
export const COMPACT = "/compact"

const ok = (reason = "as asked"): Verdict => ({ pass: true, reason })
const no = (reason: string): Verdict => ({ pass: false, reason })
const issue = (w: Work, n: number) => w.issues.find((i) => i.n === n)
const same = (a: string | undefined, b: string) => (a ?? "").trim().replace(/[.!]$/, "").toLowerCase() === b.trim().replace(/[.!]$/, "").toLowerCase()
const shape = ({ order: _order, ...rest }: Issue) => JSON.stringify(rest)

/** The numbers of the issues the run changed, added or removed, order aside. */
export function touched(seed: Work, final: Work): number[] {
  const ns = new Set([...seed.issues, ...final.issues].map((i) => i.n))

  return [...ns].filter((n) => {
    const [a, b] = [issue(seed, n), issue(final, n)]

    return !a || !b || shape(a) !== shape(b)
  })
}

/** Passes where the run touched only `allowed`, then where `rest` passes too. */
const only = (allowed: number[], seed: Work, final: Work, rest: () => Verdict): Verdict => {
  const extra = touched(seed, final).filter((n) => !allowed.includes(n))

  return extra.length ? no(`also changed ${extra.join(", ")}`) : rest()
}
/** Every issue in `ns` passes `test`, or the first that does not says why. */
const every = (w: Work, ns: number[], test: (i: Issue) => string | undefined): Verdict => {
  for (const n of ns) {
    const found = issue(w, n)
    const wrong = found ? test(found) : "is gone"

    if (wrong) return no(`issue ${n} ${wrong}`)
  }

  return ok()
}
/** Whether the answer names `n` as a number of its own. */
const names = (answer: string, n: number) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(answer)

const BACKLOG_NOTE = "triaged in the November review"
const PARENT_NOTE = "out of: "
const DONE_LIST = [3, 5, 6, 8, 11, 13, 15, 17, 19, 22]
const EIGHT: [string, number, string][] = [
  ["Count the hook's words per event", 21, "Each hook event's text is measured, so the words can be cut where they weigh most."],
  ["Show a run's tokens per task", 26, "A run's header splits its tokens by task, not only in total."],
  ["Keep a tab's scroll across a restart", 27, "A tab comes back where it was scrolled, not only at its route."],
  ["Retry a call cut off by a restart", 24, "A call cut off by a restart is retried once the runtime answers."],
  ["Group notices by surface", 3, "Notices from one surface in a turn are told under one heading."],
  ["Say which draft holds a lane", 13, "A refused start names the issue in the lane and its title."],
  ["Time each request the runtime serves", 12, "The log says how long each request took."],
  ["Search the drawer's places too", 22, "The drawer's search finds places as well as actions."],
]
const eightList = EIGHT.map(([title, from, about]) => `- "${title}", out of issue ${from}: ${about}`).join("\n")
const backlogOf = (w: Work) => w.issues.filter((i) => i.status === "backlog").map((i) => i.n)
/** A call that writes a surface's code or what the root keeps on disk, rather than acting through the command. */
const WRITES = /\.baba\/surfaces|\.babavoss\/sessions|model\.json/
const writesAround = (calls: Call[] = []) =>
  calls.filter(
    ({ tool, input }) => ((tool === "Write" || tool === "Edit") && WRITES.test(input)) || (tool === "Bash" && WRITES.test(input) && /(sed -i|>|\btee\b|\bmv\b|\bcp\b|writeFile)/.test(input)),
  )
/** A call that reads or writes a surface's code or what the root keeps on disk. */
const LOOKS = /\.baba\/surfaces|\.babavoss\/sessions|model\.json|seed\.ts|src\/surface\.ts/
const looksAround = (calls: Call[] = []) => calls.filter(({ tool, input }) => (tool === "Bash" ? !/\.babavoss\/bin\/baba|\bbv\b|bun run baba/.test(input) : true) && LOOKS.test(input))
/** A subagent launched: what the dictating words asked for with every start, and no task does. */
const subagents = (calls: Call[] = []) => calls.filter(({ tool }) => tool === "Task" || tool === "Agent")
/** A run of the surfaces' command, however it is named. */
const WORDED = /(\.babavoss\/bin\/(baba|bv)|\bbv\b|bun run baba)/
/** The command's run that puts the root to sleep. */
const sleeps = (calls: Call[] = []) => calls.some(({ tool, input }) => tool === "Bash" && /(\.babavoss\/bin\/baba|\bbv|bun run baba)\s+(--session\s+\S+\s+)?sleep\b/.test(input))
const releaseOf = (shell?: Shell) => shell?.tabs.find((t) => t.surface === "release")?.model as Checklist | undefined
const NEW_ABOUT = "A run's header shows its dollars, its tokens in and out, and the minutes it took."
const RETITLE = "Rotate the runtime's log at two megabytes"

export const TASKS: Task[] = [
  {
    name: "done-one",
    kind: "single",
    prompt: "In the queue, mark issue 24 done: its work is merged.",
    check: ({ seed, final }) => only([24], seed, final, () => every(final, [24], (i) => (i.status === "done" ? undefined : `is ${i.status}`))),
    dry: { calls: [["/queue/issues/24", "done", "n=24"]] },
  },
  {
    name: "add-one",
    kind: "single",
    prompt: 'Add an issue to the queue titled "Cache the present between hooks", about: "The hook reads the present once per turn and keeps it until a call changes it."',
    check: ({ seed, final }) => {
      const added = final.issues.filter((i) => !issue(seed, i.n))
      const right = added.find((i) => same(i.title, "Cache the present between hooks"))

      if (!right) return no(added.length ? `added ${added.map((i) => `"${i.title}"`).join(", ")} instead` : "added nothing")
      if (added.length > 1) return no(`added ${added.length} issues`)
      if (!/once per turn/i.test(right.about)) return no(`its about is "${right.about}"`)

      return only([right.n], seed, final, () => (right.status === "backlog" ? ok() : no(`it is a ${right.status}`)))
    },
    dry: { calls: [["/queue", "add", "title=Cache the present between hooks", "about=The hook reads the present once per turn and keeps it until a call changes it."]] },
  },
  {
    name: "note-one",
    kind: "single",
    prompt: 'In the queue, set the note on issue 12 to "waiting on the person\'s review".',
    check: ({ seed, final }) => only([12], seed, final, () => every(final, [12], (i) => (same(i.note, "waiting on the person's review") ? undefined : `has note "${i.note ?? ""}"`))),
    dry: { calls: [["/queue/issues/12", "note", "n=12", "text=waiting on the person's review"]] },
  },
  {
    name: "start-oldest",
    kind: "find",
    prompt: "In the queue, start the oldest issue in the backlog in a lane that is free.",
    // A trap for intent: the dictating words say a lane is a subagent and a note says where an issue stands; neither was asked.
    check: ({ seed, final, calls }) => {
      const first = seed.issues.filter((i) => i.status === "backlog").sort((a, b) => a.order - b.order)[0]!
      const busy = seed.issues.filter((i) => i.status === "lane").map((i) => i.lane)

      if (subagents(calls).length) return no("launched a subagent, which was not asked for")

      return only([first.n], seed, final, () =>
        every(final, [first.n], (i) =>
          i.status !== "lane" ? `is ${i.status}` : busy.includes(i.lane) ? `went to busy lane ${i.lane}` : i.note !== issue(seed, i.n)!.note ? `has a note, "${i.note}", not asked for` : undefined,
        ),
      )
    },
    dry: { calls: [["/queue"], ["/queue/issues/3", "start", "n=3", "lane=2"]] },
  },
  {
    name: "move-drafts",
    kind: "find",
    prompt: 'In the queue, move every draft on the narrative "The shell as a desktop" to the narrative "Watching an agent use it".',
    check: ({ seed, final }) => {
      const drafts = seed.issues.filter((i) => i.status === "draft" && i.narrative === "shell").map((i) => i.n)

      return only(drafts, seed, final, () => every(final, drafts, (i) => (i.narrative === "lab" ? undefined : `is on ${i.narrative}`)))
    },
    dry: { calls: [["/queue/narratives/shell"], ["/queue/issues/10", "move", "n=10", "narrative=lab"], ["/queue/issues/20", "move", "n=20", "narrative=lab"], ["/queue/issues/29", "move", "n=29", "narrative=lab"]] },
  },
  {
    name: "lanes-read",
    kind: "read",
    prompt: "Which lanes of the queue are free, and which issue is each busy lane delivering? Answer in a sentence or two, by number.",
    check: ({ seed, final, answer }) => {
      const busy = seed.issues.filter((i) => i.status === "lane")
      const free = [1, 2, 3, 4, 5].filter((lane) => !busy.some((i) => i.lane === lane))
      const missing = [...busy.map((i) => i.n), ...free].filter((n) => !names(answer, n))

      if (touched(seed, final).length) return no(`changed ${touched(seed, final).join(", ")}`)
      if (missing.length) return no(`the answer does not name ${missing.join(", ")}`)
      // A lane by its number before the issue's in one clause, as "lane 1 is delivering 21" or "the busy lanes are 1, which is delivering #21".
      for (const i of busy)
        if (!new RegExp(`(^|\\D)${i.lane}\\b[^.;\\n]{0,40}?\\b${i.n}\\b|\\b${i.n}\\b[^.;\\n]*?lane\\s*${i.lane}(\\D|$)`, "i").test(answer))
          return no(`the answer does not put issue ${i.n} in lane ${i.lane}`)

      return ok()
    },
    dry: { calls: [["/queue"]], answer: "Lanes 2 and 5 are free; lane 1 is delivering issue 21, lane 3 issue 24, and lane 4 issue 27." },
  },
  {
    name: "open-count",
    kind: "read",
    prompt: 'How many open issues does the narrative "A root that stays up" have in the queue? Answer with the number.',
    check: ({ seed, final, answer }) => {
      const open = seed.issues.filter((i) => i.narrative === "alive" && i.status !== "done").length
      const said = [...answer.matchAll(/\d+/g)].map((m) => Number(m[0]))

      if (touched(seed, final).length) return no(`changed ${touched(seed, final).join(", ")}`)

      return said.includes(open) ? ok() : no(`answered "${answer.trim().slice(0, 80)}", not ${open}`)
    },
    dry: { calls: [["/queue"]], answer: "4" },
  },
  {
    name: "note-backlog",
    kind: "batch",
    prompt: `In the queue, set the note on every issue in the backlog to "${BACKLOG_NOTE}".`,
    check: ({ seed, final }) => {
      const ns = backlogOf(seed)

      return only(ns, seed, final, () => every(final, ns, (i) => (same(i.note, BACKLOG_NOTE) ? undefined : `has note "${i.note ?? ""}"`)))
    },
    dry: {
      calls: [
        ["/queue"],
        [
          "-e",
          `for (const n of [3,5,6,8,11,12,13,15,17,19,22,26]) console.log(await root.call("/queue/issues/" + n, "note", { n, text: "${BACKLOG_NOTE}" }))`,
        ],
      ],
    },
  },
  {
    name: "note-parents",
    kind: "batch",
    prompt: `In the queue, set the note on every issue in the backlog to "${PARENT_NOTE}" followed by the title of the issue it came out of.`,
    check: ({ seed, final }) => {
      const ns = backlogOf(seed)
      const parent = (i: Issue) => issue(seed, issue(seed, i.n)!.from[0]!)?.title ?? ""

      return only(ns, seed, final, () => every(final, ns, (i) => (same(i.note, `${PARENT_NOTE}${parent(i)}`) ? undefined : `has note "${i.note ?? ""}"`)))
    },
    dry: {
      calls: [
        [
          "-e",
          `const q = await root.read("/queue"); const title = (n) => q.issues.find((i) => i.n === n).title\n` +
            `for (const i of q.issues.filter((i) => i.status === "backlog")) console.log((await root.call("/queue/issues/" + i.n, "note", { n: i.n, text: "${PARENT_NOTE}" + title(i.from[0]) })).outcome)`,
        ],
      ],
    },
  },
  {
    name: "done-list",
    kind: "batch",
    prompt: `In the queue, mark these issues done: ${DONE_LIST.join(", ")}.`,
    check: ({ seed, final }) => only(DONE_LIST, seed, final, () => every(final, DONE_LIST, (i) => (i.status === "done" ? undefined : `is ${i.status}`))),
    dry: { calls: DONE_LIST.map((n) => [`/queue/issues/${n}`, "done", `n=${n}`]) },
  },
  {
    name: "create-eight",
    kind: "batch",
    prompt: `Add these eight issues to the queue's backlog, each coming out of the issue named, with its line as what it is about:\n${eightList}`,
    check: ({ seed, final }) => {
      const added = final.issues.filter((i) => !issue(seed, i.n))

      for (const [title, from] of EIGHT) {
        const found = added.filter((i) => same(i.title, title))

        if (found.length !== 1) return no(`${found.length} issues titled "${title}"`)
        if (!found[0]!.from.includes(from)) return no(`"${title}" came out of ${found[0]!.from.join(", ") || "nothing"}, not ${from}`)
        if (found[0]!.status !== "backlog") return no(`"${title}" is a ${found[0]!.status}`)
      }

      return only(
        added.map((i) => i.n),
        seed,
        final,
        () => (added.length === EIGHT.length ? ok() : no(`added ${added.length} issues`)),
      )
    },
    dry: { calls: EIGHT.map(([title, from, about]) => ["/queue", "add_from", `title=${title}`, `about=${about}`, `from=${from}`, "narrative="]) },
  },
  {
    // A surface listed but not open: found by its description, opened, and worked.
    name: "open-release",
    kind: "probe",
    prompt: "The changelog for the next release is written. Record that where the release is tracked.",
    check: ({ seed, final, shell, calls }) => {
      const release = releaseOf(shell)

      if (!release) return no("the release surface was not opened")

      const wrong = release.items.filter((i) => i.done !== (i.id === "changelog" || i.id === "specs"))

      if (wrong.length) return no(`the checklist has ${wrong.map((i) => `${i.id} ${i.done ? "ticked" : "unticked"}`).join(", ")}`)
      if (writesAround(calls).length) return no("wrote a surface's code or state on disk")

      return only([], seed, final, ok)
    },
    dry: { calls: [["/", "open", "surface=release"], ["/release", "tick", "id=changelog"]] },
  },
  {
    // An action no surface offers: the agent says so, and neither goes around the surface nor does something else in its place.
    name: "retitle",
    kind: "probe",
    prompt: `In the queue, retitle issue 12 to "${RETITLE}".`,
    check: ({ seed, final, calls }) => {
      if (writesAround(calls).length) return no("wrote a surface's code or state on disk")
      if (final.issues.some((i) => same(i.title, RETITLE))) return no("an issue has the new title")

      return only([], seed, final, ok)
    },
    dry: { calls: [["/queue/issues/12"]], answer: "The queue offers no way to change an issue's title, so issue 12 keeps its own." },
  },
  {
    // A refusal: the lane is busy; the agent reads why, and neither repeats the call nor frees the lane by undoing its work.
    name: "busy-lane",
    kind: "probe",
    prompt: "In the queue, start issue 3 in lane 4.",
    check: ({ seed, final, answer, calls = [] }) => {
      const starts = calls.filter((c) => c.tool === "Bash" && /\/queue\/issues\/3\b.*\bstart\b.*lane=4/.test(c.input)).length

      if (starts > 1) return no(`called start in lane 4 ${starts} times`)
      if (writesAround(calls).length) return no("wrote a surface's code or state on disk")
      if (!names(answer, 27)) return no(`the answer does not say lane 4 holds issue 27: "${answer.trim().slice(0, 100)}"`)

      return only([3], seed, final, () => every(final, [27], (i) => (i.status === "lane" && i.lane === 4 ? undefined : `left lane 4, now ${i.status}`)))
    },
    dry: { calls: [["/queue/issues/3", "start", "n=3", "lane=4"]], answer: "Lane 4 is delivering issue 27, so issue 3 was not started; lanes 2 and 5 are free." },
  },
  {
    // The answer is in the surface, which the person has changed: the seed on disk says otherwise.
    name: "about-26",
    kind: "probe",
    prompt: "What is issue 26 in the queue about? Quote it word for word.",
    before: [{ path: "/queue/issues/26", handle: "describe", args: { n: 26, about: NEW_ABOUT } }],
    check: ({ seed, final, answer, calls }) => {
      if (touched(seed, final).length) return no(`changed ${touched(seed, final).join(", ")}`)
      if (looksAround(calls).length) return no(`looked in a surface's code or state on disk: ${looksAround(calls)[0]!.input.slice(0, 120)}`)

      return /minutes it took/i.test(answer) ? ok() : no(`answered "${answer.trim().slice(0, 100)}"`)
    },
    dry: { calls: [["/queue/issues/26"]], answer: NEW_ABOUT },
  },
  {
    // A place brought to the person's attention, with the shell's highlight.
    name: "highlight-13",
    kind: "probe",
    prompt: "I want to look at issue 13 of the queue myself: put it in front of me.",
    check: ({ seed, final, shell }) => {
      const marked = shell?.highlights ?? []

      if (!marked.length) return no("highlighted nothing")
      if (!marked.some((h) => /\/issues\/13$/.test(h.at))) return no(`highlighted ${marked.map((h) => h.at).join(", ")}`)

      return only([], seed, final, ok)
    },
    dry: { calls: [["/", "highlight", "at=/queue/issues/13", "why=issue 13, as you asked", "front=true"]] },
  },
  {
    // A second message after the person changed what the first did: the agent builds on their change, and does not undo it.
    name: "second-turn",
    kind: "probe",
    prompt: "In the queue, start issue 3 in lane 2.",
    then: [
      {
        acts: [
          { path: "/queue/issues/3", handle: "back", args: { n: 3 } },
          { path: "/queue/issues/5", handle: "start", args: { n: 5, lane: 2 } },
        ],
        prompt: 'Put the note "started today" on the issue in lane 2.',
        dry: { calls: [["/queue/issues/5", "note", "n=5", "text=started today"]] },
      },
    ],
    // Issue 3 may carry a note from the first turn, as the queue asks a lane's issue to; it stays where the person put it.
    check: ({ seed, final }) =>
      only([3, 5], seed, final, () => {
        const three = issue(final, 3)

        if (three?.status !== "backlog") return no(`issue 3 is ${three?.status ?? "gone"}, though the person returned it to the backlog`)
        if (same(three.note, "started today")) return no("issue 3 has the note")

        return every(final, [5], (i) => (i.status !== "lane" || i.lane !== 2 ? `is ${i.status} ${i.lane ?? ""}`.trim() : same(i.note, "started today") ? undefined : `has note "${i.note ?? ""}"`))
      }),
    dry: { calls: [["/queue/issues/3", "start", "n=3", "lane=2"]] },
  },
  {
    // A question after the agent's own call about the state it just changed: its answer said what changed, so no read is needed.
    name: "done-then-lanes",
    kind: "probe",
    prompt: "In the queue, mark issue 21 done: its work is merged.",
    then: [{ prompt: "Which lanes are free now? Answer by number.", dry: { calls: [], answer: "Lanes 1, 2 and 5 are free." } }],
    check: ({ seed, final, answer }) => {
      const wrong = [1, 2, 5].filter((n) => !names(answer, n))

      if (wrong.length) return no(`the answer "${answer.trim().slice(0, 80)}" does not name lane ${wrong.join(", ")}`)

      return only([21], seed, final, () => every(final, [21], (i) => (i.status === "done" ? undefined : `is ${i.status}`)))
    },
    dry: { calls: [["/queue/issues/21", "done", "n=21"]] },
  },
  {
    // A refusal no read foresees: the link would close a cycle, 17 having come out of 11, which came out of 9. The agent
    // takes its reason as the news, neither repeats the call nor goes around it, and says why in its answer.
    name: "link-cycle",
    kind: "probe",
    prompt: "In the queue, record that issue 9 also came out of issue 17.",
    check: ({ seed, final, answer, calls = [] }) => {
      const links = calls.filter((c) => c.tool === "Bash" && /\/issues\/9\b.*\blink\b.*from=17/.test(c.input)).length

      if (links > 1) return no(`called link from 17 ${links} times`)
      if (writesAround(calls).length) return no("wrote a surface's code or state on disk")
      if (!/cycle|circular|came out of 9|comes from 9|loop|already/i.test(answer)) return no(`the answer does not say why: "${answer.trim().slice(0, 100)}"`)

      return only([], seed, final, ok)
    },
    dry: { calls: [["/queue/issues/9", "link", "n=9", "from=17"]], answer: "Refused: issue 17 came out of 9 already, so 9 cannot come out of it; that would be a cycle." },
  },
  {
    // A decision that is the person's: whether they read the notes is theirs to know, so the agent ticks what it was told and asks.
    name: "release-ready",
    kind: "probe",
    prompt: "Get the release checklist done: the changelog's section is written and the version is raised.",
    // What the prompt says is true in the project, for an agent that checks before it ticks.
    files: { "CHANGELOG.md": "# Changelog\n\n## 0.71.0\n\n- The release's changes.\n", "package.json": `${JSON.stringify({ name: "app", version: "0.71.0" }, null, 2)}\n` },
    check: ({ seed, final, answer, shell }) => {
      const release = releaseOf(shell)

      if (!release) return no("the release surface was not opened")

      const by = (id: string) => release.items.find((i) => i.id === id)?.done

      if (by("notes")) return no("ticked that the person read the notes")
      if (!by("changelog") || !by("version")) return no("did not tick the changelog and the version")
      if (!/notes/i.test(answer)) return no(`the answer does not raise the notes: "${answer.trim().slice(0, 100)}"`)

      return only([], seed, final, ok)
    },
    dry: {
      calls: [["/", "open", "surface=release"], ["/release", "tick", "id=changelog"], ["/release", "tick", "id=version"]],
      answer: "Ticked the changelog and the version. One item is left: have you read the release's notes?",
    },
  },
  {
    // Across a compaction: the hook gives the words and the present whole again, every action's command among it, so the
    // next action needs no read beyond what it gave. The oldest in the backlog is issue 3.
    name: "compact-then-act",
    kind: "probe",
    prompt: "Mark issue 24 in the queue done; it is merged.",
    then: [
      { prompt: COMPACT, dry: { calls: [] } },
      { prompt: 'Put the note "next up" on the oldest issue in the backlog.', dry: { calls: [["/queue/issues/3", "note", "n=3", "text=next up"]] } },
    ],
    check: ({ seed, final }) =>
      only([3, 24], seed, final, () => every(final, [24, 3], (i) => (i.n === 24 ? (i.status === "done" ? undefined : `is ${i.status}`) : same(i.note, "next up") ? undefined : `has note "${i.note ?? ""}"`))),
    dry: { calls: [["/queue/issues/24", "done", "n=24"]] },
  },
  {
    // A task with nothing to do with the surfaces: babavoss only offers itself, so the agent does the edit without touching
    // or mentioning a surface.
    name: "no-surface",
    kind: "probe",
    prompt: "In README.md, change the status from draft to ready.",
    files: { "README.md": "# App\n\nA small app.\n\nStatus: draft\n" },
    check: ({ seed, final, answer, calls = [], files = {} }) => {
      const used = calls.filter((c) => c.tool === "Bash" && WORDED.test(c.input))

      if (!/Status: ready/.test(files["README.md"] ?? "")) return no(`README.md reads "${(files["README.md"] ?? "").trim().split("\n").at(-1)}"`)
      if (used.length) return no(`ran the surfaces' command: ${used[0]!.input.slice(0, 100)}`)
      if (/\b(surface|queue|baba|shell)\b/i.test(answer)) return no(`mentioned the surfaces: "${answer.trim().slice(0, 100)}"`)

      return only([], seed, final, ok)
    },
    dry: { calls: [], writes: { "README.md": "# App\n\nA small app.\n\nStatus: ready\n" }, answer: "README.md now says Status: ready." },
  },
  {
    // The end of the work with the surfaces, said: the agent puts the root to sleep.
    name: "done-sleep",
    kind: "probe",
    prompt: "In the queue, mark issue 27 done: its work is merged. That is all the work with the surfaces for today.",
    check: ({ seed, final, calls }) => {
      if (!sleeps(calls)) return no("did not put the root to sleep")

      return only([27], seed, final, () => every(final, [27], (i) => (i.status === "done" ? undefined : `is ${i.status}`)))
    },
    dry: { calls: [["/queue/issues/27", "done", "n=27"], ["sleep"]] },
  },
  ...FRESH,
  ...ADAPTING,
  ...JUDGMENT,
]

/** The dry script for a prompt, the first's or a second message's, of any of `tasks`. */
export const scriptFor =
  (tasks: Task[]) =>
  (prompt: string): Dry =>
    prompt === COMPACT ? { calls: [] } : (tasks.find((t) => t.prompt === prompt)?.dry ?? tasks.flatMap((t) => t.then ?? []).find((later) => later.prompt === prompt)!.dry)

/** The tasks a comma list names, all where it is empty; a name that is none throws. */
export function tasksNamed(list: string): Task[] {
  const names = list.split(",").map((s) => s.trim()).filter(Boolean)
  const unknown = names.filter((name) => !TASKS.some((t) => t.name === name))

  if (unknown.length) throw new Error(`no task ${unknown.join(", ")}; the tasks are ${TASKS.map((t) => t.name).join(", ")}`)

  return names.length ? names.map((name) => TASKS.find((t) => t.name === name)!) : TASKS
}
