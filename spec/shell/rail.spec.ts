// The rail: its order in each of its four positions, the newest tab beside the mark, and where the person lands when the
// tab they look at closes; the arrows and the next and previous tab, along it as it stands on screen; what each gesture
// does to a tab and its drawer, the shortcut's among them; the side a drawer opens at and the way a bubble points; a tab's
// one mark and why; and where the shortcuts give way to a field, the drawer's search excepted.
import { describe, expect, it } from "bun:test"
import type { Rail } from "../../framework/shell/settings/src/settings.ts"
import { awayOf, cycled, doesOf, drawerSide, homeMarkOf, markOf, newestFirst, onScreen, opensDrawer, standing, stepOf, successor } from "../../framework/shell/ui/rail.ts"
import { yields, RECORDING_MARK, SEARCH_MARK, type Focused } from "../../framework/shell/ui/shortcuts.ts"

const tab = (n: number) => ({ at: `/tabs/${n}`, n })
const at = (side: Rail["side"], from: Rail["from"] = "bottom", drawer: Rail["drawer"] = "left"): Rail => ({ side, from, drawer })

describe("the rail's order", () => {
  const newest = newestFirst([tab(1), tab(3), tab(2)]).map((t) => t.at)

  it("puts the newest tab first, by the number each was opened with", () => {
    expect(newest).toEqual(["/tabs/3", "/tabs/2", "/tabs/1"])
  })

  it("stands from the mark at the head of a column that starts from the top, the newest under it", () => {
    expect(onScreen("home", newest, at("left", "top"))).toEqual(["home", "/tabs/3", "/tabs/2", "/tabs/1"])
    expect(onScreen("home", newest, at("right", "top"))).toEqual(["home", "/tabs/3", "/tabs/2", "/tabs/1"])
  })

  it("stands from the mark at the foot of a column that starts from the bottom, the newest above it", () => {
    expect(onScreen("home", newest, at("left", "bottom"))).toEqual(["/tabs/1", "/tabs/2", "/tabs/3", "home"])
    expect(onScreen("home", newest, at("right", "bottom"))).toEqual(["/tabs/1", "/tabs/2", "/tabs/3", "home"])
  })

  it("always runs from the left along the top or bottom, the mark first, whichever end a column would start from", () => {
    for (const from of ["top", "bottom"] as const) {
      expect(onScreen("home", newest, at("top", from))).toEqual(["home", "/tabs/3", "/tabs/2", "/tabs/1"])
      expect(onScreen("home", newest, at("bottom", from))).toEqual(["home", "/tabs/3", "/tabs/2", "/tabs/1"])
    }
  })

  it("lands on the next older tab when one closes, else the next newer, else nowhere", () => {
    const tabs = newestFirst([tab(1), tab(2), tab(3)])

    expect(successor(tabs, "/tabs/2")).toBe("/tabs/1")
    expect(successor(tabs, "/tabs/1")).toBe("/tabs/2")
    expect(successor([tab(5)], "/tabs/5")).toBeUndefined()
  })
})

describe("moving along the rail", () => {
  it("steps with the arrows in the rail's direction, Home and End to either end, and ignores the arrows across it", () => {
    expect([stepOf("ArrowDown", at("left")), stepOf("ArrowUp", at("right")), stepOf("ArrowRight", at("left"))]).toEqual([1, -1, undefined])
    expect([stepOf("ArrowRight", at("top")), stepOf("ArrowLeft", at("bottom")), stepOf("ArrowDown", at("top"))]).toEqual([1, -1, undefined])
    expect([stepOf("Home", at("top")), stepOf("End", at("left"))]).toEqual(["first", "last"])
  })

  it("goes to the next and previous tab in the order on screen, round from either end", () => {
    const order = onScreen("home", ["/tabs/3", "/tabs/2", "/tabs/1"], at("left", "bottom"))

    expect(cycled(order, "home", 1)).toBe("/tabs/1")
    expect(cycled(order, "home", -1)).toBe("/tabs/3")
    expect(cycled(order, "/tabs/1", -1)).toBe("home")
    expect(cycled(["home"], "home", 1)).toBe("home")
  })
})

