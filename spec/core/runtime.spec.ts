// The resident process as its clients see it: http in, views and answers out; the door's rules; the doors reach a surface
// only through it, and say so in one line where the environment refuses it.
import { poll } from "../support/poll.ts"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, it } from "bun:test"
import { defineRoot } from "../../framework/core/root.ts"
import { reach } from "../../framework/core/runtime/reach.ts"
import { devMode, startRuntime, rootVersion, LOOK_MS, RELOAD_MS, type RuntimeOptions } from "../../framework/core/runtime/runtime.ts"
import { admitted } from "../../framework/core/runtime/door.ts"
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
  writeFileSync(join(ui, "index.html"), "<head><meta name=t content=%TOKEN%></head><script src=/_/root.js></script>")
  writeFileSync(join(ui, "root.js"), "// page")

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.0" }))

  return defineRoot({ name: "p", ui, surface: counter, ...(boot && { boot }) })
}
const started = async (dir: string, more: Partial<RuntimeOptions> = {}, boot?: (path: string) => string[]) => {
  const runtime = await startRuntime(root(dir, boot), ["--session", "S"], {
    env: { BABAVOSS_HOME: dir },
    entry: join(dir, "scripts/open.ts"),
    idleMs: 60_000,
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

  return { runtime, endpoint, base, get, post }
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
    const { base } = await started(scratch(), { latest: async () => "99.0.0" })

    await poll(async () => (await fetch(base + "/", { headers: { accept: "text/html" } })).text()).toContain(
      '<meta name="babavoss:update" content="99.0.0">'
    )
  })

  it("serves the root's page for a browser, keeps the token on everything else, and refuses other machines", async () => {
    const dir = scratch()
    const { base, endpoint, get } = await started(dir)
    const page = await fetch(base + "/notes/2", { headers: { accept: "text/html,*/*" } })
    const text = await page.text()

    expect([page.headers.get("content-type"), text.includes("%TOKEN%"), text.includes("content=")]).toEqual(["text/html", false, true])
    expect(text).toContain(
      `<meta name="babavoss:root" content="p"><meta name="babavoss:version" content="1.0"><meta name="babavoss:session" content="S"></head>`
    )
    expect((await fetch(base + "/_/root.js")).headers.get("content-type")).toBe("text/javascript")
    expect(text).not.toContain("babavoss:update")
    expect(page.headers.get("set-cookie")).toContain(`babavoss-service-${new URL(base).port}=`)
    expect((await fetch(base + "/n", { headers: { accept: "application/json", cookie: page.headers.get("set-cookie")!.split(";")[0]! } })).status).toBe(200)

    // fetch normalizes a traversal away; a raw request does not. The door's URL parsing does, so it is a surface path, never a file.
    const raw = await new Promise<number>((done) =>
      httpRequest({ host: "127.0.0.1", port: Number(new URL(base).port), path: "/_/../index.html" }, (res) => done(res.statusCode ?? 0)).end()
    )

    expect(raw).toBe(401)

    expect((await fetch(base + "/", { headers: { accept: "*/*" } })).status).toBe(401)

    // A page that cannot be served is the error, to the browser and the log; never the view in its place.
    rmSync(join(dir, "ui", "index.html"))

    const broken = await fetch(base + "/", { headers: { accept: "text/html" } })

    expect([broken.status, await broken.text()]).toEqual([500, "the root's ui has no index.html"])

    const request = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage
    const port = Number(new URL(base).port)

    expect(admitted(request({ host: `127.0.0.1:${port}` }), port)).toBe(true)
    expect(admitted(request({ host: "evil.example:80" }), port)).toBe(false)
    expect(admitted(request({ host: `localhost:${port}`, origin: "http://evil.example" }), port)).toBe(false)
    expect((await get("/_/missing.js")).status).toBe(404)
    expect((await get("/")).headers.get(SERVICE_HEADER)).toBe(endpoint.token)
  })

  it("serves the page with what it shows first, as the person reads it, in an island nothing a view says can break out of", async () => {
    const { base, post } = await started(scratch(), {}, (path) => (path === "/notes/2" ? ["/", "/n", "/nowhere"] : ["/"]))

    await post("/", { handle: "bump", args: { by: 3 } })

    const text = await (await fetch(base + "/notes/2", { headers: { accept: "text/html" } })).text()
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

    expect(await next()).toEqual({ event: "change", data: { version: 0, jobs: [] } })
    expect(await next()).toEqual({ event: "turn", data: { agent: "unknown", since: expect.any(Number), waiting: 0, drivable: false } })
    await post("/", { handle: "later", args: {} }, { [ACTOR_HEADER]: "agent:s" })
    expect(await next()).toEqual({ event: "change", data: { version: 1, jobs: ["agent:s"] } })
    expect(await next()).toEqual({ event: "call", data: { path: "/", handle: "later", args: {}, actor: "agent:s" } })
    await post("/", { handle: "nope", args: {} })
    expect(await next()).toMatchObject({ event: "call", data: { path: "/", handle: "nope", actor: "person", refused: expect.stringContaining("not offered") } })
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
const options = (dir: string) => ({ env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts"), idleMs: 60_000, log: () => {}, watch: [] })

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
      await poll(() => read("/n")).toContain("its code changed on disk")
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
      await sleep(LOOK_MS * 2)
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
      await (await fetch(`${base}/`, { headers: { accept: "text/html" } })).text()

      const page = await listen(base, endpoint.token)

      await poll(() => page.heard).toEqual(["change", "turn"])
      writeFileSync(join(src, "root.ts"), "// edited")
      await sleep(RELOAD_MS + 400)
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
  const { get, base } = await started(dir)
  const opened = async () => (await get("/?open", { accept: "text/plain" })).text()

  expect(await opened()).toStartWith("p 1.0\n")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.1" }))
  expect(await opened()).toStartWith("p 1.0\n")
  expect(await (await fetch(base + "/", { headers: { accept: "text/html" } })).text()).toContain('<meta name="babavoss:version" content="1.0">')
})

it("says a later release is out against the version it runs", async () => {
  const dir = scratch()
  const { base } = await started(dir, { latest: async () => "1.1" })
  const page = async () => (await fetch(base + "/", { headers: { accept: "text/html" } })).text()

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
    expect((await fetch(base + "/_/turn", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).status).toBe(401)
  })
})
