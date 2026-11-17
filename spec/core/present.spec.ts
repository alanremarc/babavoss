// The present as the agent reads it: a view whole, and what changed between two views, told as events on things.
import { describe, expect, it } from "bun:test"
import { CAP, diff, entries, lines, rebase, tell, whole, type Change } from "../../framework/core/present/present.ts"
import { detail, handle, type Json } from "../../framework/core/surface/index.ts"

const say = { command: "baba" }
const HOW = "Keep this true as the work moves."
/** An action as the shell lists it for a tab, as plain data. */
const offer = (name: string, fixed: Record<string, string> = {}, open: Record<string, string> = {}, description = "") => ({ name, fixed, open, description })
/** The queue tab's actions: its own at its path, and those every issue offers at its own, as one pattern. */
const ACTIONS = [
  { at: "/tabs/3", offers: [offer("add", {}, { title: "line" }), offer("draft", {}, { title: "line" }, "theirs to look at")] },
  { at: "/tabs/3/issues/N", offers: [offer("note", { n: "N" }, { text: "line" }), offer("done", { n: "N" }, {}, "its work is merged into main")] },
]
const issue = (n: number, status = "backlog", more: Record<string, Json> = {}) => ({ at: `/tabs/3/issues/${n}`, n, title: `Issue ${n}`, status, ...more })
/** The shell's / with one queue tab holding `issues`. */
const root = (issues: Json[], facts: Record<string, Json> = {}, tab: Record<string, Json> = {}): Json => ({
  title: "baba",
  surfaces: [{ name: "queue", description: "Track the work", open: handle("open", "in a new tab", { surface: "queue" }) }],
  tabs: [
    {
      at: "/tabs/3",
      n: 3,
      surface: "queue",
      close: handle("close", "its state is dropped", { n: 3 }),
      title: "Queue",
      actions: ACTIONS,
      ...tab,
      facts: { how: HOW, free: [1, 2], issues, ...facts },
    },
  ],
})
const told = (before: Json, now: Json, cap?: number) => tell(diff(before, now, say), () => undefined, cap)

