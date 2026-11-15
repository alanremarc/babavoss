// What a tab offers: which of a view's handles the person is offered as actions, which are asks, how they are named and
// grouped by a view's menu fact; the places a view names and the tree the search reads; the tab's menu and the dots on
// the way to what waits on the person; what a form's fields make of their inputs, and every menu entry as a command.
import { describe, expect, it } from "bun:test"
import { handle, type View } from "../../framework/core/surface/view.ts"
import {
  actionItems,
  argsOf,
  commandsOf,
  dotted,
  foundItems,
  grouped,
  indexOf,
  labelOf,
  MANY,
  named,
  noticesIn,
  offered,
  parentOf,
  placesOf,
  search,
  tabMenu,
} from "../../framework/shell/ui/commands.ts"
import type { Menu, MenuItem } from "../../framework/kit/layouts/menu.tsx"

const approve = handle("approve", "Approve draft 3: it joins the backlog", { n: 3 }, {}, true)
const note = handle("note", "Say where issue 3 stands", { n: 3 }, { text: "string" })
const person: View = { n: 3, title: "Draft", approve, note_: note, more: [{ note }] }

describe("a tab's actions", () => {
  it("offers every handle of the view once, in the view's order, and knows an ask by its mark", () => {
    const actions = offered("/issues/3", person)

    expect(actions.map((a) => [a.handle.name, a.ask])).toEqual([
      ["approve", true],
      ["note", false],
    ])
    expect(actions.every((a) => a.path === "/issues/3")).toBe(true)
  })

  it("calls nothing an ask that is not marked one, and offers nothing where there is no view", () => {
    expect(offered("/", { note_: note }).some((a) => a.ask)).toBe(false)
    expect(offered("/", undefined)).toEqual([])
  })

  it("names an action by its name, asks first, with … where it asks for input; by its description where names repeat", () => {
    const ran: string[] = []
    const items = actionItems(offered("/issues/3", { note_: note, approve }), (a) => ran.push(a.handle.name))

    expect(items.map((i) => [i.label, i.ask])).toEqual([
      ["Approve", true],
      ["Note…", false],
    ])
    expect(items[0]!.hint).toBe(approve.description)
    items[1]!.run()
    expect(ran).toEqual(["note"])

    const open = (n: number) => handle("open", `Open issue ${n}`, { n })

    expect(actionItems(offered("/", { a: open(1), b: open(2) }), () => {}).map((i) => i.label)).toEqual(["Open issue 1", "Open issue 2"])
    expect(named("end_move")).toBe("End move")
  })

  it("makes a prompt's fields the action's arguments, of their types, and none while a number is not one", () => {
    const open = { title: "string", lane: "number", urgent: "boolean" } as const

    expect(argsOf(open, { title: "Fix", lane: "2" })).toEqual({ title: "Fix", lane: 2, urgent: false })
    expect(argsOf(open, { title: "Fix", lane: "two" })).toBeUndefined()
    expect(argsOf(open, { lane: "2" })).toBeUndefined()
    expect(argsOf({}, {})).toEqual({})
  })
})

describe("the palette's commands", () => {
  const set: string[] = []
  const menus: Menu[] = [
    {
      id: "view",
      label: "View",
      items: [
        { kind: "action", id: "fold", label: "Fold all", keys: "⌘.", run: () => set.push("fold") },
        { kind: "check", id: "wrap", label: "Wrap", checked: false, set: (on) => set.push(`wrap ${on}`) },
        { kind: "separator", id: "edge" },
        { kind: "choice", id: "lens", label: "Lens", value: "a", options: [{ id: "a", label: "All" }, { id: "b", label: "Mine" }], set: (v) => set.push(v) },
        { kind: "submenu", id: "more", label: "More", disabled: true, items: [{ kind: "action", id: "reset", label: "Reset", run: () => {} }] },
      ],
    },
  ]

  it("offers every entry as a command named by the way to it, a check as its toggle and a choice by each other option", () => {
    const commands = commandsOf(menus)

    expect(commands.map((c) => [c.group, c.label, c.disabled])).toEqual([
      ["View", "Fold all", false],
      ["View", "Check Wrap", false],
      ["View", "Lens: Mine", false],
      ["View", "More › Reset", true],
    ])
    expect(commands[0]!.keys).toBe("⌘.")
    for (const c of commands.slice(0, 3)) c.run()
    expect(set).toEqual(["fold", "wrap true", "b"])
  })
})

