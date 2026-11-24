// The resident process as its clients see it: http in, views and answers out; the door's rules; the doors reach a surface
// only through it, and say so in one line where the environment refuses it.
import { poll } from "../support/poll.ts"
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, it } from "bun:test"
import { defineRoot } from "../../framework/core/root.ts"
import { reach } from "../../framework/core/runtime/reach.ts"
import { devMode, startRuntime, rootVersion, type RuntimeOptions } from "../../framework/core/runtime/runtime.ts"
import { admitted, foreign } from "../../framework/core/runtime/door.ts"
import { BOOT_ID, island } from "../../framework/core/runtime/boot.ts"
import { ACTOR_HEADER, SERVICE_HEADER, STALE_HEADER, endpointFile, findService, type Endpoint } from "../../framework/core/runtime/service.ts"
import { request as httpRequest, type IncomingMessage } from "node:http"
import { readJsonFile } from "../../framework/core/state/json-file.ts"
import { action, surface, view, type Update } from "../../framework/core/surface/index.ts"

type Model = { n: number; busy?: boolean }
type Event = { kind: "bumped" } | { kind: "failed"; error: string }
type Command = { kind: "later" }

const bump = action({
  name: "bump",
  description: "Add to n",
  subject: {},
  inputs: { by: "number" },
  update: (m: Model, { by }): Update<Model, Command> => ({ model: { ...m, n: m.n + by } }),
})
const later = action({
  name: "later",
  description: "Bump in a moment",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, Command> => ({ model: { ...m, busy: true }, commands: [{ kind: "later" }] }),
})
const pages = view([bump, later], { "/": (m) => ({ n: m.n, bump: bump.bind({}), ...(!m.busy && { later: later.bind({}) }) }), "/n": (m) => ({ n: m.n }) })
const counter = surface<Model, Event, Command>({
  description: "counts",
  init: () => ({ n: 0 }),
  update: (m, msg) => (msg.kind === "call" ? pages.update(m, msg) : msg.kind === "bumped" ? { model: { n: m.n + 1 } } : { model: m }),
  view: (m, path, actor) => (path === "/" && actor === "person" ? { ...pages.view(m, path), person: true } : pages.view(m, path)),
  async run(_c, send) {
    await sleep(20)
    send({ kind: "bumped" })
  },
  failed: (_c, error) => ({ kind: "failed", error }),
})
const dirs: string[] = []
const closers: (() => Promise<void>)[] = []
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-"))

  dirs.push(dir)

  return dir
}
/** A root whose page is ui/ under its directory; its runtime entry is never woken, the spec starts the runtime in its own process. */
const root = (dir: string, boot?: (path: string) => string[]) => {
  const ui = join(dir, "ui")

  mkdirSync(ui, { recursive: true })
  writeFileSync(join(ui, "index.html"), "<head><title>p</title></head><script src=/_/root.js></script>")
  writeFileSync(join(ui, "root.js"), "// page")

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.0" }))

  return defineRoot({ name: "p", ui, surface: counter, ...(boot && { boot }) })
}
const started = async (dir: string, more: Partial<RuntimeOptions> = {}, boot?: (path: string) => string[]) => {
  const runtime = await startRuntime(root(dir, boot), ["--session", "S"], {
    env: { BABAVOSS_HOME: dir },
    entry: join(dir, "scripts/open.ts"),
    strengths: { weak: 60_000 },
    // It looks, and takes changed code, at once: a spec waits on what happens, not on the runtime's own pace.
    lookMs: 10,
    reloadMs: 20,
    log: () => {},
    watch: [],
    ...more,
  })

  if (!runtime) throw new Error("not started")
  closers.push(() => runtime.close())

  const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "p")))!
  const base = `http://127.0.0.1:${runtime.port}`
  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(base + path, { headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token, ...headers } })
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", [SERVICE_HEADER]: endpoint.token, ...headers },
    })

  /** The page, as a program that holds the token fetches it. */
  const browse = (path: string) => fetch(base + path, { headers: { accept: "text/html", [SERVICE_HEADER]: endpoint.token } })

  return { runtime, endpoint, base, get, post, browse }
}

