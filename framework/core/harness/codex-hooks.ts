// Reviews Baba's project hooks through the Codex app server and records the exact hashes the person reviewed.
import { realpathSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { Readable } from "node:stream"
import { createInterface } from "node:readline"
import { hookCommand, isObject } from "./setup.ts"

type Hook = { key: string; eventName: string; command: string; sourcePath: string; currentHash: string; trustStatus: string }
export type CodexHookReview =
  | { status: "unavailable"; reason: string }
  | { status: "approved" }
  | { status: "review"; hooks: Pick<Hook, "command" | "eventName" | "sourcePath">[]; review?: string }

const asObject = (value: unknown) => (isObject(value) ? value : {})
const FALLBACK = "In an interactive Codex session for this checkout, run /hooks to review Baba’s hooks."

/** One local app-server connection, limited to the lifetime of this read or approval. */
async function withCodex<T>(project: string, use: (rpc: Rpc, canWrite: boolean) => Promise<T>): Promise<T> {
  const command = Bun.which("codex")

  if (!command) throw new Error("Codex CLI is unavailable.")

  const child = Bun.spawn([command, "app-server", "--listen", "stdio://"], {
    cwd: project, stdin: "pipe", stdout: "pipe", stderr: "ignore", signal: AbortSignal.timeout(5000),
  })
  const lines = createInterface({ input: Readable.from(child.stdout) })
  const incoming = lines[Symbol.asyncIterator]()
  let id = 0

  const send = (message: object) => {
    child.stdin.write(`${JSON.stringify(message)}\n`)
    child.stdin.flush()
  }
  const rpc: Rpc = async (method, params) => {
    const request = ++id

    send({ id: request, method, params })
    for (;;) {
      const { done, value } = await incoming.next()

      if (done) throw new Error("Codex stopped answering.")

      const message = asObject(JSON.parse(value))

      if (message.id !== request) continue
      if (message.error) throw new Error("Codex could not complete the hook request.")

      return asObject(message.result)
    }
  }

  try {
    const { userAgent } = await rpc("initialize", { clientInfo: { name: "babavoss", version: "1" }, capabilities: { experimentalApi: true } })

    send({ method: "initialized" })
    // shortcut: the trust record is version-specific, add versions once their read and write have been verified.
    return await use(rpc, typeof userAgent === "string" && /^[^/]+\/0\.172\.0(?:\s|$)/.test(userAgent))
  } finally {
    child.kill()
    lines.close()
    await child.exited
  }
}

type Rpc = (method: string, params: object) => Promise<Record<string, unknown>>

/** Codex can give a linked worktree the hook file of its main checkout. */
function hookFiles(project: string): Set<string> {
  const files = new Set([join(realpathSync(project), ".codex/hooks.json")])
  const git = Bun.which("git")

  if (git) {
    const common = Bun.spawnSync([git, "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: project, stderr: "ignore" })
    const dir = common.stdout.toString().trim()

    if (common.success && basename(dir) === ".git") files.add(join(realpathSync(dirname(dir)), ".codex/hooks.json"))
  }

  return files
}

/** The enabled hooks in Codex's project layer whose command is exactly the one Baba provisions. */
async function hooksAt(rpc: Rpc, project: string, files: Set<string>): Promise<Hook[]> {
  const { data } = await rpc("hooks/list", { cwds: [project] })
  const hooks = Array.isArray(data) ? asObject(data[0]).hooks : undefined

  if (!Array.isArray(hooks)) throw new Error("Codex did not report project hooks.")

  return hooks.filter((hook: unknown): hook is Hook => {
    const h = asObject(hook)

    return h.source === "project" && h.enabled === true && h.handlerType === "command" && h.command === hookCommand("codex") &&
      typeof h.sourcePath === "string" && files.has(h.sourcePath) && typeof h.key === "string" && h.key.startsWith(`${h.sourcePath}:`) &&
      typeof h.eventName === "string" && typeof h.trustStatus === "string" && typeof h.currentHash === "string" && /^sha256:[a-f0-9]{64}$/.test(h.currentHash)
  }).sort((a, b) => a.key.localeCompare(b.key))
}

const pending = (hooks: Hook[]) => hooks.filter((hook) => hook.trustStatus === "untrusted" || hook.trustStatus === "modified")
const reviewOf = (hooks: Hook[]) => Bun.CryptoHasher.hash("sha256", JSON.stringify(hooks.map(({ key, currentHash }) => [key, currentHash])), "hex")

/** Read the review, or record its hashes if the same hooks are still waiting for approval. */
export async function codexHookReview(project: string, reviewed?: string): Promise<CodexHookReview> {
  try {
    const files = hookFiles(project)

    return await withCodex(project, async (rpc, canWrite) => {
      const hooks = await hooksAt(rpc, project, files)
      const waiting = pending(hooks)
      const review = reviewOf(waiting)

      if (!hooks.length) throw new Error("Codex found no enabled Baba hooks. Check that the project is trusted and Baba is provisioned.")
      if (hooks.every(({ trustStatus }) => trustStatus === "trusted")) return { status: "approved" }
      if (reviewed !== undefined) {
        if (!canWrite || !waiting.length || reviewed !== review) throw new Error("The review changed or this Codex version needs its own hook review.")

        const value = Object.fromEntries(waiting.map(({ key, currentHash }) => [key, { trusted_hash: currentHash }]))

        await rpc("config/batchWrite", { edits: [{ keyPath: "hooks.state", mergeStrategy: "upsert", value }] })

        const after = await hooksAt(rpc, project, files)

        if (after.length && after.every(({ trustStatus }) => trustStatus === "trusted")) return { status: "approved" }

        throw new Error("Codex did not confirm approval. Refresh the review.")
      }
      if (!waiting.length) throw new Error("Codex reported an unsupported trust status.")

      return { status: "review", hooks: waiting.map(({ command, eventName, sourcePath }) => ({ command, eventName, sourcePath })), ...(canWrite && { review }) }
    })
  } catch (error) {
    return { status: "unavailable", reason: `${error instanceof Error ? error.message : "Codex could not be reached."} ${FALLBACK}` }
  }
}
