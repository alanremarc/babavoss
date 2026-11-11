// The resident process as its clients see it: http in, views and answers out; the door's rules; the doors reach a surface
// only through it, and say so in one line where the environment refuses it.
import { poll } from "../support/poll.ts"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, it } from "bun:test"
import { defineApp } from "../../skills/babavoss/framework/core/app.ts"
import { reach } from "../../skills/babavoss/framework/core/runtime/reach.ts"
import { startRuntime, appVersion, RELOAD_MS } from "../../skills/babavoss/framework/core/runtime/runtime.ts"
import { admitted } from "../../skills/babavoss/framework/core/runtime/door.ts"
import { ACTOR_HEADER, SERVICE_HEADER, endpointFile, findService, type Endpoint } from "../../skills/babavoss/framework/core/runtime/service.ts"
import { request as httpRequest, type IncomingMessage } from "node:http"
import { readJsonFile } from "../../skills/babavoss/framework/core/state/json-file.ts"
import { action, surface, view, type Update } from "../../skills/babavoss/framework/core/surface/index.ts"

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
/** An app whose page is ui/ under its directory; its runtime entry is never woken, the spec starts the runtime in its own process. */
const app = (dir: string) => {
  const ui = join(dir, "ui")

  mkdirSync(ui, { recursive: true })
  writeFileSync(join(ui, "index.html"), "<head><meta name=t content=%TOKEN%></head><script src=/_/app.js></script>")
  writeFileSync(join(ui, "app.js"), "// page")

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.0" }))

  return defineApp({ name: "p", ui, surface: counter })
}
const started = async (dir: string) => {
  const runtime = await startRuntime(app(dir), ["--session", "S"], { env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts"), idleMs: 60_000, log: () => {}, watch: [] })

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

  it("serves the app's page for a browser, keeps the token on everything else, and refuses other machines", async () => {
    const dir = scratch()
    const { base, endpoint, get } = await started(dir)
    const page = await fetch(base + "/notes/2", { headers: { accept: "text/html,*/*" } })
    const text = await page.text()

    expect([page.headers.get("content-type"), text.includes("%TOKEN%"), text.includes("content=")]).toEqual(["text/html", false, true])
    expect(text).toContain(
      `<meta name="babavoss:app" content="p"><meta name="babavoss:version" content="1.0"><meta name="babavoss:session" content="S"></head>`
    )
    expect((await fetch(base + "/_/app.js")).headers.get("content-type")).toBe("text/javascript")
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

    expect([broken.status, await broken.text()]).toEqual([500, "the app's ui has no index.html"])

    const request = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage
    const port = Number(new URL(base).port)

    expect(admitted(request({ host: `127.0.0.1:${port}` }), port)).toBe(true)
    expect(admitted(request({ host: "evil.example:80" }), port)).toBe(false)
    expect(admitted(request({ host: `localhost:${port}`, origin: "http://evil.example" }), port)).toBe(false)
    expect((await get("/_/missing.js")).status).toBe(404)
    expect((await get("/")).headers.get(SERVICE_HEADER)).toBe(endpoint.token)
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
    const p = app(dir)
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
    const p = app(dir)

    expect(reach(p, { id: "S" }, { env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts") })).rejects.toThrow("the runtime failed to start")
    expect(existsSync(join(dir, "sessions", "S", "p", "model.json"))).toBe(false)
  })

  it("lets one process own a directory at a time", async () => {
    const dir = scratch()

    await started(dir)

    // Another process asks for the same directory, and is told it is taken. This one, asking again, is its own code loaded again.
    const service = join(process.cwd(), "skills/babavoss/framework/core/runtime/service.ts")
    const state = join(dir, "sessions", "S", "p")
    const asks = `import { ownService } from ${JSON.stringify(service)}; console.log(String(ownService(${JSON.stringify(state)})))`
    const other = Bun.spawnSync([process.execPath, "-e", asks])

    expect(other.stdout.toString().trim()).toBe("undefined")
  })
})

it("refuses a definition without its surface or ui", () => {
  const whole = { name: "p", ui: scratch(), surface: counter }
  const without = (...parts: string[]) => Object.fromEntries(Object.entries(whole).filter(([key]) => !parts.includes(key))) as typeof whole

  expect(() => defineApp(without("surface"))).toThrow("app p has no surface:")
  expect(() => defineApp(without("ui"))).toThrow("app p has no ui:")
  expect(defineApp(whole)).toBe(whole)
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

it("takes changed code in place: the same process, address and token, the state as it was saved, and open pages and a waiting agent told", async () => {
  const dir = scratch()
  const { runtime, endpoint, base, get, post } = await started(dir)

  await post("/", { handle: "bump", args: { by: 3 } }, { [ACTOR_HEADER]: "agent" })

  const page = await listen(base, endpoint.token)

  await poll(() => page.heard.length).toBe(1)
  await (await get("/?open", { accept: "text/plain" })).text()

  const waiting = get("/_/wait?seconds=20", { accept: "text/plain" }).then((response) => response.text())
  // The code as edited: the same surface, saying one fact more. Its entry runs again in this process, as under bun --hot.
  const edited = defineApp({
    name: "p",
    ui: join(dir, "ui"),
    surface: {
      ...counter,
      view: (m, path, actor) => (path === "/" ? { ...counter.view(m, path, actor), doubled: m.n * 2 } : counter.view(m, path, actor)),
    },
  })
  const again = await startRuntime(edited, ["--session", "S"], options(dir))

  expect(again!.port).toBe(runtime.port)
  expect(readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "p")))).toEqual(endpoint)
  expect(await (await get("/")).json()).toMatchObject({ n: 3, doubled: 6 })
  expect(await waiting).toContain("+ doubled: 6")
  expect(page.heard.filter((event) => event === "change").length).toBeGreaterThan(1)
  page.stop()
})

describe("changed code while work runs", () => {
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
  const edited = (dir: string) =>
    defineApp({ name: "h", ui: join(dir, "ui"), surface: { ...holder, view: (m, path) => (path === "/" ? { ...holding.view(m, path), edited: true } : undefined) } })
  const begun = async (swapWaitMs?: number) => {
    const dir = scratch()
    const lines: string[] = []
    const opts = { ...options(dir), log: (line: string) => lines.push(line), swapWaitMs }

    app(dir)

    const runtime = await startRuntime(defineApp({ name: "h", ui: join(dir, "ui"), surface: holder }), ["--session", "S"], opts)

    closers.push(() => runtime!.close())

    const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "h")))!
    const headers = { accept: "text/plain", [SERVICE_HEADER]: endpoint.token }
    const base = `http://127.0.0.1:${runtime!.port}`
    const read = async () => (await fetch(`${base}/`, { headers })).text()
    const call = async (handle: string) => (await fetch(`${base}/`, { method: "POST", body: JSON.stringify({ handle, args: {} }), headers })).text()

    return { dir, lines, opts, read, call }
  }

  it("logs once that it waits, tells the agent, and loads once the work ends", async () => {
    const { dir, lines, opts, read, call } = await begun()

    await read()
    await call("hold")

    const again = startRuntime(edited(dir), ["--session", "S"], opts)

    await poll(() => lines.filter((line) => line.includes("waiting")).length).toBe(1)
    await sleep(RELOAD_MS * 2)
    expect(lines.filter((line) => line.includes("waiting"))).toEqual([
      expect.stringMatching(/^\d{4}-\d\d-\d\dT\S+Z h: its code changed; waiting for 1 job to finish before loading it, at most 30s: hold by agent:S$/),
    ])

    const told = await read()

    expect(told).toStartWith("h: its changed code is not loaded yet; it waits at most 30s for hold by agent:S\n")
    expect(told).not.toContain("edited")
    expect(await read()).not.toContain("not loaded yet")
    releases.splice(0).forEach((release) => release())
    await again
    expect(lines.at(-1)).toMatch(/Z h: its code changed and was loaded in place$/)

    const after = await read()

    expect(after).toStartWith("h: its changed code was loaded\n")
    expect(after).toContain("edited: true")
  })

  it("cuts work that does not end after the bounded wait, loads the new code, and names what it cut", async () => {
    const { dir, lines, opts, read, call } = await begun(300)

    await read()
    await call("hold")
    await startRuntime(edited(dir), ["--session", "S"], opts)
    expect(lines.at(-1)).toMatch(/Z h: its code changed and was loaded in place, after 0.3s, cutting hold by agent:S$/)

    const after = await read()

    expect(after).toStartWith("h: its changed code was loaded after 0.3s, cutting what still ran: hold by agent:S\n")
    expect(after).toContain("edited: true")
    expect(after).toContain("n: 0")
    releases.splice(0)
  })
})

