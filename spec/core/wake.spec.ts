// How long a runtime stays up for what woke it: each request's signal, its strength, and the deadline they keep.
import { expect, it } from "bun:test"
import { signalOf, strengthsOf, wakeful, STRENGTHS, type Request } from "../../framework/core/runtime/wake.ts"

const asked = (r: Partial<Request>): Request => ({ method: "GET", path: "/", open: false, plain: false, stream: false, html: false, probe: false, agent: false, ...r })

it("classifies each request where it enters: the agent's word and the hooks by what they say, the page by what it does", () => {
  expect(signalOf(asked({ plain: true, open: true }))).toBe("opened")
  expect(signalOf(asked({ plain: true, path: "/tabs/1" }))).toBe("agent")
  expect(signalOf(asked({ plain: true, path: "/_/wait" }))).toBe("agent")
  expect(signalOf(asked({ plain: true, method: "POST", path: "/_/turn", turn: "started" }))).toBe("started")
  expect(signalOf(asked({ plain: true, method: "POST", path: "/_/turn", turn: "gone" }))).toBe("gone")
  expect(signalOf(asked({ method: "POST", path: "/tabs/1" }))).toBe("person")
  expect(signalOf(asked({ method: "POST", path: "/_/turn" }))).toBe("person")
  expect(signalOf(asked({ agent: true, path: "/tabs/1" }))).toBe("agent")
  for (const watching of [asked({ stream: true }), asked({ html: true }), asked({ path: "/_/settings.json" }), asked({ path: "/tabs/1" }), asked({ probe: true, agent: true })])
    expect(signalOf(watching)).toBe("watching")
})

it("keeps the furthest deadline, which watching never moves, and the session's end cuts to what is left of it", () => {
  const wake = wakeful(STRENGTHS, 0)

  expect(wake.until).toBe(STRENGTHS.weak)
  wake.signal("started", 1000)
  expect(wake.until).toBe(1000 + STRENGTHS.strong)
  wake.signal("opened", 2000)
  wake.signal("watching", 3000)
  expect(wake.until).toBe(1000 + STRENGTHS.strong)
  wake.signal("gone", 4000)
  expect(wake.until).toBe(4000 + STRENGTHS.end)
  wake.signal("ended", 5000)
  expect(wake.until).toBe(5000 + STRENGTHS.weak)
})

it("takes shorter strengths from BABAVOSS_WAKE_MS, for specs, and ignores what it says wrong", () => {
  expect(strengthsOf({ BABAVOSS_WAKE_MS: "weak=2000, strong=20000,end=x,other=1" })).toEqual({ ...STRENGTHS, weak: 2000, strong: 20000 })
  expect(strengthsOf({})).toEqual(STRENGTHS)
})
