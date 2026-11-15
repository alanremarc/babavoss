// Where a run lives, and what is done there besides the harness: one directory under this repository's .babavoss/lab/runs,
// holding the project under test, a copy of a checkout as it is now, uncommitted changes included, with its own git and
// dependencies, provisioned and its root started; the agent under test's home; and the run's record, written as it goes.
// The root under test is reached here too, as the person. The surface reaches all of it through `Runs`, faked in its specs.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { findService, serviceClient, type Json } from "babavoss/core/index.ts"
import { sessionEnv } from "babavoss/core/harness/index.ts"

/** The checkout a run is a copy of: where, at which commit, and the paths that differed from it, changed or added. */
export type Checkout = { from: string; commit: string; dirty: string[] }
export type Made = { dir: string; project: string; home: string; checkout: Checkout; ms: number; page?: string }
/** An answer of the root under test: what it said, and whether it did what was asked. */
export type Said = { ok: boolean; text: string }

export interface Runs {
  /** Makes run `id`'s directory: the project, a copy of the checkout at `from` (this repository where empty), its root started for `session`. */
  make(id: string, from: string, session: string): Promise<Made>
  /** Calls a handle in the root under test, as the person. */
  act(project: string, home: string, session: string, at: string, handle: string, args: Json): Promise<Said>
  /** What the person sees at a path of the root under test, with the handles offered to them. */
  look(project: string, home: string, session: string, at: string): Promise<Said>
  /** Closes the project's roots, says what the agent under test left changed in it, and deletes it. */
  close(project: string): Promise<string>
  /** Writes the run's record. */
  record(dir: string, run: Json): void
  /** The records of every run, oldest first. */
  list(): Json[]
}

/** This repository: the checkout the lab runs in. */
export const REPO = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)))
export const RUNS = join(REPO, ".babavoss/lab/runs")
const RECORD = "run.json"
/** What a run's project leaves out of the copy: the lab itself, so a run does not start runs of its own. */
export const LEFT_OUT = [".baba/surfaces/lab"]

const sh = (cmd: string[], cwd: string, env?: Record<string, string>): string => {
  const done = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" })

  if (done.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} failed in ${cwd}: ${done.stderr.toString().trim().split("\n").at(-1)}`)

  return done.stdout.toString()
}
const paths = (out: string) => out.split("\0").filter(Boolean)
const left = (path: string) => LEFT_OUT.some((out) => path === out || path.startsWith(`${out}/`))

/** The top of the git checkout at `from`, which must have a .baba/; this repository where `from` is empty. */
export function checkoutOf(from: string): string {
  if (!from.trim()) return REPO

  const dir = resolve(from)

  if (!existsSync(dir)) throw new Error(`${dir} does not exist`)

  const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: dir, stdout: "pipe", stderr: "pipe" })

  if (top.exitCode !== 0 || realpathSync(top.stdout.toString().trim()) !== realpathSync(dir)) throw new Error(`${dir} is not the top of a git checkout`)
  if (!existsSync(join(dir, ".baba/package.json"))) throw new Error(`${dir} has no .baba/`)

  return realpathSync(dir)
}

/**
 * Copies the checkout at `from` into `project`, as it is now: a clone of its commit, which shares no refs with it and has
 * no remote to push to, and over it each path that differs from that commit, changed, added or deleted; what git ignores
 * stays out, and so does what the lab leaves out.
 */
export function copyCheckout(from: string, project: string): Checkout {
  const commit = sh(["git", "rev-parse", "HEAD"], from).trim()

  sh(["git", "clone", "-q", "--local", "--no-checkout", from, project], from)
  sh(["git", "checkout", "-q", "--detach", commit], project)
  sh(["git", "remote", "remove", "origin"], project)
  // Its home has no git identity of the person's: a commit of the agent under test's says whose it is.
  sh(["git", "config", "user.name", "the agent under test"], project)
  sh(["git", "config", "user.email", "agent-under-test@lab.invalid"], project)

  const out = paths(sh(["git", "ls-files", "-z", "--", ...LEFT_OUT], project))

  if (out.length) sh(["git", "update-index", "--skip-worktree", "--", ...out], project)
  for (const path of LEFT_OUT) rmSync(join(project, path), { recursive: true, force: true })

  const changed = paths(sh(["git", "diff", "--name-only", "--no-renames", "-z", "HEAD"], from))
  // An untracked directory listed whole is a repository of its own; .babavoss/ is what sessions write, and holds the runs.
  const untracked = paths(sh(["git", "ls-files", "-z", "--others", "--exclude-standard"], from))
  const added = untracked.filter((path) => !path.endsWith("/") && !path.startsWith(".babavoss/"))
  const dirty = [...new Set([...changed, ...added])].filter((path) => !left(path)).sort()

  for (const path of dirty) {
    const source = join(from, path)
    const target = join(project, path)

    if (existsSync(source)) {
      mkdirSync(dirname(target), { recursive: true })
      cpSync(source, target, { verbatimSymlinks: true })
    } else rmSync(target, { force: true })
  }

  return { from, commit, dirty }
}

/** Installs the project's dependencies, its own framework among them, and its .baba/, which provisions it. */
export function install(project: string) {
  const ours = (entry: [string, string | undefined]): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("BABAVOSS_")
  const env = Object.fromEntries(Object.entries(process.env).filter(ours))

  if (existsSync(join(project, "package.json")))
    try {
      sh(["bun", "install", "--frozen-lockfile"], project, env)
    } catch {
      sh(["bun", "install"], project, env)
    }
  sh(["bun", "install"], join(project, ".baba"), env)
}

/** Where the root under test keeps a session's state, and the environment it runs in: the agent under test's. */
const stateOf = (project: string, session: string) => join(project, ".babavoss/sessions", session, "baba")
const envOf = (project: string, home: string) => ({ ...sessionEnv(home), BABAVOSS_HOME: join(project, ".babavoss") })
const pageOf = async (project: string, session: string) => {
  const found = await findService(stateOf(project, session))

  return found && `http://127.0.0.1:${found.port}/`
}
const client = (project: string, home: string, session: string) =>
  serviceClient(stateOf(project, session), session, join(project, "framework/shell/scripts/open.ts"), envOf(project, home))

