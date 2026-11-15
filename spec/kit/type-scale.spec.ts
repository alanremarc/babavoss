// The kit's text keeps to the type scale: no component or layout sets a font size of its own, as a Tailwind value or a style.
import { describe, expect, it } from "bun:test"
import { Glob } from "bun"
import { join } from "node:path"

const kit = join(import.meta.dir, "../../framework/kit")
// A literal size in a class, `text-[11px]` or `text-(length:--x)`, or in a style, `fontSize: 11`; a colour, `text-[#fff]`, is no size.
const literal = /\btext-\[(?:length:)?[\d.]|\btext-\(length:|\bfontSize\s*:/

describe("the kit's type scale", () => {
  it("sets every size of text in its components and layouts by a token, never a literal size", async () => {
    const found: string[] = []

    for await (const file of new Glob("{components,layouts}/**/*.{ts,tsx}").scan(kit)) {
      const lines = (await Bun.file(join(kit, file)).text()).split("\n")

      lines.forEach((line, i) => literal.test(line) && found.push(`${file}:${i + 1}: ${line.match(literal)![0]}`))
    }
    expect(found).toEqual([])
  })

  it("knows a literal size when it sees one", () => {
    expect(["text-[11px]", "text-[0.625rem]", "text-[length:12px]", "text-(length:--size)", "style={{ fontSize: 11 }}"].every((s) => literal.test(s))).toBe(true)
    expect(["text-meta", "text-sm", "text-[#fff]", "text-[var(--x)]", "text-muted-foreground"].some((s) => literal.test(s))).toBe(false)
  })
})
