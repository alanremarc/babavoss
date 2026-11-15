// The lab's outside: a throwaway sandbox project with the surfaces under test, and one headless Claude Code process in it,
// spoken to as JSON lines. The surface reaches it only through `Harness`, so its specs put a fake in its place.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { Json } from "babavoss/core/index.ts"

/** The agent under test: its stdin, its stream of events, and its end. */
export type Agent = {
  write(line: Json): void
  lines: AsyncIterable<Json>
  exited: Promise<{ code: number | null; stderr: string }>
  kill(): void
}
export type Harness = {
  /** Makes a sandbox project and answers with its directory. */
  make(): Promise<string>
  /** Starts the agent under test in the sandbox, as session `session`. */
  spawn(sandbox: string, session: string, model: string): Agent
  /** The address of the sandbox's root page for the session, once its root is up. */
  page(sandbox: string, session: string): string | undefined
  /** Closes the sandbox's root and deletes the sandbox. */
  remove(sandbox: string, session: string): Promise<void>
}

/** This checkout: the framework the lab's .baba/ links, which the sandbox links too. */
const CHECKOUT = realpathSync(fileURLToPath(new URL("../../../node_modules/babavoss", import.meta.url)))
/** The surfaces beside this one, of which the sandbox takes a copy. */
const SURFACES = fileURLToPath(new URL("../../", import.meta.url))
const PREFIX = "baba-lab-"
const BUDGET_USD = "0.50"

/** The environment of what runs in a sandbox: none of this session's own identity, or the child takes it for its own. */
const OWN = /^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_AGENT_SDK|CLAUDE_EFFORT|AI_AGENT|BABAVOSS_|CODEX_)/
export const cleanEnv = (env: NodeJS.ProcessEnv = process.env): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !OWN.test(entry[0])))

const endpoint = (sandbox: string, session: string) => join(sandbox, ".babavoss/sessions", session, "baba/service.json")
const service = (sandbox: string, session: string): { port: number; token: string } | undefined => {
  try {
    return JSON.parse(readFileSync(endpoint(sandbox, session), "utf8")) as { port: number; token: string }
  } catch {
    return undefined
  }
}
const baba = (sandbox: string, args: string[]) => {
  const done = Bun.spawnSync([process.execPath, join(CHECKOUT, "bin/baba.ts"), ...args], {
    cwd: join(sandbox, ".baba"),
    env: cleanEnv(),
    stdout: "pipe",
    stderr: "pipe",
  })

  if (done.exitCode !== 0) throw new Error(`baba ${args.join(" ")} failed in the sandbox: ${done.stderr.toString().trim()}`)
}

/** JSON lines from a byte stream; a line that is not JSON is passed over. */
async function* jsonLines(stream: ReadableStream<Uint8Array>): AsyncIterable<Json> {
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })

    let nl: number

    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()

      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        yield JSON.parse(line) as Json
      } catch {}
    }
  }
}

export const claude: Harness = {
  async make() {
    const sandbox = realpathSync(mkdtempSync(join(tmpdir(), PREFIX)))
    const dot = join(sandbox, ".baba")
    const modules = join(dot, "node_modules")

    try {
      mkdirSync(modules, { recursive: true })
      writeFileSync(join(dot, "package.json"), `${JSON.stringify({ name: "surfaces", version: "0.1.0", private: true, type: "module" }, null, 2)}\n`)
      symlinkSync(CHECKOUT, join(modules, "babavoss"))
      // What the page is built from, as installing a release would put beside it: the checkout's own dependencies, linked.
      for (const name of readdirSync(join(CHECKOUT, "node_modules")))
        if (!name.startsWith(".") && !existsSync(join(modules, name))) symlinkSync(join(CHECKOUT, "node_modules", name), join(modules, name))
      Bun.spawnSync(["git", "init", "-q"], { cwd: sandbox })
      baba(sandbox, ["new", "greeting"])
      cpSync(join(SURFACES, "queue"), join(dot, "surfaces/queue"), { recursive: true })
      baba(sandbox, ["provision"])
    } catch (error) {
      rmSync(sandbox, { recursive: true, force: true })
      throw error
    }

    return sandbox
  },
  spawn(sandbox, session, model) {
    const child = Bun.spawn(
      [
        "claude",
        "-p",
        ...["--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-hook-events", "--replay-user-messages"],
        ...["--session-id", session, "--model", model, "--permission-mode", "bypassPermissions", "--max-budget-usd", BUDGET_USD],
        ...["--setting-sources", "project,local", "--strict-mcp-config"],
      ],
      { cwd: sandbox, env: cleanEnv(), stdin: "pipe", stdout: "pipe", stderr: "pipe" }
    )

    return {
      write(line) {
        child.stdin.write(`${JSON.stringify(line)}\n`)
        child.stdin.flush()
      },
      lines: jsonLines(child.stdout),
      exited: Promise.all([child.exited, new Response(child.stderr).text()]).then(([code, stderr]) => ({ code, stderr: stderr.trim() })),
      kill: () => child.kill(),
    }
  },
  page(sandbox, session) {
    const found = service(sandbox, session)

    return found && `http://127.0.0.1:${found.port}/`
  },
  async remove(sandbox, session) {
    // Only what the lab made: a directory of its own in the system's temporary one.
    if (!sandbox.startsWith(realpathSync(tmpdir()) + sep + PREFIX) || !existsSync(sandbox)) return

    const found = service(sandbox, session)

    if (found)
      await fetch(`http://127.0.0.1:${found.port}/_/close`, {
        method: "POST",
        headers: { accept: "text/plain", "babavoss-service": found.token },
        signal: AbortSignal.timeout(5000),
      })
        .then((answer) => answer.body?.cancel())
        .catch(() => {})
    rmSync(sandbox, { recursive: true, force: true })
  },
}
