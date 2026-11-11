// Note when the app being written names an older framework than this skill does: the framework an app depends on
// follows the skill, which carries the know-how for it.
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const parts = (version: string) =>
  version
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part))

/** Above zero when `a` is the later version. A release ahead of its pre-releases; numbers by size. */
function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)]

  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Number(x[i] ?? 0) - Number(y[i] ?? 0)
  if (x.length === 3 || y.length === 3) return y.length - x.length
  for (let i = 3; i < Math.max(x.length, y.length); i++)
    if (x[i] !== y[i])
      return x[i] === undefined ? -1 : y[i] === undefined ? 1 : typeof x[i] === typeof y[i] ? (x[i]! < y[i]! ? -1 : 1) : typeof x[i] === "number" ? -1 : 1

  return 0
}

/** The framework version the package in a directory depends on, where there is one. */
const namedAt = (dir: string) => {
  try {
    const named: unknown = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { dependencies?: Record<string, unknown> }).dependencies?.babavoss

    return typeof named === "string" ? named.replace(/^[\^~]/, "") : undefined
  } catch {
    return undefined
  }
}

/** `own` is this skill's directory; `cwd` is anywhere in the app being written. */
export function frameworkNotes(cwd: string, own: string): Record<string, string> {
  const ours = namedAt(own)
  let dir = resolve(cwd)

  while (namedAt(dir) === undefined && dir !== dirname(dir)) dir = dirname(dir)

  const theirs = namedAt(dir)

  return ours && theirs && compareVersions(ours, theirs) > 0
    ? {
        framework: `this app depends on babavoss ${theirs}; baba is at ${ours}. Tell the person and ask; on their word, the starting reference says how`,
      }
    : {}
}