describe("a tab's drawer", () => {
  const shown = { shown: true, open: false }
  const hidden = { shown: false, open: false }
  const open = { shown: true, open: true }

  it("opens by a click on the tab shown, where a click elsewhere only shows the tab", () => {
    expect(doesOf("click", shown)).toEqual(["open"])
    expect(doesOf("click", hidden)).toEqual(["show"])
  })

  it("opens at once, showing its tab, by a right click, the context-menu key, a click on a row's icon and the shortcut", () => {
    for (const gesture of ["menu", "icon", "shortcut"] as const) {
      expect(doesOf(gesture, hidden)).toEqual(["show", "open"])
      expect(doesOf(gesture, shown)).toEqual(["open"])
    }
  })

  it("closes by the same gesture that opened it, and a middle click closes the tab instead", () => {
    for (const gesture of ["click", "menu", "icon", "shortcut"] as const) expect(doesOf(gesture, open)).toEqual(["close"])
    expect(doesOf("middle", shown)).toEqual(["end"])
  })

  it("is opened from the keyboard on the tab by the context-menu key and Shift+F10, and nothing else", () => {
    expect(opensDrawer({ key: "ContextMenu", shiftKey: false })).toBe(true)
    expect(opensDrawer({ key: "F10", shiftKey: true })).toBe(true)
    expect(opensDrawer({ key: "F10", shiftKey: false })).toBe(false)
    expect(opensDrawer({ key: "Enter", shiftKey: true })).toBe(false)
  })

  it("opens at the rail's own side, or under a rail along the top or bottom at the side the person chose", () => {
    expect([drawerSide(at("left", "top", "right")), drawerSide(at("right", "top", "left"))]).toEqual(["left", "right"])
    expect([drawerSide(at("top", "top", "right")), drawerSide(at("bottom", "top", "left"))]).toEqual(["right", "left"])
  })

  it("has the bubbles of its notices point away from the rail", () => {
    expect([awayOf(at("left")), awayOf(at("right")), awayOf(at("top")), awayOf(at("bottom"))]).toEqual(["right", "left", "down", "up"])
  })
})

describe("the mark's dot", () => {
  it("is the person's while the session's hooks are not heard, never heard or gone quiet, and none once one is heard", () => {
    expect(homeMarkOf({ ever: false, since: 1 })).toBe("person")
    expect(homeMarkOf({ ever: true, since: 1 })).toBe("person")
    expect(homeMarkOf(undefined)).toBeUndefined()
  })
})

describe("a tab's mark", () => {
  it("is one dot for whatever waits on the person, a broken mark before it and the agent's quiet one after", () => {
    expect(markOf({ waits: true })).toBe("person")
    expect(markOf({ unseen: true })).toBe("person")
    expect(markOf({ needs: [{ who: "person", why: "a draft" }] })).toBe("person")
    expect(markOf({ needs: [{ who: "agent", why: "a run" }] })).toBe("agent")
    expect(markOf({ waits: true, broken: "fails" })).toBe("broken")
    expect(markOf({})).toBeUndefined()
  })

  it("says why under the tab's title, the strongest first", () => {
    expect(standing({ broken: "fails", needs: [{ who: "agent", why: "to rerun" }, { who: "person", why: "to decide" }], notices: 1, unseen: true })).toEqual([
      "Broken",
      "Needs you: to decide",
      "1 new notice",
      "Opened by the agent",
      "Needs the agent: to rerun",
    ])
    expect(standing({ notices: 2 })).toEqual(["2 new notices"])
  })
})

describe("the shortcuts", () => {
  const focused = (tagName: string, more: Partial<Focused> = {}, marks: string[] = []): Focused => ({ tagName, marked: (m) => marks.includes(m), ...more })

  it("work from anywhere but a field that takes text, the drawer's search excepted, and give way to a binding being recorded", () => {
    expect(yields(undefined)).toBe(false)
    expect(yields(focused("BUTTON"))).toBe(false)
    expect(yields(focused("INPUT", { type: "checkbox" }))).toBe(false)
    expect(yields(focused("INPUT", { type: "text" }))).toBe(true)
    expect(yields(focused("TEXTAREA"))).toBe(true)
    expect(yields(focused("DIV", { isContentEditable: true }))).toBe(true)
    expect(yields(focused("INPUT", { type: "search" }, [SEARCH_MARK]))).toBe(false)
    expect(yields(focused("BUTTON", {}, [RECORDING_MARK]))).toBe(true)
  })
})
