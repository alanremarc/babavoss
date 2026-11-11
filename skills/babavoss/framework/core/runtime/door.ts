// The http door of one surface. The surface's paths are the URLs; the method is the meaning; Accept says who asks.
//   GET  /p   application/json   the view at /p for the actor in the header     GET /p  text/html  the app's page
//   GET  /    text/event-stream  change { version } and work { jobs }           POST /p { handle, args }  a call
//                                 call { path, handle, args, actor, refused? }, each call through this door as it is answered
// /_/ is the page's own. The framework owns no page, it serves the app's; a page that cannot be served is an error, never
// the view in its place. The page is served with meta tags saying whose it is (app, version, session): presentation, so
// never in a view.
// Only this machine's clients: loopback host, own origin, the service token on everything but the page, as a header or
// as the cookie the page response sets, named after the port.
import { existsSync, readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import type { Running } from "../surface/run.ts"
import { textArgs, textLines, textSession } from "./text.ts"
import type { Args } from "../surface/view.ts"
import { ACTOR_HEADER, SERVICE_HEADER, type Identity } from "./service.ts"

/** A page served by code: the html for a path, the assets under /_/, and a close. Given the http server, for live reload. */
export type UiHosting = (
  server: Server
) => Promise<{
  page(path: string): Promise<string | undefined>
  assets(req: IncomingMessage, res: ServerResponse, next: () => void): void
  close(): Promise<void>
}>
/** An app's ui: a directory with index.html and assets served under /_/, or a hosting. */
export type Ui = string | URL | UiHosting

export type DoorOptions = {
  command?: string
  identity: Identity
  ui: Ui
  /** Called on every request, so an idle timer can be reset. */
  touched?: () => void
  end?: () => void
  /** What the page is the page of, put in its head as `<meta name="babavoss:KEY">`: app, version, session. */
  about?: Record<string, string>
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"])
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
}

export const admitted = (req: IncomingMessage, port: number): boolean => {
  const own = (url: URL) => url.protocol === "http:" && LOOPBACK.has(url.hostname) && url.port === String(port)
  const host = req.headers.host

  if (!host) return false
  try {
    if (!own(new URL(`http://${host}`))) return false
    if (req.headers.origin !== undefined && !own(new URL(req.headers.origin))) return false
  } catch {
    return false
  }

  return true
}

const wants = (req: IncomingMessage, type: string) => (req.headers.accept ?? "").split(",").some((part) => part.trim().startsWith(type))
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(value))
}
const body = (req: IncomingMessage) =>
  new Promise<string>((done, fail) => {
    let text = ""

    req.setEncoding("utf8")
    req.on("data", (chunk: string) => (text += chunk))
    req.on("end", () => done(text))
    req.on("error", fail)
  })
// Cookies ignore ports, and several runtimes share 127.0.0.1, so each names its cookie after its port; a page embedding another app's page keeps its own.
const cookieName = (port: number) => `babavoss-service-${port}`
const tokenOf = (req: IncomingMessage, port: number): string | undefined => {
  const header = req.headers[SERVICE_HEADER]

  if (typeof header === "string") return header

  return new RegExp(`(?:^|;\\s*)${cookieName(port)}=([^;]+)`).exec(req.headers.cookie ?? "")?.[1]
}

export type Door = {
  server: Server
  close(): Promise<void>
  /** The app's code was loaded again: its ui, as it is defined now, takes the place of the one served. */
  replace(ui: Ui): Promise<void>
  /** A file the page may be made of changed: the open pages are told to load again if the page is no longer the one they hold. */
  refresh(file: string): Promise<void>
  /** A line about the app's own code, said first in the agent's next answer; a later one takes its place. */
  note(line: string): void
}

