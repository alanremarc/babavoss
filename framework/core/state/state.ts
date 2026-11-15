// Where an app's state lives: one directory per agentic session, and the ports that keep a surface's model there.
// The session's directory, where the session runs, is recorded there once by the session's own entry and kept.
import { randomUUID } from "node:crypto"
import { existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Ports } from "../surface/run.ts"
import { readJsonFile, writeJsonFile } from "./json-file.ts"

export type Env = Readonly<Record<string, string | undefined>>

/** Everything kept on this machine lives under one home. */
export const baseDir = (_app: { name: string }, env: Env = process.env): string => env.BABAVOSS_HOME ?? join(homedir(), ".babavoss")

/** An app owns its state directory within the session. */
export const stateDir = (app: { name: string }, session: { id: string }, env: Env = process.env): string =>
  join(baseDir(app, env), "sessions", session.id.replaceAll(/[^A-Za-z0-9._-]/g, "-"), app.name)

const sessionFile = (dir: string) => join(dir, "session.json")

/** The directory the session runs in, as recorded under its state directory; undefined before an entry has recorded it. */
export const sessionCwd = (dir: string): string | undefined => {
  try {
    return readJsonFile<{ cwd?: unknown }>(sessionFile(dir))?.cwd as string | undefined
  } catch {
    return undefined
  }
}

/** Records the directory the session runs in, the first time only: written whole, never overwritten, whoever races. */
export function recordSessionCwd(dir: string, cwd: string): void {
  const file = sessionFile(dir)

  if (existsSync(file)) return
  mkdirSync(dir, { recursive: true })

  const temporary = join(dir, `.session.json.${randomUUID()}.tmp`)

  try {
    writeFileSync(temporary, JSON.stringify({ cwd }, null, 2))
    linkSync(temporary, file)
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") throw error
  } finally {
    rmSync(temporary, { force: true })
  }
}

/** The model in one file, model.json, under a session's directory. */
export const modelPorts = <M>(dir: string): Pick<Ports<M>, "load" | "save"> => {
  const file = join(dir, "model.json")

  return { load: () => readJsonFile(file), save: (saved) => writeJsonFile(file, saved) }
}
