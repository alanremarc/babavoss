// The playground's workspaces on disk, kept with the author's data by app so they outlive the session they were made in:
// <base>/workspaces/<app key>/<id>/ holds workspace.json, files/ the agent works in, home/ the harness's home, state/
// the app's, and sessions/<n>.json, each session's record with its trace. The files are the record; the util's model
// is what was last read from them. A deleted workspace moves to the trash, never removed.
import { createHash, randomBytes } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import type { SessionRecord, SessionSummary } from "./surface.ts"

/** Where a workspace is: a directory on this machine. A container, when it comes, is the same directory mounted. */
export type WorkspaceKind = "local"
/** workspace.json: what a workspace is made from; `app` is the app's absolute directory, `scenario` the one whose run made it. */
export type WorkspaceRecord = { id: string; name: string; app: string; preset: string; created: string; kind: WorkspaceKind; scenario?: string }
/** A workspace as listed: its record, its directory, its sessions without their traces. */
export type WorkspaceSummary = WorkspaceRecord & { dir: string; sessions: SessionSummary[] }

export const WORKSPACE_FILE = "workspace.json"
export const FILES = "files"
export const HOME = "home"
export const STATE = "state"
export const SESSIONS = "sessions"

const slug = (text: string) => text.replaceAll(/[^A-Za-z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "app"

/** An app's directory under the workspaces: its name, and a hash of where it is, so two checkouts never share. */
export const appKey = (appDir: string): string => `${slug(basename(resolve(appDir)))}-${createHash("sha256").update(resolve(appDir)).digest("hex").slice(0, 8)}`
export const workspacesDir = (base: string, appDir: string): string => join(base, "workspaces", appKey(appDir))

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown
  } catch {
    return undefined
  }
}
const isRecord = (x: unknown): x is WorkspaceRecord =>
  !!x && typeof x === "object" && typeof (x as WorkspaceRecord).id === "string" && typeof (x as WorkspaceRecord).created === "string"
const isSession = (x: unknown): x is SessionRecord =>
  !!x && typeof x === "object" && typeof (x as SessionRecord).n === "number" && Array.isArray((x as SessionRecord).transcript)

/** A session without its trace, with its cost over its turns. */
export const summaryOf = ({ transcript, ...rest }: SessionRecord): SessionSummary => {
  const cost = transcript.reduce<number | undefined>((sum, e) => (e.kind === "turn" && e.costUsd !== undefined ? (sum ?? 0) + e.costUsd : sum), undefined)

  return { ...rest, ...(cost !== undefined && { costUsd: cost }) }
}

/** Each session's record in a workspace directory, by number; what does not parse is skipped. */
export function readSessions(dir: string): SessionRecord[] {
  const at = join(dir, SESSIONS)

  if (!existsSync(at)) return []

  return readdirSync(at)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => readJson(join(at, name)))
    .filter(isSession)
    .sort((a, b) => a.n - b.n)
}

export const readSession = (dir: string, n: number): SessionRecord | undefined => {
  const record = readJson(join(dir, SESSIONS, `${n}.json`))

  return isSession(record) ? record : undefined
}

/** Writes a session's record; a workspace no longer there is not made again. */
export function writeSession(dir: string, record: SessionRecord): void {
  if (!existsSync(join(dir, WORKSPACE_FILE))) return
  mkdirSync(join(dir, SESSIONS), { recursive: true })
  writeFileSync(join(dir, SESSIONS, `${record.n}.json`), JSON.stringify(record))
}

const summary = (dir: string): WorkspaceSummary | undefined => {
  const record = readJson(join(dir, WORKSPACE_FILE))

  return isRecord(record) ? { ...record, dir, sessions: readSessions(dir).map(summaryOf) } : undefined
}

/** An app's workspaces, newest first. */
export function listWorkspaces(base: string, appDir: string): WorkspaceSummary[] {
  const at = workspacesDir(base, appDir)

  if (!existsSync(at)) return []

  return readdirSync(at, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => summary(join(at, e.name)))
    .filter((w): w is WorkspaceSummary => w !== undefined)
    .sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id))
}

