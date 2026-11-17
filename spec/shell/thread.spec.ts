// A drawer's thread: a tab's entries read from the shell's activity, and home's, the shell's own; its highlights, and the
// ordinary entries folded between them, saying how many and by whom; the four kinds of entry, calls in a row by one
// author, or the world's events by one hearer, folded, and the calls of one command one batch; the words of their lines;
// a closed tab's line; where a click on one goes; what is pinned at the foot,
// and what of the person's waits for the agent; the highlights opening a drawer opens; and a closed tab's entries gone with it.
import { describe, expect, it } from "bun:test"
import { action, story, surface, view, type Update } from "../../framework/core/index.ts"
import { shell } from "../../framework/shell/src/surface.ts"
import {
  agoOf,
  authorOf,
  batchLine,
  callsLine,
  closedLine,
  closedName,
  didOf,
  entriesIn,
  foldLine,
  glanceOf,
  itemsOf,
  kindOf,
  knownAfter,
  partsOf,
  pinnedOf,
  placeIn,
  refusedLine,
  shellEntries,
  tabIn,
  tabLine,
  UNHEARD,
  unheardLine,
  unopenedOf,
  waitingRows,
  withUnheard,
  type Row,
} from "../../framework/shell/ui/thread.ts"

const row = (n: number, more: Partial<Row>): Row => ({ n, when: "2026-11-16T12:00:00Z", who: "agent", surface: "queue", at: "/queue", did: "x", ...more })
const ROWS: Row[] = [
  row(12, { did: "done n=4", said: ["Issue 4 is done"], saidAt: "/queue/issues/4" }),
  row(11, { who: "world", by: "watch", did: "changed", times: 3 }),
  row(10, { who: "world", by: "watch", did: "moved" }),
  row(9, { did: "start n=4", refused: "lane 2 is busy" }),
  row(8, { did: "done n=4" }),
  row(7, { did: "note n=4" }),
  row(6, { who: "person", did: "approve n=7" }),
  row(5, { did: "start n=5" }),
  row(4, { surface: "lab", at: "/tabs/3", who: "world", by: "run", did: "ended", said: ["The run ended"] }),
  row(3, { surface: "lab", at: "/tabs/3", own: true, did: "open surface=lab" }),
  row(2, { who: "person", at: "/queue", own: true, did: "open surface=queue" }),
  row(1, { surface: "notes", at: null, own: true, did: "close n=1" }),
]

