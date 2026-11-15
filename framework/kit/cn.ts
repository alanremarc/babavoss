// The kit's class-name merger: cn's, told the type scale, so a size such as `text-meta` is a font size and survives a
// colour such as `text-muted-foreground` beside it, which an unconfigured merger takes for the same group and drops.
import { createCn } from "cn/config"

export const cn = createCn({ extend: { classGroups: { "font-size": [{ text: ["badge", "meta", "body", "large"] }] } } })
