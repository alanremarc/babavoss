#!/bin/sh
// 2>/dev/null; exec bun --loader :ts "$0" --word "${0##*/}" "$@"
// The standalone session client, copied into the home’s bin or beside Bun; no root code or framework imports.
import { readFileSync, mkdirSync, writeFileSync, renameSync, openSync, closeSync, statSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"

export const VERSION = 12
export const SERVICE_HEADER = "babavoss-service"
export const ACTOR_HEADER = "babavoss-actor"
export const PROBE_HEADER = "babavoss-probe"
export const STALE_HEADER = "babavoss-stale"
export const CALL_HEADER = "babavoss-call"
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

const guide = `bv — the roots open in this session
NAME PATH or bv NAME PATH — each root has its own command when its name is free
bv                         list open roots and their commands
NAME PATH                  read a view: demo /notes (or bv demo /notes)
NAME PATH HANDLE name=value  call: demo / add text=Pharmacy; text=@- reads standard input
bv NAME PATH               select a root: bv demo /notes
bv wait [SECONDS]          wait for the person: until something is heard or who is needed changes, then what changed: bv wait 60
bv close                   close: bv close; the next call wakes the root
bv -e CODE                 async program: bv -e 'for (let i=0;i<3;i++) console.log(await root.call("/", "add", {text:String(i)}))'
bv -e -                    code from standard input: echo 'console.log(await root.read("/"))' | bv -e -
bv --session ID PATH       explicit session: bv --session work /notes
bv help                    this guide
Programs have root.read(path), root.call(path, handle, args), root.wait(seconds), and root.page.
Write a program for more than a few calls of one kind, or a decision depending on a view.
Print each call's result as it goes: failure halfway leaves earlier calls done.
Stop at the first refusal unless calls are independent. Refusals include their reason as data.
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
    const [path, handle, ...values] = args
    let route = path ?? "/?open"
    let method = "GET"
    let body: string | undefined
    const program = path === "-e"

    if (program && (args.length !== 2 || !handle)) throw new SyntaxError(`${command} -e CODE | ${command} -e -`)
    if (path === "close") {
      if (args.length !== 1) throw new SyntaxError(`${command} close`)
      route = "/_/close"
      method = "POST"
    } else if (path === "wait") {
      const seconds = handle === undefined ? 600 : Number(handle)

      if (args.length > 2 || !Number.isFinite(seconds) || seconds < 0) throw new SyntaxError(`${command} wait [SECONDS]`)
      route = `/_/wait?seconds=${seconds}`
    } else if (!program && path !== undefined) {
      if (!path.startsWith("/") || path.startsWith("//")) throw new SyntaxError(`${command} PATH [HANDLE name=value…]`)
      route = path.split("/").map(encodeURIComponent).join("/")
      if (handle) {
        const inputs: Record<string, string> = {}
        let stdin: string | undefined

        for (const value of values) {
          const at = value.indexOf("=")

          if (at < 1) throw new SyntaxError("call arguments must be name=value")

          const text = value.slice(at + 1)

          inputs[value.slice(0, at)] = text === "@-" ? (stdin ??= readFileSync(0, "utf8")) : text
        }
        method = "POST"
        body = JSON.stringify({ handle, args: inputs })
      }
    }
    type Endpoint = { port: number; token: string; dir: string; pid: number; closing?: number }

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
        // Under bun's hot reload: a change in the root's code is loaded into the runtime, which stays up at its address.
        const child = spawn(process.execPath, ["--hot", root.entry, "--serve", session, command], {
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
      let erred = false

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
        if (child.exitCode === null && child.signalCode === null) {
          // Under hot reload a process whose code does not load stays, waiting for a change: it is ended, and its words said.
          if (erred) {
            child.kill()
            throw new Error(`${name}'s runtime did not start; it said:\n${said()}`)
          }
          erred = /^error: /m.test(said())
          continue
        }
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
    const call = randomUUID()
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
            [CALL_HEADER]: call,
          },
        })
      const until = Date.now() + 30_000

      for (;;) {
        try {
          const response = await send()

          // It gave way, having done nothing: its code changed and was not loaded in place. The one woken in its place answers.
          if (!response.headers.has(STALE_HEADER) || Date.now() >= until) return response
          await response.body?.cancel()
          await sleep(50)
        } catch (error) {
          // A refused connection carried nothing: the runtime ended between being found and being asked, as it does when its
          // code changes; a read is asked again whatever cut it. A call cut off may have been done.
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
      if (path === "close") return
      if (root.page !== page) {
        console.log(`page: ${page}  a new address`)
        root.page = page
        save(file, roots)
      } else if (!path) console.log(`page: ${page}`)
    }

    if (program) {
      const code = handle === "-" ? readFileSync(0, "utf8") : handle!
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
        read: (path: string) => data(path),
        call: (path: string, handle: string, args: Record<string, unknown>) => data(path, "POST", JSON.stringify({ handle, args })),
        wait: async (seconds = 600) => {
          const response = await request(`/_/wait?seconds=${seconds}`)
          const text = await response.text()

          announce()

          return text
        },
      }

      await new (Object.getPrototypeOf(async function () {}).constructor)("root", code)(connected)

      return 0
    }

    const response = await request(route, method, body)

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
