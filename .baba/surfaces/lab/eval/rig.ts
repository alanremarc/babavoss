// The eval's rig: a campaign runs each task on each variant, a number of times, one fresh agent session a run, and scores
// it on tokens and on what the agent did. A variant is a babavoss checkout, of which the rig knows nothing but its path:
// each run makes a scratch project whose .baba/ links that checkout as its framework and holds the fixture from it, provisions
// it, starts its root and opens the fixture's tab as the person, then starts the agent through Claude Code's adapter with
// the project's own hooks, says the task's prompt, and reads the harness's stream until the turn ends. The fixture's work is
// read from the root's model as the run began and as it left it, and the task's check settles pass or fail. Each run is a
// line of results.jsonl, its stream a transcript beside it; a table compares the variants. The scratch project, its home
// and its root are ended and deleted whatever happens. A dry run plays each task's script in the agent's place through the
// fake harness, against the same projects and roots, and spends nothing.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, cpSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { fakeHarness, sessionEnv, serviceClient, NONE, type Harness, type HarnessEvent, type HarnessSession, type Tokens } from "babavoss/core/index.ts"
import type { Work } from "./fixture/queue/src/surface.ts"
import type { Kind, Task } from "./tasks.ts"

/** The checkout running the rig: the default variant, and where campaigns are written. */
export const REPO = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)))
/** The fixture, as each variant carries it, and the name it takes in a run's project. */
export const FIXTURE = ".baba/surfaces/lab/eval/fixture/queue"
const SURFACE = "queue"
export const MODEL = "claude-sonnet-5-5"

export type Variant = { label: string; path: string; commit: string; dirty: boolean; version: string }
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
export type Baba = { reads: number; actions: number; programs: number; other: number }
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
  refusals: number
  failed: number
  program: string[]
  told: { hooks: number; answers: number }
  wall_ms: number
  ended?: string
  answer: string
  transcript: string
}

const say = (line: string) => console.log(line)

