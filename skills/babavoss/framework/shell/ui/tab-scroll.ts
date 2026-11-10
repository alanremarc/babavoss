// Accelerate once, then cruise through repeated copies at 25px/s without slowing at the seam.
export function tabScrollOffset(elapsed: number, width: number): number {
  const time = Math.max(0, elapsed)
  const travel = time < 200 ? time ** 2 / 400 : time - 100

  return ((travel * 25) / 1000) % width
}