it("starts again in place when the framework's own code changed: the same address, the state as saved, a new token for pages to take", async () => {
  const dir = scratch()
  const first = await startRuntime(app(dir), ["--session", "S"], { ...options(dir), stamp: 1 })
  const before = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "p")))!
  const call = (endpoint: Endpoint, by: number) =>
    fetch(`http://127.0.0.1:${endpoint.port}/`, {
      method: "POST",
      body: JSON.stringify({ handle: "bump", args: { by } }),
      headers: { "content-type": "application/json", [SERVICE_HEADER]: endpoint.token, [ACTOR_HEADER]: "agent" },
    })

  expect((await call(before, 3)).status).toBe(200)

  const again = await startRuntime(app(dir), ["--session", "S"], { ...options(dir), stamp: 2 })

  closers.push(() => again!.close())

  const after = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "p")))!

  expect(again!.port).toBe(first!.port)
  expect(after.token).not.toBe(before.token)
  expect((await call(before, 1)).status).toBe(401)
  expect(await (await call(after, 1)).json()).toMatchObject({ outcome: "written", view: { n: 4 } })
})

it("goes on with the code before it when changed code does not start from what was saved", async () => {
  const dir = scratch()
  const { runtime, get, post } = await started(dir)

  await post("/", { handle: "bump", args: { by: 3 } }, { [ACTOR_HEADER]: "agent" })

  const broken = defineApp({
    name: "p",
    ui: join(dir, "ui"),
    surface: {
      ...counter,
      restore: () => {
        throw new Error("cannot read what was saved")
      },
    },
  })

  expect((await startRuntime(broken, ["--session", "S"], options(dir)))!.port).toBe(runtime.port)
  expect(await (await get("/")).json()).toMatchObject({ n: 3 })
  expect((await post("/", { handle: "bump", args: { by: 1 } }, { [ACTOR_HEADER]: "agent" })).status).toBe(200)
})

