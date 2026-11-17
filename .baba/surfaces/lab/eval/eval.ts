// The eval, as a command: runs a campaign of tasks against variants of babavoss and prints a table that compares them on
// tokens and on what the agent did. A variant is a checkout, its dependencies installed; each run is a fresh scratch project
// on it with the fixture, and a fresh headless Claude Code session, its own hooks and baba's words included (rig.ts).
//
//   bun .baba/surfaces/lab/eval/eval.ts --variant PATH [--variant PATH …] [--tasks NAME,…] [--model ID] [--runs N]
//       [--budget USD] [--cap USD] [--turns N] [--minutes N] [--out DIR] [--dry]
//
//   --variant   a babavoss checkout; this one where none is given. The first is the baseline the others are compared with.
//               PATH#WORDS runs it with the fixture queue's words from words/WORDS.ts, as dictating, in place of its own.
//   --tasks     the tasks by name, all by default: done-one, add-one, note-one, start-oldest, move-drafts, lanes-read,
//               open-count, note-backlog, note-parents, done-list, create-eight; and the probes open-release, retitle,
//               busy-lane, about-26, highlight-13, second-turn, done-then-lanes, link-cycle, release-ready, compact-then-act,
//               no-surface, done-sleep (tasks.ts); and on a fresh project, with no fixture (fresh.ts): install, first-contact,
//               make-books, hear-books, rate-books, adapt-release, plain-edit, rename-var, screenshots-ask; adapting a surface
//               of 0.64.0 (adapting.ts): adapt-0.64; and judgment with the queue open (judgment.ts): typo, rename-fn,
//               screens-opinion, track-endpoints, verbose-told, verbose-untold
//   --model     the model Claude Code runs, claude-sonnet-5-5 by default; the one it reports is recorded beside it
//   --runs      runs of each task on each variant, 3 by default
//   --budget    optional: the most the campaign may spend in dollars as the harness counts them; refused before it starts
//               where runs × cap exceed it, and stopped once spent
//   --cap       the most one run may spend, given to the harness, 2 by default
//   --turns     the most tool calls a run may make before it is ended, 40 by default
//   --minutes   the most minutes a run may take, 10 by default
//   --out       the campaigns' directory, .babavoss/eval in this checkout by default: each campaign a directory in it with
//               results.jsonl, transcripts/ and table.txt, and tally.json counting the runs of every campaign
//   --instruction  the install task's instruction, a file's text: fresh/install.md by default, the README's block when
//               pointed at a file that holds it
//   --dry       play each task's script through the fake harness instead of an agent: everything but the agent, for free
//
// A real run needs Claude Code signed in for the person; the agent's home reaches the login by a link, as the lab's does.
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { claudeCode } from "babavoss/core/index.ts"
import { campaign, dryHarness, MODEL, REPO, table, tally, variantOf, type Options } from "./rig.ts"
import { INSTALL, withInstruction } from "./fresh.ts"
import { scriptFor, tasksNamed } from "./tasks.ts"

const { values } = parseArgs({
  options: {
    variant: { type: "string", multiple: true },
    tasks: { type: "string", default: "" },
    model: { type: "string", default: MODEL },
    runs: { type: "string", default: "3" },
    budget: { type: "string" },
    cap: { type: "string", default: "2" },
    turns: { type: "string", default: "40" },
    minutes: { type: "string", default: "10" },
    out: { type: "string", default: join(REPO, ".babavoss/eval") },
    dry: { type: "boolean", default: false },
    instruction: { type: "string", default: INSTALL },
  },
})

const number = (name: string, text: string | undefined) => {
  const n = Number(text)

  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} takes a positive number, not ${text}`)

  return n
}

try {
  const variants = (values.variant?.length ? values.variant : [REPO]).map((path, i) => variantOf(path, `v${i + 1}`))
  const options: Options = {
    variants,
    tasks: withInstruction(tasksNamed(values.tasks), resolve(values.instruction)),
    model: values.model,
    runs: Math.floor(number("runs", values.runs)),
    ...(values.budget !== undefined && { budget: number("budget", values.budget) }),
    cap: number("cap", values.cap),
    turns: Math.floor(number("turns", values.turns)),
    minutes: number("minutes", values.minutes),
    out: resolve(values.out),
    dry: values.dry,
  }
  const total = options.runs * options.tasks.length * variants.length
  const worst = total * options.cap

  console.log(`${total} ${options.dry ? "dry " : ""}runs: ${options.tasks.length} tasks × ${variants.length} variants × ${options.runs}, on ${options.dry ? "the fake harness" : options.model}`)
  if (!options.dry) {
    console.log(`at most $${options.cap.toFixed(2)} a run, $${worst.toFixed(2)} at worst${options.budget !== undefined ? `, within a budget of $${options.budget.toFixed(2)}` : ""}`)
    if (options.budget !== undefined && worst > options.budget)
      throw new Error(`the worst case, $${worst.toFixed(2)}, exceeds the budget of $${options.budget.toFixed(2)}: lower --runs or --cap, or raise --budget`)
  }

  const stop = new AbortController()
  const stopping = () => {
    if (stop.signal.aborted) return
    console.log("stopping: the run under way ends and is cleared, and no other starts")
    stop.abort()
  }

  process.on("SIGINT", stopping)
  process.on("SIGTERM", stopping)

  const harness = options.dry ? dryHarness(scriptFor(options.tasks)) : claudeCode()

  mkdirSync(options.out, { recursive: true })

  const done = await campaign(options, harness, stop.signal)
  const text = table(done.runs, variants)

  writeFileSync(join(done.dir, "table.txt"), `${text}\n`)
  console.log(`\n${text}\n`)
  if (done.skipped.length) console.log(`not run:\n${done.skipped.map((s) => `  ${s}`).join("\n")}\n`)
  console.log(tally(options.out, done.runs, options.dry ? "dry" : "real"))
  console.log(`results: ${join(done.dir, "results.jsonl")}`)
  process.exitCode = stop.signal.aborted ? 130 : 0
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