describe("a tab's menus from the surface", () => {
  const start = handle("start", "Give issue 3 to a lane", { n: 3 }, { lane: "number" })
  const done = handle("done", "Mark issue 3 done", { n: 3 })
  const describe_ = handle("describe", "Rewrite what issue 3 is about", { n: 3 }, { about: "string" })
  const drop = handle("drop", "Remove issue 3", { n: 3 })
  const issue: View = { at: "/issues/3", title: "Fix it", approve, start, done, describe: describe_, drop }

  it("lists the asks first and marked, then the groups the menu fact names under their labels, then the rest", () => {
    const items = grouped(offered("/issues/3", { ...issue, menu: [{ label: "Work", actions: ["done", "start"] }] }), [{ label: "Work", actions: ["done", "start"] }], () => {})

    expect(items.map((i) => [i.kind, "label" in i ? i.label : "", i.kind === "action" && i.mark === true])).toEqual([
      ["action", "Approve", true],
      ["separator", "", false],
      ["label", "Work", false],
      ["action", "Done", false],
      ["action", "Start…", false],
      ["separator", "", false],
      ["action", "Describe…", false],
      ["action", "Drop", false],
    ])
    expect(commandsOf([{ id: "place", label: "Fix it", items }]).filter((c) => c.ask).map((c) => c.label)).toEqual(["Approve"])
  })

  it("ignores a menu fact that is not groups of names, and orders by the view alone", () => {
    expect(grouped(offered("/", { done, drop }), "nonsense", () => {}).map((i) => ("label" in i ? i.label : i.kind))).toEqual(["Done", "Drop"])
  })

  it("names every place a view gives under at once, by its row's title or name, but the view's own", () => {
    const view: View = { at: "/", rows: [{ at: "/issues/1", title: "One" }, { at: "/issues/2", name: "two" }, { at: "/issues/1", title: "Again" }], log: { at: "/runs" } }

    expect(placesOf(view, "/")).toEqual([
      { at: "/issues/1", label: "One" },
      { at: "/issues/2", label: "two" },
      { at: "/runs", label: "runs" },
    ])
    expect(labelOf("/issues/2", undefined, placesOf(view))).toBe("two")
    expect(labelOf("/issues/1", { title: "Own" })).toBe("Own")
    expect([parentOf("/issues/3"), parentOf("/issues"), parentOf("/")]).toEqual(["/issues", "/", undefined])
  })

  it("reads the tree breadth-first within its caps, and finds places and actions by every word", async () => {
    const tree: Record<string, View> = {
      "/": { title: "Queue", add: handle("add", "Add an issue", {}, { title: "string" }), rows: [1, 2, 3].map((n) => ({ at: `/issues/${n}`, title: `Issue ${n}` })) },
      "/issues/1": { at: "/issues/1", title: "Issue 1", approve, more: { at: "/issues/1/deep", title: "Deep" } },
      "/issues/2": { at: "/issues/2", title: "Issue 2", done },
      "/issues/3": { at: "/issues/3", title: "Issue 3", drop },
    }
    const reads: string[] = []
    const read = async (path: string) => (reads.push(path), tree[path])
    const found = await indexOf(read, { views: 3, depth: 4 })

    expect(reads).toEqual(["/", "/issues/1", "/issues/2"])
    expect(search(found, "issue 3")[0]).toEqual({ kind: "place", at: "/issues/3", label: "Issue 3" })
    expect(search(found, "approve").map((f) => (f.kind === "action" ? [f.label, f.where, f.action.ask] : []))).toEqual([["Approve", "Issue 1", true]])
    expect(search(found, "deep").map((f) => (f.kind === "place" ? f.at : ""))).toEqual(["/issues/1/deep"])
    expect(search(found, "drop")).toEqual([])
    expect(search(found, "  ")).toEqual([])

    reads.length = 0
    await indexOf(read, { views: 10, depth: 0 })
    expect(reads).toEqual(["/"])
  })
})

