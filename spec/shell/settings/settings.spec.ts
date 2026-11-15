// The person's settings as values, read from what their file keeps, tolerant of whatever it holds.
import { describe, expect, it } from "bun:test"
import { DEFAULTS, resolveMode, settingsOf } from "../../../framework/shell/settings/src/settings.ts"

describe("the settings a file keeps", () => {
  it("are the defaults where it keeps nothing, or nothing that can be read", () => {
    for (const kept of [undefined, null, 3, "x", [], {}]) expect(settingsOf(kept)).toEqual(DEFAULTS)
    expect(DEFAULTS).toEqual({ appearance: { mode: "system", themes: { light: "neutral", dark: "neutral" } }, keys: {}, logo: { animate: true } })
  })

  it("take what they can read, part by part, and leave the rest the default", () => {
    expect(
      settingsOf({ appearance: { mode: "dark", themes: { dark: "claude", light: "sepia" } }, keys: { home: "Cmd+H", next: "banana", gone: "mod+x" }, logo: { animate: false } })
    ).toEqual({ appearance: { mode: "dark", themes: { light: "neutral", dark: "claude" } }, keys: { home: "mod+h" }, logo: { animate: false } })
  })

  it("drop a binding that is a command's default, and one that clashes, so no two commands share keys", () => {
    expect(settingsOf({ keys: { home: "mod+p" } }).keys).toEqual({})
    expect(settingsOf({ keys: { previous: "mod+p" } }).keys).toEqual({})
    expect(settingsOf({ keys: { home: "mod+k", previous: "mod+p" } }).keys).toEqual({ home: "mod+k", previous: "mod+p" })
    expect(settingsOf({ keys: { home: "mod+k" } }).keys).toEqual({})
  })

  it("resolve the system mode by what the system asks for", () => {
    expect(resolveMode(DEFAULTS.appearance, true)).toBe("dark")
    expect(resolveMode({ ...DEFAULTS.appearance, mode: "light" }, true)).toBe("light")
  })
})
