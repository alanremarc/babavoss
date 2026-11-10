// Note when the app being written holds an older framework than the authoring app carries.
import { existsSync, readFileSync } from "node:fs"
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

const versionAt = (dir: string) => {
  try {
    return readFileSync(join(dir, "framework", "VERSION"), "utf8").trim()
  } catch {
    return undefined
  }
}

/** `carried` is this app's own directory; `cwd` is anywhere in the app being written. */
export function frameworkNotes(cwd: string, carried: string): Record<string, string> {
  const ours = versionAt(carried)
  let dir = resolve(cwd)

  while (!existsSync(join(dir, "framework", "VERSION")) && dir !== dirname(dir)) dir = dirname(dir)

  const theirs = versionAt(dir)

  return ours && theirs && compareVersions(ours, theirs) > 0
    ? {
        framework: `this app's framework is ${theirs}; babavoss carries ${ours}. Tell the person and ask; on their word, the starting reference says how to take it`,
      }
    : {}
}
