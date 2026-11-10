#!/bin/sh
// 2>/dev/null; exec bun --loader :ts "$0" --word "${0##*/}" "$@"
// The standalone session client, copied into the home’s bin or beside Bun; no app code or framework imports.
import { readFileSync, mkdirSync, writeFileSync, renameSync, openSync, closeSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

export const VERSION = 4
export const SERVICE_HEADER = "babavoss-service"
export const ACTOR_HEADER = "babavoss-actor"
export const ENDPOINT_FILE = "service.json"
export type OpenApp = { directory: string; entry: string; state: string; command?: string; instance?: string }
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

const guide = `bv — the apps open in this session
NAME PATH or bv NAME PATH — each app has its own command when its name is free
bv                         list open apps and their commands
NAME PATH                  read a view: demo /notes (or bv demo /notes)
NAME PATH HANDLE name=value  call: demo / add text=Pharmacy; text=@- reads standard input
bv NAME PATH               select an app: bv demo /notes
bv wait [SECONDS]          wait for changes: bv wait 60
bv close                   close: bv close; the next call wakes the app
bv -e CODE                 async program: bv -e 'for (let i=0;i<3;i++) console.log(await app.call("/", "add", {text:String(i)}))'
bv -e -                    code from standard input: echo 'console.log(await app.read("/"))' | bv -e -
bv --session ID PATH       explicit session: bv --session work /notes
bv help                    this guide
Programs have app.read(path), app.call(path, handle, args), app.wait(seconds), and app.page.
Write a program for more than a few calls of one kind, or a decision depending on a view.
Print each call's result as it goes: failure halfway leaves earlier calls done.
Stop at the first refusal unless calls are independent. Refusals include their reason as data.
Stay under the harness's command run time limit.
Use wait for the person; use a timer only for what the app does not report.`

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
    const apps = load<Record<string, OpenApp>>(file) ?? {}
    const names = Object.keys(apps)

    if (!names.length) {
      console.log("nothing is open in this session; open an app through its skill")

      return 0
    }

    if (!selected && !args.length) {
      console.log(names.map((name) => `${name}: ${apps[name]!.command ?? `bv ${name}`}`).join("\n"))

      return 0
    }

    let name = selected

    if (!name && names.includes(args[0]!)) name = args.shift()
    if (!name && names.length === 1) name = names[0]
    if (!name) {
      console.log(names.map((name) => `${name}: ${apps[name]!.command ?? `bv ${name}`}`).join("\n"))
      if (args.length) throw new SyntaxError("name the app first: bv NAME PATH")

      return 0
    }

    const app = apps[name]

    if (!app) throw new SyntaxError(`app ${name} is not open in this session`)
    command = app.command ?? `bv ${name}`
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
    type Endpoint = { port: number; token: string; dir: string; pid: number }

    const find = async () => {
      const endpoint = load<Endpoint>(join(app.state, ENDPOINT_FILE))

      if (!endpoint || endpoint.dir !== app.state) return
      try {
        const response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
          headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token },
          signal: AbortSignal.timeout(300),
        })

        await response.body?.cancel()
        if (response.headers.get(SERVICE_HEADER) === endpoint.token) return endpoint
      } catch {}
    }
    let endpoint = await find()

    if (!endpoint) {
      const log = openSync(join(app.state, "service.log"), "a", 0o600)
      const child = spawn(process.execPath, [app.entry, "--serve", session, command], {
        cwd: app.directory,
        detached: true,
        stdio: ["ignore", "ignore", log],
        env: process.env,
      })

      closeSync(log)

      let failed: Error | undefined

      child.on("error", (error) => {
        failed = error
      })
      child.unref()

      const until = Date.now() + 10_000

      while (!endpoint && Date.now() < until) {
        if (failed || child.exitCode !== null || child.signalCode !== null) break
        await sleep(50)
        endpoint = await find()
      }
      if (!endpoint)
        throw new Error(
          `cannot listen on or reach this machine’s runtime; allow resident processes and loopback listening and connections (under a sandbox, in the harness settings); see ${join(app.state, "service.log")}`
        )
    }

    const page = `http://127.0.0.1:${endpoint.port}`
    const request = (url: string, method = "GET", body?: string, accept = "text/plain") =>
      fetch(`${page}${url}`, {
        method,
        ...(body !== undefined && { body }),
        headers: { accept, "content-type": "application/json", [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: `agent:${session}` },
      })
    const announce = () => {
      if (path !== "close" && app.instance !== endpoint.token) {
        console.log(`page: ${page}  a new address: give it to the person`)
        app.instance = endpoint.token
        save(file, apps)
      }
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

      await new (Object.getPrototypeOf(async function () {}).constructor)("app", code)(connected)

      return 0
    }

    const response = await request(route, method, body)

    announce()
    if (!path)
      console.log(
        [
          `${command} PATH — read; ${command} PATH HANDLE name=value — call (name=@- reads stdin)`,
          `${command} wait [SECONDS] — wait for changes`,
          `${command} close — close the app`,
          `${command} -e CODE — run an async program with app`,
        ].join("\n")
      )
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
