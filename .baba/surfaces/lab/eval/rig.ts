// The eval's rig: a campaign runs each task on each variant, a number of times, one fresh agent session a run, and scores
// it on tokens and on what the agent did. A variant is a babavoss checkout, of which the rig knows nothing but its path:
// each run makes a scratch project whose .baba/ links that checkout as its framework and holds the fixture from it, provisions
// it, starts its root and opens the fixture's tab as the person, then starts the agent through Claude Code's adapter with
// the project's own hooks, says the task's prompt, and reads the harness's stream until the turn ends. The fixture's work is
// read from the root's model as the run began and as it left it, and the task's check settles pass or fail. Each run is a
// line of results.jsonl, its stream a transcript beside it; a table compares the variants. The scratch project, its home
// and its root are ended and deleted whatever happens. A dry run plays each task's script in the agent's place through the
// fake harness, against the same projects and roots, and spends nothing. A task that starts `fresh` has no fixture: its
// project is one that only ran `baba init` from the variant, with the task's files, and what the agent left there is
// looked at before it is deleted: the surfaces' files, their checks and specs, each surface opened and its page built,
// and what the log heard once the rig, as the person, touched the files the task names.
import { chmodSync, existsSync, statSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, cpSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { fakeHarness, sessionEnv, serviceClient, NONE, type Harness, type HarnessEvent, type HarnessSession, type Tokens } from "babavoss/core/index.ts"
import type { Work } from "./fixture/queue/src/surface.ts"
import { COMPACT, SITE, type Act, type Call, type Dry, type Fresh, type Kind, type Look, type Ran, type Shell, type Task } from "./tasks.ts"

/** The checkout running the rig: the default variant, and where campaigns are written. */
export const REPO = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)))
/**
 * The fixtures, each a surface by its folder's name, taken from the rig's own checkout so every variant is run on the same
 * ones: `queue`, open as a run begins, and `release`, listed but not open.
 */
export const FIXTURES = join(REPO, ".baba/surfaces/lab/eval/fixture")
/** Other words for the fixture queue, each a words.ts a variant may run with in place of its own. */
export const WORDS = join(REPO, ".baba/surfaces/lab/eval/words")
const SURFACE = "queue"
export const MODEL = "claude-sonnet-5-5"

/** A checkout to run, and `words`, where given, the fixture queue's words it runs with in place of its own: words/NAME.ts. */
export type Variant = { label: string; path: string; commit: string; dirty: boolean; version: string; words?: string }
export type Options = {
  variants: Variant[]
  tasks: Task[]
  model: string
  runs: number
  /** The most the whole campaign may spend, in dollars, as the harness counts; none where undefined. */
  budget?: number
  /** The most one run may spend, given to the harness. */
  cap: number
  /** The most tool calls a run may make before it is ended. */
  turns: number
  /** The most minutes a run may take before it is ended. */
  minutes: number
  /** The directory of campaigns: each is a directory in it, and tally.json counts them all. */
  out: string
  dry: boolean
}
/** The command's runs by what they did; `full`, the reads of a whole view with its tables: `/`, or a tab's own path. */
export type Baba = { reads: number; full: number; actions: number; programs: number; other: number }
/** One run, as results.jsonl keeps it. */
export type Run = {
  campaign: string
  mode: "real" | "dry"
  variant: string
  path: string
  commit: string
  dirty: boolean
  task: string
  kind: Kind
  model: string
  reported_model: string
  run: number
  pass: boolean
  reason: string
  tokens: Tokens
  cost: number
  tool_calls: number
  baba: Baba
  root_calls: number
  /** Tool calls that went around the surfaces: read or wrote a surface's code or what the root keeps on disk. */
  around: number
  refusals: number
  failed: number
  program: string[]
  /** Characters told: at the session's start, by hooks after it, and in the command's answers. */
  told: { start: number; hooks: number; answers: number }
  /** The command's reads after the first turn, where a task has a second message. */
  later_reads: number
  wall_ms: number
  ended?: string
  answer: string
  transcript: string
}

const say = (line: string) => console.log(line)

