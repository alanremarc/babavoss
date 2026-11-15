// Where the page stands, and what it does when the agent points: it goes there, unless the person is in the middle of something.
import { describe, expect, it } from "bun:test"
import { arrival, placeOf, pointedSince, QUIET_MS } from "../../framework/shell/ui/pointing.ts"

describe("pointing", () => {
  it("reads a place from a path: a tab and the route within it, else home", () => {
    expect(placeOf("/tabs/3/issues/14")).toEqual({ key: "/tabs/3", route: "/issues/14" })
    expect(placeOf("/tabs/3/")).toEqual({ key: "/tabs/3", route: "/" })
    expect(placeOf("/settings")).toEqual({ key: "home", route: "/" })
    expect(placeOf("/")).toEqual({ key: "home", route: "/" })
    expect(placeOf("/elsewhere")).toEqual({ key: "home", route: "/" })
  })

  it("acts on a pointing once, when its count moves, and not on the page's first look", () => {
    const at = "/tabs/1/issues/2"

    expect(pointedSince(undefined, { at, n: 4 })).toEqual({ seen: 4 })
    expect(pointedSince(undefined, undefined)).toEqual({ seen: 0 })
    expect(pointedSince(4, { at, n: 4 })).toEqual({ seen: 4 })
    expect(pointedSince(4, { at, n: 5 })).toEqual({ seen: 5, fresh: { at, n: 5 } })
    expect(pointedSince(0, { at, n: 1 })).toEqual({ seen: 1, fresh: { at, n: 1 } })
    expect(pointedSince(5, undefined)).toEqual({ seen: 5 })
  })

  it("goes at once to a pointed place, and only offers it while the person types or has just acted", () => {
    const now = 100_000

    expect(arrival({ typing: false, acted: 0 }, now)).toBe("go")
    expect(arrival({ typing: false, acted: now - QUIET_MS }, now)).toBe("go")
    expect(arrival({ typing: false, acted: now - QUIET_MS + 1 }, now)).toBe("offer")
    expect(arrival({ typing: true, acted: 0 }, now)).toBe("offer")
  })
})
