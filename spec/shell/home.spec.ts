// Home, the shell's own page: which surfaces it offers to open and which it lists broken, the tab it returns to, and where
// its shortcut goes.
import { describe, expect, it } from "bun:test"
import { handle } from "../../framework/core/surface/view.ts"
import { backTo, choices, shortcut } from "../../framework/shell/ui/home.ts"
import { HOME, placeOf } from "../../framework/shell/ui/pointing.ts"

const open = (surface: string) => handle("open", `open a ${surface} tab`, { surface })

describe("home", () => {
  it("is the page at /, and where no tab is", () => {
    expect(placeOf("/")).toEqual({ key: HOME, route: "/" })
    expect(placeOf("/tabs")).toEqual({ key: HOME, route: "/" })
  })

  it("offers a surface that loads to open, and lists one that does not load as broken, with why, and not to open", () => {
    const broken = "the board surface does not load (SyntaxError at surfaces/board/src/surface.ts:3); fix its code, and it is loaded again"
    const listed = choices([
      { name: "notes", description: "keep notes; use when…", open: open("notes") },
      { name: "board", broken },
    ])

    expect(listed).toEqual([
      { name: "notes", description: "keep notes; use when…", open: open("notes") },
      { name: "board", broken },
    ])
    expect(listed.filter((c) => "open" in c).map((c) => c.name)).toEqual(["notes"])
  })

  it("lists a surface that offers no open as broken, never as a choice that fails", () => {
    expect(choices([{ name: "odd", description: "…" }])).toEqual([{ name: "odd", broken: "the odd surface offers no open" }])
  })

  it("returns to the tab shown before it while that tab is open", () => {
    expect(backTo("/tabs/2", ["/tabs/1", "/tabs/2"])).toBe("/tabs/2")
    expect(backTo("/tabs/3", ["/tabs/1", "/tabs/2"])).toBeUndefined()
    expect(backTo(undefined, ["/tabs/1"])).toBeUndefined()
  })

  it("is where the shortcut goes from any tab, and from home it goes back, or stays where nothing was shown before", () => {
    expect(shortcut("/tabs/2", "/tabs/2")).toBe(HOME)
    expect(shortcut("/tabs/3", undefined)).toBe(HOME)
    expect(shortcut(HOME, "/tabs/2")).toBe("/tabs/2")
    expect(shortcut(HOME, undefined)).toBe(HOME)
  })
})
