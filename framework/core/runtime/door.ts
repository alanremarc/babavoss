// The http door of one surface. The surface's paths are the URLs; the method is the meaning; Accept says who asks.
//   GET  /p   application/json   the view at /p for the actor in the header     GET /p  text/html  the root's page
//   GET  /    text/event-stream  change { version } and work { jobs }           POST /p { handle, args }  a call
//                                 call { path, handle, args, actor, refused? }, each call through this door as it is answered
//                                 notice { text, at?, from?, by? }, each notice as it is heard, `by` absent where the person
//                                 caused it; a line about the root's own code is one too, and is given to a page that connects
//                                 within NOTE_MS of it, as one does when the runtime started again. Nothing else is replayed.
//                                 turn { agent, since, waiting, drivable }, whose move it is (turn.ts), as it changes and on connect
//   POST /_/turn  text/plain        a hook's word on the turn: started, working, ended, gone; where the agent's word runs
//                                   again with no hook heard since its last run, its answer says once that the hooks are quiet
//   POST /_/turn  application/json  { message }: the person ends their move, where the harness can be driven
// /_/ is the page's own. The framework owns no page, it serves the root's; a page that cannot be served is an error, never
// the view in its place. The page is served with meta tags saying whose it is (root, version, session): presentation, so
// never in a view. And with what it shows first, so its first frame is whole: an island of JSON, the root's state as the
// person reads it now: the change it counts the stream from, whose move it is, and the views at the paths the root names
// for the page's path. The page reads it before it draws, and the stream's first change says whether it is still so.
// Only this machine's clients: loopback host, own origin, the service token on everything but the page, as a header or
// as the cookie the page response sets, named after the port. A runtime that gives way answers 503 with STALE_HEADER, having
// done nothing, and ends: its clients ask again, of the one in its place. A client's probe for whether it is up never waits.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import type { Noticed, Running } from "../surface/run.ts"
import { textArgs, textSession, textView } from "./text.ts"
import { NEEDS } from "../present/present.ts"
import type { Args } from "../surface/view.ts"
import { isPerson } from "../session.ts"
import { ACTOR_HEADER, CALL_HEADER, PROBE_HEADER, SERVICE_HEADER, STALE_HEADER, type Identity } from "./service.ts"
import { island } from "./boot.ts"
import { answered, driverOf, hooksHeard, hushed, reading, startTurn, STALE_MS, TURN_EVENTS, turned, unheardHooks, unknownTurn, type Hooks, type TurnEvent } from "./turn.ts"

/** A page served by code: the html for a path, the assets under /_/, and a close. Given the http server, for live reload. */
export type UiHosting = (
  server: Server
) => Promise<{
  page(path: string): Promise<string | undefined>
  assets(req: IncomingMessage, res: ServerResponse, next: () => void): void
  close(): Promise<void>
}>
/** A root's ui: a directory with index.html and assets served under /_/, or a hosting. */
export type Ui = string | URL | UiHosting

export type DoorOptions = {
  command?: string
  identity: Identity
  ui: Ui
  /** Called on every request, so an idle timer can be reset. */
  touched?: () => void
  end?: () => void
  /** Whether the surface's code is the code on disk, before anything is answered: undefined if so, else why the runtime ends instead. */
  current?: () => Promise<string | undefined>
  /** What the page is the page of, put in its head as `<meta name="babavoss:KEY">`: root, version, session; update, a later release out. */
  about?: Record<string, string>
  /** The paths whose views the page at a path needs first, given with its html in the boot island. */
  boot?: (path: string) => string[]
}

/** How long a line about the root's own code is still given to a page that connects. */
export const NOTE_MS = 60_000
/** Who caused a notice, in the page's words; nothing where the person did. */
const byOf = ({ actor, call }: Noticed["cause"]) => (!call ? "the surface" : isPerson(actor) ? undefined : actor.startsWith("agent:") ? "the agent" : actor)

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
// Cookies ignore ports, and several runtimes share 127.0.0.1, so each names its cookie after its port; a page embedding another root's page keeps its own.
const cookieName = (port: number) => `babavoss-service-${port}`
const tokenOf = (req: IncomingMessage, port: number): string | undefined => {
  const header = req.headers[SERVICE_HEADER]

  if (typeof header === "string") return header

  return new RegExp(`(?:^|;\\s*)${cookieName(port)}=([^;]+)`).exec(req.headers.cookie ?? "")?.[1]
}

