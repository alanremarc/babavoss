// How the workbench's toolbars are arranged: settled against the util's tools, tools and toolbars moved by a drop.
import { describe, expect, it } from "bun:test"
import { moveBar, moveTool, names, settle, type Bar } from "../../skills/babavoss/framework/shell/ui/layouts/arrange.ts"

const tools = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "s", meta: true }]
const ids = (bars: Bar[]) => bars.map((b) => `${b.edge ?? "float"}:${b.tools.join("")}`)

describe("arrange", () => {
  it("settles: nothing kept gives one toolbar pinned right with every tool, meta last; kept toolbars drop unknown tools, take missing ones, one per edge", () => {
    expect(settle(undefined, tools)).toEqual([{ id: "main", tools: ["a", "b", "c", "s"], edge: "right", expanded: true }])
    expect(
      ids(
        settle(
          [
            { id: "x", tools: ["c", "gone"], edge: "right", expanded: false, folded: ["c", "gone"] },
            { id: "y", tools: ["a"], edge: "right", expanded: true },
            { id: "z", tools: ["b"], expanded: true, float: { x: 1, y: 2, width: 300, height: 400 } },
          ],
          tools
        )
      )
    ).toEqual(["right:cas", "float:b"])
    expect(settle([{ id: "x", tools: ["c"], edge: "right", expanded: false, folded: ["c"] }], tools)[0]).toMatchObject({
      expanded: false,
      folded: ["c"],
      tools: ["c", "a", "b", "s"],
    })
    expect(settle([{ id: "z", tools: ["b"], expanded: true }], tools)[0]!.float).toMatchObject({ x: 12, y: 12, width: 280, height: 360 })
  })

  it("moves a tool among a toolbar's tools, to an edge, or out as a floating toolbar of its own; an emptied toolbar is gone", () => {
    const start = settle(undefined, tools)

    expect(ids(moveTool(start, "c", { bar: "main", index: 0 }))).toEqual(["right:cabs"])
    expect(ids(moveTool(start, "a", { bar: "main", index: 3 }))).toEqual(["right:bcas"])
    expect(ids(moveTool(start, "b", { edge: "left" }))).toEqual(["right:acs", "left:b"])

    const two = moveTool(start, "b", { edge: "left" })

    expect(ids(moveTool(two, "a", { edge: "left" }))).toEqual(["right:cs", "left:ba"])
    expect(ids(moveTool(two, "b", { float: { x: 5, y: 6 } }))).toEqual(["right:acs", "float:b"])
    expect(moveTool(two, "b", { float: { x: 5, y: 6 } })[1]!.float).toEqual({ x: 5, y: 6, width: 280, height: 360 })
    expect(moveTool(start, "nope", { edge: "top" })).toBe(start)
  })

  it("moves a whole toolbar: pinned to a free edge, merged into the toolbar on a taken edge or a named one, or floating", () => {
    const bars = moveTool(settle(undefined, tools), "b", { edge: "left" })
    const left = bars[1]!

    expect(ids(moveBar(bars, left.id, { edge: "top" }))).toEqual(["right:acs", "top:b"])
    expect(ids(moveBar(bars, left.id, { edge: "right" }))).toEqual(["right:acsb"])
    expect(ids(moveBar(bars, left.id, { bar: "main", index: 0 }))).toEqual(["right:acsb"])
    expect(ids(moveBar(bars, left.id, { float: { x: 1, y: 1 } }))).toEqual(["right:acs", "float:b"])
    expect(moveBar(bars, left.id, { bar: left.id, index: 0 })).toBe(bars)
  })

  it("names toolbars by their edge, and floating ones by number when there are several", () => {
    const bars: Bar[] = [
      { id: "l", tools: ["a"], edge: "left", expanded: true },
      { id: "f1", tools: ["b"], expanded: true },
      { id: "f2", tools: ["c"], expanded: true },
    ]
    const name = names(bars)

    expect(bars.map(name)).toEqual(["Left toolbar", "Floating toolbar 1", "Floating toolbar 2"])
    expect(names(bars.slice(0, 2))(bars[1]!)).toBe("Floating toolbar")
  })
})
