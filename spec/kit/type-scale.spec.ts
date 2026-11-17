// The kit's text keeps to the type scale, its four sizes: no component or layout sets a font size of its own, as a Tailwind
// value or a style, nor takes one of Tailwind's sizes outside the scale; the shell's own page keeps to it too. For a surface
// the scale is advice.
import { describe, expect, it } from "bun:test"
import { Glob } from "bun"
import { join } from "node:path"

const kit = join(import.meta.dir, "../../framework/kit")
const shell = join(import.meta.dir, "../../framework/shell")
// A literal size in a class, `text-[11px]` or `text-(length:--x)`, or in a style, `fontSize: 11`; a colour, `text-[#fff]`, is no size.
const literal = /\btext-\[(?:length:)?[\d.]|\btext-\(length:|\bfontSize\s*:/
// One of Tailwind's own sizes, `text-xs` to `text-9xl`, which the scale replaces.
const tailwind = /\btext-(?:xs|sm|base|lg|[2-9]?xl)(?![\w-])/
const SCALE = "text-badge 9px, text-meta 11px, text-body 12px or text-large 13px"

/** Each line of the files `pattern` finds under `dir` that `size` matches, as file:line: the match. */
const uses = async (dir: string, pattern: string, size: RegExp) => {
  const found: string[] = []

  for await (const file of new Glob(pattern).scan(dir)) {
    const lines = (await Bun.file(join(dir, file)).text()).split("\n")

    lines.forEach((line, i) => size.test(line) && found.push(`${file}:${i + 1}: ${line.match(size)![0]}`))
  }

  return found
}

describe("the kit's type scale", () => {
  it("sets every size of text in its components and layouts by a token, never a literal size", async () => {
    expect(await uses(kit, "{components,layouts}/**/*.{ts,tsx}", literal), `the kit sets text by its scale: use ${SCALE}`).toEqual([])
  })

  it("uses none of Tailwind's sizes outside the scale, nor does the shell's own page", async () => {
    expect(
      [...(await uses(kit, "**/*.{ts,tsx,css}", tailwind)), ...(await uses(shell, "{ui,settings}/**/*.{ts,tsx,html}", tailwind)).map((at) => `shell/${at}`)],
      `the kit and the shell keep to the type scale: use ${SCALE} in place of Tailwind's text-xs (text-body) or text-sm (text-large), keeping a /leading`,
    ).toEqual([])
  })

  it("knows a literal size when it sees one", () => {
    expect(["text-[11px]", "text-[0.625rem]", "text-[length:12px]", "text-(length:--size)", "style={{ fontSize: 11 }}"].every((s) => literal.test(s))).toBe(true)
    expect(["text-meta", "text-sm", "text-[#fff]", "text-[var(--x)]", "text-muted-foreground"].some((s) => literal.test(s))).toBe(false)
    expect(["text-xs", "text-sm/relaxed", "md:text-base", "text-2xl"].every((s) => tailwind.test(s))).toBe(true)
    expect(["text-body", "text-large/relaxed", "text-xs-foreground", "max-w-sm", "text-small"].some((s) => tailwind.test(s))).toBe(false)
  })
})
