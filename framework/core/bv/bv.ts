#!/bin/sh
// 2>/dev/null; exec bun --loader :ts "$0" --word "${0##*/}" "$@"
// The standalone session client, copied into the home’s bin or beside Bun; no root code or framework imports.
import { readFileSync, mkdirSync, writeFileSync, renameSync, openSync, closeSync, statSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"

export const VERSION = 19
export const SERVICE_HEADER = "babavoss-service"
export const ACTOR_HEADER = "babavoss-actor"
export const PROBE_HEADER = "babavoss-probe"
export const STALE_HEADER = "babavoss-stale"
export const CALL_HEADER = "babavoss-call"
export const CALL_ID_HEADER = "babavoss-call-id"
export const ENDPOINT_FILE = "service.json"
/** How long a live runtime may refuse connections before it is taken for deaf: longer than one takes to close its door. */
export const DEAF_MS = 10_000
export type OpenRoot = { directory: string; entry: string; state: string; command?: string; page?: string }
export const registryFile = (session: string) => join(process.env.BABAVOSS_HOME ?? join(homedir(), ".babavoss"), "sessions", session, "open.json")
export const load = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}
export function save(file: string, value: unknown) {
  mkdirSync(join(file, ".."), { recursive: true })

  const temporary = `${file}.${process.pid}.tmp`

  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
  renameSync(temporary, file)
}
export function sessionArgs(args: string[]) {
  const at = args.indexOf("--session")
  const explicit = at < 0 ? undefined : args.splice(at, 2)[1]

  if (at >= 0 && !explicit) throw new SyntaxError("--session requires ID")

  const { CLAUDE_CODE_SESSION_ID: claude, CODEX_THREAD_ID: codex } = process.env

  if (!explicit && claude && codex) throw new SyntaxError("CLAUDE_CODE_SESSION_ID and CODEX_THREAD_ID require --session ID")

  const session = explicit ?? (claude || codex)

  if (!session) throw new SyntaxError("run this from an agent's shell or pass --session ID")
  if (!/^[A-Za-z0-9._-]+$/.test(session) || session === "." || session === "..") throw new SyntaxError("invalid session ID")

  return session
}

/** Whether a run in `session`'s name is its agent's own: run from that session of its harness, as its environment says. */
export const ownRun = (session: string, env: NodeJS.ProcessEnv = process.env) => env.CLAUDE_CODE_SESSION_ID === session || env.CODEX_THREAD_ID === session

/** A call's value that names a file: @ and a path, absolute, relative or from home. Text that begins so is given with @-. */
const FILE_ARG = /^@(\/|\.\.?\/|~\/)/
const fileArg = (path: string) => {
  const file = resolve(path.startsWith("~/") ? join(homedir(), path.slice(2)) : path)

  try {
    if (statSync(file).isFile()) return readFileSync(file, "utf8")
  } catch {}
  throw new SyntaxError(`no file at ${file}: a value @PATH is read from that file; give text that begins with @ by name=@- on standard input`)
}

/**
 * The name every call of one program carries, as CALL_ID_HEADER: a caller's own name for its calls, here `program:` and the
 * run's, so the log keeps the program's calls as one move. The shell's activity reads the same prefix (thread.ts).
 */
export const PROGRAM = "program:"

/** One call of a program as it was answered: done with what it changed, or refused with why. */
export type Answered = { path: string; handle: string; args: Record<string, string>; changed?: string; refused?: string }

/** How many places of one group are named before the rest are elided; the count says how many in all. */
const NAMED = 10

/** Paths that differ only in their last part, as one: /q/issues/{3,5,6}; past NAMED, the first of them and an ellipsis. */
const together = (paths: string[]) => {
  const parts = paths.map((p) => [p.slice(0, p.lastIndexOf("/") + 1), p.slice(p.lastIndexOf("/") + 1)] as const)
  const head = parts[0]![0]
  const tails = parts.map(([, t]) => t)
  const listed = tails.length > NAMED ? [...tails.slice(0, NAMED - 2), "…"] : tails

  return paths.length > 1 && parts.every(([h]) => h === head) ? `${head}{${listed.join(",")}}` : paths.join(" ")
}

