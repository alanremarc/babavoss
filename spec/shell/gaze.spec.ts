// The mark's eyes on their sphere: at rest the brand's circles, squashed towards the edge as they turn, and never the same move twice running.
import { expect, test } from "bun:test"
import { between, drawn, eased, EYES, MOVES, next, orbiting, REST, SPHERE } from "../../framework/shell/ui/gaze.ts"

test("at rest each eye is the brand's circle, where the brand has it", () => {
  for (const eye of EYES) {
    const d = drawn(eye, REST)

    expect(d.cx).toBeCloseTo(eye.x, 6)
    expect(d.cy).toBeCloseTo(SPHERE.y, 6)
    expect(d.rx).toBeCloseTo(eye.r, 6)
    expect(d.ry).toBe(eye.r)
  }
})

test("an eye that turns towards the sphere's edge moves there and narrows along the radius, as a patch on a ball does", () => {
  const [left, right] = EYES as [(typeof EYES)[0], (typeof EYES)[0]]
  const looking = { yaw: 0.4, pitch: 0, size: 1 }

  expect(drawn(right, looking).cx).toBeGreaterThan(right.x)
  expect(drawn(right, looking).rx).toBeLessThan(right.r)
  expect(drawn(right, looking).ry).toBe(right.r)
  // The eye on the far side comes towards the front, and rounds out.
  expect(drawn(left, looking).rx).toBeGreaterThan(drawn(right, looking).rx / right.r * left.r)

  const down = drawn(left, { yaw: 0, pitch: 0.36, size: 1 })

  expect(down.cy).toBeGreaterThan(SPHERE.y)
  expect(down.rx).toBeLessThan(left.r)
  expect(Math.abs(down.turn)).toBeGreaterThan(90)
})

test("every move keeps both eyes inside the sphere, and focusing changes their size alone", () => {
  for (const move of MOVES)
    for (const gaze of move.through)
      for (const eye of EYES) {
        const d = drawn(eye, gaze)

        expect(Math.hypot(d.cx - SPHERE.x, d.cy - SPHERE.y) + Math.max(d.rx, d.ry)).toBeLessThan(SPHERE.radius)
      }

  const focus = MOVES.find((m) => m.name === "focus")!.through[0]!

  expect(drawn(EYES[0]!, { ...REST, size: focus.size }).ry).toBeCloseTo(EYES[0]!.r * focus.size, 6)
})

test("a turn eases in and out, and the next move is never the one just made", () => {
  expect(eased(0)).toBe(0)
  expect(eased(1)).toBe(1)
  expect(eased(0.5)).toBeCloseTo(0.5, 6)
  expect(eased(0.1)).toBeLessThan(0.1)
  expect(between(REST, { yaw: 1, pitch: 1, size: 2 }, 0.5)).toEqual({ yaw: 0.5, pitch: 0.5, size: 1.5, lid: 1 })
  for (const move of MOVES) for (let i = 0; i < 20; i++) expect(next(move.name, () => i / 20).name).not.toBe(move.name)
})

test("a page that lost its runtime sends the smaller eye round the larger, from rest and back to it", () => {
  const [large, small] = orbiting(0, 0)

  expect([large.cx, large.rx, small.cx, small.cy, small.rx]).toEqual([EYES[0]!.x, EYES[0]!.r, EYES[1]!.x, SPHERE.y, EYES[1]!.r])

  const [centre, right] = orbiting(1, 0)
  const [, below] = orbiting(1, Math.PI / 2)

  expect(centre.cx).toBe(SPHERE.x)
  expect(right.cy).toBeCloseTo(SPHERE.y, 6)
  expect(below.cx).toBeCloseTo(SPHERE.x, 6)
  expect(below.cy - SPHERE.y).toBeCloseTo(right.cx - SPHERE.x, 6)
  // The two never touch, and the smaller stays inside the sphere.
  expect(right.cx - SPHERE.x).toBeGreaterThan(EYES[0]!.r + EYES[1]!.r)
  expect(right.cx - SPHERE.x + EYES[1]!.r).toBeLessThan(SPHERE.radius)
})

test("under a lens an eye is a patch of the sphere as seen: whole and round at the middle, smaller and narrower towards the edge, never less than a part", () => {
  const eye = { x: 50, r: 18, lens: 2 }

  expect(drawn(eye, REST)).toMatchObject({ cx: 50, rx: 18, ry: 18 })

  const turned = drawn(eye, { yaw: 0.5, pitch: 0, size: 1 })

  expect(turned.ry).toBeCloseTo(18 * (1 + 2 * (Math.cos(0.5) - 1)), 6)
  expect(turned.rx).toBeCloseTo(turned.ry * Math.cos(0.5), 6)
  expect(drawn(eye, { yaw: 1.4, pitch: 0, size: 1 }).ry).toBeCloseTo(18 * 0.3, 6)
  // A face that rests turned draws its eyes unequal at rest, and `dx` moves the drawing.
  expect(drawn({ ...eye, yaw: 0.5, dx: -10 }, REST)).toMatchObject({ cx: turned.cx - 10, ry: turned.ry })
  // The brand's eyes have no lens: they keep their size wherever they are.
  expect(drawn({ x: 69, r: 15 }, { yaw: 0.4, pitch: 0, size: 1 }).ry).toBeCloseTo(15, 6)
})

test("lids close an eye from above and below, and open between gazes as the rest of a gaze does", () => {
  expect(drawn(EYES[0]!, { ...REST, lid: 0.1 }).ry).toBeCloseTo(EYES[0]!.r * 0.1, 6)
  expect(between(REST, { ...REST, lid: 0.2 }, 0.5).lid).toBeCloseTo(0.6, 6)
})
