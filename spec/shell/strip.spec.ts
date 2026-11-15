// The strip's order: the newest tab beside home, and where the person lands when the tab they look at closes; a tab's
// one dot for what waits on the person, and the keys that open its menu.
import { describe, expect, it } from "bun:test"
import { newestFirst, successor } from "../../framework/shell/ui/strip.ts"
import { markOf, opensMenu } from "../../framework/shell/ui/tabs.tsx"

const tab = (n: number) => ({ at: `/tabs/${n}`, n })

describe("the strip", () => {
  it("puts the newest tab first and the oldest last, by the number each was opened with", () => {
    const tabs = [tab(1), tab(4), tab(2), tab(7)]

    expect(newestFirst(tabs).map((t) => t.n)).toEqual([7, 4, 2, 1])
    expect(tabs.map((t) => t.n)).toEqual([1, 4, 2, 7])
  })

  it("puts a tab opened later beside home", () => {
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

describe("a tab in the strip", () => {
  it("carries one dot for whatever waits on the person, a broken mark before it and the agent's quiet one after", () => {
    expect(markOf({ waits: true })).toBe("person")
    expect(markOf({ unseen: true })).toBe("person")
    expect(markOf({ needs: [{ who: "person", why: "a draft" }] })).toBe("person")
    expect(markOf({ needs: [{ who: "agent", why: "a run" }] })).toBe("agent")
    expect(markOf({ waits: true, broken: "fails" })).toBe("broken")
    expect(markOf({})).toBeUndefined()
  })

  it("opens its menu on the context-menu key and on Shift+F10, and on nothing else", () => {
    expect(opensMenu({ key: "ContextMenu", shiftKey: false })).toBe(true)
    expect(opensMenu({ key: "F10", shiftKey: true })).toBe(true)
    expect(opensMenu({ key: "F10", shiftKey: false })).toBe(false)
    expect(opensMenu({ key: "Enter", shiftKey: true })).toBe(false)
  })
})