afterEach(async () => {
  for (const close of closers.splice(0)) await close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("the door", () => {
  it("reads a view by its path, calls a handle by POST, and tells the actor apart", async () => {
    const { get, post } = await started(scratch())

    expect(await (await get("/")).json()).toMatchObject({ n: 0, person: true })
    expect(await (await get("/", { [ACTOR_HEADER]: "agent:s" })).json()).toEqual({
      n: 0,
      bump: expect.objectContaining({ name: "bump" }),
      later: expect.anything(),
    })
    expect(await (await get("/n")).json()).toEqual({ n: 0 })
    expect((await get("/nowhere")).status).toBe(404)

    const written = await post("/", { handle: "bump", args: { by: 2 } })

    expect([written.status, await written.json()]).toEqual([200, { outcome: "written", view: expect.objectContaining({ n: 2 }) }])

    const refused = await post("/", { handle: "bump", args: { by: "2" } })

    expect([refused.status, await refused.json()]).toEqual([409, { outcome: "refused", reason: "bump: by must be a number" }])
    expect((await post("/", { args: {} })).status).toBe(400)
  })

  it("says on the page, quietly, that a later release is out", async () => {
    const { browse } = await started(scratch(), { latest: async () => "99.0.0" })

    await poll(async () => (await browse("/")).text()).toContain(
      '<meta name="babavoss:update" content="99.0.0">'
    )
  })

  it("serves the root's page to a browser of this machine at its bare address, as the person, and gives it no token", async () => {
    const dir = scratch()
    const { base, endpoint, get, browse } = await started(dir)
    const port = Number(new URL(base).port)
    const html = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers: { accept: "text/html,*/*", ...headers } })
    const json = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers: { accept: "application/json", ...headers } })

    // A page that names the token is served it unread: the token is never written into a page.
    writeFileSync(join(dir, "ui", "index.html"), "<head><meta name=t content=%TOKEN%></head><script src=/_/root.js></script>")

    // The bare address, with no key and no cookie: the page, what it loads, what it reads, and its calls, as the person.
    const page = await html("/notes/2")
    const text = await page.text()

    expect([page.status, page.headers.get("content-type"), page.headers.get("set-cookie"), page.headers.get(SERVICE_HEADER)]).toEqual([200, "text/html", null, null])
    expect(text).toContain(`<meta name="babavoss:root" content="p"><meta name="babavoss:version" content="1.0"><meta name="babavoss:session" content="S"></head>`)
    expect([text.includes(endpoint.token), text.includes("%TOKEN%"), text.includes(BOOT_ID)]).toEqual([false, true, true])
    expect(text).not.toContain("babavoss:update")
    expect((await fetch(base + "/_/root.js")).headers.get("content-type")).toBe("text/javascript")
    expect(await (await json("/n")).json()).toEqual({ n: 0 })
    expect((await html("/", { host: `localhost:${port}` })).status).toBe(200)

    const called = await fetch(base + "/", { method: "POST", body: JSON.stringify({ handle: "bump", args: { by: 1 } }), headers: { "content-type": "application/json", origin: base } })

    expect([called.status, (await called.json()).outcome]).toEqual([200, "written"])

    // Without the token no header makes a request the agent's, and the agent's door, which answers in text, stays shut.
    expect(await (await json("/", { [ACTOR_HEADER]: "agent:S" })).json()).toMatchObject({ n: 1, person: true })
    for (const [path, method] of [["/", "GET"], ["/?open", "GET"], ["/_/restart", "POST"], ["/_/close", "POST"], ["/_/turn", "POST"]] as const) {
      const shut = await fetch(base + path, { method, body: method === "POST" ? "started" : undefined, headers: { accept: "text/plain", [ACTOR_HEADER]: "agent:S" } })

      expect([path, shut.status, shut.headers.get(SERVICE_HEADER)]).toEqual([path, 401, null])
    }

    // The token is told back only to who sent it: a refusal, a wrong token or another host learns nothing.
    expect((await get("/", { [SERVICE_HEADER]: "wrong" })).headers.get(SERVICE_HEADER)).toBeNull()
    expect((await fetch(base + "/", { headers: { host: "evil.example" } })).headers.get(SERVICE_HEADER)).toBeNull()
    expect((await get("/")).headers.get(SERVICE_HEADER)).toBe(endpoint.token)

    // fetch normalizes a traversal away; a raw request does not. The door's URL parsing does, so it is a surface path, never a file.
    const raw = await new Promise<number>((done) =>
      httpRequest({ host: "127.0.0.1", port, path: "/_/../index.html" }, (res) => done(res.statusCode ?? 0)).end()
    )

    expect(raw).toBe(404)

    // A page that cannot be served is the error, to the browser and the log; never the view in its place.
    rmSync(join(dir, "ui", "index.html"))

    const broken = await browse("/")

    expect([broken.status, await broken.text()]).toEqual([500, "the root's ui has no index.html"])

    const request = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage

    expect(admitted(request({ host: `127.0.0.1:${port}` }), port)).toBe(true)
    expect(admitted(request({ host: "evil.example:80" }), port)).toBe(false)
    expect(admitted(request({ host: `localhost:${port}`, origin: "http://evil.example" }), port)).toBe(false)
    expect(admitted(request({ host: `localhost:${port}`, origin: "null" }), port)).toBe(false)
    expect((await get("/_/missing.js")).status).toBe(404)
  })

  it("refuses what the browser says another site started, but a navigation to the page itself, which changes and wakes nothing", async () => {
    const dir = scratch()
    let slept = false
    const { base, get } = await started(dir, { strengths: { weak: 300, strong: 60_000, end: 100 }, exit: () => (slept = true) })
    const at = (path: string, site: string, mode: string, dest: string, more: RequestInit = {}) =>
      fetch(base + path, {
        ...more,
        headers: { accept: dest === "image" ? "image/*" : "text/html,*/*;q=0.8", "sec-fetch-site": site, "sec-fetch-mode": mode, "sec-fetch-dest": dest, ...more.headers },
      })

    // Another site's image, script, read, frame, form and plain request, and another port's: refused before anything is done.
    for (const site of ["cross-site", "same-site"]) {
      for (const [path, mode, dest] of [["/?open", "no-cors", "image"], ["/_/root.js", "no-cors", "script"], ["/", "cors", "empty"], ["/_/root.js", "navigate", "document"]]) {
        const refused = await at(path!, site, mode!, dest!)

        expect([site, path, dest, refused.status]).toEqual([site, path, dest, 403])
      }
      const form = await at("/", site, "navigate", "document", { method: "POST", body: "handle=bump", headers: { "content-type": "application/x-www-form-urlencoded" } })

      expect([site, form.status]).toEqual([site, 403])
    }
    expect((await at("/", "cross-site", "navigate", "iframe")).status).toBe(403)
    expect((await at("/", "cross-site", "no-cors", "empty", { headers: { accept: "text/plain" } })).status).toBe(403)

    // A link to the page clicked on another site opens it, and another port of this host may frame it; it acts on nothing.
    for (const [site, dest] of [["cross-site", "document"], ["same-site", "document"], ["same-site", "iframe"]]) expect((await at("/notes/2", site!, "navigate", dest!)).status).toBe(200)
    // What the person starts and what the page asks of its own origin are the page's.
    expect((await at("/", "none", "navigate", "document")).status).toBe(200)
    expect((await at("/n", "same-origin", "cors", "empty", { headers: { accept: "application/json" } })).status).toBe(200)

    expect(await (await get("/n")).json()).toEqual({ n: 0 })
    await poll(() => slept, { timeout: 2000 })

    const request = (headers: Record<string, string>, method = "GET", url = "/") => ({ headers, method, url }) as unknown as IncomingMessage
    const navigation = { accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }

    expect(foreign(request({}))).toBe(false)
    expect(foreign(request({ "sec-fetch-site": "none" }))).toBe(false)
    expect(foreign(request({ "sec-fetch-site": "same-origin", accept: "application/json" }, "POST"))).toBe(false)
    expect(foreign(request({ ...navigation, "sec-fetch-site": "cross-site" }))).toBe(false)
    expect(foreign(request({ ...navigation, "sec-fetch-site": "cross-site" }, "POST"))).toBe(true)
    expect(foreign(request({ ...navigation, "sec-fetch-site": "cross-site" }, "GET", "/_/settings.json"))).toBe(true)
    expect(foreign(request({ ...navigation, "sec-fetch-site": "cross-site", accept: "application/json" }))).toBe(true)
  })

  it("keeps the session's state its owner's alone: made so, and made so again as a runtime starts where an older one left it open", async () => {
    const dir = scratch()
    const state = join(dir, "sessions", "S", "p")
    const mode = (path: string) => statSync(path).mode & 0o777

    mkdirSync(join(state, "presented"), { recursive: true, mode: 0o755 })
    writeFileSync(join(state, "hooks.json"), "{}", { mode: 0o644 })
    writeFileSync(join(state, "presented", "text.json"), "{}", { mode: 0o644 })

    const first = await started(dir)

    await first.post("/", { handle: "bump", args: { by: 1 } })
    for (const at of [join(dir, "sessions", "S"), state, join(state, "presented")]) expect([at, mode(at)]).toEqual([at, 0o700])
    for (const file of ["hooks.json", "model.json", "service.json", "service.lock", "presented/text.json"]) expect([file, mode(join(state, file))]).toEqual([file, 0o600])
    await first.runtime.close()

    // A page open in a browser outlives the restart: it needs nothing the runtime before gave it, while the token changes.
    const second = await started(dir)

    expect(second.endpoint.token).not.toBe(first.endpoint.token)
    expect((await fetch(second.base + "/", { headers: { accept: "text/html" } })).status).toBe(200)
    expect((await fetch(second.base + "/", { headers: { accept: "text/plain", [SERVICE_HEADER]: first.endpoint.token } })).status).toBe(401)
  })

  it("serves the page with what it shows first, as the person reads it, in an island nothing a view says can break out of", async () => {
    const { browse, post } = await started(scratch(), {}, (path) => (path === "/notes/2" ? ["/", "/n", "/nowhere"] : ["/"]))

    await post("/", { handle: "bump", args: { by: 3 } })

    const text = await (await browse("/notes/2")).text()
    const served = JSON.parse(new RegExp(`<script type="application/json" id="${BOOT_ID}">(.*?)</script>`).exec(text)![1]!)

    // The views the root names for the path, read as the person; one with nothing there is left for the page to ask.
    expect(served).toEqual({ version: expect.any(Number), turn: expect.objectContaining({ agent: "unknown" }), views: { "/": { n: 3, person: true, bump: expect.anything(), later: expect.anything() }, "/n": { n: 3 } } })
    expect(text.indexOf(BOOT_ID)).toBeLessThan(text.indexOf('<meta name="babavoss:root"'))

    const hostile = { "/": { said: "</script><script>alert(1)</script> <!-- & \u2028 $& $1" } }
    const element = island({ version: 1, turn: null, views: hostile })
    const inner = element.slice(element.indexOf(">") + 1, -"</script>".length)

    expect([/[<>&\u2028]/.test(inner), JSON.parse(inner).views]).toEqual([false, hostile])
  })

  it("streams a change event on every commit and command, and each call as it is answered, and is found by its endpoint", async () => {
    const dir = scratch()
    const { base, endpoint, post } = await started(dir)
    const stream = await fetch(base + "/", { headers: { accept: "text/event-stream", [SERVICE_HEADER]: endpoint.token } })
    const reader = stream.body!.getReader()
    let buffer = ""
    const next = async (): Promise<{ event: string; data: unknown }> => {
      while (!buffer.includes("\n\n")) buffer += new TextDecoder().decode((await reader.read()).value)

      const [block = "", ...rest] = buffer.split("\n\n")

      buffer = rest.join("\n\n")

      return { event: /^event: (.*)$/m.exec(block)![1]!, data: JSON.parse(/^data: (.*)$/m.exec(block)![1]!) }
    }
    // The next call answered, past the changes the command's own commit streams meanwhile, which may come first.
    const nextCall = async (): Promise<{ event: string; data: unknown }> => {
      const event = await next()

      return event.event === "change" ? nextCall() : event
    }

    expect(await next()).toEqual({ event: "change", data: { version: 0, jobs: [] } })
    expect(await next()).toEqual({ event: "turn", data: { agent: "unknown", since: expect.any(Number), waiting: 0, drivable: false } })
    await post("/", { handle: "later", args: {} }, { [ACTOR_HEADER]: "agent:s" })
    expect(await next()).toEqual({ event: "change", data: { version: 1, jobs: ["agent:s"] } })
    expect(await next()).toEqual({ event: "call", data: { path: "/", handle: "later", args: {}, actor: "agent:s" } })
    await post("/", { handle: "nope", args: {} })
    expect(await nextCall()).toMatchObject({ event: "call", data: { path: "/", handle: "nope", actor: "person", refused: expect.stringContaining("not offered") } })
    await poll(
      async () => ((await (await fetch(base + "/n", { headers: { accept: "application/json", [SERVICE_HEADER]: endpoint.token } })).json()) as Model).n
    ).toBe(1)
    await reader.cancel()
    expect(await findService(join(dir, "sessions", "S", "p"))).toMatchObject({ token: endpoint.token, port: Number(new URL(base).port) })
  })
})

