// Where the harness keeps things on disk.
import { readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { vars, type Env } from "./env.ts"

export const home = (env: Env = process.env): string => env[vars.home] ?? join(homedir(), ".codex")
export const configFile = (env: Env = process.env): string => join(home(env), "config.toml")
export const authFile = (env: Env = process.env): string => join(home(env), "auth.json")
/** Sessions under YYYY/MM/DD, one rollout-<time>-<uuid>.jsonl each. */
export const sessionsDir = (env: Env = process.env): string => join(home(env), "sessions")

const rollout = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/

/** The session id a rollout file name carries, or undefined for another file. */
export const sessionIdOf = (fileName: string): string | undefined => rollout.exec(fileName)?.[1]

/** The rollout file of a session, found under the sessions directory; undefined until the harness has written one. */
export const rolloutPath = (id: string, env: Env = process.env): string | undefined => {
  try {
    const found = readdirSync(sessionsDir(env), { recursive: true, encoding: "utf8" }).find((path) => sessionIdOf(path.split("/").at(-1) ?? "") === id)

    return found && join(sessionsDir(env), found)
  } catch {
    return undefined
  }
}
