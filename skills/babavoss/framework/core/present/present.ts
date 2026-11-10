// Present: the session's whole view at open, otherwise what changed since it was last answered.
// Agents sharing the session share its record; losing it gives the whole view again.
import type { Json } from "../surface/view.ts"

/** A view as lines, one per fact or handle, keyed by path. */
export function flatten(value: Json | undefined, prefix = "", into = new Map<string, string>()): Map<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value) && value.kind === "handle") {
    const h = value as { name: string; args: Record<string, Json>; open: Record<string, string> }
    const fixed = Object.keys(h.args).length ? ` ${JSON.stringify(h.args)}` : ""
    const open = Object.keys(h.open).length
      ? ` + ${Object.entries(h.open)
          .map(([k, t]) => `${k}:${t}`)
          .join(", ")}`
      : ""

    into.set(prefix || h.name, `${h.name}${fixed}${open}`)
  } else if (Array.isArray(value)) {
    if (!value.length) into.set(prefix, "[]")
    for (const [i, item] of value.entries()) flatten(item, prefix ? `${prefix}.${i}` : String(i), into)
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)

    if (!entries.length && prefix) into.set(prefix, "{}")
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, into)
  } else into.set(prefix, JSON.stringify(value ?? null))

  return into
}

/** The lines of `now` that differ from `before`: changed, added, removed; empty when nothing did. */
export function changes(before: Map<string, string>, now: Map<string, string>): string[] {
  const lines: string[] = []

  for (const [k, v] of now) {
    const old = before.get(k)

    if (old === undefined) lines.push(`+ ${k}: ${v}`)
    else if (old !== v) lines.push(`${k}: ${old} → ${v}`)
  }
  for (const k of before.keys()) if (!now.has(k)) lines.push(`- ${k}`)

  return lines
}
