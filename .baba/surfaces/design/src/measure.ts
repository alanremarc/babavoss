// What a telling costs and how it moved: its lines, characters and estimated tokens; its difference from the pinned one;
// and two texts as a line diff. Tokens are estimated as characters / 4, rounded up: no tokenizer is asked.
// A text is compared with the pin as it reads with what differs on every play masked: the page's port and the times.

export type Size = { lines: number; chars: number; tokens: number }
/** How a telling differs from the pinned one: its size's change, and whether its text differs. `new`: none was pinned in its place. */
export type Delta = { lines: number; chars: number; tokens: number; differs: boolean; new?: true }

export const tokens = (chars: number) => Math.ceil(chars / 4)

export function size(text: string): Size {
  return { lines: text ? text.split("\n").length : 0, chars: text.length, tokens: tokens(text.length) }
}

export const sum = (sizes: Size[]): Size => sizes.reduce((a, b) => ({ lines: a.lines + b.lines, chars: a.chars + b.chars, tokens: a.tokens + b.tokens }), { lines: 0, chars: 0, tokens: 0 })

/** A text with what differs on every play masked, so the same telling reads the same. */
export const masked = (text: string) =>
  text.replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:PORT").replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g, "TIME")

export function delta(now: string, pinned: string | undefined): Delta {
  const a = size(pinned ?? "")
  const b = size(now)

  return {
    lines: b.lines - a.lines,
    chars: b.chars - a.chars,
    tokens: b.tokens - a.tokens,
    differs: pinned === undefined ? now !== "" : masked(now) !== masked(pinned),
    ...(pinned === undefined && { new: true as const }),
  }
}

/** Several deltas as one. */
export const together = (deltas: Delta[]): Delta => ({
  lines: deltas.reduce((s, d) => s + d.lines, 0),
  chars: deltas.reduce((s, d) => s + d.chars, 0),
  tokens: deltas.reduce((s, d) => s + d.tokens, 0),
  differs: deltas.some((d) => d.differs),
})

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

/** A delta in a few words: "same", "+12 tokens, +1 lines", or "text differs, same size". */
export function said(d: Delta, texts = 0): string {
  if (!d.differs && !d.tokens && !d.lines) return "same"

  const moved = [d.tokens && `${signed(d.tokens)} tokens`, d.lines && `${signed(d.lines)} lines`].filter(Boolean).join(", ")
  const which = texts > 1 ? `${texts} texts differ` : "text differs"

  return d.differs ? (moved ? `${moved}; ${which}` : `${which}, same size`) : moved
}

/** Two texts as a line diff, by their longest common lines: each line kept, gone (`-`) or come (`+`). */
export function lineDiff(before: string, after: string): { op: " " | "-" | "+"; line: string }[] {
  const a = before ? before.split("\n") : []
  const b = after ? after.split("\n") : []
  const ma = a.map(masked)
  const mb = b.map(masked)
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))

  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = ma[i] === mb[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)

  const out: { op: " " | "-" | "+"; line: string }[] = []
  let i = 0
  let j = 0

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ma[i] === mb[j]) {
      out.push({ op: " ", line: b[j]! })
      i++
      j++
    } else if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) out.push({ op: "+", line: b[j++]! })
    else out.push({ op: "-", line: a[i++]! })
  }

  return out
}
