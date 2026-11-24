// What the canvas reads from outside: where its worktree is, its notes, and git. Each read is a property of `io`, so a spec
// puts a fake in its place. CANVAS_PROJECT moves the worktree, for a test.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { NoteFile } from "./canvas.ts"

const HERE = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "")

/** This worktree's directory: the one that holds .baba/. */
export const project = () => (process.env.CANVAS_PROJECT ? resolve(process.env.CANVAS_PROJECT) : HERE)
/** The worktree's local notes: Markdown files and their figures under the ignored notes/ directory. */
export const notesDir = () => join(project(), "notes")
/** The record of the worktree's canvas, in its own tool state; .local/ is the person's. */
export const recordFile = () => join(project(), ".baba", ".state", "canvas", "canvas.json")

/** A worktree of this repo as git lists it, with how far it stands from this one: uncommitted files, and commits not in this one's HEAD. */
export type Tree = { path: string; branch?: string; dirty?: number; ahead?: number }
/** This worktree's path and every worktree of its repo. */
export type Git = { here: string; trees: Tree[] }

async function run(cwd: string, ...args: string[]): Promise<string | undefined> {
  if (!existsSync(cwd)) return undefined
  const proc = Bun.spawn(["git", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } })
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])

  return code === 0 ? out.replace(/\n$/, "") : undefined
}

/** The repo's worktrees from `git worktree list --porcelain`, each with its branch where it has one. */
export function parseWorktrees(text: string): Tree[] {
  return text
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split("\n")
      const path = lines.find((l) => l.startsWith("worktree "))?.slice(9)
      const branch = lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "")

      return path && !lines.includes("bare") ? { path, ...(branch && { branch }) } : undefined
    })
    .filter((t): t is Tree => !!t)
}

/** Every worktree of the repo `dir` is in, with its git state against `dir`'s HEAD. */
async function readGit(dir: string): Promise<Git> {
  const here = (await run(dir, "rev-parse", "--show-toplevel")) ?? dir
  const head = await run(dir, "rev-parse", "HEAD")
  const list = await run(dir, "worktree", "list", "--porcelain")
  const trees = parseWorktrees(list ?? "")

  for (const t of trees) {
    if (same(t.path, here)) continue
    const status = await run(t.path, "status", "--porcelain")
    const ahead = head ? await run(t.path, "rev-list", "--count", `${head}..HEAD`) : undefined

    if (status !== undefined) t.dirty = status ? status.split("\n").length : 0
    if (ahead !== undefined) t.ahead = Number(ahead)
  }

  return { here, trees }
}

/** Two paths name one directory, as far as can be told without the disk: macOS lists /tmp as /private/tmp. */
export const same = (a: string, b: string) => {
  const clean = (p: string) => resolve(p).replace(/^\/private(?=\/)/, "")

  return clean(a) === clean(b)
}

/** The git directory every worktree of the repo shares, which changes when a worktree is added or removed. */
const commonDir = async (dir: string) => {
  const common = await run(dir, "rev-parse", "--git-common-dir")

  return common ? resolve(dir, common) : undefined
}

export const io = { readNotes, writeNote, git: readGit, commonDir }

/** Every note in `dir` (its .md files) and every figure in its figures/ (by `figures/NAME.html`); nothing where there is no dir. */
function readNotes(dir: string): { files: NoteFile[]; figures: Record<string, string> } {
  const list = (d: string, ext: string) => {
    try {
      return readdirSync(d).filter((f) => f.endsWith(ext) && !f.startsWith("."))
    } catch {
      return []
    }
  }
  const files = list(dir, ".md")
    .sort()
    .map((f) => ({ name: f.slice(0, -3), text: readFileSync(join(dir, f), "utf8"), updatedAt: statSync(join(dir, f)).mtime.toISOString() }))
  const figures = Object.fromEntries(list(join(dir, "figures"), ".html").map((f) => [`figures/${f}`, readFileSync(join(dir, "figures", f), "utf8")]))

  return { files, figures }
}

/** Writes a note's file in `dir`, unless one of its name is there: a file is never overwritten. */
function writeNote(dir: string, file: NoteFile) {
  const path = join(dir, `${file.name}.md`)

  mkdirSync(dir, { recursive: true })
  if (!existsSync(path)) writeFileSync(path, file.text)
}