it("tells open pages to load again when the page's own files change, and not when another file does", async () => {
  const dir = scratch()
  const src = join(dir, "src")

  mkdirSync(src)

  const runtime = await startRuntime(app(dir), ["--session", "W"], { ...options(dir), watch: [src, join(dir, "ui")] })

  closers.push(() => runtime!.close())

  const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "W", "p")))!
  const base = `http://127.0.0.1:${runtime!.port}`

  // A page was loaded, and holds its stream.
  await (await fetch(`${base}/`, { headers: { accept: "text/html" } })).text()

  const page = await listen(base, endpoint.token)

  await poll(() => page.heard.length).toBe(1)
  writeFileSync(join(src, "app.ts"), "// edited")
  await sleep(RELOAD_MS + 400)
  expect(page.heard).not.toContain("page")
  writeFileSync(join(dir, "ui", "app.js"), "// a new page")
  await poll(() => page.heard, { timeout: 5000 }).toContain("page")
  page.stop()
})

it("reads the version from the package beside the app entry", () => {
  const dir = scratch()
  const entry = join(dir, "scripts/open.ts")

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "2.3.4" }))
  expect(appVersion(entry)).toBe("2.3.4")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "3.0.0" }))
  expect(appVersion(entry)).toBe("3.0.0")
})
