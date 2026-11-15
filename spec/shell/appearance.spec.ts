// The person's menu bar setting: shown unless their cookies say it is hidden, toggled from the palette by its command and keys.
import { describe, expect, it } from "bun:test"
import { menubarCommand, menubarOf, togglesMenubar } from "../../framework/shell/ui/appearance.ts"

const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe("the menu bar setting", () => {
  it("is shown by default, and hidden only where the person hid it", () => {
    expect(menubarOf("")).toBe(true)
    expect(menubarOf("babavoss.appearance=%7B%7D")).toBe(true)
    expect(menubarOf("babavoss.appearance=%7B%7D; babavoss.menubar=hidden")).toBe(false)
    expect(menubarOf("babavoss.menubar=shown")).toBe(true)
  })

  it("is one command of the palette, named by what it will do, with its keys", () => {
    expect(menubarCommand(true, true)).toEqual({ label: "Hide menu bar", keys: "⌘\\" })
    expect(menubarCommand(false, false)).toEqual({ label: "Show menu bar", keys: "Ctrl \\" })
  })

  it("toggles on ⌘\\ on a Mac and Ctrl+\\ elsewhere, and on nothing else", () => {
    expect(togglesMenubar(press("\\", { metaKey: true }), true)).toBe(true)
    expect(togglesMenubar(press("\\", { ctrlKey: true }), false)).toBe(true)
    expect(togglesMenubar(press("\\", { ctrlKey: true }), true)).toBe(false)
    expect(togglesMenubar(press("\\", { metaKey: true, shiftKey: true }), true)).toBe(false)
    expect(togglesMenubar(press("b", { metaKey: true }), true)).toBe(false)
  })
})