describe("reach", () => {
  it("goes through the session's runtime: views, calls, refusals, the page", async () => {
    const dir = scratch()
    const p = root(dir)
    const { base } = await started(dir)
    const through = await reach(p, { id: "S" }, { env: { BABAVOSS_HOME: dir } })

    expect(through.page).toBe(base)
    expect(await through.call("/", "bump", { by: 1 }, "agent:s")).toMatchObject({ outcome: "written", view: { n: 1 } })
    expect(await through.read("/n", "person")).toEqual({ n: 1 })
    expect(await through.call("/", "nope", {}, "agent:s")).toMatchObject({ outcome: "refused" })
    expect(await through.read("/nowhere", "person")).toBeUndefined()
  })

  it("never runs the surface in its own process: with no runtime up and none that starts, a door fails and the model stays unwritten", async () => {
    const dir = scratch()
    const p = root(dir)

    expect(reach(p, { id: "S" }, { env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts") })).rejects.toThrow("the runtime failed to start")
    expect(existsSync(join(dir, "sessions", "S", "p", "model.json"))).toBe(false)
  })

  it("lets one process own a directory at a time", async () => {
    const dir = scratch()

    await started(dir)

    // Another process asks for the same directory, and is told it is taken. This one, asking again, is its own code loaded again.
    const service = join(process.cwd(), "framework/core/runtime/service.ts")
    const state = join(dir, "sessions", "S", "p")
    const asks = `import { ownService } from ${JSON.stringify(service)}; console.log(String(ownService(${JSON.stringify(state)})))`
    const other = Bun.spawnSync([process.execPath, "-e", asks])

    expect(other.stdout.toString().trim()).toBe("undefined")
  })
})

it("refuses a definition without its surface or ui", () => {
  const whole = { name: "p", ui: scratch(), surface: counter }
  const without = (...parts: string[]) => Object.fromEntries(Object.entries(whole).filter(([key]) => !parts.includes(key))) as typeof whole

  expect(() => defineRoot(without("surface"))).toThrow("root p has no surface:")
  expect(() => defineRoot(without("ui"))).toThrow("root p has no ui:")
  expect(defineRoot(whole)).toBe(whole)
})

/** The events an open page hears on its stream, collected as they come. */
const listen = async (base: string, token: string) => {
  const ctrl = new AbortController()
  const response = await fetch(`${base}/`, { headers: { accept: "text/event-stream", [SERVICE_HEADER]: token }, signal: ctrl.signal })
  const heard: string[] = []
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()

        if (done) break
        for (const line of decoder.decode(value).split("\n")) if (line.startsWith("event: ")) heard.push(line.slice(7))
      }
    } catch {
      // The stream was stopped.
    }
  })()

  return { heard, stop: () => ctrl.abort() }
}
const options = (dir: string) => ({ env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts"), strengths: { weak: 60_000 }, lookMs: 10, reloadMs: 20, log: () => {}, watch: [] })

describe("the two modes", () => {
  type Held = { n: number }
  const releases: (() => void)[] = []
  const hold = action({
    name: "hold",
    description: "Run until released",
    subject: {},
    inputs: {},
    update: (m: Held): Update<Held, { kind: "hold" }> => ({ model: m, commands: [{ kind: "hold" }] }),
  })
  const holding = view([hold], { "/": (m) => ({ n: m.n, hold: hold.bind({}) }) })
  const holder = surface<Held, { kind: "released" } | { kind: "failed"; error: string }, { kind: "hold" }>({
    description: "holds",
    init: () => ({ n: 0 }),
    update: (m, msg) => (msg.kind === "call" ? holding.update(m, msg) : msg.kind === "released" ? { model: { n: m.n + 1 } } : { model: m }),
    view: (m, path) => holding.view(m, path),
    async run(_c, send, signal) {
      await new Promise<void>((done) => {
        releases.push(done)
        signal.addEventListener("abort", () => done())
      })
      send({ kind: "released" })
    },
    failed: (_c, error) => ({ kind: "failed", error }),
  })
  /**
   * A runtime of the holding surface whose process does not end, as in a spec: what ending it and waking its successor would
   * do is recorded, as are its log's lines. Its entry is a file of its own, the code it loaded that a spec changes.
   */
  const begun = async (more: Partial<RuntimeOptions> = {}) => {
    const dir = scratch()
    const ended: (number | undefined)[] = []
    const successors: number[] = []
    const lines: string[] = []
    const entry = join(dir, "scripts/open.ts")

    root(dir)
    mkdirSync(join(dir, "scripts"))
    writeFileSync(entry, "// the root's entry\n")

    const opts: RuntimeOptions = {
      ...options(dir),
      entry,
      log: (line) => lines.push(line),
      exit: (code) => void ended.push(code),
      successor: () => void successors.push(Date.now()),
      ...more,
    }
    const runtime = (await startRuntime(defineRoot({ name: "h", ui: join(dir, "ui"), surface: holder }), ["--session", "S"], opts))!

    closers.push(() => runtime.close())

    const state = join(dir, "sessions", "S", "h")
    const endpoint = readJsonFile<Endpoint>(endpointFile(state))!
    const headers = { accept: "text/plain", [SERVICE_HEADER]: endpoint.token }
    const base = `http://127.0.0.1:${runtime.port}`
    const read = async (path = "/") => (await fetch(`${base}${path}`, { headers })).text()
    const call = async (handle: string) => {
      const response = await fetch(`${base}/`, { method: "POST", body: JSON.stringify({ handle, args: {} }), headers })

      return { status: response.status, text: await response.text() }
    }
    const restart = async () => {
      const response = await fetch(`${base}/_/restart`, { method: "POST", headers })

      return { status: response.status, text: await response.text() }
    }
    const edit = () => writeFileSync(entry, `// the root's entry, edited ${Math.random()}\n`)

    return { dir, state, runtime, endpoint, ended, successors, lines, opts, read, call, restart, edit, base }
  }
  const again = (dir: string, opts: RuntimeOptions) => startRuntime(defineRoot({ name: "h", ui: join(dir, "ui"), surface: holder }), ["--session", "S"], opts)

  afterEach(() => void releases.splice(0))

  it("is normal unless configured dev, and BABAVOSS_DEV overrides either way", () => {
    expect([devMode(undefined, {}), devMode(false, {}), devMode(true, {})]).toEqual([false, false, true])
    expect([devMode(false, { BABAVOSS_DEV: "1" }), devMode(true, { BABAVOSS_DEV: "0" }), devMode(true, { BABAVOSS_DEV: "" })]).toEqual([true, false, true])
  })

  describe("normal", () => {
    it("runs the code it started with, and says the code changed: once to the agent, and as a fact of / until it restarts", async () => {
      const { runtime, read, edit, successors, ended } = await begun()

      expect(await read("/?open")).toStartWith("h 1.0\nn: 0")
      edit()
      // As the hooks ask it, with nothing else to tell: the line alone.
      await poll(() => read("/_/wait?seconds=0")).toBe("h: its code changed on disk; it runs once restarted: bv h restart")
      expect(await read("/?open")).toStartWith(`h 1.0\ncode: changed on disk since instance ${runtime.instance} started; it runs once restarted: bv h restart\n`)
      expect(await read("/")).toStartWith("code: changed on disk")
      expect(await read("/")).not.toContain("its code changed on disk")
      expect([successors, ended]).toEqual([[], []])
    })

    it("restarts at once where nothing is under way: it answers, lets go of the session and wakes the one in its place, which keeps the state", async () => {
      const { dir, state, runtime, opts, restart, successors, ended } = await begun()

      expect(await restart()).toEqual({ status: 200, text: `h: instance ${runtime.instance} restarts` })
      await poll(() => ended.length).toBe(1)
      expect(successors.length).toBe(1)
      expect(existsSync(endpointFile(state))).toBe(false)

      const next = (await again(dir, opts))!

      closers.push(() => next.close())
      expect(next.port).toBe(runtime.port)
      expect(next.instance).not.toBe(runtime.instance)
    })

    it("drains where work is under way: it refuses new calls, names the instance to follow, and restarts once the work ended", async () => {
      const { runtime, call, restart, read, successors, ended, lines } = await begun()

      expect((await call("hold")).status).toBe(200)

      const draining = await restart()

      expect(draining.status).toBe(202)
      expect(draining.text).toBe(
        `h: instance ${runtime.instance} is draining to restart: it takes no new calls and restarts once hold by agent:S ended. Wait for it: bv h follow ${runtime.instance}`,
      )
      expect(await restart()).toEqual(draining)
      expect(await call("hold")).toEqual({ status: 409, text: `refused: ${draining.text}` })
      expect(await read("/")).toContain("n: 0")
      await sleep(60)
      expect(ended).toEqual([])
      releases.splice(0).forEach((release) => release())
      await poll(() => ended.length).toBe(1)
      expect(successors.length).toBe(1)
      expect(lines.at(-1)).toMatch(/Z h: it restarted once its work ended$/)
    })
  })

  describe("dev", () => {
    it("restarts at once when its code changes, cutting what runs; the one in its place tells the agent what was cut", async () => {
      const { dir, call, edit, successors, ended, opts } = await begun({ dev: true })

      expect((await call("hold")).status).toBe(200)
      edit()
      await poll(() => ended.length, { timeout: 3000 }).toBe(1)
      expect(successors.length).toBe(1)

      const next = (await again(dir, opts))!
      const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "h")))!

      closers.push(() => next.close())

      const answer = await (await fetch(`http://127.0.0.1:${next.port}/n`, { headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token } })).text()

      expect(answer).toMatch(/^h: its code changed \(.*scripts\/open\.ts\) and it restarted; the restart cut hold by agent:S\n/)
    })

    it("answers nothing from code that is no longer on disk: a request after a change is asked again of the one in its place", async () => {
      const { base, endpoint, edit, successors } = await begun({ dev: true })

      edit()

      const response = await fetch(`${base}/`, { headers: { accept: "text/plain", [SERVICE_HEADER]: endpoint.token } })

      expect(response.status).toBe(503)
      expect(response.headers.has(STALE_HEADER)).toBe(true)
      await poll(() => successors.length).toBe(1)
    })

    it("restarts when asked, at once, cutting what runs", async () => {
      const { runtime, call, restart, ended } = await begun({ dev: true })

      await call("hold")
      expect(await restart()).toEqual({ status: 200, text: `h: instance ${runtime.instance} restarts, cutting hold by agent:S` })
      await poll(() => ended.length).toBe(1)
    })

    it("tells open pages to load again when the page's own files change, and not when another file does", async () => {
      const dir = scratch()
      const src = join(dir, "src")

      mkdirSync(src)

      const runtime = await startRuntime(root(dir), ["--session", "W"], { ...options(dir), dev: true, watch: [src, join(dir, "ui")] })

      closers.push(() => runtime!.close())

      const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "W", "p")))!
      const base = `http://127.0.0.1:${runtime!.port}`

      // A page was loaded, and holds its stream.
      await (await fetch(`${base}/`, { headers: { accept: "text/html", [SERVICE_HEADER]: endpoint.token } })).text()

      const page = await listen(base, endpoint.token)

      await poll(() => page.heard).toEqual(["change", "turn"])
      writeFileSync(join(src, "root.ts"), "// edited")
      await sleep(150)
      expect(page.heard).not.toContain("page")
      writeFileSync(join(dir, "ui", "root.js"), "// a new page")
      await poll(() => page.heard, { timeout: 5000 }).toContain("page")
      page.stop()
    })
  })

  it("ends when its state directory is gone, as a spec's or a removed project's is", async () => {
    const { dir, ended } = await begun()

    rmSync(dir, { recursive: true, force: true })
    await poll(() => ended.length).toBe(1)
  })
})