/** One workspace with its sessions in full, traces included. */
export function readWorkspace(base: string, appDir: string, id: string): (WorkspaceRecord & { dir: string; sessions: SessionRecord[] }) | undefined {
  const dir = join(workspacesDir(base, appDir), id)
  const record = readJson(join(dir, WORKSPACE_FILE))

  return isRecord(record) ? { ...record, dir, sessions: readSessions(dir) } : undefined
}

/** The id of a workspace made at `at`: when, then a few random letters; safe in a path. */
const idOf = (at: Date) => `${at.toISOString().replaceAll(/[-:]/g, "").replace("T", "-").slice(0, 15)}-${randomBytes(2).toString("hex")}`

/**
 * Makes a workspace for an app: files/ filled from the preset's directory (none is the empty preset), home/, state/ and
 * sessions/ empty, workspace.json written last, so a half-made one is never listed.
 */
export function createWorkspace(
  base: string,
  made: { app: string; preset: string; from?: string; scenario?: string; name?: string; now?: Date }
): WorkspaceSummary {
  const now = made.now ?? new Date()
  const id = idOf(now)
  const dir = join(workspacesDir(base, made.app), id)
  const record: WorkspaceRecord = {
    id,
    name: made.name ?? made.scenario ?? made.preset,
    app: resolve(made.app),
    preset: made.preset,
    created: now.toISOString(),
    kind: "local",
    ...(made.scenario && { scenario: made.scenario }),
  }

  for (const sub of [FILES, HOME, STATE, SESSIONS]) mkdirSync(join(dir, sub), { recursive: true })
  if (made.from) cpSync(made.from, join(dir, FILES), { recursive: true })
  writeFileSync(join(dir, WORKSPACE_FILE), JSON.stringify(record, null, 2) + "\n")

  return { ...record, dir, sessions: [] }
}

/** The person's trash: ~/.Trash on macOS, the XDG trash elsewhere. Their own home, never an agent's. */
export const systemTrash = (env: NodeJS.ProcessEnv = process.env): string =>
  process.platform === "darwin" ? join(homedir(), ".Trash") : join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "Trash")

/** A name not yet taken in a directory: the name, then the name with a number. */
const free = (dir: string, name: string): string => {
  let taken = name

  for (let n = 2; existsSync(join(dir, taken)); n++) taken = `${name} ${n}`

  return taken
}

/** Renames, or across devices copies, links as links, then removes the source: a move either way. */
const move = (from: string, to: string) => {
  try {
    renameSync(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
    cpSync(from, to, { recursive: true, verbatimSymlinks: true })
    rmSync(from, { recursive: true, force: true })
  }
}

/**
 * Moves a directory to a trash under `name`; where it went. The XDG trash keeps it under files/ with an info/ entry saying
 * where it came from; the macOS trash, at its top.
 */
export function moveToTrash(dir: string, trash: string, name: string, layout: "macos" | "xdg" = process.platform === "darwin" ? "macos" : "xdg"): string {
  if (layout === "macos") {
    mkdirSync(trash, { recursive: true })

    const to = join(trash, free(trash, name))

    move(dir, to)

    return to
  }

  const files = join(trash, "files")
  const info = join(trash, "info")

  mkdirSync(files, { recursive: true })
  mkdirSync(info, { recursive: true })

  const taken = free(files, name)
  const to = join(files, taken)

  writeFileSync(join(info, `${taken}.trashinfo`), `[Trash Info]\nPath=${encodeURI(resolve(dir))}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`)
  move(dir, to)

  return to
}

/** Moves a workspace to the trash, named so the person can tell what it was; where it went. */
export const trashWorkspace = (workspace: { dir: string; id: string; name: string }, trash: string, layout?: "macos" | "xdg"): string =>
  moveToTrash(workspace.dir, trash, `babavoss workspace ${workspace.name} ${workspace.id}`, layout)
