// The person's settings as values, read from what their file keeps, tolerant of whatever it holds.
import { describe, expect, it } from "bun:test"
import { appearanceOf, choiceIn, DEFAULTS, resolveMode, settingsOf } from "../../../framework/shell/settings/src/settings.ts"

describe("the settings a file keeps", () => {
  it("are the defaults where it keeps nothing, or nothing that can be read", () => {
    for (const kept of [undefined, null, 3, "x", [], {}]) expect(settingsOf(kept)).toEqual(DEFAULTS)
    expect(DEFAULTS).toEqual({ appearance: { mode: "system", same: true, themes: { light: "neutral", dark: "neutral" } }, keys: {}, logo: { animate: true } })
  })

  it("take what they can read, part by part, and leave the rest the default", () => {
    expect(
      settingsOf({ appearance: { mode: "dark", themes: { dark: "claude", light: "sepia" } }, keys: { home: "Cmd+H", next: "banana", gone: "mod+x" }, logo: { animate: false } })
    ).toEqual({ appearance: { mode: "dark", same: false, themes: { light: "neutral", dark: "claude" } }, keys: { home: "mod+h" }, logo: { animate: false } })
  })

  it("read a file of before dynamic themes: its themes are presets, and its modes the same where they name the same one", () => {
    expect(appearanceOf({ mode: "light", themes: { light: "claude", dark: "claude" } })).toEqual({ mode: "light", same: true, themes: { light: "claude", dark: "claude" } })
    expect(appearanceOf({ themes: { light: "neutral", dark: "claude" } })).toEqual({ mode: "system", same: false, themes: { light: "neutral", dark: "claude" } })
  })

  it("read a dynamic theme as its three numbers, held to their bounds, and one that is not three numbers as the default", () => {
    expect(appearanceOf({ same: true, themes: { light: { hue: 400, tint: 120, vivid: -3 } } }).themes.light).toEqual({ hue: 40, tint: 100, vivid: 0 })
    expect(appearanceOf({ same: false, themes: { light: { hue: 10, tint: 20 }, dark: { hue: "x", tint: 1, vivid: 2 } } }).themes).toEqual({ light: "neutral", dark: "neutral" })
    expect(appearanceOf({ same: "yes", themes: { light: { hue: 10, tint: 20, vivid: 30 }, dark: { hue: 10, tint: 20, vivid: 30 } } }).same).toBe(true)
  })

  it("show both modes in the one theme while they are the same, each its own otherwise", () => {
    const appearance = { mode: "system", same: true, themes: { light: "moss", dark: "plum" } } as const

    expect(choiceIn(appearance, "dark")).toBe("moss")
    expect(choiceIn({ ...appearance, same: false }, "dark")).toBe("plum")
  })

  it("drop a binding that is a command's default, and one that clashes, so no two commands share keys", () => {
    expect(settingsOf({ keys: { home: "mod+p" } }).keys).toEqual({})
    expect(settingsOf({ keys: { previous: "mod+p" } }).keys).toEqual({})
    expect(settingsOf({ keys: { home: "mod+j", previous: "mod+p" } }).keys).toEqual({ home: "mod+j", previous: "mod+p" })
    expect(settingsOf({ keys: { home: "mod+j" } }).keys).toEqual({})
  })

  it("resolve the system mode by what the system asks for", () => {
    expect(resolveMode(DEFAULTS.appearance, true)).toBe("dark")
    expect(resolveMode({ ...DEFAULTS.appearance, mode: "light" }, true)).toBe("light")
  })
})
