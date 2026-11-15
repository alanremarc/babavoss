// What the framework tells the agent unasked, through the harness's hooks: at a session's start, what invoking the skill
// baba would, its text and the root's answer, the root started; after each tool call, what was heard in an open root since
// the agent was last told, one line each: notices, and where the person acted; with each message of the person, that and
// then what changed at / since the agent was last told it, by who changed it: the person on its page, the surface by itself,
// or the agent with them. What the agent's own calls alone changed or gave, their answers told it. It steers and informs,
// and blocks nothing: a hook that finds nothing says nothing, and one that fails is silent.
// Each hook also tells the open roots whose move it is (turn.ts): a message starts the agent's turn, a tool call is work,
// a stop ends it, the session's end leaves it unknown; a stop and a session's end add no context and never keep the agent
// from stopping.
import { readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ACTOR_HEADER, ENDPOINT_FILE, load, registryFile, SERVICE_HEADER, type OpenRoot } from "./bv/bv.ts"
import type { TurnEvent } from "./runtime/turn.ts"

/** What a harness gives a hook on standard input; Claude Code's names. */
export type HookInput = { session_id?: string; hook_event_name?: string; source?: string }
type Endpoint = { port: number; token: string; dir: string }

/** What each hook's event tells of the turn. An API error ends a turn as a stop does. */
const TURNS: Record<string, TurnEvent> = { UserPromptSubmit: "started", PostToolUse: "working", Stop: "ended", StopFailure: "ended", SessionEnd: "gone" }

/** What a hook's event tells of the turn: a session that starts or resumes waits for the person; one compacted may be mid-turn, so it says nothing. */
export const turnOf = (input: HookInput): TurnEvent | undefined =>
  TURNS[input.hook_event_name ?? ""] ?? (input.hook_event_name === "SessionStart" && input.source !== "compact" ? "ended" : undefined)

const ROOT = fileURLToPath(new URL("../shell/scripts/open.ts", import.meta.url))
const SKILL = fileURLToPath(new URL("../../skill/SKILL.md", import.meta.url))

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
export async function hookContext(input: HookInput, baba: string): Promise<string | undefined> {
  const session = input.session_id

  if (!session || !/^[A-Za-z0-9._-]+$/.test(session)) return undefined
  process.env.BABAVOSS_HOME ??= homeOf(baba)

  const roots = () => Object.entries(load<Record<string, OpenRoot>>(registryFile(session)) ?? {})
  const lines: string[] = []
  const turn = turnOf(input)
  // Whose move it is, told before what changed is read, so the page counts nothing as waiting once the turn has it.
  const tell = async () => {
    if (turn) await Promise.all(roots().map(([, root]) => tellTurn(root, session, turn).catch(() => {})))
  }

  if (input.hook_event_name === "SessionStart") {
    // What invoking the skill baba gives, given unasked: its text, and the root started, which the skill would have the
    // agent do. The root's answer is its version, its page's address, the roots and the tabs open in this session.
    const root = Bun.spawnSync([process.execPath, ROOT, "--session", session], { stdout: "pipe", stderr: "ignore", env: process.env, timeout: 20_000 })
    const answer = root.stdout.toString().trim()

    lines.push(readFileSync(SKILL, "utf8").replace(/^---\n[\s\S]*?\n---\n+/, "").trim())
    if (root.exitCode === 0 && answer) lines.push(`The root of .baba/ was started for this session, and answered:\n${answer}`)
    await tell()
  } else if (turn === "ended" || turn === "gone") await tell()
  else {
    const tells = TELLS[input.hook_event_name ?? ""] ?? TELLS.UserPromptSubmit!

    await tell()
    for (const [name, root] of roots()) {
      const text = await changed(root, session, tells.ask).catch(() => undefined)

      if (text) lines.push(`${tells.lead(name === "baba" ? "the root of .baba/" : `the root ${name}`)}\n${text}`)
    }
  }

  return lines.length ? lines.join("\n\n") : undefined
}

/** A hook's standard output: plain text is context at a session's start and with a prompt; after a tool call it is named as such. */
export const hookOutput = (input: HookInput, context: string): string =>
  input.hook_event_name === "PostToolUse" ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }) : context