/** Masks what looks like a credential: a run's transcript is kept on disk. */
export const mask = (text: string): string =>
  text
    .replace(/sk-ant-[\w-]+/g, "<masked>")
    .replace(/((?:token|secret|password|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',}]{8,}/gi, "$1<masked>")
    .replace(/\b[A-Za-z0-9+_-]{48,}\b/g, "<masked>")

const sh = (cmd: string[], cwd: string, env?: Record<string, string>): string => {
  const done = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" })

  if (done.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} failed in ${cwd}: ${done.stderr.toString().trim().split("\n").slice(-3).join(" ")}`)

  return done.stdout.toString()
}

/** The variant at `path`: a babavoss checkout with its dependencies installed and the fixture; its commit, and whether it differs from it. */
export function variantOf(given: string, label: string): Variant {
  const [path, words] = given.split("#") as [string, string?]
  const dir = realpathSync(resolve(path))

  if (words !== undefined && !existsSync(join(WORDS, `${words}.ts`))) throw new Error(`no words ${words}: they are ${readdirSync(WORDS).map((f) => f.replace(/\.ts$/, "")).join(", ")}`)

  if (!existsSync(join(dir, "framework/core/index.ts"))) throw new Error(`${dir} is not a babavoss checkout`)
  if (!existsSync(join(dir, "node_modules/react"))) throw new Error(`${dir} has no dependencies: run bun install there`)

  const commit = sh(["git", "rev-parse", "HEAD"], dir).trim()
  const dirty = sh(["git", "status", "--porcelain"], dir).trim() !== ""
  const version = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version

  return { label, path: dir, commit, dirty, version, ...(words && { words }) }
}

/** A run's place: the scratch directory, its project and the agent's home, and the root's state for the session. */
type Place = { dir: string; project: string; home: string; session: string; state: string; env: Record<string, string>; entry: string }

/** The environment of the root and the commands the rig runs in a run's project: the agent's, with the scratch settings. */
const envOf = (project: string, home: string): Record<string, string> => ({
  ...sessionEnv(home),
  BABAVOSS_HOME: join(project, ".baba/.state"),
  BABAVOSS_SETTINGS: join(home, ".babavoss/settings.json"),
  BABAVOSS_LATEST: "",
})

/** Makes a scratch project on `variant`, with the fixture as its surface, provisioned for Claude Code alone, and its root started. */
export function makePlace(variant: Variant, session: string, files: Record<string, string> = {}): Place {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "babavoss-eval-")))
  const project = join(dir, "project")
  const home = join(dir, "home")
  const baba = join(project, ".baba")
  const env = envOf(project, home)

  try {
    mkdirSync(join(baba, "node_modules"), { recursive: true })
    mkdirSync(join(home, ".babavoss"), { recursive: true })
    symlinkSync(variant.path, join(baba, "node_modules/babavoss"))
    writeFileSync(
      join(baba, "package.json"),
      `${JSON.stringify({ name: "surfaces", version: "0.1.0", private: true, type: "module", scripts: { baba: "bun node_modules/babavoss/bin/baba.ts" } }, null, 2)}\n`,
    )
    writeFileSync(
      join(baba, "baba.config.ts"),
      `import { config } from "babavoss/core/config.ts"\n\nexport default config({ title: "Eval", harnesses: { claude: { enable: true }, codex: { enable: false } } })\n`,
    )
    for (const name of readdirSync(FIXTURES)) cpSync(join(FIXTURES, name), join(baba, "surfaces", name), { recursive: true })
    if (variant.words) cpSync(join(WORDS, `${variant.words}.ts`), join(baba, "surfaces", SURFACE, "src/words.ts"))
    // The release the variant runs is the latest heard: no lookup, and no word of an update in what the agent is told.
    mkdirSync(join(project, ".baba/.state"), { recursive: true })
    writeFileSync(join(project, ".baba/.state/latest.json"), JSON.stringify({ asked: Date.now(), version: variant.version }))
    sh(["bun", "run", "baba", "provision"], baba, env)
    // A repository with a first commit, as a project is: the harness's own tools, a worktree for a subagent, need one.
    writeFileSync(join(project, ".gitignore"), "node_modules\n.state\n.root\n")
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(project, path, ".."), { recursive: true })
      writeFileSync(join(project, path), text)
    }
    sh(["git", "init", "-q"], project)
    sh(["git", "add", "-A"], project)
    sh(["git", "-c", "user.name=eval", "-c", "user.email=eval@lab.invalid", "commit", "-qm", "the project as the eval made it"], project)
    sh(["bun", "run", "baba", "start", "--session", session], baba, env)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }

  return { dir, project, home, session, state: join(project, ".baba/.state/sessions", session, "baba"), env, entry: join(baba, "node_modules/babavoss/framework/shell/scripts/open.ts") }
}

/** Commits everything in `project` as one commit with `message`. */
const commit = (project: string, message: string) => {
  sh(["git", "add", "-A"], project)
  sh(["git", "-c", "user.name=eval", "-c", "user.email=eval@lab.invalid", "commit", "-qm", message], project)
}

/**
 * Makes a scratch project as a person would: a repository with a README, `baba init` run in it from the variant, then the
 * task's files and its own; where they were written for an older release, they are committed first with `.baba/package.json` naming
 * it, and the dependency set back to the variant in a commit after, as taking a release does. Its root is started.
 */
export function makeFresh(variant: Variant, session: string, fresh: Fresh, files: Record<string, string> = {}): Place {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "babavoss-eval-")))
  const project = join(dir, "project")
  const home = join(dir, "home")
  const baba = join(project, ".baba")
  const env = envOf(project, home)

  try {
    mkdirSync(project, { recursive: true })
    mkdirSync(join(home, ".babavoss"), { recursive: true })
    writeFileSync(join(project, "README.md"), "# App\n\nA small app.\n")
    sh(["git", "init", "-q"], project)
    commit(project, "the project")
    shim(dir, variant)
    if (fresh.empty) {
      return { dir, project, home, session, state: join(project, ".baba/.state/sessions", session, "baba"), env, entry: join(baba, "node_modules/babavoss/framework/shell/scripts/open.ts") }
    }
    // The person's own package cache, read and filled by the install, so a run does not download the framework's dependencies.
    sh(["bun", join(variant.path, "bin/baba.ts"), "init", "claude", "codex", "--from", `file:${variant.path}`], project, { ...env, BUN_INSTALL_CACHE_DIR: join(homedir(), ".bun/install/cache") })
    // A release is a copy of the package, its dependencies beside it in .baba/node_modules; installed from a checkout, its
    // files link back into it, where the checkout's own dependencies would be a second copy of every type. So it is copied.
    rmSync(join(baba, "node_modules/babavoss"), { recursive: true, force: true })
    sh(["rsync", "-a", "--exclude", "node_modules", "--exclude", ".git", "--exclude", ".state", `${variant.path}/`, join(baba, "node_modules/babavoss/")], project)
    mkdirSync(join(project, ".baba/.state"), { recursive: true })
    writeFileSync(join(project, ".baba/.state/latest.json"), JSON.stringify({ asked: Date.now(), version: variant.version }))
    for (const [path, text] of Object.entries({ ...files, ...fresh.files })) {
      mkdirSync(join(project, path, ".."), { recursive: true })
      writeFileSync(join(project, path), text)
    }
    sh(["bun", "run", "baba", "provision"], baba, env)
    if (fresh.was) {
      const file = join(baba, "package.json")
      const now = readFileSync(file, "utf8")

      writeFileSync(file, now.replace(/"babavoss": "[^"]*"/, `"babavoss": "github:alanremarc/babavoss#v${fresh.was}"`))
      commit(project, `surfaces on babavoss ${fresh.was}`)
      writeFileSync(file, now)
      commit(project, `take babavoss ${variant.version}`)
    } else commit(project, "baba init")
    // A person who ran `init` by hand starts no shell: the session's own hook starts it.
    if (!fresh.cold) sh(["bun", "run", "baba", "start", "--session", session], baba, env)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }

  return { dir, project, home, session, state: join(project, ".baba/.state/sessions", session, "baba"), env, entry: join(baba, "node_modules/babavoss/framework/shell/scripts/open.ts") }
}

/** The variant's site/ on a free loopback port, as it is published: index.html at /, every other file at its path; each path asked for is kept. */
function serveSite(variant: Variant) {
  const root = join(variant.path, "site")
  const fetched: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      const file = join(root, path === "/" ? "index.html" : path)

      fetched.push(path)
      if (!file.startsWith(`${root}/`) || !statSync(file, { throwIfNoEntry: false })?.isFile()) return new Response("not found", { status: 404 })

      return new Response(Bun.file(file))
    },
  })

  return { url: `http://127.0.0.1:${server.port}`, fetched, stop: () => server.stop(true) }
}

/** Where the eval's `open` writes what it was given, in a run's directory. */
const OPENED = "opened.txt"
/** The package as the public install names it, which the shim sends to the variant. */
export const PUBLIC = "github:alanremarc/babavoss"

/**
 * A `bunx` first on the agent's PATH, in the run's `bin/`: `bunx github:alanremarc/babavoss ARGS…` runs the variant's own
 * command with the variant as the framework, copied as a release is; anything else goes to the real bunx. The public
 * repository may not carry the variant's release, so an instruction to install it is tried on the variant, word for word.
 * Beside it an `open` and an `xdg-open` that only write what they were given to `opened.txt`: a page the agent opens is
 * counted, and no browser of the person's is opened on a scratch runtime.
 */
function shim(dir: string, variant: Variant) {
  const bin = join(dir, "bin")
  const bunx = Bun.which("bunx") ?? "bunx"
  const copy = `rm -rf .baba/node_modules/babavoss && rsync -a --exclude node_modules --exclude .git --exclude .state '${variant.path}/' .baba/node_modules/babavoss/`

  const lines = [
    "#!/bin/sh",
    "# The eval's bunx: the public install, sent to the variant.",
    `export BUN_INSTALL_CACHE_DIR='${join(homedir(), ".bun/install/cache")}'`,
    `case "$1" in ${PUBLIC}*)`,
    "  shift",
    `  if [ "$1" = init ]; then bun '${variant.path}/bin/baba.ts' init --from 'file:${variant.path}' || exit $?; ${copy}; exit 0; fi`,
    `  exec bun '${variant.path}/bin/baba.ts' "$@";;`,
    "esac",
    `exec '${bunx}' "$@"`,
  ]

  const open = ["#!/bin/sh", "# The eval's open: what the agent opens, written down and not opened.", `echo "$*" >> '${join(dir, OPENED)}'`]

  mkdirSync(bin, { recursive: true })
  for (const [name, text] of [["bunx", lines], ["open", open], ["xdg-open", open]] as const) {
    writeFileSync(join(bin, name), `${text.join("\n")}\n`)
    chmodSync(join(bin, name), 0o755)
  }
}

/** A command's exit code and the end of what it said. */
const ran = (cmd: string[], cwd: string, env: Record<string, string>, timeout = 120_000): Ran => {
  if (!existsSync(cwd)) return { code: -1, out: `there is no ${cwd}` }

  const done = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe", timeout })

  return { code: done.exitCode ?? -1, out: (done.stdout.toString() + done.stderr.toString()).trim().slice(-3000) }
}

/** Every file under `dir` but node_modules, by its path from `from`. */
const filesUnder = (dir: string, from: string): Record<string, string> => {
  const found: Record<string, string> = {}
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)

      if (entry.name === "node_modules") continue
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) found[path.slice(from.length + 1)] = readFileSync(path, "utf8")
    }
  }

  try {
    walk(dir)
  } catch {}

  return found
}