/** An answer of the text door split: its own lines, and what was heard meanwhile, under `notices:`. */
const split = (text: string): [string, string[]] => {
  const [own = "", ...rest] = text.split(/^notices:$/m)

  return [own.trim(), rest.join("\n").split("\n").filter((line) => line.trim())]
}

/** A call's argument as the summary writes it: a plain word as is, anything else quoted, a long one cut. */
const argument = (value: string) => (/^[\w.,:/@+-]+$/.test(value) ? value : JSON.stringify(value.length > 40 ? `${value.slice(0, 39)}…` : value))

/**
 * The answer to a program's calls, after what it printed: how many were done and refused; the calls done, grouped where
 * the same handle changed the same, each change as the present tells it; each refusal with its inputs and its reason;
 * where the program ended at a refusal, that no call after it was made; and what was heard meanwhile, once.
 */
export function summed(calls: Answered[], stopped = false): string {
  const groups = new Map<string, { handle: string; changed: string; paths: string[] }>()
  const heard: string[] = []
  const refusals: string[] = []

  for (const call of calls) {
    const [said, notices] = split(call.refused ?? call.changed ?? "")

    for (const line of notices) if (!heard.includes(line)) heard.push(line)
    if (call.refused !== undefined) {
      refusals.push(`refused: ${call.path} ${[call.handle, ...Object.entries(call.args).map(([k, v]) => `${k}=${argument(v)}`)].join(" ")}: ${said.replace(/^refused: /, "")}`)
      continue
    }

    const changed = said.split("\n").filter(Boolean).join("; ") || "nothing changed"
    const key = `${call.handle}\0${changed}`

    groups.get(key)?.paths.push(call.path) ?? groups.set(key, { handle: call.handle, changed, paths: [call.path] })
  }

  const done = calls.length - refusals.length

  return [
    `${done} call${done === 1 ? "" : "s"} done${refusals.length ? `, ${refusals.length} refused` : ""}`,
    ...[...groups.values()].map((g) => `${together(g.paths)} ${g.handle}${g.paths.length > 1 ? ` ×${g.paths.length}` : ""}: ${g.changed}`),
    ...refusals,
    ...(stopped ? ["the refusal ended the program: no call after it was made"] : []),
    ...(heard.length ? ["notices:", ...heard] : []),
  ].join("\n")
}

/**
 * A view as a program reads it: its facts as they are, each offered action as `{ handle, args, inputs }`, the handle to
 * call, its fixed args and its open inputs, each input an object, `{ type }` now, so what more an input says of itself
 * later, as a kind or its choices, is a field beside its type and no break.
 */
export function shaped(view: unknown): unknown {
  if (Array.isArray(view)) return view.map(shaped)
  if (!view || typeof view !== "object") return view

  const value = view as Record<string, unknown>

  if (value.kind === "handle" && typeof value.name === "string") {
    const open = (value.open ?? {}) as Record<string, unknown>

    return {
      handle: value.name,
      args: value.args ?? {},
      inputs: Object.fromEntries(Object.entries(open).map(([k, v]) => [k, typeof v === "string" ? { type: v } : v])),
    }
  }

  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shaped(v)]))
}

/** A program's path: one that begins with / as it is, any other under `base`, the path given before -e; `.` and `..` worked out. */
export function under(base: string, path = ""): string {
  const parts: string[] = []

  for (const part of (path.startsWith("/") ? path : `${base}/${path}`).split("/")) {
    if (part === "..") parts.pop()
    else if (part && part !== ".") parts.push(part)
  }

  return `/${parts.join("/")}`
}