it("tells the version it started with, the code it runs, whatever the package says since", async () => {
  const dir = scratch()
  const { get, browse } = await started(dir)
  const opened = async () => (await get("/?open", { accept: "text/plain" })).text()

  expect(await opened()).toStartWith("p 1.0\n")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.1" }))
  expect(await opened()).toStartWith("p 1.0\n")
  expect(await (await browse("/")).text()).toContain('<meta name="babavoss:version" content="1.0">')
})

it("says a later release is out against the version it runs", async () => {
  const dir = scratch()
  const { browse } = await started(dir, { latest: async () => "1.1" })
  const page = async () => (await browse("/")).text()

  await poll(page).toContain('<meta name="babavoss:update" content="1.1">')
})

it("reads the version from the package beside the root entry", () => {
  const dir = scratch()
  const entry = join(dir, "scripts/open.ts")

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "2.3.4" }))
  expect(rootVersion(entry)).toBe("2.3.4")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "3.0.0" }))
  expect(rootVersion(entry)).toBe("3.0.0")
})

describe("the turn", () => {
  /** The turns an open page is told, as they come. */
  const turns = async (base: string, token: string) => {
    const ctrl = new AbortController()
    const response = await fetch(`${base}/`, { headers: { accept: "text/event-stream", [SERVICE_HEADER]: token }, signal: ctrl.signal })
    const told: { agent: string; waiting: number; drivable: boolean }[] = []
    const reader = response.body!.getReader()
    let buffer = ""

    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()

          if (done) break
          buffer += new TextDecoder().decode(value)

          const blocks = buffer.split("\n\n")

          buffer = blocks.pop()!
          for (const block of blocks) if (block.startsWith("event: turn\n")) told.push(JSON.parse(/^data: (.*)$/m.exec(block)![1]!))
        }
      } catch {
        // The stream was stopped.
      }
    })()
    closers.push(async () => ctrl.abort())

    return told
  }

  it("is told by the hooks, counts the person's calls the agent has not been told, and cannot be started from the page", async () => {
    const { base, endpoint, get, post } = await started(scratch())
    const text = { accept: "text/plain", [ACTOR_HEADER]: "agent:S" }
    const hook = (word: string) => fetch(base + "/_/turn", { method: "POST", body: word, headers: { ...text, [SERVICE_HEADER]: endpoint.token } })
    const told = await turns(base, endpoint.token)
    const last = () => told.at(-1)

    await poll(last).toEqual({ agent: "unknown", since: expect.any(Number), waiting: 0, drivable: false })
    await (await get("/?open", text)).text()
    expect((await hook("started")).status).toBe(200)
    await poll(last).toMatchObject({ agent: "working", waiting: 0 })
    expect((await hook("ended")).status).toBe(200)
    await poll(last).toMatchObject({ agent: "idle", waiting: 0 })

    // The person acts while the agent is idle: each call that changed / waits, and the agent's own calls do not.
    await post("/", { handle: "bump", args: { by: 1 } })
    await post("/", { handle: "bump", args: { by: 1 } })
    await poll(last).toMatchObject({ agent: "idle", waiting: 2 })
    await post("/", { handle: "bump", args: { by: 1 } }, { [ACTOR_HEADER]: "agent:S" })
    expect(told.filter((turn) => turn.waiting === 3)).toEqual([])

    // The next message starts the turn and the agent is told: nothing waits.
    await hook("started")
    await (await get("/_/wait?seconds=0", text)).text()
    await poll(last).toMatchObject({ agent: "working", waiting: 0 })
    await hook("gone")
    await poll(last).toMatchObject({ agent: "unknown" })
    expect((await hook("asleep")).status).toBe(400)

    // A harness that cannot be driven: ending the move from the page says why it cannot.
    const ended = await post("/_/turn", { message: "take them up" })

    expect([ended.status, await ended.json()]).toEqual([200, { cannot: expect.stringContaining("send the agent a message") }])
    expect((await post("/_/turn", {})).status).toBe(400)
    expect((await fetch(base + "/_/turn", { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: "http://evil.example" } })).status).toBe(403)
  })
})