/**
 * What the agent left in a fresh project, looked at with its root up: the surfaces' files and the task's own; `bun check`
 * and the specs in .baba/; each surface opened after a restart, and the root's page built; then the files the task names
 * touched as the person would by hand, and what the log heard of it, the world's entries.
 */
async function lookAt(place: Place, fresh: Fresh, task: Task): Promise<Look> {
  const baba = join(place.project, ".baba")
  const left = { up: up(place), address: address(place), outside: outside(place), strays: strays(place), browsed: browsed(place) }
  const env = { ...place.env, TMPDIR: mkdtempSync(join(place.dir, "tmp-")) }
  const word = (...args: string[]) => ran([".baba/.state/bin/baba", "--session", place.session, ...args], place.project, place.env)
  const surfaces = (() => {
    try {
      return readdirSync(join(baba, "surfaces"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    } catch {
      return []
    }
  })()
  const present = word("/").out
  const stale = /changed on disk/.test(present)
  const there = Object.fromEntries(
    [".baba/package.json", ".baba/node_modules/babavoss/package.json", ".claude/skills/baba", ".agents/skills/baba/SKILL.md", ".codex/hooks.json", ".baba/.state/bin/baba"].map(
      (p) => [p, existsSync(join(place.project, p))],
    ),
  )
  // The judge's specs, which the agent never saw, are written beside its own before anything is checked.
  for (const [path, text] of Object.entries(fresh.judge ?? {})) {
    mkdirSync(join(place.project, path, ".."), { recursive: true })
    writeFileSync(join(place.project, path), text)
  }

  const check = ran(["bun", "check"], baba, env)
  const test = ran(["bun", "test"], baba, env, 180_000)
  const judged = fresh.judge ? ran(["bun", "test", ...Object.keys(fresh.judge).map((p) => join(place.project, p))], baba, env, 180_000) : undefined
  const restart = word("restart")

  if (/drains|restarts$/m.test(restart.out)) {
    const id = /instance (\w+)/.exec(restart.out)?.[1]

    if (id) word("follow", id, "30")
  }

  const opened = Object.fromEntries(surfaces.map((name) => [name, word("/", "open", `surface=${name}`).out]))
  const page = ran(["bun", "node_modules/babavoss/framework/shell/scripts/build.ts", ".root", join(place.dir, "page")], baba, env)
  const touched = Date.now()

  for (const [path, change] of Object.entries(fresh.touch ?? {})) {
    const file = join(place.project, path)

    writeFileSync(file, change(readFileSync(file, "utf8")))
    await Bun.sleep(1500)
  }
  if (fresh.touch) word("/")

  const heard = (saved(place).model?.activity ?? []).filter((e) => e.who === "world" && (e.when ?? 0) >= touched)
  const own = [".baba/baba.config.ts", ...Object.keys(task.files ?? {})].flatMap((p) => {
    try {
      return [[p, readFileSync(join(place.project, p), "utf8")] as const]
    } catch {
      return []
    }
  })
  const files = { ...filesUnder(join(baba, "surfaces"), place.project), ...Object.fromEntries(own) }

  const framework = (() => {
    try {
      return (JSON.parse(readFileSync(join(baba, "node_modules/babavoss/package.json"), "utf8")) as { version?: string }).version ?? ""
    } catch {
      return ""
    }
  })()

  return {
    surfaces,
    files,
    stale,
    there,
    present,
    check,
    test,
    opened,
    page,
    heard: heard.map((e) => ({ by: e.by ?? "", did: e.did ?? "", surface: e.surface ?? "" })),
    framework,
    fetched: [],
    ...left,
    ...(judged && { judged }),
  }
}

/** Whether the session's root runs, as the agent left it: its endpoint written and its process alive. */
const up = (place: Place) => {
  try {
    return alive((JSON.parse(readFileSync(join(place.state, "service.json"), "utf8")) as { pid: number }).pid)
  } catch {
    return false
  }
}
/** The page's address, by the port the session's root keeps for it: the root says it in full only once. */
const address = (place: Place) => {
  try {
    return `http://127.0.0.1:${readFileSync(join(place.state, "port"), "utf8").trim()}`
  } catch {
    return undefined
  }
}
/** What in the agent's home Claude Code keeps, the login's link, the shell's settings, and the package caches: none of it the agent's doing. */
const HOME_OWN = /^(\.claude|Library|\.babavoss|\.bun\/install\/cache|\.cache)(\/|\.|$)/
/** What the run changed outside its project: files in the agent's home but those, and anything in the run's directory beside its parts. */
function outside(place: Place): string[] {
  const parts = new Set(["project", "home", "bin", OPENED])
  const home: string[] = []
  const walk = (at: string, rel: string) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const path = rel ? `${rel}/${e.name}` : e.name

      if (HOME_OWN.test(path)) continue
      if (e.isDirectory()) walk(join(at, e.name), path)
      else home.push(`~/${path}`)
    }
  }

  try {
    walk(place.home, "")
  } catch {}

  return [...readdirSync(place.dir).filter((n) => !parts.has(n)), ...home]
}
/** The project's changes outside what babavoss keeps: .baba/, the harnesses' files, the sessions' state. */
const strays = (place: Place) =>
  ran(["git", "status", "--porcelain", "--untracked-files=normal"], place.project, place.env)
    .out.split("\n")
    .map((l) => l.slice(3))
    .filter((p) => p && !/^(\.baba|\.claude|\.agents|\.codex|\.babavoss)\//.test(p))
/** What the agent opened with the eval's `open`, a line each. */
const browsed = (place: Place) => {
  try {
    return readFileSync(join(place.dir, OPENED), "utf8").split("\n").filter(Boolean)
  } catch {
    return []
  }
}

type Entry = {
  when?: number
  who?: string
  by?: string
  surface?: string
  own?: boolean
  refused?: string
  at?: string
  did?: string
  args?: Record<string, unknown>
  said?: { text: string; at?: string; highlight?: true }[]
}
type Saved = { model?: { tabs?: { n?: number; surface: string; named?: boolean; model: unknown }[]; activity?: Entry[] } }
/** A log's entries, one a line, each read as its last line. */
const logOf = (file: string): Entry[] => {
  try {
    const byN = new Map<number, Entry>()

    for (const line of readFileSync(file, "utf8").split("\n"))
      try {
        const e = JSON.parse(line) as Entry & { n: number }

        byN.set(e.n, e)
      } catch {}

    return [...byN.values()]
  } catch {
    return []
  }
}
/**
 * The root's model as its framework keeps it: in one model.json, as a variant of before keeps it; or as shell.json, each
 * open tab's state.json and each log, open or closed.
 */
const saved = (place: Place): Saved => {
  const read = (file: string): unknown => JSON.parse(readFileSync(join(place.state, file), "utf8"))

  try {
    return read("model.json") as Saved
  } catch {}
  try {
    const shell = read("shell.json") as { tabs?: { n: number; surface: string; named?: boolean }[] }
    const tabs = (shell.tabs ?? []).map((t) => ({ ...t, model: read(`tabs/${t.n}/state.json`) }))
    const folders = (dir: string) => {
      try {
        return readdirSync(join(place.state, dir)).map((n) => join(place.state, dir, n))
      } catch {
        return []
      }
    }
    const logs = [place.state, ...folders("tabs"), ...folders("closed")].flatMap((at) => [join(at, "log.1.jsonl"), join(at, "log.jsonl")])

    return { model: { tabs, activity: logs.flatMap(logOf) } }
  } catch {
    return {}
  }
}
/** The work a fresh project's check is given in place of the fixture's, which it has none of. */
const BLANK: Work = { issues: [], narratives: [], next: 1, clock: 0 }
/** The fixture's work in the root's model: its tab by its name. */
const workOf = (s: Saved): Work | undefined => (s.model?.tabs?.find((t) => t.surface === SURFACE && t.named) ?? s.model?.tabs?.find((t) => t.surface === SURFACE))?.model as Work | undefined

/** The shell as a check reads it: the highlights the agent raised, each place and why, and each tab's surface and model. */
const shellOf = (s: Saved): Shell => ({
  highlights: (s.model?.activity ?? []).flatMap((e) =>
    e.who === "agent" && e.did === "highlight" && !e.refused ? [{ at: typeof e.args?.at === "string" ? e.args.at : (e.said?.[0]?.at ?? e.at ?? ""), text: e.said?.[0]?.text ?? "" }] : [],
  ),
  tabs: (s.model?.tabs ?? []).map((t) => ({ surface: t.surface, model: t.model })),
})

/** Takes actions on the root as the person, on the page: each a handle called at a path; a refusal throws. */
async function actAsPerson(place: Place, acts: Act[]) {
  const client = serviceClient(place.state, place.session, place.entry, place.env)

  for (const act of acts) {
    // The page's door, JSON with no actor, which the runtime takes as the person's; the agent's plain door would make it the agent's.
    const answer = await client.request(act.path, { method: "POST", body: JSON.stringify({ handle: act.handle, args: act.args }) })
    const text = await answer.text()

    if (!answer.ok) throw new Error(`the person's ${act.handle} at ${act.path} was refused: ${text.trim().slice(0, 200)}`)
  }
}

/** Opens the fixture's tab as the person, takes the task's acts before the agent starts, and answers with its work as the run begins. */
async function openFixture(place: Place, before: Act[] = []): Promise<Work> {
  await actAsPerson(place, [{ path: "/", handle: "open", args: { surface: SURFACE } }, ...before])
  for (const until = Date.now() + 5000; Date.now() < until; await Bun.sleep(50)) {
    const work = workOf(saved(place))

    if (work) return work
  }
  throw new Error("the fixture's tab did not open")
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}
/** Puts the root to sleep, so its model is written and nothing listens; a runtime that does not end is killed. */
async function closeRoot(place: Place) {
  let pid: number | undefined

  try {
    const endpoint = JSON.parse(readFileSync(join(place.state, "service.json"), "utf8")) as { port: number; token: string; pid: number }

    pid = endpoint.pid
    await fetch(`http://127.0.0.1:${endpoint.port}/_/close`, {
      method: "POST",
      headers: { accept: "text/plain", "babavoss-service": endpoint.token },
      signal: AbortSignal.timeout(5000),
    })
      .then((answer) => answer.body?.cancel())
      .catch(() => {})
  } catch {}
  for (const until = Date.now() + 5000; pid && alive(pid) && Date.now() < until; ) await Bun.sleep(50)
  if (pid && alive(pid)) process.kill(pid, "SIGKILL")
}

/** Ends whatever still runs from the run's directory, as a command line names it, then deletes the directory. */
function clear(place: Place, harness: Harness) {
  Bun.spawnSync(["pkill", "-9", "-f", place.dir], { stdout: "ignore", stderr: "ignore" })
  harness.release(place.home)
  rmSync(place.dir, { recursive: true, force: true })
}

/** An invocation of the root's command in a shell line: the project's own, a bv, or the package's script. */
const WORD = /(?:^|[\s;&|(`"'])(?:\S*\.baba\/\.state\/bin\/(?:baba|bv)|bv|bun run baba)(?=\s|$)/g
const OPERATOR = /^(\||\|\||&&|;|>|>>|2>&1|<|&)$/
const SCRIPT = /\.(ts|js|mjs|cjs|sh|py)$/
/** A path read whole, with its tables: the root's, or a tab's own, by its name or its number. */
const WHOLE = /^\/(?:[\w-]+|tabs\/\d+)?\/?$/

/** What one shell line did with the root's command: each invocation, by the word after it, a read, an action, a program or other. */
export function babaIn(line: string): Baba {
  const seen: Baba = { reads: 0, full: 0, actions: 0, programs: 0, other: 0 }

  for (const match of line.matchAll(WORD)) {
    const [first, second] = line
      .slice(match.index! + match[0].length)
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^["']|["']$/g, ""))
      .filter((word, i, all) => !(word === "--session" || all[i - 1] === "--session"))

    // A program may follow a path, as `baba / -e CODE`, which the command refuses: it is counted as the program it was meant to be.
    if (first === "-e" || second === "-e") seen.programs++
    else if (first?.startsWith("/") && second && !OPERATOR.test(second) && !second.startsWith(">")) seen.actions++
    else if (first?.startsWith("/")) {
      seen.reads++
      if (WHOLE.test(first)) seen.full++
    } else seen.other++
  }

  return seen
}

/** How the agent ran a program, where it did, from its tool calls: a program of the command's, a shell loop, a pipeline into the command, a script file. */
export function programs(calls: { tool: string; input: string }[]): string[] {
  const kinds = new Set<string>()
  const written: string[] = []

  for (const { tool, input } of calls) {
    if (tool === "Write" || tool === "Edit") {
      try {
        const file = (JSON.parse(input) as { file_path?: string }).file_path

        if (file && SCRIPT.test(file)) written.push(basename(file))
      } catch {}
      continue
    }
    if (tool !== "Bash") continue

    const word = babaIn(input)
    const uses = word.reads + word.actions + word.programs + word.other > 0

    if (word.programs) kinds.add("-e")
    if (uses && /\b(for|while|until)\b[\s\S]*?\bdo\b/.test(input)) kinds.add("shell loop")
    if (uses && /\|\s*(xargs|while|parallel)\b/.test(input)) kinds.add("pipeline")
    // A heredoc that is the command's own program, `-e - <<'EOF'`, is that program, not a script of the shell's.
    if (uses && (/\b(bun|node|python3?|deno)\s+(-e|--eval|-c)\b/.test(input) || (!word.programs && /<<\s*['"]?\w+/.test(input)))) kinds.add("inline script")
    if (written.some((file) => input.includes(file))) kinds.add("script file")
  }

  return [...kinds]
}

/** A path into a surface's code or what the root keeps on disk: what the words say never to look in or change. */
const BEHIND = /\.baba\/(?!node_modules\/babavoss\/skill\/)(surfaces|\.root)\b|\.baba\/\.state\/sessions|model\.json|seed\.ts|surface\.ts/

/** Whether a tool call went around the surfaces, to their code or the root's state on disk, rather than through the command. */
export const goesAround = ({ tool, input }: Call): boolean =>
  (tool === "Bash" ? babaIn(input).reads + babaIn(input).actions + babaIn(input).programs + babaIn(input).other === 0 || /\b(cat|grep|rg|sed|head|tail|ls|find|jq)\b/.test(input) : true) &&
  BEHIND.test(input)

/** What a run's stream says: the harness's own figures, and what the rig counts in it. */
export function measure(events: HarnessEvent[]) {
  const calls = events.flatMap((e) => (e.kind === "call" ? [e] : []))
  const results = new Map(events.flatMap((e) => (e.kind === "result" ? [[e.id, e] as const] : [])))
  const turns = events.flatMap((e) => (e.kind === "turn" ? [e] : []))
  const words = calls.filter((c) => c.tool === "Bash" && babaIn(c.input).reads + babaIn(c.input).actions + babaIn(c.input).programs + babaIn(c.input).other > 0)
  const refused = (text: string) => /^refused:/m.test(text)
  const sum = (of: typeof calls) =>
    of
      .map((c) => babaIn(c.input))
      .reduce((a, b) => ({ reads: a.reads + b.reads, full: a.full + b.full, actions: a.actions + b.actions, programs: a.programs + b.programs, other: a.other + b.other }), {
        reads: 0,
        full: 0,
        actions: 0,
        programs: 0,
        other: 0,
      })
  const baba = sum(words)
  // Which turn each call is in: how many turns ended before it.
  const turnOf = new Map(events.flatMap((e, i) => (e.kind === "call" ? [[e.id, events.slice(0, i).filter((x) => x.kind === "turn").length] as const] : [])))
  const start = events.find((e) => e.kind === "injected" && e.event === "SessionStart")
  const lastResult = events.findLastIndex((e) => e.kind === "result")
  const replies = events.slice(lastResult + 1).flatMap((e) => (e.kind === "reply" ? [e.text] : []))
  const started = events.find((e) => e.kind === "started")

  return {
    tokens: turns.reduce<Tokens>(
      (a, t) => ({ input: a.input + t.tokens.input, cache_write: a.cache_write + t.tokens.cache_write, cache_read: a.cache_read + t.tokens.cache_read, output: a.output + t.tokens.output }),
      { ...NONE },
    ),
    cost: Math.max(0, ...turns.map((t) => t.total)),
    reported_model: started?.kind === "started" ? started.loaded.model : "",
    tool_calls: calls.length,
    baba,
    refusals: words.filter((c) => refused(results.get(c.id)?.text ?? "")).length,
    failed: calls.filter((c) => results.get(c.id)?.error && !refused(results.get(c.id)?.text ?? "")).length,
    program: programs(calls),
    around: calls.filter(goesAround).length,
    calls: calls.map(({ id, tool, input }) => ({ tool, input, turn: turnOf.get(id) ?? 0, result: results.get(id)?.text.slice(0, 1000) ?? "" })),
    later_reads: sum(words.filter((c) => (turnOf.get(c.id) ?? 0) > 0)).reads,
    told: {
      start: start?.kind === "injected" ? start.text.length : 0,
      hooks: events.reduce((n, e) => n + (e.kind === "injected" && e !== start ? e.text.length : 0), 0),
      answers: words.reduce((n, c) => n + (results.get(c.id)?.text.length ?? 0), 0),
    },
    answer: (replies.length ? replies : events.flatMap((e) => (e.kind === "reply" ? [e.text] : [])).slice(-1)).join("\n"),
  }
}

/**
 * The fake harness, playing in the agent's place the script of the task whose prompt it is told: the project's own hook,
 * at the session's start for the first prompt and with the message for a later one, then each call of the root's command,
 * then the script's answer.
 */
export function dryHarness(script: (prompt: string) => Dry): Harness {
  const fake = fakeHarness()

  return {
    ...fake.harness,
    name: "dry",
    start(options): HarnessSession {
      const session = fake.harness.start(options)
      const env = envOf(options.project, options.home)
      let said = 0
      const hook = (event: "SessionStart" | "UserPromptSubmit", more: Record<string, string>) =>
        Bun.spawnSync(["bun", ".baba/node_modules/babavoss/bin/baba.ts", "hook", "claude"], {
          cwd: options.project,
          env,
          stdin: new TextEncoder().encode(JSON.stringify({ session_id: options.session, hook_event_name: event, cwd: options.project, ...more })),
          stdout: "pipe",
          stderr: "ignore",
        })
          .stdout.toString()
          .trim()
      const play = async (prompt: string) => {
        const first = said++ === 0

        if (first) {
          fake.emit(
            { kind: "started", session: options.session, loaded: { model: "dry", cwd: options.project, tools: ["Bash"], skills: [], plugins: [], mcp: [], commands: [] } },
            { kind: "injected", event: "SessionStart", text: hook("SessionStart", { source: "startup" }) },
          )
        } else if (prompt === COMPACT) {
          // A compaction, as Claude Code plays it: the session starts again with what the hook gives, and the turn ends.
          fake.emit({ kind: "injected", event: "SessionStart", text: hook("SessionStart", { source: "compact" }) })
          fake.emit({ kind: "turn", ok: true, text: "", tokens: { ...NONE }, total: 0, ms: 0, calls: 0 })

          return
        } else {
          const told = hook("UserPromptSubmit", { prompt })

          if (told) fake.emit({ kind: "injected", event: "UserPromptSubmit", text: told })
        }
        fake.emit({ kind: "message", text: prompt })

        const { calls, writes, answer } = script(prompt)

        for (const [path, text] of Object.entries(writes ?? {})) writeFileSync(join(options.project, path), text)

        for (const [i, args] of calls.entries()) {
          const done = Bun.spawnSync([".baba/.state/bin/baba", "--session", options.session, ...args], { cwd: options.project, env, stdout: "pipe", stderr: "pipe" })
          const quoted = args.map((a) => (/^[\w/.=-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`)).join(" ")

          fake.emit(
            { kind: "call", id: `dry-${said}-${i}`, tool: "Bash", input: `.baba/.state/bin/baba ${quoted}`, word: true },
            { kind: "result", id: `dry-${said}-${i}`, text: (done.stdout.toString() + done.stderr.toString()).trim(), ...(done.exitCode !== 0 && { error: true }) },
          )
        }
        fake.emit({ kind: "reply", text: answer ?? "Done." }, { kind: "turn", ok: true, text: "", tokens: { ...NONE }, total: 0, ms: 0, calls: calls.length + 1 })
      }

      return { ...session, say: (text) => void play(text) }
    },
  }
}

