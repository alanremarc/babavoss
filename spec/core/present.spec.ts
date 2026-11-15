// The present as the agent reads it: a view whole, and what changed between two views, told as events on things.
import { describe, expect, it } from "bun:test"
import { CAP, diff, entries, lines, tell, whole, type Change } from "../../framework/core/present/present.ts"
import { handle, type Json } from "../../framework/core/surface/index.ts"

const say = { command: "baba" }
const HOW = "Keep this true as the work moves."
const issue = (n: number, status = "backlog", more: Record<string, Json> = {}) => ({ at: `/tabs/3/issues/${n}`, n, title: `Issue ${n}`, status, ...more })
/** The shell's / with one queue tab holding `issues`. */
const root = (issues: Json[], facts: Record<string, Json> = {}, tab: Record<string, Json> = {}): Json => ({
  title: "baba",
  surfaces: [{ name: "queue", description: "Track the work", open: handle("open", "open a queue tab", { surface: "queue" }) }],
  tabs: [
    {
      at: "/tabs/3",
      n: 3,
      surface: "queue",
      close: handle("close", "close tab 3", { n: 3 }),
      title: "Queue",
      actions: ["add", "draft"],
      ...tab,
      facts: { how: HOW, free: [1, 2], issues, ...facts },
    },
  ],
})
const told = (before: Json, now: Json, cap?: number) => tell(diff(before, now, say), () => undefined, cap)

describe("whole", () => {
  it("says relative facts, lists of plain rows as tables with their handles after, and handles as commands", () => {
    expect(lines({ count: 0, tags: [], add: handle("add", "Add one", {}, { text: "string" }), notes: [{ n: 1, text: "a" }, { n: 2 }] }, say)).toEqual([
      "count: 0",
      "tags: []",
      "add: baba / add text=string   Add one",
      'notes: n\ttext\n1\t"a"\n2\t',
    ])
  })
  it("says each open tab under one heading, with its actions by name, its facts relative to it", () => {
    const text = whole(root([issue(1)]), say)

    expect(text).toEqual([
      'title: "baba"',
      'surfaces: name\tdescription\n"queue"\t"Track the work"',
      'open: baba / open surface="queue"   open a queue tab',
      "",
      '/tabs/3 queue "Queue"',
      "actions: add, draft   each one's command is at /tabs/3",
      "close: baba / close n=3   close tab 3",
      `how: ${JSON.stringify(HOW)}`,
      "free: [1, 2]",
      'issues: at\tn\ttitle\tstatus\n"/tabs/3/issues/1"\t1\t"Issue 1"\t"backlog"',
    ])
  })
  it("says the root's own: one open for every surface, by the name column; who is needed, first; where the person was pointed, by its place", () => {
    const need = { at: "/tabs/3", surface: "queue", who: "person", why: "to approve a draft" }
    const view = {
      title: "baba",
      needs: [need],
      surfaces: ["queue", "lab"].map((name) => ({ name, description: `the ${name}`, open: handle("open", `open a ${name} tab`, { surface: name }) })),
      pointed: { at: "/tabs/3", n: 2 },
      tabs: [],
    }

    expect(whole(view, say)).toEqual([
      'title: "baba"',
      'needs: at\tsurface\twho\twhy\n"/tabs/3"\t"queue"\t"person"\t"to approve a draft"',
      'surfaces: name\tdescription\n"queue"\t"the queue"\n"lab"\t"the lab"',
      "open: baba / open surface=NAME   open a NAME tab",
      'pointed: "/tabs/3"',
    ])
    // A need is an event on it, one line: who, where, why; where the person was pointed changes by its place alone.
    expect(told(view, { ...view, needs: [{ ...need, who: "agent", why: "to draft" }], pointed: { at: "/tabs/3", n: 3 } })).toEqual([
      "- need: the person, at /tabs/3 queue, to approve a draft",
      "+ need: you, at /tabs/3 queue, to draft",
    ])
    expect(told(view, { ...view, needs: [{ ...need, why: "to approve two drafts" }] })).toEqual(["need: the person, at /tabs/3 queue, now to approve two drafts"])
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
  it("tells a reorder alone in one line", () => {
    expect(told(root([issue(1), issue(2), issue(3)]), root([issue(3), issue(1), issue(2)]))).toEqual(['/tabs/3 queue "Queue"', "issues: order now 3, 1, 2"])
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
  it("tells a tab opened whole under its heading, its standing prose with it, and a tab closed in one line", () => {
    const empty = { title: "baba", surfaces: [], tabs: [] }
    const opened = { ...empty, tabs: [{ at: "/tabs/4", n: 4, surface: "queue", title: "Queue", actions: ["add"], facts: { how: HOW, lanes: 5 } }] }

    expect(told(empty, opened)).toEqual([
      '+ /tabs/4 queue "Queue"',
      "actions: add   each one's command is at /tabs/4",
      `how: ${JSON.stringify(HOW)}`,
      "lanes: 5",
    ])
    expect(told(opened, empty)).toEqual(['- /tabs/4 queue "Queue" closed'])
  })
  it("tells a tab's actions by what was offered or withdrawn", () => {
    expect(told(root([]), root([], {}, { actions: ["add", "approve"] }))).toEqual(['/tabs/3 queue "Queue"', "actions: + approve, - draft"])
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
