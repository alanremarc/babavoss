// How long a runtime stays up for what woke it: each request's signal, its strength, and the deadline they keep.
import { expect, it } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { signalOf, sleepsAtEnd, strengthsOf, wakeful, STRENGTHS, VISIBLE_MS, type Request } from "../../framework/core/runtime/wake.ts"

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
  const wake = wakeful(STRENGTHS, 0, () => true)

  expect(wake.until).toBe(STRENGTHS.weak)
  wake.signal("started", 1000)
  expect(wake.until).toBe(1000 + STRENGTHS.strong)
  wake.signal("opened", 2000)
  wake.signal("ended", 2500)
  wake.signal("watching", 3000)
  expect(wake.until).toBe(1000 + STRENGTHS.strong)
  wake.signal("gone", 4000)
  expect(wake.until).toBe(4000 + STRENGTHS.end)
  wake.signal("ended", 5000)
  expect(wake.until).toBe(4000 + STRENGTHS.end)
  wake.signal("opened", 6000)
  expect(wake.until).toBe(6000 + STRENGTHS.weak)
})

it("keeps a page lease alongside activity, carries it across restart, and stops renewing it when the session ends", () => {
  const wake = wakeful(STRENGTHS, 0)
  const resumed = wakeful(STRENGTHS, STRENGTHS.weak, () => true)

  wake.signal("visible", 1000)
  expect(wake.until).toBe(STRENGTHS.weak)
  wake.signal("visible", STRENGTHS.weak)
  resumed.carry(wake.state)
  expect(resumed.until).toBe(STRENGTHS.weak + VISIBLE_MS)
  resumed.signal("gone", STRENGTHS.weak)
  resumed.signal("visible", STRENGTHS.weak + 30_000)
  expect(resumed.until).toBe(STRENGTHS.weak + STRENGTHS.end)
})

it("leaves the deadline and the page's lease as they were at the session's end where the settings say it does not sleep, asked as it is heard", () => {
  let sleeps = false
  const wake = wakeful(STRENGTHS, 0, () => sleeps)

  wake.signal("started", 1000)
  wake.signal("visible", 2000)
  wake.signal("gone", 3000)
  expect(wake.until).toBe(1000 + STRENGTHS.strong)
  wake.signal("visible", 1000 + STRENGTHS.strong)
  expect(wake.until).toBe(1000 + STRENGTHS.strong + VISIBLE_MS)
  sleeps = true
  wake.signal("gone", 1000 + STRENGTHS.strong + 1)
  expect(wake.until).toBe(1000 + STRENGTHS.strong + 1 + STRENGTHS.end)
})

it("sleeps at the session's end only when the person opts in", () => {
  const file = join(mkdtempSync(join(tmpdir(), "wake-settings-")), "settings.json")
  const env = { BABAVOSS_SETTINGS: file }

  expect(sleepsAtEnd(env)).toBe(false)
  const wake = wakeful(STRENGTHS, 0)

  wake.signal("gone", 1000)
  expect(wake.until).toBe(STRENGTHS.weak)
  for (const [kept, sleeps] of [["{", false], ["null", false], ['{"runtime":{"sleepAtEnd":true}}', true], ['{"runtime":{"sleepAtEnd":false}}', false]] as const) {
    writeFileSync(file, kept)
    expect([kept, sleepsAtEnd(env)]).toEqual([kept, sleeps])
  }
})

it("takes shorter strengths from BABAVOSS_WAKE_MS, for specs, and ignores what it says wrong", () => {
  expect(strengthsOf({ BABAVOSS_WAKE_MS: "weak=2000, strong=20000,end=x,other=1" })).toEqual({ ...STRENGTHS, weak: 2000, strong: 20000 })
  expect(strengthsOf({})).toEqual(STRENGTHS)
})