export const runs: Runs = {
  async make(id, from, session) {
    const began = Date.now()
    const checkout = checkoutOf(from)
    const dir = join(RUNS, id)
    const project = join(dir, "project")
    const home = join(dir, "home")

    // What sessions write is git's to ignore, here as the root's door has it.
    if (!existsSync(join(REPO, ".babavoss/.gitignore"))) {
      mkdirSync(join(REPO, ".babavoss"), { recursive: true })
      writeFileSync(join(REPO, ".babavoss/.gitignore"), "*\n")
    }
    mkdirSync(home, { recursive: true })
    try {
      const copied = copyCheckout(checkout, project)

      install(project)
      // Its root is up before the agent's first message, so the page is there from the start; the hook finds it.
      sh(["bun", "run", "baba", "start", "--session", session], join(project, ".baba"), envOf(project, home))

      return { dir, project, home, checkout: copied, ms: Date.now() - began, page: await pageOf(project, session) }
    } catch (error) {
      rmSync(project, { recursive: true, force: true })
      throw error
    }
  },
  async act(project, home, session, at, handle, args) {
    const answer = await client(project, home, session).request(at, { method: "POST", body: JSON.stringify({ handle, args }) })
    const body = (await answer.json()) as { outcome?: string; reason?: string; error?: string }

    return body.outcome === "written"
      ? { ok: true, text: `written: ${handle} at ${at}` }
      : { ok: false, text: `refused: ${body.reason ?? body.error ?? answer.status}` }
  },
  async look(project, home, session, at) {
    const answer = await client(project, home, session).request(at)

    return { ok: answer.ok, text: JSON.stringify(await answer.json(), null, 2) }
  },
  async close(project) {
    if (!project.startsWith(RUNS + sep) || !existsSync(project)) return ""

    const sessions = join(project, ".babavoss/sessions")

    for (const session of existsSync(sessions) ? readdirSync(sessions) : []) {
      const found = await findService(join(sessions, session, "baba")).catch(() => undefined)

      if (found)
        await fetch(`http://127.0.0.1:${found.port}/_/close`, {
          method: "POST",
          headers: { accept: "text/plain", "babavoss-service": found.token },
          signal: AbortSignal.timeout(5000),
        })
          .then((answer) => answer.body?.cancel())
          .catch(() => {})
    }

    let changed = ""

    try {
      changed = sh(["git", "status", "--short"], project).trimEnd()
    } catch {}
    // A closed runtime ends as its answer is sent; a moment more, and nothing writes in the project any longer.
    await Bun.sleep(300)
    rmSync(project, { recursive: true, force: true })

    return changed
  },
  record(dir, run) {
    if (!dir.startsWith(RUNS + sep)) return
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, RECORD), `${JSON.stringify(run)}\n`)
  },
  list() {
    if (!existsSync(RUNS)) return []

    return readdirSync(RUNS)
      .sort()
      .flatMap((id) => {
        try {
          return [JSON.parse(readFileSync(join(RUNS, id, RECORD), "utf8")) as Json]
        } catch {
          return []
        }
      })
  },
}