type Ending = { events: HarnessEvent[]; ended?: string }

/**
 * Says the prompt and reads the stream until the turn ends, the run makes more than `turns` tool calls, its time is out, or
 * the campaign is stopped; `events` are the run's so far, and the time and calls count over the whole run.
 */
async function converse(agent: HarnessSession, prompt: string, options: Options, stop: AbortSignal, transcript: string, events: HarnessEvent[], timeout: AbortSignal): Promise<string | undefined> {
  let ended: string | undefined
  const out = (event: HarnessEvent) => appendFileSync(transcript, `${mask(JSON.stringify({ t: Date.now(), ...event }))}\n`)
  const from = events.length

  agent.say(prompt)

  const iterator = agent.events[Symbol.asyncIterator]()
  const halted = new Promise<"halt">((done) => {
    for (const signal of [timeout, stop]) signal.aborted ? done("halt") : signal.addEventListener("abort", () => done("halt"), { once: true })
  })

  for (;;) {
    const next = stop.aborted || timeout.aborted ? "halt" : await Promise.race([iterator.next(), halted])

    if (next === "halt") {
      ended = stop.aborted ? "the campaign was stopped" : `out of time after ${options.minutes} minutes`
      break
    }
    if (next.done) break
    events.push(next.value)
    out(next.value)
    if (next.value.kind === "turn" || next.value.kind === "ended") break
    if (next.value.kind === "call" && events.filter((e) => e.kind === "call").length > options.turns) {
      ended = `ended after ${options.turns} tool calls`
      break
    }
  }
  if (events.at(-1)?.kind === "ended" && !events.slice(from).some((e) => e.kind === "turn")) {
    const last = events.at(-1) as Extract<HarnessEvent, { kind: "ended" }>

    ended ??= `the harness ended with ${last.code}: ${last.stderr.split("\n").slice(-2).join(" ")}`
  }

  return ended
}

