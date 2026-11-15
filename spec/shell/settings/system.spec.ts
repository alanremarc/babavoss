// The machine's mode: what macOS's answer means, which adapter fits, and how often one is asked.
import { describe, expect, it } from "bun:test"
import type { SystemAdapter } from "../../../framework/shell/settings/src/system/adapter.ts"
import { adapterFor, machineMode, reader } from "../../../framework/shell/settings/src/system/index.ts"
import { modeOf } from "../../../framework/shell/settings/src/system/macos.ts"

describe("the machine's mode", () => {
  it("reads macOS: Dark is dark, a key that does not exist is light, anything else is not known", () => {
    expect(modeOf(0, "Dark\n", "")).toBe("dark")
    expect(modeOf(1, "", "The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist\n")).toBe("light")
    expect(modeOf(0, "Sepia\n", "")).toBeUndefined()
    expect(modeOf(null, "", "")).toBeUndefined()
    expect(modeOf(127, "", "command not found")).toBeUndefined()
  })

  it("asks the adapter that fits the operating system, and none where none fits", () => {
    expect(adapterFor("darwin")?.name).toBe("macos")
    expect(adapterFor("linux")).toBeUndefined()
  })

  it("asks an adapter once in a while, however often it is read, and knows nothing without one", () => {
    let asked = 0
    let clock = 0
    const fake: SystemAdapter = { name: "fake", fits: () => true, read: () => (++asked % 2 ? "dark" : "light") }
    const read = reader(fake, 2000, () => clock)

    expect([read(), read()]).toEqual(["dark", "dark"])
    clock = 2000
    expect(read()).toBe("light")
    expect(asked).toBe(2)
    expect(reader(undefined)()).toBeUndefined()
  })

  it("leaves the answer to the browser where the person says so", () => {
    expect(machineMode({ BABAVOSS_SYSTEM_MODE: "browser" })).toBeUndefined()
  })
})