describe("whole", () => {
  it("says relative facts, lists of plain rows as tables, and the handles after them in one block, the command once", () => {
    expect(lines({ count: 0, tags: [], add: handle("add", "keeps one", {}, { text: "string" }), notes: [{ n: 1, text: "a" }, { n: 2 }] }, say)).toEqual([
      "count: 0",
      "tags: []",
      'notes: n\ttext\n1\t"a"\n2\t',
      "actions: baba / ACTION name=value…",
      "  add text=string   keeps one",
    ])
  })
  it("puts the arguments every handle shares in the block's head, says each input as what it means, and a handle by its name, never its key", () => {
    const n = { n: 12 }
    const view = {
      title: "Issue 12",
      note: "waits",
      describe: handle("describe", "", n, { about: { type: "string", kind: "markdown" } }),
      note_: handle("note", "empty clears it", n, { text: { type: "string", kind: "line" } }),
      start: handle("start", "when a subagent begins on it", n, { lane: { type: "number", range: [1, 5] } }),
      move: handle("move", "", n, { narrative: { type: "string", kind: "id" }, mode: { type: "string", choices: ["light", "dark"] } }),
      link: handle("link", "", n, { from: { type: "number", kind: "issue" } }),
      done: handle("done", "its work is merged into main", n),
    }

    expect(lines(view, { command: "baba", path: "/queue/issues/12" })).toEqual([
      'title: "Issue 12"',
      'note: "waits"',
      "actions: baba /queue/issues/12 ACTION n=12 name=value…",
      "  describe about=markdown",
      "  note text=line   empty clears it",
      "  start lane=1..5   when a subagent begins on it",
      "  move narrative=id(string) mode=light|dark",
      "  link from=issue(number)",
      "  done   its work is merged into main",
    ])
    // One handle alone keeps its arguments on its line; none with arguments, and the head says no more than ACTION.
    expect(lines({ done: handle("done", "", n) }, say)).toEqual(["actions: baba / ACTION name=value…", "  done n=12"])
    expect(lines({ play: handle("play", ""), pin: handle("pin", "keeps them") }, say)).toEqual(["actions: baba / ACTION", "  play", "  pin   keeps them"])
  })
  it("folds a handle every row of a table offers into one line with the column for its argument", () => {
    const rows = [1, 2].map((n) => ({ n, title: `Draft ${n}`, approve: handle("approve", "into the backlog", { n }) }))

    expect(lines({ drafts: rows, add: handle("add", "", {}, { title: { type: "string", kind: "line" } }) }, say)).toEqual([
      'drafts: n\ttitle\n1\t"Draft 1"\n2\t"Draft 2"',
      "actions: baba / ACTION name=value…",
      "  approve n=N   into the backlog",
      "  add title=line",
    ])
  })
  it("says each open tab under one heading, its facts relative to it, then its actions with their commands: its own, and its rows' as one pattern", () => {
    const text = whole(root([issue(1)]), say)

    expect(text).toEqual([
      'title: "baba"',
      'surfaces: name\tdescription\n"queue"\t"Track the work"',
      "actions: baba / ACTION name=value…",
      '  open surface="queue"   in a new tab',
      "",
      '/tabs/3 queue "Queue"',
      `how: ${JSON.stringify(HOW)}`,
      "free: [1, 2]",
      'issues: at\tn\ttitle\tstatus\n"/tabs/3/issues/1"\t1\t"Issue 1"\t"backlog"',
      "actions: baba /tabs/3 ACTION name=value…",
      "  add title=line",
      "  draft title=line   theirs to look at",
      "actions: baba /tabs/3/issues/N ACTION n=N name=value…",
      "  note text=line",
      "  done   its work is merged into main",
      "actions: baba / ACTION name=value…",
      "  close n=3   its state is dropped",
    ])
  })
  it("leaves detail out, a list's rows and a fact, and says in one line how much there is and where it is read", () => {
    const view = root([issue(1), detail(issue(2, "done", { note: "merged" })), detail(issue(3, "done"))], { tokens: detail(1200) })

    const text = whole({ ...(view as Record<string, Json>), tabs: [{ ...(view as { tabs: Record<string, Json>[] }).tabs[0]!, actions: [] }] }, say)

    expect(text.slice(-5)).toEqual([
      "free: [1, 2]",
      'issues: at\tn\ttitle\tstatus\n"/tabs/3/issues/1"\t1\t"Issue 1"\t"backlog"',
      "+2 more in issues, tokens in detail; read /tabs/3",
      "actions: baba / ACTION name=value…",
      "  close n=3   its state is dropped",
    ])
    expect(whole({ count: detail(3), name: "x" }, { ...say, path: "/tabs/1" })).toEqual(['name: "x"', "+count in detail; read /tabs/1"])
  })
  it("says the root's own: one open for every surface, by the name column; where the person was brought, by its place", () => {
    const view = {
      title: "baba",
      surfaces: ["queue", "lab"].map((name) => ({ name, description: `the ${name}`, open: handle("open", "in a new tab", { surface: name }) })),
      pointed: { at: "/tabs/3", n: 2 },
      tabs: [],
    }

    expect(whole(view, say)).toEqual([
      'title: "baba"',
      'surfaces: name\tdescription\n"queue"\t"the queue"\n"lab"\t"the lab"',
      'pointed: "/tabs/3"',
      "actions: baba / ACTION name=value…",
      "  open surface=NAME   in a new tab",
    ])
    // Where the person was brought changes by its place alone.
    expect(told(view, { ...view, pointed: { at: "/tabs/3", n: 3 } })).toEqual([])
    expect(told(view, { ...view, pointed: { at: "/tabs/4", n: 3 } })).toEqual(['pointed: "/tabs/3" → "/tabs/4"'])
  })
})