export type Door = {
  server: Server
  close(): Promise<void>
  /** The root's code was loaded again: its ui, as it is defined now, takes the place of the one served. */
  replace(ui: Ui): Promise<void>
  /** A file the page may be made of changed: the open pages are told to load again if the page is no longer the one they hold. */
  refresh(file: string): Promise<void>
  /**
   * A line about the root's own code, told to the open pages as a notice, and said first in the agent's next answer unless
   * `agent` is false, as for what does not change what the agent should do; a later one takes its place.
   */
  note(line: string, agent?: boolean): void
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

      return html === undefined ? { error: "the root's ui has no index.html" } : { html }
    } catch (error) {
      hosted = undefined

      return { error: `the root's page cannot be served: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  const escaped = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  // Read at each page: the version is the code's, and the code may have been loaded again.
  const about = () =>
    Object.entries(options.about ?? {})
      .map(([key, value]) => `<meta name="babavoss:${escaped(key)}" content="${escaped(value)}">`)
      .join("")
  const actorText = `agent:${options.about?.session ?? "session"}`
  const text = textSession(running, options.identity.dir, actorText, options.command ?? "bv root")
  const streams = new Set<ServerResponse>()
  // What the runtime has to say of the root's code, until an answer to the agent carries it; a wait ends for it too.
  let said: string | undefined
  const noted = new Set<() => void>()
  const told = (answer: string) => {
    const line = said

    said = undefined

    return line === undefined ? answer : `${line}\n${answer}`
  }
  const change = () => `event: change\ndata: ${JSON.stringify({ version: running.version(), jobs: running.jobs() })}\n\n`
  const notice = (value: { text: string; at?: string; from?: string; by?: string }) => `event: notice\ndata: ${JSON.stringify(value)}\n\n`
  /** The last line about the root's own code, with when it was said, for a page that connects soon after. */
  let health: { line: string; at: number } | undefined

  // Whose move it is, as the hooks tell it, and how many of the person's calls wait for the agent's next answer: told to the
  // page when it reads otherwise. The agent's calls under way keep a working turn from going stale.
  let turn = unknownTurn(Date.now())
  let busy = 0
  let turnSent = ""
  let stale: ReturnType<typeof setTimeout> | undefined
  // Whether the hooks speak between the agent's runs of the word (turn.ts); whether any did, and whether it was told they
  // are quiet, kept beside the session's state so a runtime that starts again tells it once.
  const hooksFile = join(options.identity.dir, "hooks.json")
  let hooks: Hooks = unheardHooks()

  try {
    const kept = JSON.parse(readFileSync(hooksFile, "utf8")) as Partial<Hooks>

    hooks = { ever: kept.ever === true, told: kept.told === true }
  } catch {}

  const keepHooks = (next: Hooks) => {
    const changed = next.ever !== hooks.ever || next.told !== hooks.told

    hooks = next
    if (changed)
      try {
        writeFileSync(hooksFile, JSON.stringify({ ever: next.ever, told: next.told }))
      } catch {}
  }
  const turnNow = () => {
    const { agent, since } = reading(turn, Date.now(), busy > 0 && !hooks.told)

    return { agent, since, waiting: text.waiting(), drivable: !!driverOf(options.about?.session ?? "session") }
  }
  const turnEvent = () => `event: turn\ndata: ${(turnSent = JSON.stringify(turnNow()))}\n\n`
  const pushTurn = () => {
    clearTimeout(stale)
    if (turn.agent === "working") (stale = setTimeout(pushTurn, Math.max(0, turn.heard + STALE_MS - Date.now()) + 1)).unref()
    if (JSON.stringify(turnNow()) === turnSent) return

    const event = turnEvent()

    for (const res of streams) res.write(event)
  }

  running.subscribe(() => {
    for (const res of streams) res.write(change())
    pushTurn()
  })
  running.notices(({ cause, ...rest }) => {
    const by = byOf(cause)

    for (const res of streams) res.write(notice({ ...rest, ...(by && { by }) }))
  })

  const server = createServer(async (req, res) => {
    options.touched?.()
    res.setHeader(SERVICE_HEADER, options.identity.token)

    const port = (server.address() as { port: number } | null)?.port ?? 0

    if (!admitted(req, port)) return json(res, 403, { error: "not this machine's client" })

    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const path = url.pathname
    const html = req.method === "GET" && wants(req, "text/html") && !wants(req, "application/json")
    const why = req.headers[PROBE_HEADER] === undefined && (!path.startsWith("/_/") || path === "/_/wait") ? await options.current?.() : undefined

    if (why !== undefined) {
      res.writeHead(503, { "content-type": "text/plain", [STALE_HEADER]: "1" })
      res.once("finish", () => options.end?.())

      return res.end(why)
    }

    if (wants(req, "text/plain")) {
      let hush: string | undefined
      const reply = (status: number, value: string) => {
        res.writeHead(status, { "content-type": "text/plain" })
        res.end(hush ? `${hush}\n${value}` : value)
      }

      if (tokenOf(req, port) !== options.identity.token) return reply(401, "service token required")
      if (req.method === "POST" && path === "/_/turn") {
        const event = (await body(req)).trim() as TurnEvent

        if (!TURN_EVENTS.includes(event)) return reply(400, `the turn is told as one of ${TURN_EVENTS.join(", ")}`)
        keepHooks(hooksHeard())
        turn = turned(turn, event, Date.now())
        pushTurn()

        return reply(200, "")
      }

      const call = req.headers[CALL_HEADER]

      if (typeof call === "string") {
        const now = hushed(hooks, call, Date.now())

        keepHooks(now.hooks)
        hush = now.line
        res.once("finish", () => keepHooks(answered(hooks, call, Date.now())))
      }
      busy += 1
      res.once("close", () => {
        busy -= 1
        pushTurn()
      })
      try {
        if (req.method === "POST" && path === "/_/close") {
          res.once("finish", () => options.end?.())

          return reply(200, `${options.about?.root} closed; any call wakes it`)
        }
        if (req.method === "GET" && path === "/_/wait") {
          const seconds = Number(url.searchParams.get("seconds") ?? 600)

          if (!Number.isFinite(seconds) || seconds < 0) return reply(400, "seconds must be a nonnegative number")

          // `tell=notices`, what was heard alone, as after a tool call; otherwise a boundary: what was heard, then what changed
          // at /. A wait ends on what was heard, or on who is needed changing: a fact a surface changed by itself waits for the next.
          const heard = url.searchParams.get("tell") === "notices"
          const due = () => text.noticed() > 0 || (!heard && text.changed().some((c) => c.keys.some((k) => k === NEEDS || k.startsWith(`${NEEDS}[`))))

          if (!due() && said === undefined)
            await new Promise<void>((done) => {
              const finish = () => {
                clearTimeout(timer)
                unsubscribe()
                noted.delete(finish)
                res.off("close", finish)
                done()
              }
              const unsubscribe = running.subscribe(() => {
                if (due()) finish()
              })
              const timer = setTimeout(finish, seconds * 1000)

              noted.add(finish)
              res.once("close", finish)
            })
          if (res.destroyed) return

          // Answered even when nothing is told: what only the agent's own calls changed is passed over, not kept for later.
          return reply(200, told((heard ? text.heard() : text.tell()) || "nothing changed"))
        }
        if (req.method === "GET") {
          const view = running.read(path, actorText)
          const open = path === "/" && url.searchParams.has("open")
          const lines = view === undefined ? [`nothing at ${path}`] : textView(view, path, options.command ?? "bv root")
          const use = open ? [`${options.about?.root} ${options.about?.version}`] : []

          // A read of / is the present whole, and what changes is counted from it; any other read is its own, and what was heard.
          return reply(view === undefined ? 404 : 200, told(path === "/" && view !== undefined ? text.tell([...use, ...lines], true) : text.answer(lines)))
        }
        if (req.method === "POST") {
          const call = JSON.parse(await body(req))

          if (!call || typeof call.handle !== "string") return reply(400, "a call names a handle")

          const before = running.read(path, actorText)
          const args = textArgs(before, call.handle, call.args ?? {})
          const answer = await running.call(path, call.handle, args, actorText)
          const heard = { path, handle: call.handle, args, actor: actorText, ...(answer.outcome === "refused" && { refused: answer.reason }) }

          for (const stream of streams) stream.write(`event: call\ndata: ${JSON.stringify(heard)}\n\n`)
          if (answer.outcome === "refused") return reply(409, told(text.answer([`refused: ${answer.reason}`])))

          // What the call changed where it was made, and what was heard; what others changed at / waits for a boundary.
          const result = text.answer(text.diff(before, answer.view, path))

          return reply(200, told(result || "nothing changed"))
        }

        return reply(405, `${req.method} is not a door`)
      } catch (error) {
        return reply(409, `refused: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (req.method === "POST" && path === "/_/turn") {
      if (tokenOf(req, port) !== options.identity.token) return json(res, 401, { error: "service token required" })

      let message: unknown

      try {
        message = (JSON.parse((await body(req)) || "{}") as { message?: unknown }).message
      } catch {}
      if (typeof message !== "string" || !message.trim()) return json(res, 400, { error: "ending a move sends a message: { message }" })

      return json(res, 200, await startTurn(options.about?.session ?? "session", message))
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
      // Read in one go, so the views are of the version the island says; a view that cannot be read is the page's to ask for.
      const version = running.version()
      const views: Record<string, unknown> = {}

      for (const at of options.boot?.(path) ?? []) {
        try {
          const view = running.read(at, "person")

          if (view !== undefined) views[at] = view
        } catch {}
      }

      // A replacer function, so a `$` a view holds is never read as a pattern.
      const boot = island({ version, turn: turnNow(), views })

      // The page carries the state it was served with, so it is never kept: a refresh is served it anew.
      res.writeHead(200, {
        "content-type": "text/html",
        "cache-control": "no-store",
        "set-cookie": `${cookieName(port)}=${options.identity.token}; Path=/; SameSite=Strict; HttpOnly`,
      })

      return res.end(served.html.replaceAll("%TOKEN%", options.identity.token).replace("</head>", () => `${boot}${about()}</head>`))
    }
    if (tokenOf(req, port) !== options.identity.token) return json(res, 401, { error: "service token required" })

    const actor = typeof req.headers[ACTOR_HEADER] === "string" ? req.headers[ACTOR_HEADER] : "person"

    if (req.method === "GET" && wants(req, "text/event-stream")) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
      res.write(change())
      res.write(turnEvent())
      if (health && Date.now() - health.at < NOTE_MS) res.write(notice({ text: health.line, ...(options.about?.root && { from: options.about.root }) }))
      streams.add(res)
      req.on("close", () => streams.delete(res))

      return
    }
    if (req.method === "GET") {
      try {
        const view = running.read(path, actor)

        // A program's read of / gives the agent the present whole, as the word's does.
        if (path === "/" && actor === actorText && view !== undefined) text.seen()

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
    note(line, agent = true) {
      if (agent) said = line
      health = { line, at: Date.now() }
      for (const res of streams) res.write(notice({ text: line, ...(options.about?.root && { from: options.about.root }) }))
      for (const finish of Array.from(noted)) finish()
    },
    // Streams and keep-alive connections are cut first, or a browser that reconnects keeps the server open forever.
    close: async () => {
      clearTimeout(stale)
      for (const res of streams) res.end()
      streams.clear()

      const closed = new Promise<void>((done) => server.close(() => done()))

      server.closeAllConnections()
      await closed
      await ended(hosted)
    },
  }
}