/** One run of `task` on `variant`: a project made, the agent run, the fixture checked, everything ended and deleted. */
export async function runOnce(harness: Harness, variant: Variant, task: Task, n: number, options: Options, campaign: string, dir: string, stop: AbortSignal): Promise<Run> {
  const began = Date.now()
  const session = crypto.randomUUID()
  const name = `${task.name}.${variant.label}.${n}.jsonl`
  const transcript = join(dir, "transcripts", name)
  const place = task.fresh ? makeFresh(variant, session, task.fresh, task.files) : makePlace(variant, session, task.files)
  const site = task.fresh?.site ? serveSite(variant) : undefined
  const prompt = site ? task.prompt.replaceAll(SITE, site.url) : task.prompt
  let ending: Ending = { events: [] }
  let look: Look | undefined
  let seed: Work | undefined
  let final: Work | undefined
  let activity: Saved = {}
  // The task's files as the run left them.
  const files: Record<string, string> = {}

  try {
    seed = task.fresh ? BLANK : await openFixture(place, task.before)
    harness.home(place.home)

    // A fresh project's agent finds the eval's bunx and open first, as it starts; the rig's own PATH is put back at once.
    const path = process.env.PATH

    if (task.fresh) process.env.PATH = `${join(place.dir, "bin")}:${path}`

    const agent = (() => {
      try {
        return harness.start({ project: place.project, home: place.home, session, model: options.model, budget: options.cap })
      } finally {
        process.env.PATH = path
      }
    })()
    const timeout = AbortSignal.timeout(options.minutes * 60_000)

    try {
      ending.ended = await converse(agent, prompt, options, stop, transcript, ending.events, timeout)
      // A second message in the same session, after the person acted on the root between the two.
      for (const later of task.then ?? []) {
        if (ending.ended) break
        await actAsPerson(place, later.acts ?? [])
        ending.ended = await converse(agent, later.prompt, options, stop, transcript, ending.events, timeout)
      }
    } finally {
      await agent.end()
    }
    if (!ending.ended) delete ending.ended
  } catch (error) {
    ending = { ...ending, ended: `the run failed: ${error instanceof Error ? error.message : String(error)}` }
  } finally {
    if (task.fresh) look = await lookAt(place, task.fresh, task).catch(() => undefined)
    site?.stop()
    if (look && site) look.fetched = site.fetched
    // What the agent left, kept beside its transcript, so a verdict can be read against the files it judged.
    if (look) writeFileSync(transcript.replace(/\.jsonl$/, ".files.json"), `${JSON.stringify(look.files, null, 2)}\n`)
    await closeRoot(place).catch(() => {})
    activity = saved(place)
    for (const path of Object.keys(task.files ?? {}))
      try {
        files[path] = readFileSync(join(place.project, path), "utf8")
      } catch {}
    final = task.fresh ? BLANK : workOf(activity)
    clear(place, harness)
  }

  const m = measure(ending.events)
  const verdict = seed && final ? task.check({ seed, final, answer: m.answer, shell: shellOf(activity), calls: m.calls, files, ...(look && { look }) }) : { pass: false, reason: "the fixture's work could not be read" }
  const { answer, calls: _calls, ...measured } = m

  return {
    campaign,
    mode: options.dry ? "dry" : "real",
    variant: variant.label,
    path: variant.path,
    commit: variant.commit,
    dirty: variant.dirty,
    task: task.name,
    kind: task.kind,
    model: options.model,
    run: n,
    ...measured,
    root_calls: (activity.model?.activity ?? []).filter((e) => e.who === "agent" && e.surface === SURFACE && !e.own && e.refused === undefined).length,
    pass: verdict.pass && !ending.ended,
    reason: ending.ended ? `${ending.ended}; ${verdict.reason}` : verdict.reason,
    wall_ms: Date.now() - began,
    ...(ending.ended && { ended: ending.ended }),
    answer: mask(answer).slice(0, 2000),
    transcript: join("transcripts", name),
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)

  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0
}
/** What a table shows of a run, column by column: new input (uncached and cache-written), cache read, output, dollars, and what the rig counts. */
const COLUMNS: [string, (r: Run) => number, (x: number) => string][] = [
  ["after", (r) => r.told.hooks + r.told.answers, (x) => Math.round(x).toString()],
  ["reads", (r) => r.baba.reads, (x) => x.toString()],
  ["full", (r) => r.baba.full ?? 0, (x) => x.toString()],
  ["start", (r) => r.told.start ?? 0, (x) => Math.round(x).toString()],
  ["in.new", (r) => r.tokens.input + r.tokens.cache_write, (x) => Math.round(x).toString()],
  ["in.cache", (r) => r.tokens.cache_read, (x) => Math.round(x).toString()],
  ["out", (r) => r.tokens.output, (x) => Math.round(x).toString()],
  ["usd", (r) => r.cost, (x) => x.toFixed(3)],
  ["calls", (r) => r.tool_calls, (x) => x.toString()],
  ["acts", (r) => r.baba.actions, (x) => x.toString()],
  ["progs", (r) => r.baba.programs, (x) => x.toString()],
  ["root", (r) => r.root_calls, (x) => x.toString()],
  ["refused", (r) => r.refusals, (x) => x.toString()],
  ["around", (r) => r.around ?? 0, (x) => x.toString()],
  ["failed", (r) => r.failed, (x) => x.toString()],
  ["sec", (r) => r.wall_ms / 1000, (x) => x.toFixed(0)],
]
const grid = (rows: string[][]) => {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)))

  return rows.map((r) => r.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join("  ").trimEnd()).join("\n")
}

