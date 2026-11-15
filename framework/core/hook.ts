// What the framework tells the agent unasked, through the harness's hooks: at a session's start, what invoking the skill
// baba would, its text and the shell's answer, the shell started; where the session had the text before, as after a
// compaction or a resume, the text's reminder in its place (wordsFor); after each tool call, what was heard in an open root since
// the agent was last told, one line each: notices, and where the person acted; with each message of the person, that and
// then what changed at / since the agent was last told it, by who changed it: the person on its page, the surface by itself,
// or the agent with them. What the agent's own calls alone changed or gave, their answers told it. It steers and informs,
// and blocks nothing: a hook that finds nothing says nothing, and one that fails is silent.
// Each hook also tells the open roots whose move it is (turn.ts): a message starts the agent's turn, a tool call is work,
// a stop ends it, the session's end leaves it unknown; a stop and a session's end add no context and never keep the agent
// from stopping. Nothing here knows a harness: its adapter reads the hook's input as the framework's moment, and prints what
// is told as the harness takes it (harness/).
import { readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ACTOR_HEADER, ENDPOINT_FILE, load, registryFile, SERVICE_HEADER, type OpenRoot } from "./bv/bv.ts"
import type { HookEvent, Source } from "./harness/harness.ts"
import type { TurnEvent } from "./runtime/turn.ts"

type Endpoint = { port: number; token: string; dir: string }

/** What each moment tells of the turn. */
const TURNS: Record<string, TurnEvent> = { UserPromptSubmit: "started", PostToolUse: "working", Stop: "ended", SessionEnd: "gone" }

/** What a moment tells of the turn: a session that starts or resumes waits for the person; one compacted may be mid-turn, so it says nothing. */
export const turnOf = (event: HookEvent): TurnEvent | undefined =>
  TURNS[event.moment] ?? (event.moment === "SessionStart" && event.source !== "compact" ? "ended" : undefined)

/**
 * Which of baba's words a session's start is given: the whole, where the agent has not had them, as in a new or cleared
 * session or where the harness does not say; their reminder, where it had them and they are in its context or its summary.
 */
export const wordsFor = (source: Source | undefined): "whole" | "reminder" => (source === "compact" || source === "resume" || source === "fork" ? "reminder" : "whole")

const ROOT = fileURLToPath(new URL("../shell/scripts/open.ts", import.meta.url))
const WORDS = { whole: fileURLToPath(new URL("../../skill/SKILL.md", import.meta.url)), reminder: fileURLToPath(new URL("../../skill/reminder.md", import.meta.url)) }

/** Where the roots of a .baba/ keep what their sessions write: beside it, or in the person's home's own place. */
export const homeOf = (baba: string) => join(dirname(baba) === realpathSync(homedir()) ? homedir() : dirname(baba), ".babavoss")

/** The endpoint of an open root's runtime; undefined where it is asleep. */
const endpointOf = (root: OpenRoot) => {
  const endpoint = load<Endpoint>(join(root.state, ENDPOINT_FILE))

  return endpoint && endpoint.dir === root.state ? endpoint : undefined
}

/** Tells an open root's runtime of the turn; one asleep is not woken for it, since its page is closed too. */
async function tellTurn(root: OpenRoot, session: string, event: TurnEvent) {
  const endpoint = endpointOf(root)

  if (!endpoint) return
  await fetch(`http://127.0.0.1:${endpoint.port}/_/turn`, {
    method: "POST",
    headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: `agent:${session}` },
    body: event,
    signal: AbortSignal.timeout(1000),
  })
}

/** What each event asks of an open root, and how it is led: after a tool call what was heard alone; with a message, the present's changes too. */
export const TELLS: Record<string, { ask: string; lead: (of: string) => string }> = {
  PostToolUse: { ask: "/_/wait?seconds=0&tell=notices", lead: (of) => `Heard in ${of} while you worked:` },
  UserPromptSubmit: { ask: "/_/wait?seconds=0", lead: (of) => `In ${of}: what was heard, then what changed at / since you were last told it, by who changed it:` },
}

/** What an open root has to tell at `ask`; undefined where it has nothing, or its runtime is asleep. */
async function changed(root: OpenRoot, session: string, ask: string): Promise<string | undefined> {
  const endpoint = endpointOf(root)

  if (!endpoint) return undefined

  const answer = await fetch(`http://127.0.0.1:${endpoint.port}${ask}`, {
    headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: `agent:${session}` },
    signal: AbortSignal.timeout(2000),
  })
  const text = (await answer.text()).trim()

  return answer.ok && text && text !== "nothing changed" ? text : undefined
}

/** The context a hook adds for the agent, for the roots of `baba`, a .baba/ directory; undefined when there is none to add. */
export async function hookContext(input: HookEvent, baba: string): Promise<string | undefined> {
  const session = input.session

  if (!session || !/^[A-Za-z0-9._-]+$/.test(session)) return undefined
  process.env.BABAVOSS_HOME ??= homeOf(baba)

  const roots = () => Object.entries(load<Record<string, OpenRoot>>(registryFile(session)) ?? {})
  const lines: string[] = []
  const turn = turnOf(input)
  // Whose move it is, told before what changed is read, so the page counts nothing as waiting once the turn has it.
  const tell = async () => {
    if (turn) await Promise.all(roots().map(([, root]) => tellTurn(root, session, turn).catch(() => {})))
  }

  if (input.moment === "SessionStart") {
    // What invoking the skill baba gives, given unasked: its text, and the shell started, which the skill would have the
    // agent do. The shell's answer is its version, its page's address, the surfaces and the tabs open in this session.
    const root = Bun.spawnSync([process.execPath, ROOT, "--session", session], { stdout: "pipe", stderr: "ignore", env: process.env, timeout: 20_000 })
    const answer = root.stdout.toString().trim()

    lines.push(readFileSync(WORDS[wordsFor(input.source)], "utf8").replace(/^---\n[\s\S]*?\n---\n+/, "").trim())
    if (root.exitCode === 0 && answer) lines.push(`The shell of .baba/ was started for this session, and answered:\n${answer}`)
    await tell()
  } else if (turn === "ended" || turn === "gone") await tell()
  else {
    const tells = TELLS[input.moment] ?? TELLS.UserPromptSubmit!

    await tell()
    for (const [name, root] of roots()) {
      const text = await changed(root, session, tells.ask).catch(() => undefined)

      if (text) lines.push(`${tells.lead(name === "baba" ? "the shell of .baba/" : `the root ${name}`)}\n${text}`)
    }
  }

  return lines.length ? lines.join("\n\n") : undefined
}
