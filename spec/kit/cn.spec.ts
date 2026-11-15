// The kit's class-name merger knows the type scale: a size token is a font size, kept beside a text colour.
import { describe, expect, it } from "bun:test"
import { cn } from "../../framework/kit/cn.ts"

describe("the kit's cn", () => {
  it("keeps a type-scale size beside a text colour", () => {
    for (const size of ["text-badge", "text-meta", "text-body", "text-large"]) expect(cn(`${size} text-muted-foreground`)).toBe(`${size} text-muted-foreground`)
  })

  it("lets a later size win over an earlier one, a token or Tailwind's", () => {
    expect(cn("text-xs text-meta")).toBe("text-meta")
    expect(cn("text-body", "text-meta")).toBe("text-meta")
  })
})
