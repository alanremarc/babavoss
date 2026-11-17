// The mark's eyes as they are seen exactly: two round patches of one size on a sphere, looked at by a camera close to it.
// Nothing is added to the geometry: an eye is a cap of the sphere, its edge a circle in space, and what is drawn is that
// circle through a pinhole. Near the camera a patch is large; towards the limb it is further, so smaller, and seen edge
// on, so narrower; past the horizon, which a close camera has before the sphere's middle, it is hidden, and an eye that
// straddles the horizon is cut by the sphere's own outline. The head rests turned a little to the right, so at rest the
// left eye is near the middle, whole and round, and the right one smaller and narrower. Pure: the sphere, the poses a
// thinking face goes through, the easing between them, and the outline an eye has at a gaze.

/** Where the head looks, in radians from where it rests, right and down positive; and how wide the eyes are, 1 at rest. */
export type Gaze = { yaw: number; pitch: number; size: number }
/**
 * The sphere and how it is seen. `camera`: how far the camera is from the sphere's centre, in its radii, above 1; the
 * nearer, the stronger the perspective and the less of the sphere is seen. `radius`: the sphere's outline as drawn, in the
 * mark's 100 by 100 box; it scales the whole and changes no shape. `eye`: an eye's size, the angle from its centre to its
 * edge, in radians. `apart`: how far either side of the head's front an eye is. `turned`: how far to the right the head rests.
 */
export type Sphere = { camera: number; radius: number; eye: number; apart: number; turned: number }

/** The mark's sphere: a camera three and a half radii away, an eye at the middle 18 of the box's 100 from centre to edge. */
export const SPHERE: Sphere = { camera: 3.5, radius: 56.5, eye: 0.24, apart: 0.3, turned: 0.215 }
/** The middle of the mark's box, where the sphere's is. */
export const MIDDLE = 50
/** The two eyes: left and right of the head's front. */
export const SIDES = [-1, 1] as const
export type Side = (typeof SIDES)[number]
export const REST: Gaze = { yaw: 0, pitch: 0, size: 1 }

type V = [number, number, number]

const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V): V => {
  const l = Math.hypot(...a)

  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Where an eye's centre is on the unit sphere at a gaze: x right, y down, as on a screen, z towards the camera. Pitch, then yaw. */
export function centreOf(side: Side, gaze: Gaze, s: Sphere = SPHERE): V {
  const sx = Math.sin(side * s.apart)
  const front = Math.cos(side * s.apart)
  const yaw = gaze.yaw + s.turned
  const depth = front * Math.cos(gaze.pitch)

  return [sx * Math.cos(yaw) + depth * Math.sin(yaw), front * Math.sin(gaze.pitch), -sx * Math.sin(yaw) + depth * Math.cos(yaw)]
}

/** How many points of an eye's edge are drawn. */
const POINTS = 48

/** A point of the unit sphere as the camera sees it, in the mark's box. */
export function seen(p: V, s: Sphere = SPHERE): [number, number] {
  // Scaled so the sphere's horizon, the points whose z is 1 / camera, is drawn at `radius`.
  const scale = (s.radius * Math.sqrt(s.camera * s.camera - 1)) / (s.camera - p[2])

  return [MIDDLE + scale * p[0], MIDDLE + scale * p[1]]
}

/**
 * An eye's edge as the camera sees it: its points in the mark's box, in order, none where no part of the eye is seen; and
 * whether the eye is `cut`, going over the horizon, where its edge ends at the sphere's outline and is closed along it.
 */
export function edgeOf(side: Side, gaze: Gaze, s: Sphere = SPHERE): { points: [number, number][]; cut: boolean } {
  const n = centreOf(side, gaze, s)
  const size = s.eye * gaze.size
  // Two directions across the eye, at right angles to where it faces.
  const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const v = cross(n, u)
  const c = Math.cos(size)
  const r = Math.sin(size)
  const at = (t: number): V => [
    n[0] * c + r * (u[0] * Math.cos(t) + v[0] * Math.sin(t)),
    n[1] * c + r * (u[1] * Math.cos(t) + v[1] * Math.sin(t)),
    n[2] * c + r * (u[2] * Math.cos(t) + v[2] * Math.sin(t)),
  ]
  // Along the edge z is n.z c + r (u.z cos t + v.z sin t): in front of the horizon within `half` of the angle `mid`.
  const swing = r * Math.hypot(u[2], v[2])
  const over = 1 / s.camera - n[2] * c

  if (over >= swing) return { points: [], cut: false }

  const cut = over > -swing
  const mid = Math.atan2(v[2], u[2])
  const half = cut ? Math.acos(over / swing) : Math.PI
  const count = cut ? POINTS + 1 : POINTS

  return { points: Array.from({ length: count }, (_, i) => seen(at(mid - half + (2 * half * i) / POINTS), s)), cut }
}

/** An eye as an SVG path in the mark's box, empty where none of it is seen: its edge, closed along the sphere's outline where it is cut. */
export function outline(side: Side, gaze: Gaze, s: Sphere = SPHERE): string {
  const { points, cut } = edgeOf(side, gaze, s)

  if (!points.length) return ""

  const said = points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`)

  if (!cut) return `M${said.join("L")}Z`

  // Back along the sphere's outline, the short way: the horizon between the two crossings.
  const [first, last] = [points[0]!, points.at(-1)!]
  const turn = Math.atan2(first[1] - MIDDLE, first[0] - MIDDLE) - Math.atan2(last[1] - MIDDLE, last[0] - MIDDLE)

  return `M${said.join("L")}A${s.radius} ${s.radius} 0 0 ${Math.sin(turn) > 0 ? 1 : 0} ${said[0]}Z`
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
  { name: "down", through: [{ yaw: 0.05, pitch: 0.43, size: 1 }], turn: [560, 820], rest: [900, 2000] },
  { name: "left", through: [{ yaw: -0.48, pitch: 0.02, size: 1 }], turn: [520, 780], rest: [600, 1500] },
  { name: "right", through: [{ yaw: 0.48, pitch: 0.02, size: 1 }], turn: [520, 780], rest: [600, 1500] },
  { name: "focus", through: [{ yaw: 0, pitch: 0.06, size: 0.78 }], turn: [420, 620], rest: [900, 1900] },
  { name: "wide", through: [{ yaw: 0, pitch: -0.1, size: 1.1 }], turn: [380, 560], rest: [500, 1100] },
  {
    name: "sweep",
    through: [
      { yaw: -0.43, pitch: 0.36, size: 1 },
      { yaw: 0.43, pitch: -0.31, size: 1 },
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
  { to: { yaw: -0.5, pitch: 0.02, size: 0.92 }, turn: 1200, hold: 350 },
  { to: { yaw: 0.5, pitch: 0.02, size: 0.92 }, turn: 1200, hold: 350 },
]
