// Where a root's state lives: one directory per agentic session, and the ports that keep a surface's model there.
// The session's directory, where the session runs, is recorded there once by the session's own entry and kept. A session's
// state is its owner's alone: its directories 0700, its files 0600, since it holds the token that opens the agent's door.
import { randomUUID } from "node:crypto"
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Ports } from "../surface/run.ts"
import { readJsonFile, writeJsonFile } from "./json-file.ts"

export type Env = Readonly<Record<string, string | undefined>>

/** Everything kept on this machine lives under one home. */
export const baseDir = (_app: { name: string }, env: Env = process.env): string => env.BABAVOSS_HOME ?? join(homedir(), ".baba", ".state")

/** A root owns its state directory within the session. */
export const stateDir = (root: { name: string }, session: { id: string }, env: Env = process.env): string =>
  join(baseDir(root, env), "sessions", session.id.replaceAll(/[^A-Za-z0-9._-]/g, "-"), root.name)

const sessionFile = (dir: string) => join(dir, "session.json")

/**
 * Makes a root's state directory, and the session's above it, its owner's alone. `sweep`, as a runtime starts: what it
 * already holds too, as a session older than this rule left it; a link is never followed.
 */
export function ownState(dir: string, sweep = false): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dirname(dir), 0o700)
  chmodSync(dir, 0o700)
  if (!sweep) return

  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const stat = lstatSync(path, { throwIfNoEntry: false })

      if (stat?.isDirectory()) {
        chmodSync(path, 0o700)
        walk(path)
      } else if (stat?.isFile()) chmodSync(path, 0o600)
    }
  }

  walk(dir)
}

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
  ownState(dir)

  const temporary = join(dir, `.session.json.${randomUUID()}.tmp`)

  try {
    writeFileSync(temporary, JSON.stringify({ cwd }, null, 2), { mode: 0o600 })
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

  return { load: () => readJsonFile(file), save: (saved) => writeJsonFile(file, saved, { own: true }) }
}
