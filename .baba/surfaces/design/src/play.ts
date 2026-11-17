// The player: one scenario played on the demo project through the framework's own code, with no agent and no harness. The
// demo is made in a directory of its own, a project with a .baba/ whose surfaces are this surface's demo/surfaces. Every
// text the agent would be given comes from the process that gives it in a session: the framework's hook, run as the
// harness runs it, `baba hook` with the event on standard input; and the word, .babavoss/bin/baba, run as the agent's
// shell runs it, its output what a tool call shows. The root's runtime is woken by them as in a session, in its own
// process. The person acts as their page does, by the door, and the build moves as its file is written. Where a scenario
// changes the demo's code, its surfaces are a copy of the demo's, changed there. Each hook is given the input Claude Code
// gives it, and a harness that no longer runs the hooks gives none. Nothing told is
// made here: the player only records it, with what changed in the project, read as the person's page reads it, and what
// that page showed: each open tab's view at /, as the person reads it, and the tab in front.
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as sleep } from "node:timers/promises"
import type { Json } from "babavoss/core/index.ts"
import { endDeaf, type Endpoint } from "babavoss/core/runtime/service.ts"
import { HOME, placeOf, pointedSince, type Pointed } from "babavoss/shell/ui/pointing.ts"
import { newestFirst, successor } from "babavoss/shell/ui/rail.ts"
import type { Scenario, Scripted, Step } from "./scenarios.ts"

/** The session the demo runs in, as the harness names it. */
export const SESSION = "demo"
/** The word in the demo project, as the root names it to the agent. */
export const WORD = ".babavoss/bin/baba"
/** What stands for the demo's own directory in what is recorded: it differs on every play and means nothing. */
export const PROJECT = "<project>"

/** One piece of text the agent is given: what carries it, a hook's event or the answer to a command, and the text, empty where it is given nothing. */
export type Telling = { carrier: string; text: string }
/**
 * One step as played: who moved, what they did, what changed in the project as the page sees it, and what the agent was
 * given. `timing`: why what it was given may differ from play to play; `unhooked`: the harness ran no hook for it.
 */
export type Played = {
  who: "harness" | "person" | "agent" | "surface" | "root" | "project"
  did: string
  changed: string[]
  tellings: Telling[]
  page: Page
  timing?: string
  unhooked?: true
}
/** An open tab as the person's page draws it: its path, its surface, and its view at /, the paths in it the tab's own and each handle kept to what a page draws. */
export type Drawn = { at: string; surface: string; view: Json }
/**
 * What the person's page showed after a step: the open tabs, and the one in front, `shown`, by the shell's page's own rule:
 * none, home, until the person moves, and then where they moved or the agent pointed them. `asleep`: the root was asleep,
 * so the page is as it last was.
 */
export type Page = { tabs: Drawn[]; shown?: string; asleep?: true }
export type Play = { name: string; steps: Played[]; error?: string }

const FRAMEWORK = realpathSync(dirname(fileURLToPath(import.meta.resolve("babavoss/package.json"))))
const BABA = join(FRAMEWORK, "bin/baba.ts")
const SURFACES = realpathSync(fileURLToPath(new URL("../demo/surfaces", import.meta.url)))
const BUILD = "build.txt"
/** The demo's clock, which a pause puts ahead (clock.ts), and the file it reads, both in the demo's directory. */
const CLOCK = fileURLToPath(new URL("./clock.ts", import.meta.url))
const AHEAD = "clock"
/** How long a reload is waited for before the step says it was not seen. */
const RELOAD_MS = 10_000
/** The demo's runtime entry, as the framework names it, and as a copy of the demo's surfaces finds it. */
const ENTRIES = (dir: string) => [join(FRAMEWORK, "framework/shell/scripts/open.ts"), join(dir, ".baba/node_modules/babavoss/framework/shell/scripts/open.ts")]

/**
 * Where this root's plays are made: one directory of the temporary ones for each checkout's design surface, each play's
 * directory in it named by the process that plays it. Kept apart, so what one root's plays left is that root's to remove.
 */
