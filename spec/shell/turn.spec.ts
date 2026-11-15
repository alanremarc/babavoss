// Whose move it is, as the logo says it: still, working, or the person's changes waiting, counted; and in words, its label.
import { describe, expect, it } from "bun:test"
import { endable, standingOf } from "../../framework/shell/ui/turn.ts"

describe("the logo's standing", () => {
  it("moves while the agent works, and counts nothing then, since what the person does reaches it as it goes", () => {
    expect(standingOf({ agent: "working", waiting: 3 })).toEqual({ state: "working", waiting: 0, said: "The agent is working: what you do on the page reaches it as it goes" })
  })

  it("stands still while the agent is idle, or with the person's changes counted where they wait for its next turn", () => {
    expect(standingOf({ agent: "idle", waiting: 0 }).state).toBe("still")
    expect(standingOf({ agent: "idle", waiting: 2 })).toEqual({ state: "waiting", waiting: 2, said: "Idle; 2 of your changes wait for its next turn" })
    expect(standingOf({ agent: "idle", waiting: 1 }).said).toBe("Idle; 1 of your change waits for its next turn")
  })

  it("stands still where the turn is not known, and says so", () => {
    expect(standingOf(undefined)).toEqual({ state: "still", waiting: 0, said: "Not known whether the agent is working: its harness has not said" })
    expect(standingOf({ agent: "unknown", waiting: 1 }).state).toBe("waiting")
  })

  it("offers to end the person's move only while the agent is idle and something of theirs waits", () => {
    expect(endable({ agent: "idle", waiting: 1 })).toBe(true)
    expect(endable({ agent: "idle", waiting: 0 })).toBe(false)
    expect(endable({ agent: "working", waiting: 2 })).toBe(false)
    expect(endable(undefined)).toBe(false)
  })
})
