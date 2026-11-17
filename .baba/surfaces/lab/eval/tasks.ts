// The eval's tasks, as data: each a name, a kind, the prompt said to the agent, a check on the fixture's work as the run left
// it, and a script the dry run plays instead of an agent. A prompt says what the person wants and never how to do it: whether
// the agent writes a program for a batch is what is measured. A check reads the work the run began with from the root, not
// from the fixture's seed, so a variant that changes the seed is checked against its own; an answer is the agent's last words.
import type { Issue, Work } from "./fixture/queue/src/surface.ts"

export type Kind = "single" | "find" | "read" | "batch"
export type Verdict = { pass: boolean; reason: string }
export type Checked = { seed: Work; final: Work; answer: string }
/** What the dry run does in the agent's place: its command's arguments, one call each, and its last words. */
export type Dry = { calls: string[][]; answer?: string }
export type Task = { name: string; kind: Kind; prompt: string; check: (run: Checked) => Verdict; dry: Dry }

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
    check: ({ seed, final }) => {
      const first = seed.issues.filter((i) => i.status === "backlog").sort((a, b) => a.order - b.order)[0]!
      const busy = seed.issues.filter((i) => i.status === "lane").map((i) => i.lane)

      return only([first.n], seed, final, () =>
        every(final, [first.n], (i) => (i.status !== "lane" ? `is ${i.status}` : busy.includes(i.lane) ? `went to busy lane ${i.lane}` : undefined)),
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
      for (const i of busy) if (!new RegExp(`lane\\s*${i.lane}\\D[^.;\\n]*?\\b${i.n}\\b|\\b${i.n}\\b[^.;\\n]*?lane\\s*${i.lane}(\\D|$)`, "i").test(answer)) return no(`the answer does not put issue ${i.n} in lane ${i.lane}`)

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
]

/** The tasks a comma list names, all where it is empty; a name that is none throws. */
export function tasksNamed(list: string): Task[] {
  const names = list.split(",").map((s) => s.trim()).filter(Boolean)
  const unknown = names.filter((name) => !TASKS.some((t) => t.name === name))

  if (unknown.length) throw new Error(`no task ${unknown.join(", ")}; the tasks are ${TASKS.map((t) => t.name).join(", ")}`)

  return names.length ? names.map((name) => TASKS.find((t) => t.name === name)!) : TASKS
}
