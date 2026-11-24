// The person's settings as values, read from what their file keeps, tolerant of whatever it holds.
import { describe, expect, it } from "bun:test"
import { appearanceOf, choiceIn, DEFAULTS, preferencesOf, railOf, resolveMode, settingsFromView, settingsOf, viewOf, type Settings } from "../../../framework/shell/settings/src/settings.ts"

describe("the settings a file keeps", () => {
  it("are the defaults where it keeps nothing, or nothing that can be read", () => {
    for (const kept of [undefined, null, 3, "x", [], {}]) expect(settingsOf(kept)).toEqual(DEFAULTS)
    expect(DEFAULTS).toEqual({
      appearance: { mode: "system", same: true, themes: { light: "neutral", dark: "neutral" }, rail: { side: "left", from: "bottom", drawer: "left" } },
      preferences: { motion: "system", scale: 1, side: "right" },
      keys: {},
      logo: { animate: true },
      runtime: { sleepAtEnd: true },
      archive: { days: 30, megabytes: 200 },
    })
  })

  it("take what they can read, part by part, and leave the rest the default", () => {
    expect(
      settingsOf({
        appearance: { mode: "dark", themes: { dark: "clay", light: "sepia" }, rail: { side: "top" } },
        preferences: { motion: "reduced", scale: 3 },
        keys: { drawer: "Cmd+H", next: "banana", gone: "mod+x" },
        logo: { animate: false },
        runtime: { sleepAtEnd: false },
        archive: { days: 7, megabytes: 0.5 },
      })
    ).toEqual({
      appearance: { mode: "dark", same: false, themes: { light: "neutral", dark: "clay" }, rail: { side: "top", from: "bottom", drawer: "left" } },
      preferences: { motion: "reduced", scale: 1, side: "right" },
      keys: { drawer: "mod+h" },
      logo: { animate: false },
      runtime: { sleepAtEnd: false },
      archive: { days: 7, megabytes: 200 },
    })
  })

  it("read a file of before dynamic themes: its themes are presets, and its modes the same where they name the same one", () => {
    expect(appearanceOf({ mode: "light", themes: { light: "clay", dark: "clay" } })).toEqual({ mode: "light", same: true, themes: { light: "clay", dark: "clay" }, rail: DEFAULTS.appearance.rail })
    // Clay was named claude: a file from then reads as clay.
    expect(appearanceOf({ themes: { light: "claude", dark: "claude" } }).themes).toEqual({ light: "clay", dark: "clay" })
    expect(appearanceOf({ themes: { light: "neutral", dark: "clay" } })).toEqual({ mode: "system", same: false, themes: { light: "neutral", dark: "clay" }, rail: DEFAULTS.appearance.rail })
  })

  it("read a dynamic theme as its three numbers, held to their bounds, and one that is not three numbers as the default", () => {
    expect(appearanceOf({ same: true, themes: { light: { hue: 400, tint: 120, vivid: -3 } } }).themes.light).toEqual({ hue: 40, tint: 100, vivid: 0 })
    expect(appearanceOf({ same: false, themes: { light: { hue: 10, tint: 20 }, dark: { hue: "x", tint: 1, vivid: 2 } } }).themes).toEqual({ light: "neutral", dark: "neutral" })
    expect(appearanceOf({ same: "yes", themes: { light: { hue: 10, tint: 20, vivid: 30 }, dark: { hue: 10, tint: 20, vivid: 30 } } }).same).toBe(true)
  })

  it("show both modes in the one theme while they are the same, each its own otherwise", () => {
    const appearance = { ...DEFAULTS.appearance, mode: "system", same: true, themes: { light: "moss", dark: "plum" } } as const

    expect(choiceIn(appearance, "dark")).toBe("moss")
    expect(choiceIn({ ...appearance, same: false }, "dark")).toBe("plum")
  })

  it("drop a binding that is a command's default, and one that clashes, so no two commands share keys", () => {
    expect(settingsOf({ keys: { drawer: "mod+p" } }).keys).toEqual({})
    expect(settingsOf({ keys: { previous: "mod+p" } }).keys).toEqual({})
    expect(settingsOf({ keys: { drawer: "mod+j", previous: "mod+p" } }).keys).toEqual({ drawer: "mod+j", previous: "mod+p" })
    expect(settingsOf({ keys: { drawer: "mod+j" } }).keys).toEqual({})
  })

  it("read a file of before the drawer: its binding of home is the drawer's, unless the drawer has its own, and one of the menu is dropped", () => {
    expect(settingsOf({ keys: { home: "mod+shift+h", menu: "f9" } }).keys).toEqual({ drawer: "mod+shift+h" })
    expect(settingsOf({ keys: { home: "mod+shift+h", drawer: "mod+shift+d" } }).keys).toEqual({ drawer: "mod+shift+d" })
  })

  it("read each preference as one of its choices, the default where it is not one, and a file of before them as the defaults", () => {
    expect(preferencesOf({ motion: "full", scale: 1.25, side: "left" })).toEqual({ motion: "full", scale: 1.25, side: "left" })
    expect(preferencesOf({ motion: "slow", scale: "1.25", side: "top" })).toEqual(DEFAULTS.preferences)
    expect(settingsOf({ appearance: { mode: "dark" } }).preferences).toEqual(DEFAULTS.preferences)
  })

  it("read where the rail stands part by part, each part it cannot read the default, and a file of before the rail as the default rail", () => {
    expect(railOf({ side: "right", from: "top", drawer: "right" })).toEqual({ side: "right", from: "top", drawer: "right" })
    expect(railOf({ side: "middle", from: 3, drawer: "right" })).toEqual({ side: "left", from: "bottom", drawer: "right" })
    expect(settingsOf({ appearance: { mode: "dark", themes: { light: "clay", dark: "clay" } } }).appearance.rail).toEqual({ side: "left", from: "bottom", drawer: "left" })
  })

  it("come back whole from what their view tells, every part of them, as the settings' page hands them to the shell", () => {
    const changed: Settings = {
      appearance: { mode: "dark", same: false, themes: { light: "moss", dark: { hue: 200, tint: 40, vivid: 60 } }, rail: { side: "top", from: "top", drawer: "right" } },
      preferences: { motion: "reduced", scale: 1.5, side: "left" },
      keys: { drawer: "mod+shift+d", next: "alt+f2" },
      logo: { animate: false },
      runtime: { sleepAtEnd: false },
      archive: { days: 90, megabytes: 1000 },
    }

    for (const settings of [DEFAULTS, changed]) expect(settingsFromView(viewOf(settings))).toEqual(settings)
    expect(Object.keys(viewOf(changed)).sort()).toEqual(Object.keys(changed).map((k) => (k === "keys" ? "shortcuts" : k)).sort())
  })

  it("resolve the system mode by what the system asks for", () => {
    expect(resolveMode(DEFAULTS.appearance, true)).toBe("dark")
    expect(resolveMode({ ...DEFAULTS.appearance, mode: "light" }, true)).toBe("light")
  })
})