/** Masks what looks like a credential or a key that opens a live page: a run's transcript is kept on disk. */
export const mask = (text: string): string =>
  text
    .replace(/sk-ant-[\w-]+/g, "<masked>")
    .replace(/([?&]key=)[\w-]{16,}/g, "$1<masked>")
    .replace(/((?:token|secret|password|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',}]{8,}/gi, "$1<masked>")
    .replace(/\b[A-Za-z0-9+_-]{48,}\b/g, "<masked>")

const sh = (cmd: string[], cwd: string, env?: Record<string, string>): string => {
  const done = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" })

  if (done.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} failed in ${cwd}: ${done.stderr.toString().trim().split("\n").slice(-3).join(" ")}`)

  return done.stdout.toString()
}

/** The variant at `path`: a babavoss checkout with its dependencies installed and the fixture; its commit, and whether it differs from it. */
export function variantOf(path: string, label: string): Variant {
  const dir = realpathSync(resolve(path))

  if (!existsSync(join(dir, "framework/core/index.ts"))) throw new Error(`${dir} is not a babavoss checkout`)
  if (!existsSync(join(dir, FIXTURE, "src/surface.ts"))) throw new Error(`${dir} has no fixture at ${FIXTURE}`)
  if (!existsSync(join(dir, "node_modules/react"))) throw new Error(`${dir} has no dependencies: run bun install there`)

  const commit = sh(["git", "rev-parse", "HEAD"], dir).trim()
  const dirty = sh(["git", "status", "--porcelain"], dir).trim() !== ""
  const version = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version

  return { label, path: dir, commit, dirty, version }
}

/** A run's place: the scratch directory, its project and the agent's home, and the root's state for the session. */
type Place = { dir: string; project: string; home: string; session: string; state: string; env: Record<string, string>; entry: string }

/** The environment of the root and the commands the rig runs in a run's project: the agent's, with the scratch settings. */
const envOf = (project: string, home: string): Record<string, string> => ({
  ...sessionEnv(home),
  BABAVOSS_HOME: join(project, ".babavoss"),
  BABAVOSS_SETTINGS: join(home, ".babavoss/settings.json"),
  BABAVOSS_LATEST: "",
})

/** Makes a scratch project on `variant`, with the fixture as its surface, provisioned for Claude Code alone, and its root started. */
export function makePlace(variant: Variant, session: string): Place {
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
    cpSync(join(variant.path, FIXTURE), join(baba, "surfaces", SURFACE), { recursive: true })
    // The release the variant runs is the latest heard: no lookup, and no word of an update in what the agent is told.
    mkdirSync(join(project, ".babavoss"), { recursive: true })
    writeFileSync(join(project, ".babavoss/latest.json"), JSON.stringify({ asked: Date.now(), version: variant.version }))
    sh(["bun", "run", "baba", "provision"], baba, env)
    // A repository with a first commit, as a project is: the harness's own tools, a worktree for a subagent, need one.
    writeFileSync(join(project, ".gitignore"), "node_modules\n.babavoss\n.root\n")
    sh(["git", "init", "-q"], project)
    sh(["git", "add", "-A"], project)
    sh(["git", "-c", "user.name=eval", "-c", "user.email=eval@lab.invalid", "commit", "-qm", "the project as the eval made it"], project)
    sh(["bun", "run", "baba", "start", "--session", session], baba, env)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }

  return { dir, project, home, session, state: join(project, ".babavoss/sessions", session, "baba"), env, entry: join(baba, "node_modules/babavoss/framework/shell/scripts/open.ts") }
}

type Saved = { model?: { tabs?: { surface: string; named?: boolean; model: unknown }[]; activity?: { who?: string; surface?: string; own?: boolean; refused?: string }[] } }
const saved = (place: Place): Saved => {
  try {
    return JSON.parse(readFileSync(join(place.state, "model.json"), "utf8")) as Saved
  } catch {
    return {}
  }
}
/** The fixture's work in the root's model: its tab by its name. */
const workOf = (s: Saved): Work | undefined => (s.model?.tabs?.find((t) => t.surface === SURFACE && t.named) ?? s.model?.tabs?.find((t) => t.surface === SURFACE))?.model as Work | undefined

/** Opens the fixture's tab as the person, and answers with its work as the run begins. */
async function openFixture(place: Place): Promise<Work> {
  const client = serviceClient(place.state, place.session, place.entry, place.env)
  const answer = await client.request("/", { method: "POST", body: JSON.stringify({ handle: "open", args: { surface: SURFACE } }) })

  await answer.body?.cancel()
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
const WORD = /(?:^|[\s;&|(`"'])(?:\S*\.babavoss\/bin\/(?:baba|bv)|bv|bun run baba)(?=\s|$)/g
const OPERATOR = /^(\||\|\||&&|;|>|>>|2>&1|<|&)$/
const SCRIPT = /\.(ts|js|mjs|cjs|sh|py)$/

/** What one shell line did with the root's command: each invocation, by the word after it, a read, an action, a program or other. */
export function babaIn(line: string): Baba {
  const seen: Baba = { reads: 0, actions: 0, programs: 0, other: 0 }

  for (const match of line.matchAll(WORD)) {
    const [first, second] = line
      .slice(match.index! + match[0].length)
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^["']|["']$/g, ""))
      .filter((word, i, all) => !(word === "--session" || all[i - 1] === "--session"))

    // A program may follow a path, as `baba / -e CODE`, which the command refuses: it is counted as the program it was meant to be.
    if (first === "-e" || second === "-e") seen.programs++
    else if (first?.startsWith("/")) second && !OPERATOR.test(second) && !second.startsWith(">") ? seen.actions++ : seen.reads++
    else seen.other++
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
    if (uses && /\b(bun|node|python3?|deno)\s+(-e|--eval|-c)\b|<<\s*['"]?\w+/.test(input)) kinds.add("inline script")
    if (written.some((file) => input.includes(file))) kinds.add("script file")
  }

  return [...kinds]
}

/** What a run's stream says: the harness's own figures, and what the rig counts in it. */
export function measure(events: HarnessEvent[]) {
  const calls = events.flatMap((e) => (e.kind === "call" ? [e] : []))
  const results = new Map(events.flatMap((e) => (e.kind === "result" ? [[e.id, e] as const] : [])))
  const turns = events.flatMap((e) => (e.kind === "turn" ? [e] : []))
  const words = calls.filter((c) => c.tool === "Bash" && babaIn(c.input).reads + babaIn(c.input).actions + babaIn(c.input).programs + babaIn(c.input).other > 0)
  const refused = (text: string) => /^refused:/m.test(text)
  const baba = words.map((c) => babaIn(c.input)).reduce((a, b) => ({ reads: a.reads + b.reads, actions: a.actions + b.actions, programs: a.programs + b.programs, other: a.other + b.other }), {
    reads: 0,
    actions: 0,
    programs: 0,
    other: 0,
  })
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
    told: {
      hooks: events.reduce((n, e) => n + (e.kind === "injected" ? e.text.length : 0), 0),
      answers: words.reduce((n, c) => n + (results.get(c.id)?.text.length ?? 0), 0),
    },
    answer: (replies.length ? replies : events.flatMap((e) => (e.kind === "reply" ? [e.text] : [])).slice(-1)).join("\n"),
  }
}

/**
 * The fake harness, playing in the agent's place the script of the task whose prompt it is told: the project's own
 * session-start hook, then each call of the root's command, then the script's answer.
 */
export function dryHarness(script: (prompt: string) => Task["dry"]): Harness {
  const fake = fakeHarness()

  return {
    ...fake.harness,
    name: "dry",
    start(options): HarnessSession {
      const session = fake.harness.start(options)
      const env = envOf(options.project, options.home)
      const play = async (prompt: string) => {
        const hook = Bun.spawnSync(["bun", ".baba/node_modules/babavoss/bin/baba.ts", "hook", "claude"], {
          cwd: options.project,
          env,
          stdin: new TextEncoder().encode(JSON.stringify({ session_id: options.session, hook_event_name: "SessionStart", source: "startup", cwd: options.project })),
          stdout: "pipe",
          stderr: "ignore",
        })

        fake.emit(
          { kind: "started", session: options.session, loaded: { model: "dry", cwd: options.project, tools: ["Bash"], skills: [], plugins: [], mcp: [], commands: [] } },
          { kind: "injected", event: "SessionStart", text: hook.stdout.toString().trim() },
          { kind: "message", text: prompt },
        )

        const { calls, answer } = script(prompt)

        for (const [i, args] of calls.entries()) {
          const done = Bun.spawnSync([".babavoss/bin/baba", "--session", options.session, ...args], { cwd: options.project, env, stdout: "pipe", stderr: "pipe" })
          const quoted = args.map((a) => (/^[\w/.=-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`)).join(" ")

          fake.emit(
            { kind: "call", id: `dry-${i}`, tool: "Bash", input: `.babavoss/bin/baba ${quoted}`, word: true },
            { kind: "result", id: `dry-${i}`, text: (done.stdout.toString() + done.stderr.toString()).trim(), ...(done.exitCode !== 0 && { error: true }) },
          )
        }
        fake.emit({ kind: "reply", text: answer ?? "Done." }, { kind: "turn", ok: true, text: "", tokens: { ...NONE }, total: 0, ms: 0, calls: calls.length + 1 })
        fake.exit(0)
      }

      return { ...session, say: (text) => void play(text) }
    },
  }
}

type Ending = { events: HarnessEvent[]; ended?: string }

/** Says the prompt and reads the stream until the turn ends, the run makes more than `turns` tool calls, its time is out, or the campaign is stopped. */
async function converse(agent: HarnessSession, prompt: string, options: Options, stop: AbortSignal, transcript: string): Promise<Ending> {
  const events: HarnessEvent[] = []
  const timeout = AbortSignal.timeout(options.minutes * 60_000)
  let ended: string | undefined
  const out = (event: HarnessEvent) => appendFileSync(transcript, `${mask(JSON.stringify({ t: Date.now(), ...event }))}\n`)

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
  await agent.end()
  if (events.at(-1)?.kind === "ended" && !events.some((e) => e.kind === "turn")) {
    const last = events.at(-1) as Extract<HarnessEvent, { kind: "ended" }>

    ended ??= `the harness ended with ${last.code}: ${last.stderr.split("\n").slice(-2).join(" ")}`
  }

  return { events, ...(ended && { ended }) }
}

/** One run of `task` on `variant`: a project made, the agent run, the fixture checked, everything ended and deleted. */
export async function runOnce(harness: Harness, variant: Variant, task: Task, n: number, options: Options, campaign: string, dir: string, stop: AbortSignal): Promise<Run> {
  const began = Date.now()
  const session = crypto.randomUUID()
  const name = `${task.name}.${variant.label}.${n}.jsonl`
  const transcript = join(dir, "transcripts", name)
  const place = makePlace(variant, session)
  let ending: Ending = { events: [] }
  let seed: Work | undefined
  let final: Work | undefined
  let activity: Saved = {}

  try {
    seed = await openFixture(place)
    harness.home(place.home)

    const agent = harness.start({ project: place.project, home: place.home, session, model: options.model, budget: options.cap })

    ending = await converse(agent, task.prompt, options, stop, transcript)
  } catch (error) {
    ending = { ...ending, ended: `the run failed: ${error instanceof Error ? error.message : String(error)}` }
  } finally {
    await closeRoot(place).catch(() => {})
    activity = saved(place)
    final = workOf(activity)
    clear(place, harness)
  }

  const m = measure(ending.events)
  const verdict = seed && final ? task.check({ seed, final, answer: m.answer }) : { pass: false, reason: "the fixture's work could not be read" }
  const { answer, ...measured } = m

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
  ["in.new", (r) => r.tokens.input + r.tokens.cache_write, (x) => Math.round(x).toString()],
  ["in.cache", (r) => r.tokens.cache_read, (x) => Math.round(x).toString()],
  ["out", (r) => r.tokens.output, (x) => Math.round(x).toString()],
  ["usd", (r) => r.cost, (x) => x.toFixed(3)],
  ["calls", (r) => r.tool_calls, (x) => x.toString()],
  ["reads", (r) => r.baba.reads, (x) => x.toString()],
  ["acts", (r) => r.baba.actions, (x) => x.toString()],
  ["progs", (r) => r.baba.programs, (x) => x.toString()],
  ["root", (r) => r.root_calls, (x) => x.toString()],
  ["refused", (r) => r.refusals, (x) => x.toString()],
  ["failed", (r) => r.failed, (x) => x.toString()],
  ["told", (r) => r.told.hooks + r.told.answers, (x) => Math.round(x).toString()],
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
  const legend = variants.map((v) => `${v.label}  ${v.path} @ ${v.commit.slice(0, 10)}${v.dirty ? " with uncommitted changes" : ""}`).join("\n")

  return `${legend}\n\nmedians per run; prog: runs that ran a program\n${grid([head, ...rows])}\n\ntotals over all runs\n${grid([head, ...totalRows])}`
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
  const id = new Date().toISOString().replace(/\.\d+Z$/, "").replaceAll(":", "-")
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