export function door<M>(running: Running<M>, options: DoorOptions): Door {
  let ui = options.ui
  const uiDir = () => (typeof ui === "function" ? undefined : typeof ui === "string" ? ui : fileURLToPath(ui))
  const hosting = () => (typeof ui === "function" ? ui : undefined)
  let hosted: ReturnType<UiHosting> | undefined
  /** The page as the hosting last gave it: what the open pages hold. */
  let served: string | undefined
  const host = () => (hosted ??= hosting()!(server))
  /** The page's html, or why there is none: a hosting that cannot start, as when the page's dependencies are not installed. */
  const page = async (path: string): Promise<{ html: string } | { error: string }> => {
    try {
      const html = hosting()
        ? await (await host()).page(path)
        : existsSync(join(uiDir()!, "index.html"))
          ? readFileSync(join(uiDir()!, "index.html"), "utf8")
          : undefined

      if (html !== undefined) served = html

      return html === undefined ? { error: "the app's ui has no index.html" } : { html }
    } catch (error) {
      hosted = undefined

      return { error: `the app's page cannot be served: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  const escaped = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  // Read at each page: the version is the code's, and the code may have been loaded again.
  const about = () =>
    Object.entries(options.about ?? {})
      .map(([key, value]) => `<meta name="babavoss:${escaped(key)}" content="${escaped(value)}">`)
      .join("")
  const actorText = `agent:${options.about?.session ?? "session"}`
  const text = textSession(running, options.identity.dir, actorText, options.command ?? "bv app")
  const streams = new Set<ServerResponse>()
  // What the runtime has to say of the app's code, until an answer to the agent carries it; a wait ends for it too.
  let said: string | undefined
  const noted = new Set<() => void>()
  const told = (answer: string) => {
    const line = said

    said = undefined

    return line === undefined ? answer : `${line}\n${answer}`
  }
  const change = () => `event: change\ndata: ${JSON.stringify({ version: running.version(), jobs: running.jobs() })}\n\n`

  running.subscribe(() => {
    for (const res of streams) res.write(change())
  })

  const server = createServer(async (req, res) => {
    options.touched?.()
    res.setHeader(SERVICE_HEADER, options.identity.token)

    const port = (server.address() as { port: number } | null)?.port ?? 0

    if (!admitted(req, port)) return json(res, 403, { error: "not this machine's client" })

    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const path = url.pathname
    const html = req.method === "GET" && wants(req, "text/html") && !wants(req, "application/json")

    if (wants(req, "text/plain")) {
      const reply = (status: number, value: string) => {
        res.writeHead(status, { "content-type": "text/plain" })
        res.end(value)
      }

      if (tokenOf(req, port) !== options.identity.token) return reply(401, "service token required")
      try {
        if (req.method === "POST" && path === "/_/close") {
          res.once("finish", () => options.end?.())

          return reply(200, `${options.about?.app} closed; any call wakes it`)
        }
        if (req.method === "GET" && path === "/_/wait") {
          const seconds = Number(url.searchParams.get("seconds") ?? 600)

          if (!Number.isFinite(seconds) || seconds < 0) return reply(400, "seconds must be a nonnegative number")
          if (!text.changed().length && said === undefined)
            await new Promise<void>((done) => {
              const finish = () => {
                clearTimeout(timer)
                unsubscribe()
                noted.delete(finish)
                res.off("close", finish)
                done()
              }
              const unsubscribe = running.subscribe(() => {
                if (text.changed().length) finish()
              })
              const timer = setTimeout(finish, seconds * 1000)

              noted.add(finish)
              res.once("close", finish)
            })
          if (res.destroyed) return

          return reply(200, told(text.changed().length ? text.answer([]) : "nothing changed"))
        }
        if (req.method === "GET") {
          const view = running.read(path, actorText)
          const open = path === "/" && url.searchParams.has("open")
          const lines = view === undefined ? [`nothing at ${path}`] : [...textLines(view, "", new Map(), path, options.command ?? "bv app").values()]
          const use = open ? [`${options.about?.app} ${options.about?.version}`] : []

          return reply(view === undefined ? 404 : 200, told(text.answer([...use, ...lines], open, view, path)))
        }
        if (req.method === "POST") {
          const call = JSON.parse(await body(req))

          if (!call || typeof call.handle !== "string") return reply(400, "a call names a handle")

          const before = running.read(path, actorText)
          const args = textArgs(before, call.handle, call.args ?? {})
          const answer = await running.call(path, call.handle, args, actorText)
          const heard = { path, handle: call.handle, args, actor: actorText, ...(answer.outcome === "refused" && { refused: answer.reason }) }

          for (const stream of streams) stream.write(`event: call\ndata: ${JSON.stringify(heard)}\n\n`)
          if (answer.outcome === "refused") return reply(409, told(`refused: ${answer.reason}`))

          const result = text.answer(text.diff(before, answer.view), false, undefined, path)

          return reply(200, told(result || "nothing changed"))
        }

        return reply(405, `${req.method} is not a door`)
      } catch (error) {
        return reply(409, `refused: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (path.startsWith("/_/")) {
      if (hosting()) return (await host()).assets(req, res, () => json(res, 404, { error: `nothing at ${path}` }))

      const dir = uiDir()
      const file = dir && normalize(join(dir, path.slice(3)))

      if (!file || !file.startsWith(dir!) || !existsSync(file)) return json(res, 404, { error: `nothing at ${path}` })
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })

      return res.end(readFileSync(file))
    }

    if (html) {
      const served = await page(path)

      if ("error" in served) {
        console.error(served.error)
        res.writeHead(500, { "content-type": "text/plain" })

        return res.end(served.error)
      }
      res.writeHead(200, { "content-type": "text/html", "set-cookie": `${cookieName(port)}=${options.identity.token}; Path=/; SameSite=Strict; HttpOnly` })

      return res.end(served.html.replaceAll("%TOKEN%", options.identity.token).replace("</head>", `${about()}</head>`))
    }
    if (tokenOf(req, port) !== options.identity.token) return json(res, 401, { error: "service token required" })

    const actor = typeof req.headers[ACTOR_HEADER] === "string" ? req.headers[ACTOR_HEADER] : "person"

    if (req.method === "GET" && wants(req, "text/event-stream")) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
      res.write(change())
      streams.add(res)
      req.on("close", () => streams.delete(res))

      return
    }
    if (req.method === "GET") {
      try {
        const view = running.read(path, actor)

        return view === undefined ? json(res, 404, { error: `nothing at ${path}` }) : json(res, 200, view)
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    }
    if (req.method === "POST") {
      let call: { handle?: unknown; args?: unknown }

      try {
        call = JSON.parse((await body(req)) || "{}") as typeof call
      } catch {
        return json(res, 400, { error: "a call is JSON: { handle, args }" })
      }
      if (typeof call.handle !== "string") return json(res, 400, { error: "a call names a handle" })

      const answer = await running.call(path, call.handle, (call.args ?? {}) as Args, actor)
      const heard = { path, handle: call.handle, args: call.args ?? {}, actor, ...(answer.outcome === "refused" && { refused: answer.reason }) }

      for (const res of streams) res.write(`event: call\ndata: ${JSON.stringify(heard)}\n\n`)

      return json(res, answer.outcome === "written" ? 200 : 409, answer)
    }

    return json(res, 405, { error: `${req.method} is not a door` })
  })

  const ended = async (held: ReturnType<UiHosting> | undefined) => {
    if (held) await Promise.race([held.then((h) => h.close()).catch(() => {}), new Promise<void>((done) => setTimeout(done, 3000).unref())])
  }

  return {
    server,
    async replace(next) {
      const held = hosted

      hosted = undefined
      ui = next
      await ended(held)
    },
    async refresh(file) {
      if (!streams.size || served === undefined) return

      const before = served
      const dir = uiDir()
      // A hosting says by its page whether it changed; a directory of files is the page, so a change in it is one.
      // A page that does not build is not told of: the open pages go on with the one they hold.
      const differs = hosting() ? !("error" in (await page("/"))) && served !== before : !!dir && file.startsWith(dir)

      if (differs) for (const res of streams) res.write("event: page\ndata: {}\n\n")
    },
    note(line) {
      said = line
      for (const finish of Array.from(noted)) finish()
    },
    // Streams and keep-alive connections are cut first, or a browser that reconnects keeps the server open forever.
    close: async () => {
      for (const res of streams) res.end()
      streams.clear()

      const closed = new Promise<void>((done) => server.close(() => done()))

      server.closeAllConnections()
      await closed
      await ended(hosted)
    },
  }
}
