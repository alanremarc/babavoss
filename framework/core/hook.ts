// What the framework tells the agent unasked, through the harness's hooks: at a session's start, the root's answer, which
// starts its runtime, and which roles the session has open; with each message of the person and after each tool call, what changed in
// an open role since the session was last answered, as when the person acted on its page. It steers and informs, and
// blocks nothing: a hook that finds nothing says nothing, and one that fails is silent.
import { realpathSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ACTOR_HEADER, ENDPOINT_FILE, load, registryFile, SERVICE_HEADER, type OpenRole } from "./bv/bv.ts"

/** What a harness gives a hook on standard input; Claude Code's names. */
export type HookInput = { session_id?: string; hook_event_name?: string; source?: string }
type Endpoint = { port: number; token: string; dir: string }

const ROOT = fileURLToPath(new URL("../root/scripts/open.ts", import.meta.url))

/** Where the roles of a .baba/ keep what their sessions write: beside it, or in the person's home's own place. */
export const homeOf = (baba: string) => join(dirname(baba) === realpathSync(homedir()) ? homedir() : dirname(baba), ".babavoss")

/** What changed in an open role since the session was last answered; undefined where nothing did, or its runtime is asleep. */
async function changed(role: OpenRole, session: string): Promise<string | undefined> {
  const endpoint = load<Endpoint>(join(role.state, ENDPOINT_FILE))

  if (!endpoint || endpoint.dir !== role.state) return undefined

  const answer = await fetch(`http://127.0.0.1:${endpoint.port}/_/wait?seconds=0`, {
    headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: `agent:${session}` },
    signal: AbortSignal.timeout(2000),
  })
  const text = (await answer.text()).trim()

  return answer.ok && text && text !== "nothing changed" ? text : undefined
}

/** The context a hook adds for the agent, for the roles of `baba`, a .baba/ directory; undefined when there is none to add. */
export async function hookContext(input: HookInput, baba: string): Promise<string | undefined> {
  const session = input.session_id

  if (!session || !/^[A-Za-z0-9._-]+$/.test(session)) return undefined
  process.env.BABAVOSS_HOME ??= homeOf(baba)

  const roles = Object.entries(load<Record<string, OpenRole>>(registryFile(session)) ?? {})
  const lines: string[] = []

  if (input.hook_event_name === "SessionStart") {
    // The root is started with the session, roles or none: its answer is its version, its page's address and the roles.
    const root = Bun.spawnSync([process.execPath, ROOT, "--session", session], { stdout: "pipe", stderr: "ignore", env: process.env, timeout: 20_000 })
    const answer = root.stdout.toString().trim()

    if (root.exitCode === 0 && answer) lines.push(answer)
    // A session that goes on, resumed or compacted, may no longer hold what its open roles last answered.
    for (const [name, role] of roles.filter(([name]) => name !== "baba")) lines.push(`The role ${name} is open in this session. Its current state is read with \`${role.command ?? `bv ${name}`} /\`.`)
  } else
    for (const [name, role] of roles) {
      const text = await changed(role, session).catch(() => undefined)

      if (text) lines.push(`The role ${name} changed since this session last read it; the person may have acted on its page:\n${text}`)
    }

  return lines.length ? lines.join("\n\n") : undefined
}

/** A hook's standard output: plain text is context at a session's start and with a prompt; after a tool call it is named as such. */
export const hookOutput = (input: HookInput, context: string): string =>
  input.hook_event_name === "PostToolUse" ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }) : context