describe("diff", () => {
  it("keys a list's rows by identity: a row changed is one line of only what changed, under its tab's heading", () => {
    expect(told(root([issue(1), issue(2)]), root([issue(1), issue(2, "lane", { lane: 1 })]))).toEqual([
      '/tabs/3 queue "Queue"',
      '/tabs/3/issues/2: status "backlog" → "lane", + lane 1',
    ])
  })
  it("names a row by n, id, name or key where it has no at, and by its index where it has none of them", () => {
    expect(told({ rows: [{ n: 1, v: 1 }] }, { rows: [{ n: 1, v: 2 }] })).toEqual(["rows 1: v 1 → 2"])
    expect(told({ rows: [{ name: "a", v: 1 }] }, { rows: [{ name: "a", v: 2 }] })).toEqual(["rows a: v 1 → 2"])
    expect(told({ rows: [{ v: 1 }, { v: 2 }] }, { rows: [{ v: 1 }, { v: 3 }] })).toEqual(["rows.1.v: 2 → 3"])
  })
  it("tells a reorder by what moved, never as the whole order, and as how many where many moved", () => {
    const ns = (...n: number[]) => root(n.map((x) => issue(x)))

    expect(told(ns(1, 2, 3), ns(3, 1, 2))).toEqual(['/tabs/3 queue "Queue"', "/tabs/3/issues/3 moved to the top"])
    expect(told(ns(1, 2, 3, 4), ns(1, 3, 2, 4))).toEqual(['/tabs/3 queue "Queue"', "/tabs/3/issues/2 moved down"])
    expect(told(ns(1, 2, 3, 4), ns(2, 3, 4, 1))).toEqual(['/tabs/3 queue "Queue"', "/tabs/3/issues/1 moved to the end"])
    expect(told(ns(1, 2, 3, 4, 5, 6), ns(6, 5, 4, 3, 2, 1))).toEqual(['/tabs/3 queue "Queue"', "issues: 5 rows moved; read /tabs/3 for the order"])
    expect(told({ rows: [{ n: 1 }, { n: 2 }] }, { rows: [{ n: 2 }, { n: 1 }] })).toHaveLength(1)
  })
  it("tells a row added or removed in one line, and several added at once as a table", () => {
    expect(told(root([issue(1), issue(2)]), root([issue(2), issue(4)]))).toEqual([
      '/tabs/3 queue "Queue"',
      '- /tabs/3/issues/1 "Issue 1"',
      '+ /tabs/3/issues/4: n 4, title "Issue 4", status "backlog"',
    ])
    expect(told(root([]), root([issue(5), issue(6)]))).toEqual([
      '/tabs/3 queue "Queue"',
      "+ issues: at\tn\ttitle\tstatus",
      '"/tabs/3/issues/5"\t5\t"Issue 5"\t"backlog"',
      '"/tabs/3/issues/6"\t6\t"Issue 6"\t"backlog"',
    ])
  })
  it("tells standing prose only as where to read it", () => {
    expect(told(root([]), root([], { how: `${HOW} Always.` }))).toEqual(['/tabs/3 queue "Queue"', "how changed; read /tabs/3"])
  })
  it("tells a long text once, its new value cut, with where to read it whole", () => {
    const long = "word ".repeat(60).trim()
    const text = told(root([issue(1)]), root([issue(1, "backlog", { note: long })]))

    expect(text).toEqual([
      '/tabs/3 queue "Queue"',
      `/tabs/3/issues/1: + note ${JSON.stringify(long.slice(0, 100))}… (${long.length} chars; read /tabs/3/issues/1)`,
    ])
    expect(told({ about: long }, { about: `${long}!` })).toEqual([`about → ${JSON.stringify(long.slice(0, 100))}… (${long.length + 1} chars; read /)`])
  })
  it("tells a tab opened in one line, its heading, its own actions by name and where to read it, and a tab closed in one line", () => {
    const empty = { title: "baba", surfaces: [], tabs: [] }
    const opened = { ...empty, tabs: [{ at: "/tabs/4", n: 4, surface: "queue", title: "Queue", actions: [{ at: "/tabs/4", offers: [offer("add")] }], facts: { how: HOW, lanes: 5 } }] }

    expect(told(empty, opened)).toEqual(['+ /tabs/4 queue "Queue", actions: add; read /tabs/4'])
    expect(told(opened, empty)).toEqual(['- /tabs/4 queue "Queue" closed'])
  })
  it("tells a tab the agent's own call opened whole, as it has not seen it, and never cuts it", () => {
    const empty = { title: "baba", surfaces: [], tabs: [] }
    const opened = { ...empty, tabs: [{ at: "/tabs/4", n: 4, surface: "queue", title: "Queue", actions: [{ at: "/tabs/4", offers: [offer("add")] }], facts: { how: HOW, lanes: 5 } }] }

    expect(tell(diff(empty, opened, { ...say, opened: "whole" }), () => undefined, 2)).toEqual([
      '+ /tabs/4 queue "Queue"',
      `how: ${JSON.stringify(HOW)}`,
      "lanes: 5",
      "actions: baba /tabs/4 ACTION",
      "  add",
    ])
  })
  it("tells a tab's actions by what was offered, with its command, or withdrawn, by its name", () => {
    const now = [ACTIONS[0]!, { ...ACTIONS[1]!, offers: [ACTIONS[1]!.offers[0]!, offer("start", { n: "N" }, { lane: "1..5" })] }]

    expect(told(root([]), root([], {}, { actions: now }))).toEqual([
      '/tabs/3 queue "Queue"',
      "actions at /tabs/3/issues/N: - done\nactions: baba /tabs/3/issues/N ACTION name=value…\n  start n=N lane=1..5",
    ].flatMap((l) => l.split("\n")))
  })
  it("counts detail that stays detail, and tells a row that became detail, or stopped being it, by what changed in it", () => {
    const rows = (...r: Json[]) => root([], { issues: r, tokens: detail(5) })

    expect(told(rows(issue(1), detail(issue(2))), rows(issue(1), detail(issue(2, "done"))))).toEqual(['/tabs/3 queue "Queue"', "detail changed: 1 in issues; read /tabs/3"])
    expect(told(rows(issue(1)), rows(detail(issue(1, "done"))))).toEqual(['/tabs/3 queue "Queue"', '/tabs/3/issues/1: status "backlog" → "done"'])
    expect(told(rows(detail(issue(1))), rows(issue(1, "lane")))).toEqual(['/tabs/3 queue "Queue"', '/tabs/3/issues/1: status "backlog" → "lane"'])
    expect(told(rows(issue(1)), rows(issue(1), detail(issue(2))))).toEqual(['/tabs/3 queue "Queue"', "detail changed: 1 in issues; read /tabs/3"])
    expect(told(root([], { tokens: detail(5) }), root([], { tokens: detail(6) }))).toEqual(['/tabs/3 queue "Queue"', "detail changed: tokens in detail; read /tabs/3"])
  })
  it("says nothing where nothing changed", () => {
    expect(told(root([issue(1)]), root([issue(1)]))).toEqual([])
  })
})

