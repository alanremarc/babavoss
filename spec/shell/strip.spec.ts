// The strip's order: the newest tab beside home, and where the person lands when the tab they look at closes; a tab's
// one dot for what waits on the person, and the keys that open its menu; the next and previous tab the shortcuts go to,
// and where the shortcuts give way to a field.
import { describe, expect, it } from "bun:test"
import { cycled, newestFirst, successor } from "../../framework/shell/ui/strip.ts"
import { yields, RECORDING_MARK, SEARCH_MARK, type Focused } from "../../framework/shell/ui/shortcuts.ts"
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

describe("the next and previous tab", () => {
  const order = ["home", "/tabs/3", "/tabs/2", "/tabs/1"]

  it("go along the strip as it is shown, home first, and round from either end", () => {
    expect(cycled(order, "home", 1)).toBe("/tabs/3")
    expect(cycled(order, "/tabs/2", 1)).toBe("/tabs/1")
    expect(cycled(order, "/tabs/1", 1)).toBe("home")
    expect(cycled(order, "home", -1)).toBe("/tabs/1")
    expect(cycled(order, "/tabs/3", -1)).toBe("home")
    expect(cycled(["home"], "home", 1)).toBe("home")
  })
})

describe("the shortcuts", () => {
  const focused = (tagName: string, more: Partial<Focused> = {}, marks: string[] = []): Focused => ({ tagName, marked: (m) => marks.includes(m), ...more })

  it("work from anywhere but a field that takes text, home's search excepted, and give way to a binding being recorded", () => {
    expect(yields(undefined)).toBe(false)
    expect(yields(focused("BUTTON"))).toBe(false)
    expect(yields(focused("DIV"))).toBe(false)
    expect(yields(focused("INPUT", { type: "checkbox" }))).toBe(false)
    expect(yields(focused("INPUT", { type: "text" }))).toBe(true)
    expect(yields(focused("TEXTAREA"))).toBe(true)
    expect(yields(focused("DIV", { isContentEditable: true }))).toBe(true)
    expect(yields(focused("INPUT", { type: "text" }, [SEARCH_MARK]))).toBe(false)
    expect(yields(focused("BUTTON", {}, [RECORDING_MARK]))).toBe(true)
  })
})