/** The campaign's table: per task and variant the pass rate, how many ran a program, and the medians; then each variant's totals and its difference from the first. */
export function table(runs: Run[], variants: Variant[]): string {
  const head = ["task", "variant", "pass", "prog", ...COLUMNS.map(([name]) => name)]
  const tasks = [...new Set(runs.map((r) => r.task))]
  const rows = tasks.flatMap((task) =>
    variants.flatMap((v) => {
      const mine = runs.filter((r) => r.task === task && r.variant === v.label)

      if (!mine.length) return []

      return [[task, v.label, `${mine.filter((r) => r.pass).length}/${mine.length}`, `${mine.filter((r) => r.program.length).length}/${mine.length}`, ...COLUMNS.map(([, get, show]) => show(median(mine.map(get))))]]
    }),
  )
  const totals = variants.map((v) => {
    const mine = runs.filter((r) => r.variant === v.label)

    return { v, mine, sums: COLUMNS.map(([, get]) => mine.reduce((n, r) => n + get(r), 0)) }
  })
  const first = totals[0]
  const totalRows = totals.flatMap(({ v, mine, sums }) => {
    const line = ["total", v.label, `${mine.filter((r) => r.pass).length}/${mine.length}`, `${mine.filter((r) => r.program.length).length}/${mine.length}`, ...sums.map((x, i) => COLUMNS[i]![2](x))]
    const diff =
      first && v !== first.v
        ? [["vs " + first.v.label, v.label, "", "", ...sums.map((x, i) => (first.sums[i] ? `${x >= first.sums[i]! ? "+" : ""}${(((x - first.sums[i]!) / first.sums[i]!) * 100).toFixed(1)}%` : "-"))]]
        : []

    return [line, ...diff]
  })
  const legend = variants
    .map((v) => `${v.label}  ${v.path} @ ${v.commit.slice(0, 10)}${v.dirty ? " with uncommitted changes" : ""}${v.words ? `, the queue's words ${v.words}` : ""}`)
    .join("\n")

  return `${legend}\n\nmedians per run; after: characters told after the session's start; full: reads of a whole view; prog: runs that ran a program\n${grid([head, ...rows])}\n\ntotals over all runs\n${grid([head, ...totalRows])}`
}

type Count = { runs: number; input: number; cache_read: number; cache_write: number; output: number; cost: number }
type Tally = { campaigns: number; real: Count; dry: Count }
const ZERO: Count = { runs: 0, input: 0, cache_read: 0, cache_write: 0, output: 0, cost: 0 }
const add = (c: Count, r: Run): Count => ({
  runs: c.runs + 1,
  input: c.input + r.tokens.input,
  cache_read: c.cache_read + r.tokens.cache_read,
  cache_write: c.cache_write + r.tokens.cache_write,
  output: c.output + r.tokens.output,
  cost: c.cost + r.cost,
})
const counted = (c: Count) =>
  `${c.runs} runs, tokens in ${c.input + c.cache_read + c.cache_write} (uncached ${c.input}, cache read ${c.cache_read}, cache write ${c.cache_write}), out ${c.output}, $${c.cost.toFixed(2)} as the harness counts`

/** Adds the campaign's runs to tally.json in the campaigns' directory, and says them and the total. */
export function tally(out: string, runs: Run[], mode: "real" | "dry"): string {
  const file = join(out, "tally.json")
  let kept: Tally = { campaigns: 0, real: ZERO, dry: ZERO }

  try {
    kept = { ...kept, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Tally>) }
  } catch {}

  const these = runs.reduce(add, ZERO)
  const next: Tally = { ...kept, campaigns: kept.campaigns + 1, [mode]: runs.reduce(add, kept[mode]) }

  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)

  return `this campaign: ${counted(these)}\nall ${mode} campaigns in ${out}: ${counted(next[mode])}`
}

