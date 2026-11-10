// Facts and handles are flattened and compared for text answers.
import { expect, it } from "bun:test"
import { changes, flatten } from "../../skills/babavoss/framework/core/present/present.ts"
import { handle } from "../../skills/babavoss/framework/core/surface/index.ts"

it("flattens facts and handles to lines, and tells the change between two views", () => {
  const before = flatten({ count: 0, tags: [], add: handle("add", "add", {}, { text: "string" }), notes: [{ n: 1, remove: handle("remove", "r", { n: 1 }) }] })

  expect([...before]).toEqual([
    ["count", "0"],
    ["tags", "[]"],
    ["add", "add + text:string"],
    ["notes.0.n", "1"],
    ["notes.0.remove", 'remove {"n":1}'],
  ])
  expect(changes(before, flatten({ count: 2, tags: ["x"], notes: [] }))).toEqual([
    "count: 0 → 2",
    '+ tags.0: "x"',
    "+ notes: []",
    "- tags",
    "- add",
    "- notes.0.n",
    "- notes.0.remove",
  ])
})
