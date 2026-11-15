// The strip's order: the newest tab beside the launcher, and where the person lands when the tab they look at closes.
import { describe, expect, it } from "bun:test"
import { newestFirst, successor } from "../../framework/shell/ui/strip.ts"

const tab = (n: number) => ({ at: `/tabs/${n}`, n })

describe("the strip", () => {
  it("puts the newest tab first and the oldest last, by the number each was opened with", () => {
    const tabs = [tab(1), tab(4), tab(2), tab(7)]

    expect(newestFirst(tabs).map((t) => t.n)).toEqual([7, 4, 2, 1])
    expect(tabs.map((t) => t.n)).toEqual([1, 4, 2, 7])
  })

  it("puts a tab opened later beside the launcher", () => {
    expect(newestFirst([tab(1), tab(2), tab(3)])[0]!.n).toBe(3)
  })

  it("lands on the next older tab when one closes, else the next newer, else nowhere", () => {
    const strip = newestFirst([tab(1), tab(2), tab(3)])

    expect(successor(strip, "/tabs/2")).toBe("/tabs/1")
    expect(successor(strip, "/tabs/3")).toBe("/tabs/2")
    expect(successor(strip, "/tabs/1")).toBe("/tabs/2")
    expect(successor([tab(5)], "/tabs/5")).toBeUndefined()
    expect(successor(strip, "/tabs/9")).toBeUndefined()
  })
})