export const PLAYS = join(realpathSync(tmpdir()), `babavoss-design-${Bun.hash(SURFACES).toString(36)}`)
const LIVE = Symbol.for("babavoss.design.plays")
/** The plays under way in this process, by directory: kept on globalThis, which a reload of the root's code leaves as it is. */
const live = (): Set<string> => ((globalThis as { [LIVE]?: Set<string> })[LIVE] ??= new Set())
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Removes a play's directory, after ending the demo's runtime it woke, where one still runs: by its pid, only if it is that runtime. */
async function removed(dir: string) {
  try {
    const at = JSON.parse(readFileSync(join(dir, ".babavoss/sessions", SESSION, "baba/service.json"), "utf8")) as Endpoint

    for (const entry of ENTRIES(dir)) if (alive(at.pid) && (await endDeaf(at, entry, SESSION))) break
  } catch {}
  rmSync(dir, { recursive: true, force: true })
}

/**
 * Removes what earlier plays of this root left, as a play cut short, or one whose root was reloaded or killed, leaves it:
 * every play's directory and runtime but those of plays under way, here or in another live process.
 */
export async function swept() {
  let names: string[] = []

  try {
    names = readdirSync(PLAYS)
  } catch {}
  await Promise.all(
    names.map((name) => {
      const dir = join(PLAYS, name)
      const owner = Number(name.split("-")[0])

      return live().has(dir) || (owner !== process.pid && alive(owner)) ? undefined : removed(dir)
    }),
  )
}

/** A value as one line of what changed: JSON, cut where long. */
const short = (v: Json | undefined) => {
  const s = v === undefined ? "–" : JSON.stringify(v)

  return s.length > 80 ? `${s.slice(0, 79)}…` : s
}
/** A row's name in its list: its path where it has one, else its number or name; its index where it has none. */
const named = (v: Json, i: number) => {
  const row = v && typeof v === "object" && !Array.isArray(v) ? v : {}
  const id = [row.at, row.n, row.name].find((x) => typeof x === "string" || typeof x === "number")

  return id === undefined ? String(i) : String(id)
}
/** A view's scalars by their place, handles left out: what the page shows, to compare before and after. A row is placed by its identity. */
function flat(value: Json | undefined, at = "", out = new Map<string, Json>()): Map<string, Json> {
  if (value && typeof value === "object" && !Array.isArray(value) && value.kind === "handle") return out
  if (Array.isArray(value) && value.every((v) => v === null || typeof v !== "object")) out.set(at, value)
  else if (Array.isArray(value)) value.forEach((v, i) => flat(v, `${at}[${named(v, i)}]`, out))
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!(k === "at" && at.endsWith("]"))) flat(v, at ? `${at}.${k}` : k, out)
  } else if (value !== undefined) out.set(at, value)

  return out
}
/** A place as read: within its innermost row, by that row's list and path. */
const said = (key: string) => key.replace(/^.*?(\w+)\[([^\]]*)\](?!.*\[)/, "$1 $2")
/** What differs between two reads of /: a line per fact changed, and a row added or gone as one line. */
export function changes(before: Json | undefined, after: Json | undefined): string[] {
  const a = flat(before)
  const b = flat(after)
  const lines: string[] = []
  const rowOf = (k: string) => k.slice(0, k.lastIndexOf("]") + 1)
  const has = (of: Map<string, Json>, row: string) => [...of.keys()].some((k) => k === row || k.startsWith(`${row}.`) || k.startsWith(`${row}[`))
  const told = new Set<string>()
  const field = (k: string, row: string) => k.slice(row.length + 1)

  for (const [k, v] of b) {
    const row = rowOf(k)

    if (row && !has(a, row)) {
      if (told.has(row)) continue
      told.add(row)
      lines.push(`+ ${said(row)}: ${[...b].filter(([x]) => rowOf(x) === row).map(([x, v]) => `${field(x, row)} ${short(v)}`).join(", ")}`)
    } else if (!a.has(k)) {
      if (!(Array.isArray(v) && !v.length && has(a, k))) lines.push(`+ ${said(k)}: ${short(v)}`)
    } else if (JSON.stringify(a.get(k)) !== JSON.stringify(v)) lines.push(`${said(k)}: ${short(a.get(k))} → ${short(v)}`)
  }
  for (const k of a.keys()) {
    const row = rowOf(k)

    if (row && !has(b, row)) {
      if (!told.has(row)) lines.push(`- ${said(row)}`)
      told.add(row)
    } else if (!b.has(k) && !has(b, k)) lines.push(`- ${said(k)}`)
  }

  return lines
}