describe("the tab's menu", () => {
  const add = handle("add", "Add an issue", {}, { title: "string" })
  const done = handle("done", "Mark issue 3 done", { n: 3 })
  const at = (path: string, view: View) => offered(path, view)
  const shape = (items: MenuItem[]): string[] =>
    items.map((i) => {
      const dot = "mark" in i && i.mark ? " •" : ""

      if (i.kind === "separator") return "---"
      if (i.kind === "submenu") return `> ${i.label}${dot} [${shape(i.items).join(", ")}]${i.search ? " (filter)" : ""}`

      return `${i.kind === "label" ? "# " : ""}${i.label}${dot}`
    })
  const controls: MenuItem[] = [{ kind: "action", id: "close", label: "Close tab", run: () => {} }]
  const parts = { start: () => {}, navigate: () => {}, controls }

  it("holds the surface's actions under its title, the place's under its name, its asks first and dotted, Go, then the shell's", () => {
    const items = tabMenu({
      ...parts,
      surface: { label: "Queue", actions: at("/", { add }) },
      place: { label: "Draft", actions: at("/issues/3", { done, approve }) },
      go: [
        { at: "/issues", label: "issues", up: true },
        { at: "/", label: "Queue", up: true },
        { at: "/issues/3/runs", label: "Runs" },
      ],
      dots: new Set(["/issues/3/runs"]),
    })

    expect(shape(items)).toEqual(["# Queue", "Add…", "---", "# Draft •", "Approve •", "---", "Done", "---", "> Go • [issues, Queue, ---, Runs •]", "---", "Close tab"])
  })

  it("leaves out what is empty, and gives Go a field to filter where it lists more than a few places", () => {
    const go = Array.from({ length: MANY + 1 }, (_, n) => ({ at: `/issues/${n}`, label: `Issue ${n}` }))
    const items = tabMenu({ ...parts, surface: { label: "Queue", actions: [] }, go, dots: new Set() })

    expect(shape(items)[0]).toEndWith("(filter)")
    expect(shape(items).slice(1)).toEqual(["---", "Close tab"])
  })

  it("dots the way to what waits elsewhere: the place Go lists at it or above it, or the way back up that leads to it", () => {
    const go = [{ at: "/", label: "Queue", up: true }, { at: "/issues/3/runs", label: "Runs" }]

    expect([...dotted(["/issues/4"], "/issues/3", go)]).toEqual(["/"])
    expect([...dotted(["/issues/3/runs/1"], "/issues/3", go)]).toEqual(["/issues/3/runs"])
    expect([...dotted(["/issues/3", "/"], "/issues/3", go)]).toEqual([])
    expect([...dotted(["/issues/4"], "/", [{ at: "/issues/4" }, { at: "/issues/5" }])]).toEqual(["/issues/4"])
  })

  it("knows which unseen notices are about a tab, as paths within it, one about no place as its root", () => {
    const notices = [{ at: "/tabs/2/issues/4" }, { at: "/tabs/2" }, { at: "/tabs/21/issues/1" }, { at: null }, { at: "/tabs/3" }]

    expect(noticesIn("/tabs/2", notices)).toEqual(["/issues/4", "/"])
  })

  it("makes what the search finds entries that go to a place or start an action, an ask dotted, each naming where it is", () => {
    const went: string[] = []
    const items = foundItems(
      [
        { kind: "place", at: "/issues/3", label: "Draft" },
        { kind: "action", action: offered("/issues/3", { approve })[0]!, label: "Approve", where: "Draft" },
      ],
      (to) => went.push(to),
      (a) => went.push(a.handle.name)
    )

    expect(items.map((i) => (i.kind === "action" ? [i.label, i.note, i.mark === true] : []))).toEqual([
      ["Draft", undefined, false],
      ["Approve", "Draft", true],
    ])
    for (const i of items) if (i.kind === "action") i.run()
    expect(went).toEqual(["/issues/3", "approve"])
  })
})