describe("a thread", () => {
  it("folds one program's entries, those in a row that share its name, into one batch, whatever each is; a highlight stands as its own", () => {
    const one = { id: "program:3f2a9c1b" }
    const rows = [
      row(20, { did: "note n=9" }),
      row(19, { ...one, did: "note n=8", refused: "issue 8 is done" }),
      row(18, { ...one, did: "note n=7", said: ["Issue 7 noted"] }),
      ...[17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7].map((n) => row(n, { ...one, did: `note n=${n - 11}` })),
      row(6, { id: "lab:act-1", did: "note n=1" }),
    ]
    const items = itemsOf(rows)

    expect(items.map((i) => ("rows" in i ? [i.kind, i.rows.length] : [i.kind, 1]))).toEqual([
      ["calls", 1],
      ["batch", 13],
      ["calls", 1],
    ])
    expect(batchLine(items[1] as Extract<(typeof items)[number], { kind: "batch" }>)).toBe("13 calls by the agent, one command, stopped at note n=8: issue 8 is done")
    expect(itemsOf([row(3, { ...one }), row(2, { ...one, said: ["Look here"], highlight: true }), row(1, { ...one })]).map((i) => i.kind)).toEqual(["calls", "notice", "calls"])
  })

  it("is a tab's entries and the shell's lines about it; home's is the shell's own", () => {
    expect(entriesIn(ROWS, "/queue").map((r) => r.n)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 2])
    expect(entriesIn(ROWS, "/tabs/3").map((r) => r.n)).toEqual([4, 3])
    expect(shellEntries(ROWS).map((r) => r.n)).toEqual([3, 2, 1])
  })

  it("knows the four kinds of entry: a notice, the surface's lines; a refusal; a call or an event that said nothing; and the shell's own line about a tab", () => {
    expect(ROWS.map(kindOf)).toEqual(["notice", "call", "call", "refused", "call", "call", "call", "call", "notice", "tab", "tab", "tab"])
    // A call made on the shell itself, at its /, is a call.
    expect(kindOf(row(1, { surface: "baba", at: "/", did: "bump" }))).toBe("call")
    expect(shellEntries([row(1, { surface: "baba", at: "/", did: "bump" })])).toHaveLength(1)
  })

  it("folds calls in a row by one author, and the world's events by one hearer, into one line, and says how many", () => {
    const items = itemsOf(entriesIn(ROWS, "/queue"))

    expect(items.map((i) => ("rows" in i ? `${i.who} ${i.rows.map((r) => r.n).join(",")}` : `${i.kind} ${i.row.n}`))).toEqual([
      "notice 12",
      "world 11,10",
      "refused 9",
      "agent 8,7",
      "person 6",
      "agent 5",
      "tab 2",
    ])
    expect(items.flatMap((i) => (i.kind === "calls" ? [callsLine(i)] : []))).toEqual(["World · watch heard 4 events", "Agent made 2 calls", "You made 1 call", "Agent made 1 call"])
  })

  it("shows its highlights, and folds the ordinary entries between two into one, where they happened", () => {
    const rows = ROWS.map((r) => (r.n === 9 || r.n === 4 ? { ...r, highlight: true as const } : r))
    const parts = partsOf(rows)

    expect(parts.map((p) => (p.kind === "fold" ? p.rows.map((r) => r.n).join(",") : `!${p.row.n}`))).toEqual(["12,11,10", "!9", "8,7,6,5", "!4", "3,2,1"])
    // With no highlight yet, the whole thread is one fold; with none at all, nothing.
    expect(partsOf(ROWS).map((p) => p.kind)).toEqual(["fold"])
    expect(partsOf([])).toEqual([])
  })

  it("says of a fold how many and by whom in a few words, the world's events as many as it heard", () => {
    expect(foldLine(ROWS.slice(0, 8))).toBe("10 actions: 5 by the agent, 4 heard, 1 by you")
    expect(foldLine([row(1, {}), row(2, {}), row(3, {})])).toBe("3 actions by the agent")
    expect(foldLine([row(1, { who: "person" })])).toBe("1 action by you")
    expect(foldLine(ROWS.slice(1, 3))).toBe("4 events heard")
  })

  it("glances at the newest entry of the fold at the foot in one line, as its line would say it", () => {
    expect(glanceOf(ROWS[0]!)).toBe("Agent: Issue 4 is done")
    expect(glanceOf(ROWS[1]!)).toBe("World · watch: changed ×3")
    expect(glanceOf(ROWS[3]!)).toBe("Agent: start n=4 refused, lane 2 is busy")
    expect(glanceOf(ROWS[9]!, true)).toBe("Lab opened by the agent")
  })

  it("folds the calls of one command into one line, saying where a refusal stopped it", () => {
    const batch = [
      row(25, { did: "start n=4", refused: "lane 2 is busy", id: "program:c1" }),
      row(24, { did: "note n=4", said: ["Issue 4 noted"], id: "program:c1" }),
      row(23, { did: "done n=3", id: "program:c1" }),
      row(22, { did: "add title=x", id: "program:c0" }),
      row(21, { did: "add title=y" }),
    ]
    const items = itemsOf(batch)

    expect(items.map((i) => ("rows" in i ? `${i.kind} ${i.rows.map((r) => r.n).join(",")}` : `${i.kind} ${i.row.n}`))).toEqual(["batch 25,24,23", "calls 22,21"])
    expect(batchLine(items[0] as Extract<(typeof items)[0], { kind: "batch" }>)).toBe("3 calls by the agent, one command, stopped at start n=4: lane 2 is busy")
    expect(batchLine({ kind: "batch", who: "person", rows: batch.slice(1, 3) })).toBe("2 calls by you, one command")
    // Opened, a batch's own entries read as any others do.
    expect(itemsOf(batch.slice(0, 3), false).map((i) => i.kind)).toEqual(["refused", "notice", "calls"])
  })

  it("says what was done, a refusal with why, and who did it, the world by what heard it", () => {
    expect([didOf(ROWS[1]!), didOf(ROWS[2]!)]).toEqual(["changed ×3", "moved"])
    expect(refusedLine(ROWS[3]!)).toBe("Agent: start n=4 refused, lane 2 is busy")
    expect([authorOf("person"), authorOf("agent"), authorOf("world", "watch"), authorOf("world", undefined, "baba")]).toEqual(["You", "Agent", "World · watch", "baba"])
  })

  it("says a tab entry by who did it, and on home names its surface", () => {
    expect(tabLine(ROWS[10]!)).toBe("Opened by you")
    expect(tabLine(ROWS[9]!, true)).toBe("Lab opened by the agent")
    expect(tabLine(row(1, { own: true, did: "show at=/queue" }))).toBe("Shown to you by the agent")
    expect(tabLine(ROWS[11]!, true)).toBe("Notes closed by the agent")
  })

  it("goes where an entry happened, within its tab, and knows the tab a notice heard is in", () => {
    expect(placeIn({ ...ROWS[0]!, at: ROWS[0]!.saidAt! }, "/queue")).toBe("/issues/4")
    expect(placeIn(ROWS[1]!, "/queue")).toBe("/")
    expect(placeIn(ROWS[11]!, "/queue")).toBeUndefined()
    expect([tabIn("/tabs/2/issues/12"), tabIn("/queue/issues/12"), tabIn("/activity"), tabIn(undefined)]).toEqual(["/tabs/2", "/queue", undefined, undefined])
  })

  it("says how long ago as now, minutes and hours, then the clock time", () => {
    const now = new Date(2026, 10, 16, 12, 0, 0)

    expect([agoOf(new Date(2026, 10, 16, 11, 59, 30), now), agoOf(new Date(2026, 10, 16, 11, 45), now), agoOf(new Date(2026, 10, 16, 9, 0), now)]).toEqual(["now", "15m", "3h"])
  })
})

