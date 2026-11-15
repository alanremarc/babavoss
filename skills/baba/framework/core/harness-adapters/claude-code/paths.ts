// Where the harness keeps things on disk.
import { homedir } from "node:os"
import { join } from "node:path"
import { vars, type Env } from "./env.ts"

export const configDir = (env: Env = process.env): string => env[vars.configDir] ?? join(homedir(), ".claude")

/** The projects/ directory name for a working directory, as observed: every `/` and `.` becomes `-`. CLAUDE_CODE_PROJECT_DIR_NAME overrides it. */
export const projectDirName = (cwd: string): string => cwd.replaceAll(/[/.]/g, "-")

/** The transcript of a session started in `cwd`; it may lag the current turn. */
export const transcriptPath = (cwd: string, sessionId: string, env: Env = process.env): string =>
  join(configDir(env), "projects", projectDirName(cwd), `${sessionId}.jsonl`)
