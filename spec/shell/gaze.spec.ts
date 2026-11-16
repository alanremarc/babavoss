// The mark's eyes on their sphere, seen by a close camera: two of one size that rest to the right of the middle and so
// unequal, smaller and narrower towards the limb, cut by the horizon and gone behind it, and never the same move twice
// running.
import { expect, test } from "bun:test"
import { between, centreOf, eased, edgeOf, MIDDLE, MOVES, next, outline, REST, SEARCH, seen, settled, SPHERE, type Gaze, type Side } from "../../framework/shell/ui/gaze.ts"

/** An eye's box as drawn: its middle, width and height. */
const boxOf = (side: Side, gaze: Gaze) => {
  const { points } = edgeOf(side, gaze)
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])

  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
const straight = (side: Side): Gaze => ({ yaw: -SPHERE.turned - side * SPHERE.apart, pitch: 0, size: 1 })

test("the sphere's outline is its horizon: a point there is drawn at the sphere's radius, and the middle at the middle", () => {
  const z = 1 / SPHERE.camera
  const [x, y] = seen([Math.sqrt(1 - z * z), 0, z])

  expect(x - MIDDLE).toBeCloseTo(SPHERE.radius, 6)
  expect(y).toBeCloseTo(MIDDLE, 6)
  expect(seen([0, 0, 1])).toEqual([MIDDLE, MIDDLE])
})

test("an eye dead ahead is a circle at the middle, 18 of the box's 100 from centre to edge", () => {
  for (const side of [-1, 1] as const) {
    const eye = boxOf(side, straight(side))

    expect(eye.x).toBeCloseTo(MIDDLE, 4)
    expect(eye.w).toBeCloseTo(eye.h, 1)
    expect(eye.w / 2).toBeGreaterThan(17.5)
    expect(eye.w / 2).toBeLessThan(18.5)
  }
})

test("at rest the head is turned to the right: the left eye is near the middle and nearly round, the right one beside it, smaller and narrower", () => {
  const [l, r] = [boxOf(-1, REST), boxOf(1, REST)]

  expect(Math.abs(l.x - MIDDLE)).toBeLessThan(8)
  expect(l.w).toBeGreaterThan(l.h * 0.97)
  expect(r.x - r.w / 2).toBeGreaterThan(l.x + l.w / 2)
  expect(r.h).toBeLessThan(l.h)
  expect(r.w).toBeLessThan(r.h)
  expect(l.y).toBeCloseTo(MIDDLE, 6)
  expect(edgeOf(1, REST).cut).toBe(false)
})

test("the eyes swap as the head looks the other way: what the camera sees is the same from either side", () => {
  const away = { yaw: -2 * SPHERE.turned, pitch: 0, size: 1 }

  expect(boxOf(1, away).h).toBeCloseTo(boxOf(-1, REST).h, 6)
  expect(boxOf(-1, away).w).toBeCloseTo(boxOf(1, REST).w, 6)
  expect(boxOf(1, away).x - MIDDLE).toBeCloseTo(MIDDLE - boxOf(-1, REST).x, 6)
})

test("an eye that turns away gets smaller and, faster, narrower; over the horizon it is cut by the sphere's outline, and behind it is gone", () => {
  const horizon = Math.acos(1 / SPHERE.camera)
  const at = (angle: number): Gaze => ({ yaw: straight(1).yaw + angle, pitch: 0, size: 1 })
  const [near, far] = [boxOf(1, at(0.3)), boxOf(1, at(0.9))]

  expect(far.h).toBeLessThan(near.h)
  expect(far.w / far.h).toBeLessThan(near.w / near.h)
  expect(edgeOf(1, at(horizon)).cut).toBe(true)
  expect(outline(1, at(horizon))).toContain(`A${SPHERE.radius} ${SPHERE.radius}`)
  for (const [x, y] of edgeOf(1, at(horizon)).points) expect(Math.hypot(x - MIDDLE, y - MIDDLE)).toBeLessThanOrEqual(SPHERE.radius + 1e-6)
  expect(edgeOf(1, at(horizon + SPHERE.eye + 0.01)).points).toEqual([])
  expect(outline(1, { yaw: Math.PI, pitch: 0, size: 1 })).toBe("")
})

test("an eye that turns down moves down, and focusing changes its size alone", () => {
  const down = boxOf(-1, { yaw: 0, pitch: 0.43, size: 1 })

  expect(down.y).toBeGreaterThan(MIDDLE)
  expect(down.h).toBeLessThan(boxOf(-1, REST).h)

  const focus = MOVES.find((m) => m.name === "focus")!.through[0]!

  expect(boxOf(-1, { ...REST, size: focus.size }).h).toBeLessThan(boxOf(-1, REST).h)
  expect(centreOf(-1, { ...REST, size: focus.size })).toEqual(centreOf(-1, REST))
})

test("every move but the spin keeps both eyes whole and in sight", () => {
  for (const move of MOVES.filter((m) => m.name !== "spin"))
    for (const gaze of move.through)
      for (const side of [-1, 1] as const) {
        const { points, cut } = edgeOf(side, gaze)

        expect(points.length).toBeGreaterThan(0)
        expect(cut).toBe(false)
      }
})

test("a spin takes the head once round to where it rests, and is then said as rest, so the next turn takes the short way", () => {
  const spin = MOVES.find((m) => m.name === "spin")!.through.at(-1)!

  for (const side of [-1, 1] as const) {
    expect(boxOf(side, spin).x).toBeCloseTo(boxOf(side, REST).x, 6)
    expect(boxOf(side, spin).h).toBeCloseTo(boxOf(side, REST).h, 6)
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
  for (const { to } of SEARCH) for (const side of [-1, 1] as const) expect(edgeOf(side, to).points.length).toBeGreaterThan(0)
})
