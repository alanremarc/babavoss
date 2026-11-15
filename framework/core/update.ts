// Says when a later babavoss is released than the one these roles run on. The repository is asked at most once a day,
// briefly, and a failure to reach it is silence. BABAVOSS_LATEST, when set, is the answer, and nothing is asked.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readJsonFile, writeJsonFile } from "./state/json-file.ts"

/** The framework's version: every version on the repository's main is a release, tagged vX.Y.Z. */
export const VERSION = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version
export const REPOSITORY = "alanremarc/babavoss"
const DAY = 24 * 60 * 60 * 1000

/** Whether version `a` comes after `b`, by their numbers; what is not a number counts as 0. */
export const later = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map((n) => Number.parseInt(n) || 0))

  for (let i = 0; i < 3; i++) if ((x![i] ?? 0) !== (y![i] ?? 0)) return (x![i] ?? 0) > (y![i] ?? 0)

  return false
}

/** The latest release, as last heard in this home; asked again once that is a day old. */
async function latest(home: string, now: number): Promise<string | undefined> {
  if (process.env.BABAVOSS_LATEST !== undefined) return process.env.BABAVOSS_LATEST || undefined

  const file = join(home, "latest.json")
  const heard = readJsonFile<{ asked: number; version?: string }>(file)

  if (heard && now - heard.asked < DAY) return heard.version

  let version = heard?.version

  try {
    const answer = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/main/package.json`, { signal: AbortSignal.timeout(1500) })

    if (answer.ok) version = ((await answer.json()) as { version?: string }).version
  } catch {}
  try {
    writeJsonFile(file, { asked: now, version })
  } catch {}

  return version
}

/** What to tell the agent when a later release is out: how to take it in `baba`, the roles' package, and what to do after. */
export async function updateNote(home: string, baba: string, now = Date.now()): Promise<string | undefined> {
  const version = await latest(home, now)

  return version && later(version, VERSION)
    ? `babavoss ${version} is out; these roles run on ${VERSION}. Update, unless the person said not to: run \`bun add babavoss@github:${REPOSITORY}#v${version}\` in ${baba}, ` +
        `read node_modules/babavoss/CHANGELOG.md there from ${VERSION} up, adapt the roles to what changed, and run their specs`
    : undefined
}