const guide = `bv — the roots open in this session
NAME PATH or bv NAME PATH — each root has its own command when its name is free
bv                         list open roots and their commands
NAME PATH                  read a view: demo /notes (or bv demo /notes)
NAME PATH HANDLE name=value  call: demo / add text=Pharmacy; text=@- reads standard input, text=@./note.md a file
bv NAME PATH               select a root: bv demo /notes
bv wait [SECONDS]          wait for the person: until something is heard or who is needed changes, then what changed: bv wait 60
bv sleep                   put the root to sleep once your work with it is over: its state is kept, the next call wakes it
bv restart                 restart, to run changed code: at once, or once the work under way ended, naming the instance
bv follow INSTANCE [SECONDS]  wait until that instance restarted, and say which one answers: bv follow 3f2a9c1b
bv [PATH] -e - <<'EOF'     a program, JavaScript or TypeScript, on standard input until EOF; a path before -e is the base
                           its relative paths are under: bv /notes -e - <<'EOF'
                           for (const note of (await read()).notes) await call(note.at, "remind", {seconds: 60})
                           EOF
bv -e CODE                 a one-line program as one word; a quote inside it ends the shell's, so prefer standard input
bv --session ID PATH       explicit session: bv --session work /notes
bv help                    this guide
For more than a few calls, run one program. In it: await read(path), a view as data, each action offered as
{ handle, args, inputs }; await call(path, handle, {name: value}), what the call changed, a refusal thrown; print(...).
A refusal ends the program unless it catches it; the calls before it stay done. The answer is what the program printed,
then one summary of its calls: how many were done, the same change once with its count, each refusal with why.
root.read(path) and root.call(path, handle, args), a view and an answer as JSON, root.wait(seconds) and root.page remain.
The program runs in this command's process, with the files and network the agent's shell has: no more, no less.
Stay under the harness's command run time limit.
Use wait for the person; use a timer only for what the root does not report.`

