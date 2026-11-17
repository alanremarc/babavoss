// The conventions every page is handed: derived from the person's settings and the machine by one function, read by a
// page from useConventions(), and the same on the page's root as attributes and variables, from one record.
import { describe, expect, it } from "bun:test"
import { renderToString } from "react-dom/server"
import { DEFAULTS, PREFERENCE_NAMES, type Settings } from "../../framework/shell/settings/src/settings.ts"
import { attributesOf, conventionsOf, type Conventions } from "../../framework/shell/src/conventions.ts"
import { ConventionsContext, useConventions } from "../../framework/shell/ui/tab.tsx"

const light = { dark: false, reduced: false }
const prefer = (preferences: Partial<Settings["preferences"]>, appearance: Partial<Settings["appearance"]> = {}): Settings => ({
  ...DEFAULTS,
  appearance: { ...DEFAULTS.appearance, ...appearance },
  preferences: { ...DEFAULTS.preferences, ...preferences },
})

describe("the conventions", () => {
  it("are the person's preferences, where the rail stands and the mode, with the machine's answer where they follow it", () => {
    expect(conventionsOf(DEFAULTS, light)).toEqual({ motion: "full", scale: 1, side: "right", rail: "left", mode: "light" })
    expect(conventionsOf(DEFAULTS, { dark: true, reduced: true })).toEqual({ motion: "reduced", scale: 1, side: "right", rail: "left", mode: "dark" })
    expect(conventionsOf(prefer({ motion: "full", scale: 1.25, side: "left" }, { mode: "light", rail: { side: "top", from: "bottom", drawer: "right" } }), { dark: true, reduced: true })).toEqual({
      motion: "full",
      scale: 1.25,
      side: "left",
      rail: "top",
      mode: "light",
    })
    expect(conventionsOf(prefer({ motion: "reduced" }), light).motion).toBe("reduced")
  })

  it("hold a convention for every preference, so one added to the settings is handed to the page", () => {
    for (const name of PREFERENCE_NAMES) expect(conventionsOf(DEFAULTS, light)).toHaveProperty(name)
  })

  it("stand on the page's root as an attribute each, and a number as a variable too", () => {
    expect(attributesOf({ motion: "reduced", scale: 1.1, side: "left", rail: "bottom", mode: "dark" })).toEqual({
      data: { motion: "reduced", scale: "1.1", side: "left", rail: "bottom", mode: "dark" },
      vars: { "--scale": "1.1" },
    })
  })

  it("are read by a page from the shell, and are the defaults in light where no shell holds the page", () => {
    const told: Conventions[] = []
    const Page = () => (told.push(useConventions()), null)
    const given: Conventions = { motion: "reduced", scale: 1.5, side: "left", rail: "right", mode: "dark" }

    renderToString(<Page />)
    renderToString(
      <ConventionsContext.Provider value={given}>
        <Page />
      </ConventionsContext.Provider>
    )
    expect(told).toEqual([conventionsOf(DEFAULTS, light), given])
  })
})