describe("tell", () => {
  it("groups changes by who made them, each tab's heading once in each group", () => {
    const changes = diff(root([issue(1), issue(2)]), root([issue(1, "done"), issue(2, "lane")], { free: [2] }), say)
    const text = tell(changes, (c: Change) => (c.line.includes("issues/1") ? "changed by the person:" : "changed by the surface:"))

    expect(text).toEqual([
      "changed by the surface:",
      '/tabs/3 queue "Queue"',
      "free: [1, 2] → [2]",
      '/tabs/3/issues/2: status "backlog" → "lane"',
      "changed by the person:",
      '/tabs/3 queue "Queue"',
      '/tabs/3/issues/1: status "backlog" → "done"',
    ])
  })
  it("stops at the cap, and says how much more changed in each tab and where to read it", () => {
    const many = Array.from({ length: 60 }, (_, i) => issue(i + 1))
    const text = told(root(many), root(many.map((row) => ({ ...row, status: "done" }))))

    expect(text).toHaveLength(CAP + 1)
    expect(text.at(-1)).toBe("… and 21 more changes: 21 at /tabs/3; read there for them")
  })
})

it("keys facts by identity, so a row moved keeps its keys, and a list's order has its own", () => {
  const a = entries({ rows: [{ n: 1, v: "a" }, { n: 2, v: "b" }] })
  const b = entries({ rows: [{ n: 2, v: "b" }, { n: 1, v: "a" }] })

  expect([...a]).toEqual([
    ["rows#order", "1,2"],
    ["rows[1].n", "1"],
    ["rows[1].v", '"a"'],
    ["rows[2].n", "2"],
    ["rows[2].v", '"b"'],
  ])
  expect([...b].filter(([k, v]) => a.get(k) !== v)).toEqual([["rows#order", "2,1"]])
})

it("rebases what one party knows by another's change, so what others changed meanwhile is still to be told", () => {
  const known = root([issue(1), issue(2)])
  // The person moved issue 1 on, then the agent opened issue 3 and gave issue 2 a note.
  const was = root([issue(1, "lane"), issue(2)])
  const now = root([issue(1, "lane"), issue(2, "backlog", { note: "mine" }), issue(3)])

  expect(told(rebase(known, was, now)!, now)).toEqual(['/tabs/3 queue "Queue"', "/tabs/3/issues/1: status \"backlog\" → \"lane\""])
  expect(rebase(known, known, now)).toEqual(now)
  expect(rebase(known, now, now)).toEqual(known)
})
