// The mark's eyes as two patches on an invisible sphere, the circle home's tab lights on hover, seen through a lens that
// stays over the sphere's middle. The eyes are of one size; where the head looks turns the sphere, and each eye is drawn
// where its patch lands: narrower towards the sphere's edge, as a patch on a ball is, and smaller the further from the
// middle, as the lens has it. The head rests turned a little to the right, so at rest the eyes sit right of the middle:
// the left one near it, whole and round, the right one smaller. Pure: the poses a thinking face goes through, the easing
// between them, and the ellipse an eye is at a gaze.

/** Where the head looks, in radians from where it rests, right and down positive; and how wide the eyes are, 1 at rest. */
export type Gaze = { yaw: number; pitch: number; size: number }
/** An eye on the sphere, in the mark's 100 by 100 box: its centre's x with the head straight, the centre's y being the sphere's, and its radius at the middle. */
export type Eye = { x: number; r: number }
/** An eye as drawn: an ellipse whose `rx` lies along the line from the sphere's centre, turned by `turn` degrees. */
export type Drawn = { cx: number; cy: number; rx: number; ry: number; turn: number }

/** The sphere: centred in the mark's box, as wide as home's tab, which is 28px round a mark of 20px. */
export const SPHERE = { x: 50, y: 50, radius: 70 }
/** How far either side of the head's front an eye is, in radians. */
const APART = 0.28
/** How far to the right the head is turned at rest, in radians. */
export const TURNED = 0.25
/**
 * How fast the lens makes an eye smaller as it leaves the front: its size is how near the front it is, to this power. One
 * smooth curve from whole at the middle to nothing at the edge, so an eye that turns away shrinks all the way as it
 * narrows, and never stops at a least size while it goes on narrowing.
 */
const LENS = 2.4
export const EYES: Eye[] = [-1, 1].map((side) => ({ x: SPHERE.x + SPHERE.radius * Math.sin(side * APART), r: 18 }))
export const REST: Gaze = { yaw: 0, pitch: 0, size: 1 }

/** The eye at `gaze`: whole and round at the sphere's middle, smaller and narrower along the radius towards its edge, and nothing behind it. */
export function drawn(eye: Eye, gaze: Gaze): Drawn {
  const sx = (eye.x - SPHERE.x) / SPHERE.radius
  const front = Math.sqrt(1 - sx * sx)
  const yaw = gaze.yaw + TURNED
  // Pitch about the horizontal axis, then yaw about the vertical one; y grows downwards, as on a screen.
  const y = front * Math.sin(gaze.pitch)
  const depth = front * Math.cos(gaze.pitch)
  const x = sx * Math.cos(yaw) + depth * Math.sin(yaw)
  // How near the front the eye is: 1 at the middle, 0 at the edge and behind, where it is not seen.
  const z = Math.max(0, -sx * Math.sin(yaw) + depth * Math.cos(yaw))
  const r = eye.r * gaze.size * z ** LENS

  return {
    cx: SPHERE.x + x * SPHERE.radius,
    cy: SPHERE.y + y * SPHERE.radius,
    rx: r * z,
    ry: z > 0 ? r : 0,
    turn: Math.hypot(x, y) < 1e-6 ? 0 : (Math.atan2(y, x) * 180) / Math.PI,
  }
}

export const eased = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export const between = (a: Gaze, b: Gaze, t: number): Gaze => ({
  yaw: a.yaw + (b.yaw - a.yaw) * t,
  pitch: a.pitch + (b.pitch - a.pitch) * t,
  size: a.size + (b.size - a.size) * t,
})

const ROUND = 2 * Math.PI

/** A gaze with its yaw brought within half a round of straight: the same look, said so the next turn takes the short way. */
export const settled = (gaze: Gaze): Gaze => {
  const yaw = gaze.yaw - ROUND * Math.round(gaze.yaw / ROUND)

  return yaw === gaze.yaw ? gaze : { ...gaze, yaw }
}

/** One move of a thinking face: the gazes it passes through, how long each turn takes and how long it rests at its end, in ms. */
export type Move = { name: string; through: Gaze[]; turn: [number, number]; rest: [number, number] }

export const MOVES: Move[] = [
  { name: "straight", through: [REST], turn: [520, 760], rest: [700, 1600] },
  { name: "down", through: [{ yaw: 0.04, pitch: 0.36, size: 1 }], turn: [560, 820], rest: [900, 2000] },
  { name: "left", through: [{ yaw: -0.4, pitch: 0.02, size: 1 }], turn: [520, 780], rest: [600, 1500] },
  { name: "right", through: [{ yaw: 0.4, pitch: 0.02, size: 1 }], turn: [520, 780], rest: [600, 1500] },
  { name: "focus", through: [{ yaw: 0, pitch: 0.05, size: 0.78 }], turn: [420, 620], rest: [900, 1900] },
  { name: "wide", through: [{ yaw: 0, pitch: -0.08, size: 1.1 }], turn: [380, 560], rest: [500, 1100] },
  {
    name: "sweep",
    through: [
      { yaw: -0.36, pitch: 0.3, size: 1 },
      { yaw: 0.36, pitch: -0.26, size: 1 },
    ],
    turn: [760, 1100],
    rest: [500, 1200],
  },
  // The head spins once round: the eyes go off to the right, behind, and come back from the left to where they rest.
  { name: "spin", through: [{ yaw: ROUND, pitch: 0, size: 1 }], turn: [1100, 1500], rest: [700, 1500] },
]

/** The next move, never the one just made; `random` gives numbers from 0 up to 1. */
export function next(last: string | undefined, random: () => number = Math.random): Move {
  const others = MOVES.filter((m) => m.name !== last)

  return others[Math.floor(random() * others.length)]!
}

export const within = ([from, to]: [number, number], random: () => number = Math.random) => from + (to - from) * random()

/**
 * The gazes of a page that lost its runtime, gone through again and again: the face looks slowly from one side to the
 * other, as for something it cannot find. Each with how long the turn to it takes and how long it is held, in ms.
 */
export const SEARCH: { to: Gaze; turn: number; hold: number }[] = [
  { to: { yaw: -0.42, pitch: 0.02, size: 0.92 }, turn: 1200, hold: 350 },
  { to: { yaw: 0.42, pitch: 0.02, size: 0.92 }, turn: 1200, hold: 350 },
]
