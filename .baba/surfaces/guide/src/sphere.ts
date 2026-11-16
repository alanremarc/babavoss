// The mark's eyes as they would be seen exactly: two round patches of one size on a sphere, looked at by a camera close
// to it. Nothing is added to the geometry: an eye is a cap of the sphere, its edge a circle in space, and what is drawn is
// that circle through a pinhole. Near the camera a patch is large; towards the limb it is further, so smaller, and seen
// edge on, so narrower; past the horizon, which a close camera has well before the sphere's middle, it is hidden, and an
// eye that straddles the horizon is cut by the sphere's own outline. Tried in the guide beside the shell's mark, gaze.ts,
// which draws an ellipse by a rule of thumb. Pure.
import type { Gaze } from "babavoss/shell/ui/gaze.ts"

/**
 * The sphere and how it is seen. `camera`: how far the camera is from the sphere's centre, in its radii, above 1; the nearer,
 * the stronger the perspective and the less of the sphere is seen. `radius`: the sphere's outline as drawn, in the mark's
 * 100 by 100 box. `eye`: an eye's size as an angle from its centre to its edge, in radians. `apart`: how far either side
 * of the head's front an eye is. `turned`: how far to the right the head rests. `reach`: how far the moves turn it, 1 as
 * they are written for the shell's mark; whoever plays the moves scales them by it, a whole turn round excepted.
 */
export type Sphere = { camera: number; radius: number; eye: number; apart: number; turned: number; reach: number }

/**
 * The sphere that rests closest to the shell's mark, found by search: the left eye near the middle and as large, the right
 * one where it is now. An exact sphere cannot rest quite as the mark does: its right eye is narrower and taller.
 */
export const SPHERE: Sphere = { camera: 1.2, radius: 48, eye: 0.112, apart: 0.152, turned: 0.137, reach: 0.5 }

type V = [number, number, number]

const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V): V => {
  const l = Math.hypot(...a)

  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Where an eye's centre is on the unit sphere at a gaze: x right, y down, z towards the camera. Pitch, then yaw. */
export function centreOf(side: -1 | 1, gaze: Gaze, s: Sphere): V {
  const sx = Math.sin(side * s.apart)
  const front = Math.cos(side * s.apart)
  const yaw = gaze.yaw + s.turned
  const { pitch } = gaze
  const depth = front * Math.cos(pitch)

  return [sx * Math.cos(yaw) + depth * Math.sin(yaw), front * Math.sin(pitch), -sx * Math.sin(yaw) + depth * Math.cos(yaw)]
}

/** How many points of an eye's edge are drawn. */
const POINTS = 48

/**
 * An eye as an SVG path in the mark's box, empty where none of it is seen. Its edge is the circle of points an angle
 * `eye` from its centre; each is seen at x / (camera - z), scaled so the sphere's outline has `radius`. The part of the
 * edge in front of the horizon is drawn as it is, and where the eye goes over the horizon it is closed by the sphere's
 * outline between the two points where its edge crosses.
 */
export function outline(side: -1 | 1, gaze: Gaze, s: Sphere): string {
  const n = centreOf(side, gaze, s)
  const size = s.eye * gaze.size
  // Two directions across the eye, at right angles to where it faces.
  const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const v = cross(n, u)
  const c = Math.cos(size)
  const r = Math.sin(size)
  // A camera at `camera` sees the sphere as far as the points whose z is 1 / camera: its horizon.
  const horizon = 1 / s.camera
  const focal = s.radius * Math.sqrt(s.camera * s.camera - 1)
  const at = (t: number): V => [
    n[0] * c + r * (u[0] * Math.cos(t) + v[0] * Math.sin(t)),
    n[1] * c + r * (u[1] * Math.cos(t) + v[1] * Math.sin(t)),
    n[2] * c + r * (u[2] * Math.cos(t) + v[2] * Math.sin(t)),
  ]
  const seen = (p: V) => `${(50 + (focal * p[0]) / (s.camera - p[2])).toFixed(2)} ${(50 + (focal * p[1]) / (s.camera - p[2])).toFixed(2)}`
  // z along the edge is n.z c + r (u.z cos t + v.z sin t): in front of the horizon within `half` of the angle `mid`.
  const swing = r * Math.hypot(u[2], v[2])
  const over = horizon - n[2] * c

  if (over >= swing) return ""

  const whole = over <= -swing
  const mid = Math.atan2(v[2], u[2])
  const half = whole ? Math.PI : Math.acos(over / swing)
  const points = Array.from({ length: POINTS + 1 }, (_, i) => seen(at(mid - half + (2 * half * i) / POINTS)))

  if (whole) return `M${points.slice(0, -1).join("L")}Z`

  // Back along the sphere's outline, the short way: the horizon between the two crossings.
  const [fx, fy] = points[0]!.split(" ").map(Number) as [number, number]
  const [lx, ly] = points.at(-1)!.split(" ").map(Number) as [number, number]
  const turn = Math.atan2(fy - 50, fx - 50) - Math.atan2(ly - 50, lx - 50)
  const short = Math.atan2(Math.sin(turn), Math.cos(turn))

  return `M${points.join("L")}A${s.radius} ${s.radius} 0 0 ${short > 0 ? 1 : 0} ${points[0]}Z`
}

/** How much of the sphere the camera sees, as the angle from its middle to its horizon, in degrees. */
export const horizonOf = (s: Sphere): number => (Math.acos(1 / s.camera) * 180) / Math.PI
