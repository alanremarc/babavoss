// The mark's eyes on their sphere, under a lens at its middle: two of one size that rest to the right of it and so unequal,
// narrower and smaller towards the edge, gone behind, and never the same move twice running.
import { expect, test } from "bun:test"
import { between, drawn, eased, EYES, MOVES, next, REST, SEARCH, settled, SPHERE, TURNED } from "../../framework/shell/ui/gaze.ts"

const [left, right] = EYES as [(typeof EYES)[0], (typeof EYES)[0]]

test("the eyes are of one size, the same distance either side of the head's front", () => {
  expect(left.r).toBe(right.r)
  expect(SPHERE.x - left.x).toBeCloseTo(right.x - SPHERE.x, 6)
})

test("at rest the head is turned to the right: the left eye is near the middle, nearly whole and round, and the right one smaller and narrower", () => {
  const [l, r] = [drawn(left, REST), drawn(right, REST)]

  expect(Math.abs(l.cx - SPHERE.x)).toBeLessThan(5)
  expect(l.ry).toBeGreaterThan(left.r * 0.99)
  expect(l.rx).toBeGreaterThan(l.ry * 0.99)
  expect(r.cx).toBeGreaterThan(l.cx + l.rx + r.rx)
  expect(r.ry).toBeLessThan(l.ry * 0.75)
  expect(r.rx).toBeLessThan(r.ry)
  expect(l.cy).toBe(SPHERE.y)
})

test("the lens stays at the middle: an eye brought there by a turn is whole, and the sizes swap as the head looks the other way", () => {
  // Turned back by its rest and by the eye's own angle, the right eye is dead ahead.
  const ahead = drawn(right, { yaw: -TURNED - Math.asin((right.x - SPHERE.x) / SPHERE.radius), pitch: 0, size: 1 })

  expect(ahead.cx).toBeCloseTo(SPHERE.x, 6)
  expect(ahead.rx).toBeCloseTo(right.r, 6)
  expect(ahead.ry).toBeCloseTo(right.r, 6)

  const away = { yaw: -2 * TURNED, pitch: 0, size: 1 }

  expect(drawn(right, away).ry).toBeCloseTo(drawn(left, REST).ry, 6)
  expect(drawn(left, away).ry).toBeCloseTo(drawn(right, REST).ry, 6)
})

test("an eye that turns down moves there and narrows along the radius, as a patch on a ball does", () => {
  const down = drawn(left, { yaw: 0, pitch: 0.36, size: 1 })

  expect(down.cy).toBeGreaterThan(SPHERE.y)
  expect(down.rx).toBeLessThan(down.ry)
  expect(Math.abs(down.turn)).toBeGreaterThan(45)
})

test("every move keeps both eyes inside the sphere, focusing changes their size alone, and an eye behind the head is not seen", () => {
  for (const move of MOVES)
    for (const gaze of move.through)
      for (const eye of EYES) {
        const d = drawn(eye, gaze)

        expect(Math.hypot(d.cx - SPHERE.x, d.cy - SPHERE.y) + Math.max(d.rx, d.ry)).toBeLessThan(SPHERE.radius)
      }

  const focus = MOVES.find((m) => m.name === "focus")!.through[0]!

  expect(drawn(left, { ...REST, size: focus.size }).ry).toBeCloseTo(drawn(left, REST).ry * focus.size, 6)
  expect(drawn(left, { yaw: Math.PI, pitch: 0, size: 1 })).toMatchObject({ rx: 0, ry: 0 })
})

test("a spin takes the head once round to where it rests, and is then said as rest, so the next turn takes the short way", () => {
  const spin = MOVES.find((m) => m.name === "spin")!.through.at(-1)!

  for (const eye of EYES) {
    expect(drawn(eye, spin).cx).toBeCloseTo(drawn(eye, REST).cx, 6)
    expect(drawn(eye, spin).ry).toBeCloseTo(drawn(eye, REST).ry, 6)
  }
  expect(settled(spin).yaw).toBeCloseTo(0, 6)
  expect(settled({ yaw: 3.5, pitch: 0, size: 1 }).yaw).toBeCloseTo(3.5 - 2 * Math.PI, 6)
  expect(settled(REST)).toBe(REST)
})

test("a turn eases in and out, and the next move is never the one just made", () => {
  expect(eased(0)).toBe(0)
  expect(eased(1)).toBe(1)
  expect(eased(0.5)).toBeCloseTo(0.5, 6)
  expect(eased(0.1)).toBeLessThan(0.1)
  expect(between(REST, { yaw: 1, pitch: 1, size: 2 }, 0.5)).toEqual({ yaw: 0.5, pitch: 0.5, size: 1.5 })
  for (const move of MOVES) for (let i = 0; i < 20; i++) expect(next(move.name, () => i / 20).name).not.toBe(move.name)
})

test("a page that lost its runtime looks from one side to the other, both eyes in sight", () => {
  expect(SEARCH.map((s) => Math.sign(s.to.yaw))).toEqual([-1, 1])
  for (const { to } of SEARCH) for (const eye of EYES) expect(drawn(eye, to).rx).toBeGreaterThan(0)
})
