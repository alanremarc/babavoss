// The mark's eyes as two patches on an invisible sphere, the circle home's tab lights on hover: where the face looks
// turns the sphere, and each eye is drawn where its patch lands, squashed towards the sphere's edge as a patch on a ball is.
// Pure: the poses a thinking face goes through, the easing between them, and the ellipse an eye is at a gaze.

/**
 * Where the face looks, in radians, right and down positive; how wide the eyes are, 1 at rest; and, where it is said,
 * how open their lids are, 1 open and near 0 shut.
 */
export type Gaze = { yaw: number; pitch: number; size: number; lid?: number }
/**
 * An eye at rest, in the mark's 100 by 100 box: its centre's x, the centre's y being the sphere's, and its radius.
 *
 * A variant of the mark may put a lens over the sphere's middle, `lens`: the eye is then a patch of the sphere as it is
 * seen, narrower towards the edge, and of its radius `r` only at the very middle, smaller by `lens` times how far from
 * the front it is. `yaw` is how far the face is turned at rest: its eyes then rest to one side of the lens, which stays
 * at the mark's middle, so eyes of one size rest unequal.
 */
export type Eye = { x: number; r: number; lens?: number; yaw?: number }
/** An eye as drawn: an ellipse whose `rx` lies along the line from the sphere's centre, turned by `turn` degrees. */
export type Drawn = { cx: number; cy: number; rx: number; ry: number; turn: number }

/** The sphere: centred in the mark's box, as wide as home's tab, which is 28px round a mark of 20px. */
export const SPHERE = { x: 50, y: 50, radius: 70 }
export const EYES: Eye[] = [
  { x: 33.772, r: 18 },
  { x: 71.5, r: 12.728 },
]
export const REST: Gaze = { yaw: 0, pitch: 0, size: 1 }

/** The least a lens makes of an eye, however near the edge it is. */
const LENS_LEAST = 0.3

/**
 * The eye at `gaze`. The brand's: at rest exactly its circle, and narrower along the radius the further it turns from the
 * front. Under a lens: a patch of the sphere as seen, and smaller the further from the middle.
 */
export function drawn(eye: Eye, gaze: Gaze): Drawn {
  const sx = (eye.x - SPHERE.x) / SPHERE.radius
  const front = Math.sqrt(1 - sx * sx)
  const yaw = gaze.yaw + (eye.yaw ?? 0)
  // Pitch about the horizontal axis, then yaw about the vertical one; y grows downwards, as on a screen.
  const y = front * Math.sin(gaze.pitch)
  const depth = front * Math.cos(gaze.pitch)
  const x = sx * Math.cos(yaw) + depth * Math.sin(yaw)
  const z = Math.max(0, -sx * Math.sin(yaw) + depth * Math.cos(yaw))
  const lens = eye.lens === undefined ? undefined : Math.max(LENS_LEAST, 1 + eye.lens * (z - 1))
  const r = eye.r * gaze.size * (lens ?? 1)

  return {
    cx: SPHERE.x + x * SPHERE.radius,
    cy: SPHERE.y + y * SPHERE.radius,
    rx: lens === undefined ? (r * z) / front : r * z,
    ry: r * (gaze.lid ?? 1),
    turn: Math.hypot(x, y) < 1e-6 ? 0 : (Math.atan2(y, x) * 180) / Math.PI,
  }
}

export const eased = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export const between = (a: Gaze, b: Gaze, t: number): Gaze => ({
  yaw: a.yaw + (b.yaw - a.yaw) * t,
  pitch: a.pitch + (b.pitch - a.pitch) * t,
  size: a.size + (b.size - a.size) * t,
  lid: (a.lid ?? 1) + ((b.lid ?? 1) - (a.lid ?? 1)) * t,
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

/** How long the smaller eye takes round the larger one, in ms, while the page has lost its runtime. */
export const ORBIT_MS = 1800
/** How far from the larger eye's centre the smaller one goes round it. */
const ORBIT_RADIUS = 34

/**
 * The eyes of a page that lost its runtime: the larger one comes to the mark's centre and the smaller goes round it.
 * `into` is how far into that they are, 0 the eyes at rest and 1 the orbit, and `angle` where on its round the smaller
 * one is, in radians from the right, clockwise. At 0 and no angle both are exactly at rest. `pair` is the eyes, the
 * brand's unless a variant of the mark is tried.
 */
export function orbiting(into: number, angle: number, pair: Eye[] = EYES): [Drawn, Drawn] {
  const [large, small] = pair as [Eye, Eye]
  const cx = large.x + (SPHERE.x - large.x) * into
  const away = small.x - large.x + (ORBIT_RADIUS - (small.x - large.x)) * into

  return [
    { cx, cy: SPHERE.y, rx: large.r, ry: large.r, turn: 0 },
    { cx: cx + away * Math.cos(angle), cy: SPHERE.y + away * Math.sin(angle), rx: small.r, ry: small.r, turn: 0 },
  ]
}

/**
 * How a page that lost its runtime may say so, apart from the orbit: `doze`, the lids shut, opening a little now and
 * then; `search`, the face looking slowly from one side to the other; `pulse`, the eyes still, fading in turn.
 */
export type Lost = "orbit" | "doze" | "search" | "pulse"
export const LOSTS: readonly Lost[] = ["orbit", "doze", "search", "pulse"]

/** The gazes of a lost face, gone through again and again: each with how long the turn to it takes and how long it is held, in ms. */
export const LOST_LOOPS: Record<Exclude<Lost, "orbit" | "pulse">, { to: Gaze; turn: number; hold: number }[]> = {
  doze: [
    { to: { yaw: 0, pitch: 0.12, size: 1, lid: 0.1 }, turn: 520, hold: 2400 },
    { to: { yaw: 0, pitch: 0.06, size: 1, lid: 0.45 }, turn: 380, hold: 260 },
  ],
  search: [
    { to: { yaw: -0.42, pitch: 0.02, size: 0.92 }, turn: 1200, hold: 350 },
    { to: { yaw: 0.42, pitch: 0.02, size: 0.92 }, turn: 1200, hold: 350 },
  ],
}