/** Runs a campaign: every task on every variant, `runs` times each, interleaved so drift falls on all variants alike. */
export async function campaign(options: Options, harness: Harness, stop: AbortSignal): Promise<{ dir: string; runs: Run[]; skipped: string[] }> {
  // Two campaigns begun in the same second each take a directory of their own.
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "").replaceAll(":", "-")
  const id = [stamp, ...Array.from({ length: 99 }, (_, i) => `${stamp}-${i + 2}`)].find((name) => !existsSync(join(options.out, name)))!
  const dir = join(options.out, id)
  const plan = Array.from({ length: options.runs }, (_, i) => i + 1).flatMap((n) => options.tasks.flatMap((task) => options.variants.map((variant) => ({ n, task, variant }))))
  const runs: Run[] = []
  const skipped: string[] = []
  let spent = 0

  mkdirSync(join(dir, "transcripts"), { recursive: true })
  for (const { n, task, variant } of plan) {
    const why = stop.aborted ? "stopped" : options.budget !== undefined && spent >= options.budget ? `the budget of $${options.budget.toFixed(2)} is spent` : undefined

    if (why) {
      skipped.push(`${task.name} on ${variant.label}, run ${n} (${why})`)
      continue
    }

    const run = await runOnce(harness, variant, task, n, options, id, dir, stop)

    runs.push(run)
    spent += run.cost
    appendFileSync(join(dir, "results.jsonl"), `${JSON.stringify(run)}\n`)
    say(`${run.pass ? "pass" : "FAIL"}  ${task.name} on ${variant.label}, run ${n}: ${run.reason}; ${run.tool_calls} calls, $${run.cost.toFixed(3)}, ${(run.wall_ms / 1000).toFixed(0)}s`)
  }

  return { dir, runs, skipped }
}
