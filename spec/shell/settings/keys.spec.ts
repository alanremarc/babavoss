// The shell's shortcuts as values: the commands and their default bindings, a binding read or refused, said for a
// platform, and a key pressed matched to its command given the person's bindings.
import { describe, expect, it } from "bun:test"
import { bindings, chordOf, clashing, commandOf, COMMANDS, parse, same, shown, type Pressed } from "../../../framework/shell/settings/src/keys.ts"

const press = (code: string, held: Partial<Pressed> = {}): Pressed => ({
  key: code.replace(/^Key/, "").toLowerCase(),
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...held,
})

describe("the shortcuts", () => {
  it("bind home to mod+p, the next tab to mod+j and the previous to mod+k, and the shown tab's menu to shift+f10", () => {
    expect(bindings({})).toEqual({ home: "mod+p", next: "mod+j", previous: "mod+k", menu: "shift+f10" })
    expect(Object.values(COMMANDS).every((c) => c.does.length > 0)).toBe(true)
  })

  it("read a binding as the person writes it into one order, mod meaning ⌘ on a Mac and Ctrl elsewhere", () => {
    expect(parse("Mod+P")).toEqual({ keys: "mod+p" })
    expect(parse("shift + cmd + k")).toEqual({ keys: "mod+shift+k" })
    expect(parse("alt+f2")).toEqual({ keys: "alt+f2" })
    expect(parse("f7")).toEqual({ keys: "f7" })
    expect(parse("ctrl+[")).toEqual({ keys: "ctrl+[" })
  })

  it("refuse what cannot be a binding: no key, two keys, a modifier alone, a key that types, a word that is no key", () => {
    for (const written of ["", "mod", "mod+p+k", "p", "shift+p", "mod+banana"]) expect(parse(written)).toHaveProperty("refused")
    expect(parse("shift+p")).toEqual({ refused: expect.stringContaining("types text") })
  })

  it("say a binding as a Mac shows it, and as other platforms write it", () => {
    expect(shown("mod+p", true)).toBe("⌘P")
    expect(shown("mod+shift+k", true)).toBe("⌘⇧K")
    expect(shown("mod+shift+k", false)).toBe("Ctrl+Shift+K")
    expect(shown("shift+f10", false)).toBe("Shift+F10")
  })

  it("know a key pressed by its place on the keyboard, ⌘ as mod on a Mac and Ctrl as mod elsewhere, and a modifier alone as none", () => {
    expect(chordOf(press("KeyP", { metaKey: true }), true)).toBe("mod+p")
    expect(chordOf(press("KeyP", { ctrlKey: true }), false)).toBe("mod+p")
    expect(chordOf(press("KeyP", { ctrlKey: true }), true)).toBe("ctrl+p")
    expect(chordOf({ ...press("KeyK", { metaKey: true, shiftKey: true }), key: "K" }, true)).toBe("mod+shift+k")
    expect(chordOf({ key: "Meta", code: "MetaLeft", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, true)).toBeUndefined()
  })

  it("match a key pressed to its command, by the person's bindings over the defaults", () => {
    expect(commandOf(press("KeyP", { metaKey: true }), {}, true)).toBe("home")
    expect(commandOf(press("KeyJ", { ctrlKey: true }), {}, false)).toBe("next")
    expect(commandOf(press("KeyK", { metaKey: true }), {}, true)).toBe("previous")
    expect(commandOf(press("KeyP", { ctrlKey: true }), {}, true)).toBeUndefined()
    expect(commandOf(press("KeyP", { metaKey: true }), { home: "mod+shift+h" }, true)).toBeUndefined()
    expect(commandOf(press("KeyH", { metaKey: true, shiftKey: true }), { home: "mod+shift+h" }, true)).toBe("home")
    expect(commandOf(press("F10", { shiftKey: true, key: "F10" }), {}, false)).toBe("menu")
  })

  it("know a clash wherever two bindings are the same keys on some platform", () => {
    expect(clashing({}, "home", "mod+j")).toBe("next")
    expect(clashing({}, "home", "mod+j".replace("mod", "ctrl"))).toBe("next")
    expect(clashing({}, "next", "mod+j")).toBeUndefined()
    expect(same("ctrl+p", "mod+p")).toBe(true)
    expect(same("meta+p", "ctrl+p")).toBe(false)
  })
})
