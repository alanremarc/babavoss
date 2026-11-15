// The mark's eyes as two patches on an invisible sphere, the circle home's tab lights on hover: where the face looks
// turns the sphere, and each eye is drawn where its patch lands, squashed towards the sphere's edge as a patch on a ball is.
// Pure: the poses a thinking face goes through, the easing between them, and the ellipse an eye is at a gaze.

/** Where the face looks, in radians, right and down positive; how wide the eyes are, 1 at rest; and how open, 1 unless said, 0 shut. */
export type Gaze = { yaw: number; pitch: number; size: number; open?: number }
/** An eye at rest, in the mark's 100 by 100 box: its centre's x, the centre's y being the sphere's, and its radius. */
export type Eye = { x: number; r: number }
/** An eye as drawn: an ellipse whose `rx` lies along the line from the sphere's centre, turned by `turn` degrees. */
export type Drawn = { cx: number; cy: number; rx: number; ry: number; turn: number }

/** The sphere: centred in the mark's box, as wide as home's tab, which is 28px round a mark of 20px. */
export const SPHERE = { x: 50, y: 50, radius: 70 }
export const EYES: Eye[] = [
  { x: 33.772, r: 18 },
  { x: 71.5, r: 12.728 },
]
export const REST: Gaze = { yaw: 0, pitch: 0, size: 1 }
/** Asleep: the eyes nearly shut, two level lines where they rest. */
export const SLEEP: Gaze = { yaw: 0, pitch: 0, size: 1, open: 0.14 }

/** The eye at `gaze`: at rest exactly the brand's circle, and narrower along the radius the further it turns from the front. */
export function drawn(eye: Eye, gaze: Gaze): Drawn {
  const sx = (eye.x - SPHERE.x) / SPHERE.radius
  const front = Math.sqrt(1 - sx * sx)
  // Pitch about the horizontal axis, then yaw about the vertical one; y grows downwards, as on a screen.
  const y = front * Math.sin(gaze.pitch)
  const depth = front * Math.cos(gaze.pitch)
  const x = sx * Math.cos(gaze.yaw) + depth * Math.sin(gaze.yaw)
  const z = Math.max(0, -sx * Math.sin(gaze.yaw) + depth * Math.cos(gaze.yaw))
  const r = eye.r * gaze.size

  return {
    cx: SPHERE.x + x * SPHERE.radius,
    cy: SPHERE.y + y * SPHERE.radius,
    rx: (r * z) / front,
    // A lid closes an eye from above and below: across the radius, which at the front is up and down.
    ry: r * (gaze.open ?? 1),
    turn: Math.hypot(x, y) < 1e-6 ? 0 : (Math.atan2(y, x) * 180) / Math.PI,
  }
}

export const eased = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export const between = (a: Gaze, b: Gaze, t: number): Gaze => ({
  yaw: a.yaw + (b.yaw - a.yaw) * t,
  pitch: a.pitch + (b.pitch - a.pitch) * t,
  size: a.size + (b.size - a.size) * t,
  open: (a.open ?? 1) + ((b.open ?? 1) - (a.open ?? 1)) * t,
})

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
]

/** The next move, never the one just made; `random` gives numbers from 0 up to 1. */
export function next(last: string | undefined, random: () => number = Math.random): Move {
  const others = MOVES.filter((m) => m.name !== last)

  return others[Math.floor(random() * others.length)]!
}

export const within = ([from, to]: [number, number], random: () => number = Math.random) => from + (to - from) * random()