describe("a closed tab", () => {
  const tab = { n: 3, surface: "queue", closed: "2026-11-16T10:00:00Z", by: "person" as const, at: "/activity/closed/3" }

  it("is named by the title it had, or its surface's and its number, and says when it closed and who closed it", () => {
    expect(closedName(tab)).toBe("Queue 3")
    expect(closedName({ ...tab, title: "Release" })).toBe("Release")
    expect(closedLine(tab, new Date("2026-11-16T12:30:00Z"))).toBe("Closed 2h ago by you")
    expect(closedLine({ ...tab, by: "agent" }, new Date("2026-11-16T10:00:20Z"))).toBe("Closed just now by the agent")
    expect(closedLine({ ...tab, by: "shell" }, new Date("2026-11-16T10:12:00Z"))).toBe("Closed 12m ago by the shell")
  })
})

describe("what a thread's foot pins", () => {
  it("is that the tab is broken, with Reload, and nothing else", () => {
    expect(pinnedOf({ broken: "it fails" })).toEqual({ tone: "broken", text: "This tab is broken", detail: "it fails", does: { label: "Reload" } })
    expect(pinnedOf({})).toBeUndefined()
  })

  it("on home, is what of the person's waits for the agent's next turn: their latest calls, as many as wait", () => {
    expect(waitingRows([row(13, { who: "person", refused: "no" }), ...ROWS], 2).map((r) => r.n)).toEqual([6, 2])
    expect(waitingRows(ROWS, 0)).toEqual([])
  })
})

