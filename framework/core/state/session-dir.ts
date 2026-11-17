// The directory of the session this process's runtime serves, where what is the session's own is kept beside its roots'
// state: a surface's command keeps there what every tab of the session shares and what outlives each tab. The runtime is
// woken as `ENTRY --serve SESSION`, with BABAVOSS_HOME set by the root's door; outside a runtime there is none.
import { join } from "node:path"
import { baseDir, type Env } from "./state.ts"

/** The file a session's directory holds once its harness said the session ended; anything heard after takes it back (hook.ts). */
export const ENDED = "ended"

/** The session's directory, ~/.babavoss/sessions/ID or a project's .babavoss/sessions/ID; undefined where no runtime is served. */
export function sessionDir(argv: readonly string[] = process.argv, env: Env = process.env): string | undefined {
  const at = argv.indexOf("--serve")
  const session = at === -1 ? undefined : argv[at + 1]

  if (!session || env.BABAVOSS_HOME === undefined) return undefined

  return join(baseDir({ name: "" }, env), "sessions", session.replaceAll(/[^A-Za-z0-9._-]/g, "-"))
}