/** A shell argument as the agent would type it. */
const quoted = (s: string) => (/^[\w./=:@-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`)
const argsOf = (args: Record<string, string> = {}) => Object.entries(args).map(([k, v]) => `${k}=${v}`)

/** A tab's view as its page draws it: its paths within the tab, as the shell gives them to a page, and a handle by its name, description, inputs and whether it is an ask. */
function drawn(value: Json | undefined, address: string): Json {
  if (Array.isArray(value)) return value.map((v) => drawn(v, address))
  if (!value || typeof value !== "object") return value ?? null
  if (value.kind === "handle") return { kind: "handle", name: value.name ?? "", description: value.description ?? "", open: value.open ?? {}, ...(value.ask === true && { ask: true }) }

  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, k === "at" && typeof v === "string" && (v === address || v.startsWith(`${address}/`)) ? v.slice(address.length) || "/" : drawn(v, address)]),
  )
}

/**
 * Plays `scenario` on a demo project of its own, made here and, with the runtime it woke, removed on every way out; aborted,
 * it stops the step under way and its processes. What a process that ended mid-play left, `swept` removes.
 */
export async function play(scenario: Scenario, signal?: AbortSignal): Promise<Play> {
  mkdirSync(PLAYS, { recursive: true })

  const dir = mkdtempSync(join(PLAYS, `${process.pid}-`))

  live().add(dir)
  try {
    return await played(scenario, dir, signal)
  } catch (error) {
    return { name: scenario.name, steps: [], error: error instanceof Error ? error.message : String(error) }
  } finally {
    await removed(dir)
    live().delete(dir)
  }
}

async function played(scenario: Scenario, dir: string, signal?: AbortSignal): Promise<Play> {
  const home = join(dir, ".babavoss")
  // The person's settings are the demo's own, so a scenario that changes one leaves theirs as they are. Every process of the
  // demo reads the time by its clock; bun's options take no quoting, so it is preloaded from the demo's directory.
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    BABAVOSS_HOME: home,
    BABAVOSS_LATEST: "",
    BABAVOSS_SETTINGS: join(dir, "settings.json"),
    CLAUDE_CODE_SESSION_ID: SESSION,
    BUN_OPTIONS: `--preload ${join(dir, "clock.ts")}`,
    DESIGN_CLOCK: join(dir, AHEAD),
  }
  let ahead = 0

  for (const key of ["CODEX_THREAD_ID", "BABAVOSS_BIN"]) delete env[key]
  // A scenario that changes the code plays the root in dev mode, where it takes the change at once; any other, in normal mode.
  env.BABAVOSS_DEV = scenario.steps.some((s) => s.kind === "code") ? "1" : "0"
  mkdirSync(join(dir, ".baba"), { recursive: true })
  writeFileSync(join(dir, ".baba/package.json"), JSON.stringify({ name: "demo", private: true, type: "module" }))
  cpSync(CLOCK, join(dir, "clock.ts"))
  if (scenario.steps.some((s) => s.kind === "code")) {
    // A copy the scenario may change, which finds the framework and the page's packages where the demo's own do.
    cpSync(SURFACES, join(dir, ".baba/surfaces"), { recursive: true, dereference: true })
    mkdirSync(join(dir, ".baba/node_modules"))
    symlinkSync(FRAMEWORK, join(dir, ".baba/node_modules/babavoss"))
    symlinkSync(join(FRAMEWORK, "node_modules"), join(dir, "node_modules"))
  } else symlinkSync(SURFACES, join(dir, ".baba/surfaces"))

  // The page's key is the demo session's secret, never recorded: masked at its own length, so what a telling costs stays true.
  const own = (text: string) =>
    text
      .replaceAll(dir, PROJECT)
      .replace(/([?&]key=)([\w-]+)/g, (_, at: string, key: string) => at + "K".repeat(key.length))
      .trimEnd()
  /** Time let pass within a step, cut short once the play is stopped. */
  const nap = (ms: number) => sleep(ms, undefined, signal && { signal })
  /** A process of the demo's, killed once the play is stopped, unless it is what tidies up after it. */
  const run = async (cmd: string[], stdin?: string, stop: AbortSignal | undefined = signal) => {
    const child = Bun.spawn(cmd, { cwd: dir, env, stdin: stdin === undefined ? "ignore" : new Blob([stdin]), stdout: "pipe", stderr: "pipe", ...(stop && { signal: stop }) })
    const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])

    return own([out.trimEnd(), err.trimEnd()].filter(Boolean).join("\n"))
  }
  /** Whether the harness runs the hooks. */
  let hooked = true
  /** The harness's hook for an event, given Claude Code's input for it: the context it adds, as the agent is given it; none where the harness runs no hooks. */
  const hook = async (event: string, extra: Record<string, Json> = {}): Promise<Telling[]> => {
    if (!hooked) return []

    const input = { session_id: SESSION, transcript_path: join(home, "transcript.jsonl"), cwd: dir, permission_mode: "default", hook_event_name: event, ...extra }
    const out = await run([process.execPath, BABA, "hook"], JSON.stringify(input))
    let text = out

    if (event === "PostToolUse" && out) {
      try {
        text = (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext
      } catch {}
    }

    return [{ carrier: `${event} hook`, text }]
  }
  /** The word, as the agent's shell runs it: what the tool call shows; a program is named by its `-e` alone. */
  const word = async (args: string[]): Promise<Telling> => ({
    carrier: `answer to ${args[0] === "-e" ? `${WORD} -e …` : [WORD, ...args.map(quoted)].join(" ")}`,
    text: await run([join(dir, WORD), ...args]),
  })
  /** The PostToolUse hook after a tool call, given the call as Claude Code gives it: a Bash command and what it printed. */
  const posted = (command: string, answer?: Telling) =>
    hook("PostToolUse", { tool_name: "Bash", tool_input: { command, description: command }, tool_response: { stdout: answer?.text ?? "", stderr: "", interrupted: false }, tool_use_id: "toolu_demo" })
  const endpoint = () => {
    try {
      return JSON.parse(readFileSync(join(home, "sessions", SESSION, "baba", "service.json"), "utf8")) as { port: number; token: string }
    } catch {
      return undefined
    }
  }
  /** The door as the person's page uses it; undefined where the root is asleep, which a look does not wake. */
  const page = async (path: string, call?: { handle: string; args: Json }): Promise<Json | undefined> => {
    const at = endpoint()

    if (!at) return undefined
    try {
      const response = await fetch(`http://127.0.0.1:${at.port}${path}`, {
        method: call ? "POST" : "GET",
        headers: { accept: "application/json", "babavoss-service": at.token, "babavoss-actor": "person", "content-type": "application/json" },
        ...(call && { body: JSON.stringify(call) }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      })

      return (await response.json()) as Json
    } catch {
      return undefined
    }
  }
  const tabsOf = (root: Json | undefined) => (root as { tabs?: { at: string; n: number; surface: string }[] } | undefined)?.tabs ?? []
  /** The project as the page has it: /, what /activity added since the last look, and each open tab at /. */
  let seen = 0
  const look = async () => {
    const root = await page("/")
    const activity = (await page("/activity")) as { entries?: { n: number; who: string; surface: string; at: string | null; what: string }[] | string } | undefined
    const fresh = Array.isArray(activity?.entries) ? activity.entries.filter((e) => e.n > seen).reverse() : []
    const tabs = await Promise.all(tabsOf(root).map(async (t): Promise<Drawn> => ({ at: t.at, surface: t.surface, view: drawn(await page(t.at), t.at) })))

    seen = Math.max(seen, ...fresh.map((e) => e.n))

    return { root, tabs, activity: fresh.map((e) => `activity: ${e.who} · ${e.surface} ${e.at ?? ""} · ${e.what}`) }
  }
  const tabOf = (root: Json | undefined, surface: string) => tabsOf(root).find((t) => t.surface === surface)?.at
  /**
   * Where the person's page stands, as the shell's page keeps it in its URL (shell.tsx): home until the person moves. The
   * person's call at a tab is made in it; opened from home, a tab is gone to; closed while in front, the page goes to the
   * next older tab, or home. The agent's `show` is gone to, where its tab is open, as when the person is not busy, but
   * not one made before the page first looked. A tab in front that closes otherwise leaves home in front, unless the URL's
   * number names a tab that now stands at its surface's name.
   */
  let at = HOME
  let pointed: number | undefined
  const activeIn = (rows: { at: string; n: number }[]) => (at === HOME || rows.some((r) => r.at === at) ? at : (rows.find((r) => at === `/tabs/${r.n}`)?.at ?? HOME))
  const shownAfter = (step: Step, previous: Json | undefined, root: Json | undefined) => {
    const rows = tabsOf(root)
    const active = () => activeIn(rows)
    const front = activeIn(tabsOf(previous))
    const moved = (path: string, handle: string, args: Record<string, Json> = {}) => {
      const key = placeOf(path).key

      if (key !== HOME) at = key
      else if (handle === "open") at = newestFirst(rows.filter((r) => r.surface === args.surface))[0]?.at ?? at
      else if (handle === "close") {
        const closed = tabsOf(previous).find((t) => t.n === args.n)

        if (closed?.at === front) at = successor(newestFirst(tabsOf(previous)), closed.at) ?? HOME
      }
    }

    if (step.kind === "act") moved(step.path, step.handle, step.args)
    if (step.kind === "acts") for (const c of step.calls) moved(c.path, c.handle, c.args)

    const { seen, fresh } = pointedSince(pointed, (root as { pointed?: Pointed } | undefined)?.pointed)

    pointed = seen
    if (fresh && rows.some((r) => r.at === placeOf(fresh.at).key)) at = placeOf(fresh.at).key
    if (!rows.some((r) => at === `/tabs/${r.n}`)) at = active()

    return at === HOME ? undefined : active()
  }
  let waiting: Promise<Telling> | undefined
  const steps: Played[] = []
  let before = await look()

  /** The surfaces' descriptions at /, as the page reads them: what a reload of their code is seen by. */
  const descriptions = async () => JSON.stringify(((await page("/")) as { surfaces?: { name: string; description?: string }[] } | undefined)?.surfaces ?? null)
  let loaded: string | undefined
  const one = async (step: Step): Promise<Omit<Played, "changed" | "page">> => {
    switch (step.kind) {
      case "start":
        return {
          who: "harness",
          did: `the session ${step.source === "startup" ? "starts" : step.source === "resume" ? "resumes" : "starts again after a compaction"}`,
          tellings: await hook("SessionStart", { source: step.source, ...(step.source !== "compact" && { model: "claude-opus-5-5" }) }),
        }
      case "say":
        return { who: "person", did: `says: ${step.text}`, tellings: await hook("UserPromptSubmit", { prompt: step.text }) }
      case "read": {
        const did = `${WORD} ${step.path}`
        const answer = await word([step.path])

        return { who: "agent", did, tellings: [answer, ...(await posted(did, answer))] }
      }
      case "call": {
        const args = [step.path, step.handle, ...argsOf(step.args)]
        const did = [WORD, ...args.map(quoted)].join(" ")
        const answer = await word(args)

        return { who: "agent", did, tellings: [answer, ...(await posted(did, answer))] }
      }
      case "program": {
        const answer = await word(["-e", step.code])

        return { who: "agent", did: `${WORD} -e …, a program: ${step.what}`, tellings: [answer, ...(await posted(`${WORD} -e '${step.code}'`, answer))] }
      }
      case "wait":
        waiting = word(["wait", String(step.seconds)])
        // The wait is under way at the door before anyone moves, as when the agent waits for the person.
        await nap(400)

        return { who: "agent", did: `${WORD} wait ${step.seconds}, and waits`, tellings: [] }
      case "waited": {
        const answer = await (waiting ?? Promise.resolve({ carrier: "no wait", text: "" }))

        waiting = undefined

        return { who: "agent", did: "the wait ends", tellings: [answer, ...(await posted(`${WORD} wait`, answer))] }
      }
      case "tool":
        return { who: "agent", did: `another tool: ${step.what}`, tellings: await posted(step.what) }
      case "act": {
        const answer = (await page(step.path, { handle: step.handle, args: step.args ?? {} })) as { outcome?: string; reason?: string } | undefined
        const args = Object.entries(step.args ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`)

        return {
          who: "person",
          did: `on the page: ${step.handle}${args.length ? ` ${args.join(" ")}` : ""} at ${step.path}${answer?.outcome === "refused" ? `, refused: ${answer.reason}` : ""}`,
          tellings: [],
        }
      }
      case "acts": {
        let refused = 0

        // One after another, as the person clicks them.
        for (const c of step.calls) if (((await page(c.path, { handle: c.handle, args: c.args ?? {} })) as { outcome?: string } | undefined)?.outcome === "refused") refused++

        return { who: "person", did: `on the page: ${step.what}${refused ? `, ${refused} refused` : ""}`, tellings: [] }
      }
      case "look": {
        const notices = (await page("/activity/notices")) as { entries?: { n: number }[] | string } | undefined
        const newest = Array.isArray(notices?.entries) ? Math.max(0, ...notices.entries.map((e) => e.n)) : 0

        if (newest) await page("/activity/notices", { handle: step.mark, args: { n: newest } })

        return {
          who: "person",
          did: step.mark === "seen" ? "marks every notice seen" : "opens the drawer of the newest notice's tab, which marks it seen",
          tellings: [],
        }
      }
      case "go": {
        const root = await page("/")
        const point = (root as { pointed?: Pointed } | undefined)?.pointed

        if (point && tabsOf(root).some((r) => r.at === placeOf(point.at).key)) at = placeOf(point.at).key

        return { who: "person", did: `goes where the agent pointed them${point ? `: ${point.at}` : ", but it pointed nowhere"}`, tellings: [] }
      }
      case "code": {
        const file = join(dir, ".baba/surfaces", step.surface, step.file)
        let text = readFileSync(file, "utf8")

        loaded = await descriptions()
        for (const [from, to] of step.edits) {
          if (!text.includes(from)) throw new Error(`${step.surface}/${step.file} has no ${JSON.stringify(from)} to change`)
          text = text.replace(from, to)
        }
        writeFileSync(file, text)

        return { who: "project", did: `the code changes: ${step.what}`, tellings: [] }
      }
      case "reloaded": {
        const until = Date.now() + RELOAD_MS

        while (Date.now() < until && (await descriptions()) === loaded) await nap(50)

        const seen = (await descriptions()) !== loaded

        return {
          who: "root",
          did: seen ? "the root has loaded the changed code" : `the root did not show the changed code within ${RELOAD_MS / 1000}s`,
          tellings: [],
          ...(!seen && { timing: "the reload was not seen in time" }),
        }
      }
      case "pause":
        // Passed at once, on the demo's clock.
        ahead += step.seconds * 1000
        writeFileSync(join(dir, AHEAD), String(ahead))

        return { who: "root", did: `${step.seconds} seconds pass with no call, as while the agent thinks`, tellings: [] }
      case "hooks":
        hooked = step.on

        return { who: "harness", did: step.on ? "the harness runs the hooks again" : "the harness stops running the hooks", tellings: [] }
      case "build": {
        appendFileSync(join(dir, BUILD), `${step.line}\n`)

        // Moved once the page shows it: the build's command reads the file every few milliseconds.
        const at = tabOf(before.root, "build")
        const status = step.line.split(":")[0]

        for (let i = 0; at && i < 100; i++) {
          if (((await page(at)) as { status?: string } | undefined)?.status === status) break
          await nap(20)
        }

        return { who: "surface", did: `the build moves by itself: ${step.line}`, tellings: [] }
      }
      case "stop":
        return { who: "harness", did: "the agent's turn ends", tellings: await hook("Stop", { stop_hook_active: false }) }
      case "sleep":
        await run([join(dir, WORD), "close"])
        for (let i = 0; endpoint() && i < 100; i++) await nap(20)

        return { who: "root", did: "the root goes to sleep, as when nothing called it for a while", tellings: [] }
    }
  }

  try {
    for (const step of scenario.steps as Scripted[]) {
      if (signal?.aborted) throw new Error("stopped")

      const unhooked = !hooked && ["start", "say", "read", "call", "program", "waited", "tool", "stop"].includes(step.kind)
      const done = { ...(await one(step)), ...(step.timing && { timing: step.timing }), ...(unhooked ? { unhooked: true as const } : {}) }
      const after = await look()

      const shown = after.root === undefined ? undefined : shownAfter(step, before.root, after.root)
      const page: Page =
        after.root === undefined ? { ...(steps.at(-1)?.page ?? { tabs: [] }), asleep: true } : { tabs: after.tabs, ...(shown && { shown }) }

      steps.push({ ...done, changed: [...after.activity, ...(after.root === undefined ? [] : changes(before.root, after.root))], page })
      if (after.root !== undefined) before = after
    }

    return { name: scenario.name, steps }
  } catch (error) {
    return { name: scenario.name, steps, error: signal?.aborted ? "stopped" : error instanceof Error ? error.message : String(error) }
  } finally {
    await waiting?.catch(() => {})
    if (endpoint()) await run([join(dir, WORD), "close"], undefined, AbortSignal.timeout(10_000)).catch(() => "")
    for (let i = 0; endpoint() && i < 100; i++) await sleep(20)
  }
}