describe("waking and sleeping", () => {
  // The time is the spec's own, moved on in place of waiting: a weak signal keeps it five minutes, a strong one half an hour, the session's end one.
  const MIN = 60_000
  const clock = () => {
    let at = 1_000_000

    return { now: () => at, pass: (ms: number) => (at += ms) }
  }
  const asleep = async (dir: string, time = clock(), log: (line: string) => void = () => {}, endSleeps?: () => boolean) => {
    let slept = false
    const up = await started(dir, { strengths: { weak: 5 * MIN, strong: 30 * MIN, end: MIN }, now: time.now, exit: () => (slept = true), log, endSleeps })

    return { ...up, ...time, slept: () => slept }
  }
  /** Whether it is still up once it has looked a few times. */
  const stays = async (slept: () => boolean) => {
    await sleep(60)

    return !slept()
  }
  const plain = (base: string, token: string, path: string, init: RequestInit = {}) =>
    fetch(base + path, { ...init, headers: { accept: "text/plain", [SERVICE_HEADER]: token, ...init.headers } }).then((r) => r.text())

  it("sleeps once a weak wake is spent, telling the page that watches it, whose reads and stream keep it no longer", async () => {
    const { base, endpoint, get, slept, pass } = await asleep(scratch())
    const page = await listen(base, endpoint.token)

    await plain(base, endpoint.token, "/?open")
    for (let i = 0; i < 4; i++) {
      pass(MIN)
      await get("/")
      expect(await stays(slept)).toBe(true)
    }
    // The page read all along, and its stream is open: the open alone kept it, five minutes.
    pass(MIN + 1)
    await poll(slept).toBe(true)
    await poll(() => page.heard).toContain("asleep")
    page.stop()
  })
  it("stays up for the person's message, the agent's command and the person's action, and the session's end cuts it short", async () => {
    for (const strong of ["message", "command", "action"] as const) {
      const { base, endpoint, post, slept, pass } = await asleep(scratch(), undefined, undefined, () => true)

      if (strong === "message") await plain(base, endpoint.token, "/_/turn", { method: "POST", body: "started" })
      if (strong === "command") await plain(base, endpoint.token, "/")
      if (strong === "action") await post("/", { handle: "bump", args: { by: 1 } })
      // Past a weak wake by far, and short of a strong one.
      pass(29 * MIN)
      expect([strong, await stays(slept)]).toEqual([strong, true])
      if (strong === "message") {
        await plain(base, endpoint.token, "/_/turn", { method: "POST", body: "gone" })
        expect(await stays(slept)).toBe(true)
        pass(MIN + 1)
      } else pass(MIN + 1)
      await poll(slept).toBe(true)
    }
  })
  it("stays awake for a visible page with a stream and sleeps after its last lease expires", async () => {
    const lines: string[] = []
    const { base, endpoint, slept, pass } = await asleep(scratch(), clock(), (line) => lines.push(line))
    const page = await listen(base, endpoint.token)
    const visible = (headers?: HeadersInit) => fetch(base + "/_/visible", { method: "POST", headers })

    pass(4.5 * MIN)
    expect((await visible({ "sec-fetch-site": "cross-site" })).status).toBe(403)
    expect((await visible()).status).toBe(204)
    pass(MIN)
    expect(await stays(slept)).toBe(true)
    expect((await visible()).status).toBe(204)
    pass(MIN)
    expect(await stays(slept)).toBe(true)
    pass(MIN / 2 + 1)
    await poll(slept).toBe(true)
    await poll(() => page.heard).toContain("asleep")
    expect(lines.join("\n")).toContain("sleeps (idle timeout); last activity: startup")
    page.stop()
  })
  it("sleeps when asked, at once, and the next runtime has the state", async () => {
    const dir = scratch()
    const lines: string[] = []
    const { base, endpoint, post, slept } = await asleep(dir, clock(), (line) => lines.push(line))
    const page = await listen(base, endpoint.token)

    expect((await fetch(base + "/_/visible", { method: "POST" })).status).toBe(204)
    await post("/", { handle: "bump", args: { by: 2 } })
    expect(await plain(base, endpoint.token, "/_/close", { method: "POST" })).toBe("p asleep; any call wakes it, its state kept")
    await poll(slept).toBe(true)
    expect(lines.join("\n")).toContain("sleeps (explicit sleep); last activity: person")
    page.stop()

    const woken = await started(dir, { exit: () => {} })

    expect(await (await woken.get("/")).json()).toMatchObject({ n: 2 })
  })
  it("carries its deadline over a restart, so the one in its place stays up as long", async () => {
    const dir = scratch()
    const time = clock()
    const first = await started(dir, { strengths: { weak: MIN, strong: 30 * MIN }, now: time.now, exit: () => {}, successor: () => {} })

    await first.post("/", { handle: "bump", args: { by: 1 } })
    await plain(first.base, first.endpoint.token, "/_/restart", { method: "POST" })
    await first.runtime.close()

    // The one in its place began with a weak wake of its own, five minutes; what it carried is the action's half hour.
    const { slept, pass } = await asleep(dir, time)

    pass(29 * MIN)
    expect(await stays(slept)).toBe(true)
    pass(MIN + 1)
    await poll(slept).toBe(true)
  })
})