describe("home's thread", () => {
  const at = (iso: string) => Date.parse(iso)

  it("keeps each stretch of the hooks' silence the page has known as its own highlight, by its time among the shell's entries, saying what to do", () => {
    const rows = [
      row(3, { when: "2026-11-16T12:05:00Z", at: "/tabs/3" }),
      row(2, { when: "2026-11-16T12:01:00Z" }),
      row(1, { when: "2026-11-16T12:00:00Z", at: null }),
    ]
    const known = [
      { ever: false, since: at("2026-11-16T11:00:00.500Z") },
      { ever: true, since: at("2026-11-16T12:03:00.250Z") },
    ]
    const thread = withUnheard(rows, known)

    expect(thread.map((r) => r.n)).toEqual([3, -known[1]!.since, 2, 1, -known[0]!.since])
    expect(thread[1]).toMatchObject({ who: "world", surface: "baba", at: null, when: "2026-11-16T12:03:00Z", highlight: true })
    expect(thread[1]!.said).toEqual([`${UNHEARD}. Its hooks went quiet: start a new session to get them back.`])
    expect(thread[4]!.said).toEqual([`${UNHEARD}. Start the session in a harness set up for this project, from its folder.`])
    expect(itemsOf(thread.map((r) => (r.said ? r : { ...r, own: true }))).map((i) => i.kind)).toEqual(["tab", "notice", "tab", "tab", "notice"])
    expect([unheardLine(known[0]!)]).toEqual(thread[4]!.said!)
  })

  it("knows a stretch once, by when it began: a turn that says it again, as on a reload or a reconnect, adds none", () => {
    const one = { ever: true, since: 5 }
    const known = knownAfter([], one)

    expect(known).toEqual([one])
    expect(knownAfter(known, { ...one })).toBe(known)
    expect(knownAfter(known, undefined)).toBe(known)
    expect(knownAfter(known, { ever: true, since: 9 })).toEqual([one, { ever: true, since: 9 }])
  })
})

describe("opening a drawer", () => {
  it("opens the highlights not yet opened in its tab, and on home those in no tab, never an ordinary entry", () => {
    const rows = ROWS.map((r) => (r.n === 12 || r.n === 4 ? { ...r, highlight: true as const } : r))
    const unopened = [12, 8, 4]

    expect(unopenedOf(entriesIn(rows, "/queue"), unopened)).toEqual([12])
    expect(unopenedOf(entriesIn(rows, "/tabs/3"), unopened)).toEqual([4])
    expect(unopenedOf(shellEntries(rows), unopened)).toEqual([])
  })

  it("marks them opened quietly, by the page's mark, which tells the agent nothing and keeps no entry", async () => {
    const ring = action({
      name: "ring",
      description: "ring",
      subject: {},
      inputs: {},
      update: (m: { n: number }): Update<{ n: number }, never> => ({ model: m, notices: [{ text: "Rang", highlight: true }] }),
    })
    const pages = view([ring], { "/": () => ({ title: "Bell", ring: ring.bind({}) }) })
    const bell = surface<{ n: number }, never, never>({ description: "a bell", init: () => ({ n: 0 }), update: (m, msg) => pages.update(m, msg as never), view: pages.view, run: async () => {}, failed: () => undefined as never })
    const { agent, person } = story(shell({ bell }))

    await agent.call("/", "open", { surface: "bell" })
    await agent.call("/bell", "ring")
    agent.told()
    agent.noticed()

    const highlights = person.sees("/activity/highlights")!
    const mine = unopenedOf(entriesIn((highlights.entries as Row[]) ?? [], "/bell"), highlights.unopened as number[])

    expect(mine).toEqual([2])
    expect(await person.call("/activity/highlights", "opened", { n: 2 })).toMatchObject({ outcome: "written" })
    expect(person.sees("/activity/highlights")).toMatchObject({ unopened: [] })
    expect(agent.told()).toEqual([])
    expect(agent.noticed()).toEqual([])
    expect(agent.sees("/activity")).toMatchObject({ kept: 2 })
  })
})