export async function bv(argv: string[], selected?: string, command = "bv"): Promise<number> {
  try {
    const args = [...argv]

    if (args[0] === "help") {
      const bin = command.includes("/") ? dirname(command.split(" ")[0]!) : undefined

      console.log(
        bin ? guide.replaceAll(/(?<!bv )\b(?:NAME|demo)\b/g, `${bin}/${selected ?? "NAME"}`).replaceAll(/\bbv\b/g, `${bin}/bv`) : guide
      )

      return 0
    }

    const session = sessionArgs(args)
    const file = registryFile(session)
    const roots = load<Record<string, OpenRoot>>(file) ?? {}
    const names = Object.keys(roots)

    if (!names.length) {
      console.log("nothing is open in this session; open a root through its skill")

      return 0
    }

    if (!selected && !args.length) {
      console.log(names.map((name) => `${name}: ${roots[name]!.command ?? `bv ${name}`}`).join("\n"))

      return 0
    }

    let name = selected

    if (!name && names.includes(args[0]!)) name = args.shift()
    if (!name && names.length === 1) name = names[0]
    if (!name) {
      console.log(names.map((name) => `${name}: ${roots[name]!.command ?? `bv ${name}`}`).join("\n"))
      if (args.length) throw new SyntaxError("name the root first: bv NAME PATH")

      return 0
    }

    const root = roots[name]

    if (!root) throw new SyntaxError(`root ${name} is not open in this session`)
    command = root.command ?? `bv ${name}`
    // A path before -e is the base the program's relative paths are under: `baba /queue -e -`.
    const base = args[1] === "-e" && args[0]?.startsWith("/") ? under("/", args.shift()) : "/"
    const [path, handle, ...values] = args
    let route = path ?? "/?open"
    let method = "GET"
    let body: string | undefined
    const program = path === "-e"

    // A program split into words was cut by the shell where a quote inside it ended the shell's quote: run, it would be a
    // program other than the one written.
    if (program && args.length > 2)
      throw new SyntaxError(
        `the program came as ${args.length - 1} words, not one: a quote inside it ended the shell's. Give it on standard input: ${command} -e - <<'EOF'`,
      )
    if (program && !handle) throw new SyntaxError(`${command} [PATH] -e - <<'EOF' with the program on standard input, or ${command} -e CODE`)
    // `close` is the word's old name, kept.
    if (path === "sleep" || path === "close") {
      if (args.length !== 1) throw new SyntaxError(`${command} sleep`)
      route = "/_/close"
      method = "POST"
    } else if (path === "restart") {
      if (args.length !== 1) throw new SyntaxError(`${command} restart`)
      route = "/_/restart"
      method = "POST"
    } else if (path === "follow") {
      if (args.length > 3 || !handle || !/^[0-9a-f]+$/.test(handle) || !Number.isFinite(Number(values[0] ?? 600)) || Number(values[0] ?? 600) < 0)
        throw new SyntaxError(`${command} follow INSTANCE [SECONDS]`)
    } else if (path === "wait") {
      const seconds = handle === undefined ? 600 : Number(handle)

      if (args.length > 2 || !Number.isFinite(seconds) || seconds < 0) throw new SyntaxError(`${command} wait [SECONDS]`)
      route = `/_/wait?seconds=${seconds}`
    } else if (!program && path !== undefined) {
      if (!path.startsWith("/") || path.startsWith("//")) throw new SyntaxError(`${command} PATH [HANDLE name=value…]`)
      route = path.split("/").map(encodeURIComponent).join("/")
      // A program comes after a path alone: one after a handle, as `/queue add -e -`, is neither a call nor a program.
      if (handle === "-e" || values.includes("-e")) throw new SyntaxError(`-e follows a path alone: ${command} ${path} -e - <<'EOF' with the program`)
      if (handle) {
        const inputs: Record<string, string> = {}
        let stdin: string | undefined

        for (const value of values) {
          const at = value.indexOf("=")

          if (at < 1) throw new SyntaxError("call arguments must be name=value")

          const text = value.slice(at + 1)

          inputs[value.slice(0, at)] = text === "@-" ? (stdin ??= readFileSync(0, "utf8")) : FILE_ARG.test(text) ? fileArg(text.slice(1)) : text
        }
        method = "POST"
        body = JSON.stringify({ handle, args: inputs })
      }
    }
    type Endpoint = { port: number; token: string; dir: string; pid: number; instance?: string; closing?: number }

    const refused = (error: unknown) =>
      [error, (error as { cause?: unknown } | undefined)?.cause].some((e) => (e as { code?: string } | undefined)?.code === "ECONNREFUSED")
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0)

        return true
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM"
      }
    }
    // A runtime alive with nothing listening at its port, since it said it was closing or since it was first seen so.
    let deaf: { endpoint: Endpoint; since: number } | undefined
    const find = async () => {
      const endpoint = load<Endpoint>(join(root.state, ENDPOINT_FILE))

      if (!endpoint || endpoint.dir !== root.state) return
      try {
        const response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
          headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token, [PROBE_HEADER]: "1" },
          signal: AbortSignal.timeout(300),
        })

        await response.body?.cancel()
        deaf = undefined
        if (response.headers.get(SERVICE_HEADER) === endpoint.token && !response.headers.has(STALE_HEADER)) return endpoint
      } catch (error) {
        // A probe is answered at once, even while requests are held: only a refused connection says nothing listens.
        if (refused(error) && alive(endpoint.pid)) {
          const seen = deaf?.endpoint.token === endpoint.token ? deaf.since : Date.now()

          deaf = { endpoint, since: typeof endpoint.closing === "number" ? Math.min(endpoint.closing, seen) : seen }
        } else deaf = undefined
      }
    }
    /**
     * Ends the deaf runtime the service file names: only that process, and only where its command line says it is this
     * session's runtime of this root; SIGTERM, then SIGKILL. Answers whether it is gone, leaving the session's lock free.
     */
    const replace = async ({ pid }: Endpoint) => {
      const listed = spawnSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 1000 })
      const entries = new Set([root.entry])
      const gone = async () => {
        for (const until = Date.now() + 2000; Date.now() < until; await sleep(50)) if (!alive(pid)) return true

        return !alive(pid)
      }

      try {
        entries.add(realpathSync(root.entry))
      } catch {}
      if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid || listed.status !== 0) return false
      if (![...entries].some((entry) => listed.stdout.includes(`${entry} --serve ${session}`))) return false
      for (const signal of ["SIGTERM", "SIGKILL"] as const) {
        try {
          process.kill(pid, signal)
        } catch {}
        if (await gone()) return true
      }

      return false
    }
    // Replaced once in a run, and said once; a fresh runtime deaf too is not for the client to fix.
    let replaced = false
    let told = false
    /** The session's runtime for this root: the one up, or one woken. */
    const reach = async (): Promise<Endpoint> => {
      let endpoint = await find()

      if (endpoint) return endpoint

      let failed: Error | undefined
      const logFile = join(root.state, "service.log")
      let logged = 0
      const wake = () => {
        const log = openSync(logFile, "a", 0o600)

        logged = statSync(logFile).size
        // Never under bun's hot reload: the runtime takes changed code by starting again, as its mode says.
        const child = spawn(process.execPath, [root.entry, "--serve", session, command], {
          cwd: root.directory,
          detached: true,
          stdio: ["ignore", "ignore", log],
          env: process.env,
        })

        closeSync(log)
        child.on("error", (error) => {
          failed = error
        })
        child.unref()

        return child
      }
      let until = Date.now() + 10_000
      let child = wake()
      let woken = Date.now()

      // Code that does not load says why where its runtime logs, as bun does, a line beginning with error: and the file it is in.
      const said = () => readFileSync(logFile).subarray(logged).toString("utf8").trim().split("\n").slice(-20).join("\n")

      while (!endpoint && Date.now() < until && !failed) {
        await sleep(50)
        endpoint = await find()
        if (endpoint) continue
        // The runtime named is alive with nothing at its port: one that closes lets go within DEAF_MS, and woken ones wait it
        // out; one whose door is gone never does, and is replaced, once.
        if (deaf) {
          if (Date.now() - deaf.since < DEAF_MS) {
            until = Math.max(until, deaf.since + DEAF_MS + 1000)
            continue
          }
          if (replaced || !(await replace(deaf.endpoint))) break
          replaced = true
          deaf = undefined
          child = wake()
          woken = Date.now()
          until = Date.now() + 10_000
          continue
        }
        if (child.exitCode === null && child.signalCode === null) continue
        // It ended without serving. With 0, the runtime before it was still letting go of the session, and the next one
        // woken finds it free; with anything else it failed, and would again.
        if (child.exitCode !== 0) {
          if (child.exitCode !== 78 && said()) throw new Error(`${name}'s runtime did not start; it said:\n${said()}`)
          break
        }
        if (Date.now() - woken >= 250) {
          child = wake()
          woken = Date.now()
        }
      }
      if (!endpoint)
        throw new Error(
          `cannot listen on or reach this machine’s runtime; allow resident processes and loopback listening and connections (under a sandbox, in the harness settings); see ${join(root.state, "service.log")}`
        )
      if (replaced && !told) console.log(`${name}: the runtime had stopped answering and was started again; its state is kept`)
      told = replaced

      return endpoint
    }
    let endpoint = await reach()
    let page = `http://127.0.0.1:${endpoint.port}`
    // One run of the command, one tool call of the agent's: the runtime tells by it whether the hooks speak between calls.
    // Only a run from the session's own harness session is one: another session's agent naming it by --session, or a
    // script with none, runs in its name but is no call of its agent's, so it carries none.
    const call = ownRun(session) ? randomUUID() : undefined
    // A program names its calls, each by the same name, so the log keeps them as one move.
    const named = path === "-e" ? `${PROGRAM}${randomUUID().slice(0, 8)}` : undefined
    const request = async (url: string, method = "GET", body?: string, accept = "text/plain") => {
      const send = () =>
        fetch(`${page}${url}`, {
          method,
          ...(body !== undefined && { body }),
          headers: {
            accept,
            "content-type": "application/json",
            [SERVICE_HEADER]: endpoint.token,
            [ACTOR_HEADER]: `agent:${session}`,
            ...(call && { [CALL_HEADER]: call }),
            ...(named && method === "POST" && { [CALL_ID_HEADER]: named }),
          },
        })
      const until = Date.now() + 30_000

      for (;;) {
        try {
          const response = await send()

          // It restarted for changed code, having done nothing: the one woken in its place answers.
          if (!response.headers.has(STALE_HEADER) || Date.now() >= until) return response
          await response.body?.cancel()
          await sleep(50)
        } catch (error) {
          // A refused connection carried nothing: the runtime ended between being found and being asked, as it does when it
          // restarts; a read is asked again whatever cut it. A call cut off may have been done.
          if (method !== "GET" && !refused(error))
            throw new Error(`the call's outcome is unknown: its runtime ended before answering; read before retrying (${error instanceof Error ? error.message : String(error)})`)
          if (Date.now() >= until) throw error
        }
        endpoint = await reach()
        page = `http://127.0.0.1:${endpoint.port}`
      }
    }
    // An open always names the page; any other answer names it only when the address is not the one last named.
    const announce = () => {
      if (path === "sleep" || path === "close") return
      if (root.page !== page) {
        console.log(`page: ${page}  a new address`)
        root.page = page
        save(file, roots)
      } else if (!path) console.log(`page: ${page}`)
    }

    /**
     * The program door: the code given runs here, in this command's process, with `read`, `call` and `print` in scope, and
     * `root` as before. It is arbitrary code with this process's file and network access, which is what the agent's own
     * shell, which runs this command, already has: the door adds no reach, and no sandbox. Its answer is what it printed,
     * then one summary of its calls; a refusal is thrown, and ends it unless it catches it, the calls before it done.
     */
    if (program) {
      const given = handle === "-" ? readFileSync(0, "utf8") : handle!
      const data = async (path: string, method = "GET", body?: string) => {
        const response = await request(path, method, body, "application/json")

        if (![200, 404, 409].includes(response.status)) throw new Error(await response.text())

        const result = response.status === 404 ? undefined : await response.json()

        if (response.status === 404) await response.body?.cancel()
        announce()

        return result
      }
      const connected = {
        page,
        read: (path: string) => data(under(base, path)),
        call: (path: string, handle: string, args: Record<string, unknown>) => data(under(base, path), "POST", JSON.stringify({ handle, args })),
        wait: async (seconds = 600) => {
          const response = await request(`/_/wait?seconds=${seconds}`)
          const text = await response.text()

          announce()

          return text
        },
      }
      const calls: Answered[] = []

      class Refused extends Error {}

      const scope = {
        root: connected,
        read: async (path?: string) => {
          const view = await connected.read(path ?? "")

          return view === undefined ? undefined : shaped(view)
        },
        // As the command's own call: through the text door, values as text the view's types read, answered with what it changed.
        call: async (path: string, handle: string, args: Record<string, unknown> = {}) => {
          const at = under(base, path)
          const inputs = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)]))
          const response = await request(at.split("/").map(encodeURIComponent).join("/"), "POST", JSON.stringify({ handle, args: inputs }))
          const text = await response.text()
          const said = text.split(/^notices:$/m)[0]!.trim()

          announce()
          calls.push(response.ok ? { path: at, handle, args: inputs, changed: text } : { path: at, handle, args: inputs, refused: text })
          if (!response.ok) throw new Refused(`refused: ${at} ${handle}: ${said.replace(/^refused: /, "")}`)

          return said || "nothing changed"
        },
        print: (...values: unknown[]) => console.log(values.map((v) => (typeof v === "string" ? v : v === undefined ? "undefined" : JSON.stringify(v))).join(" ")),
      }
      let source = given

      // TypeScript too, its types erased; code the transpiler takes for no module, as one with a return at its top, runs as written.
      try {
        source = new Bun.Transpiler({ loader: "ts", trimUnusedImports: false }).transformSync(given)
      } catch {}

      let failed: unknown

      try {
        await new (Object.getPrototypeOf(async function () {}).constructor)(...Object.keys(scope), source)(...Object.values(scope))
      } catch (error) {
        failed = error
      }

      const stopped = failed instanceof Refused

      if (calls.length) console.log(summed(calls, stopped))
      if (failed !== undefined && !stopped) {
        const why = failed instanceof Error ? failed.message : String(failed)
        // A program given as a word that does not parse was likely cut by a quote inside it, the shell's taking it.
        const cut = failed instanceof SyntaxError && handle !== "-" ? `; given as one word, a quote inside it may have ended the shell's: give it on standard input, ${command} -e - <<'EOF'` : ""

        console.error(`the program failed: ${why}${cut}`)
      }

      return failed === undefined ? 0 : 1
    }

    /**
     * Waits until `instance` let go of the session, and answers with what answers in its place, woken where nothing does;
     * undefined where `instance` still runs after `ms`.
     */
    const after = async (instance: string, ms: number): Promise<Endpoint | undefined> => {
      for (const until = Date.now() + ms; ; await sleep(100)) {
        const named = load<Endpoint>(join(root.state, ENDPOINT_FILE))

        if (named?.instance !== instance || !alive(named.pid)) break
        if (Date.now() >= until) return undefined
      }
      endpoint = await reach()
      page = `http://127.0.0.1:${endpoint.port}`

      return endpoint
    }

    if (path === "follow") {
      const seconds = Number(values[0] ?? 600)
      const named = load<Endpoint>(join(root.state, ENDPOINT_FILE))
      const running = !!named && named.instance === handle && alive(named.pid)
      const next = await after(handle!, seconds * 1000)

      if (!next) {
        console.log(`${name}: instance ${handle} still runs after ${seconds}s; follow it again: ${command} follow ${handle}`)

        return 1
      }
      announce()
      console.log(`${name}: instance ${handle} ${running ? "restarted" : "is gone"}; instance ${next.instance} answers`)

      return 0
    }

    const response = await request(route, method, body)

    // Restarting at once: the answer is given once the instance in its place answers.
    if (path === "restart" && response.status === 200) {
      const was = endpoint.instance!

      console.log(await response.text())

      const next = await after(was, 30_000)

      announce()
      console.log(next ? `${name}: instance ${next.instance} answers` : `${name}: instance ${was} still runs; follow it: ${command} follow ${was}`)

      return next ? 0 : 1
    }
    announce()
    // What the skill does not say: the command's name here, and its words besides a path and a handle.
    if (!path) {
      const where = /^[^\s/]+\//.test(command) ? ", from the project's directory" : ""

      console.log(`command: ${command}${where}; ${command} wait [SECONDS] waits for the person, then tells what changed`)
    }
    if (response.body) for await (const chunk of response.body) process.stdout.write(chunk)
    process.stdout.write("\n")

    return response.ok ? 0 : response.status === 400 ? 2 : 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))

    return error instanceof SyntaxError ? 2 : 1
  }
}
if (import.meta.main) {
  const directory = dirname(resolve(process.argv[1]!))

  if (basename(directory) === "bin" && basename(dirname(directory)) === ".babavoss")
    process.env.BABAVOSS_HOME ??= dirname(directory)

  const args = process.argv.slice(2)
  const word = args[0] === "--word" ? (args.splice(0, 2)[1]!) : basename(process.argv[1]!)

  process.exitCode = await bv(
    args,
    word === "bv" || word === "bv.ts" ? undefined : word,
    basename(dirname(directory)) === ".babavoss" ? relative(dirname(dirname(directory)), process.argv[1]!) : "bv",
  )
}
