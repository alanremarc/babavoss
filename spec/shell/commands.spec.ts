// The frame's commands: which of a view's handles the person is offered as actions, which are asks, how they are named,
// what a prompt's fields make of their inputs, and every menu entry as a command of the palette.
import { describe, expect, it } from "bun:test"
import { handle, type View } from "../../framework/core/surface/view.ts"
import { actionItems, argsOf, commandsOf, joined, named, offered } from "../../framework/shell/ui/commands.ts"
import type { Menu } from "../../framework/kit/layouts/menu.tsx"

const approve = handle("approve", "Approve draft 3: it joins the backlog", { n: 3 })
const note = handle("note", "Say where issue 3 stands", { n: 3 }, { text: "string" })
const person: View = { n: 3, title: "Draft", approve, note_: note, more: [{ note }] }
const agent: View = { n: 3, title: "Draft", note_: note }

describe("the frame's actions", () => {
  it("offers every handle of the view once, in the view's order, and knows an ask by the agent not being offered it", () => {
    const actions = offered("/issues/3", person, agent)

    expect(actions.map((a) => [a.handle.name, a.ask])).toEqual([
      ["approve", true],
      ["note", false],
    ])
    expect(actions.every((a) => a.path === "/issues/3")).toBe(true)
  })

  it("calls nothing an ask without the agent's view, and offers nothing where there is no view", () => {
    expect(offered("/", person).some((a) => a.ask)).toBe(false)
    expect(offered("/", undefined)).toEqual([])
  })

  it("names an action by its name, asks first, with … where it asks for input; by its description where names repeat", () => {
    const ran: string[] = []
    const items = actionItems(offered("/issues/3", { note_: note, approve }, agent), (a) => ran.push(a.handle.name))

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

describe("the frame's menus", () => {
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

  it("joins menus of one id that several parts of a page give, in the order given", () => {
    const own: Menu = { id: "view", label: "View", items: [{ kind: "action", id: "lens", label: "Lens", run: () => {} }] }
    const all = joined([[{ id: "issues", label: "Issues", items: [] }, own], [menus[0]!]])

    expect(all.map((m) => m.id)).toEqual(["issues", "view"])
    expect(all[1]!.items.map((i) => i.kind)).toEqual(["action", "separator", "action", "check", "separator", "choice", "submenu"])
  })
})
