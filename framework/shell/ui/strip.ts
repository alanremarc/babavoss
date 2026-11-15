// The strip's order: newest tab first, beside home; a tab's number is the order it was opened in.
/** The tabs newest first, by their number, which grows with each one opened. */
export function newestFirst<T extends { n: number }>(tabs: readonly T[]): T[] {
  return [...tabs].sort((a, b) => b.n - a.n)
}

/** Where the person lands when the tab at `at` closes: the next older tab in the strip, else the next newer, else nowhere. */
export function successor<T extends { at: string }>(strip: readonly T[], at: string): string | undefined {
  const i = strip.findIndex((tab) => tab.at === at)

  if (i < 0) return undefined

  return (strip[i + 1] ?? strip[i - 1])?.at
}
