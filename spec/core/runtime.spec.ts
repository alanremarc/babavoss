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
import { startRuntime, appVersion } from "../../skills/babavoss/framework/core/runtime/runtime.ts"
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
    expect(await startRuntime(app(dir), ["--session", "S"], { env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts"), log: () => {} })).toBeUndefined()
  })
})

it("refuses a definition without its surface or ui", () => {
  const whole = { name: "p", ui: scratch(), surface: counter }
  const without = (...parts: string[]) => Object.fromEntries(Object.entries(whole).filter(([key]) => !parts.includes(key))) as typeof whole

  expect(() => defineApp(without("surface"))).toThrow("app p has no surface:")
  expect(() => defineApp(without("ui"))).toThrow("app p has no ui:")
  expect(defineApp(whole)).toBe(whole)
})

it("ends once idle when a watched source changes, releasing the session, so the next call wakes the new code", async () => {
  const dir = scratch()
  const src = join(dir, "src")

  require("node:fs").mkdirSync(src)

  let ended = 0
  const runtime = await startRuntime(app(dir), ["--session", "W"], {
    env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts"),
    idleMs: 60_000,
    log: () => {},
    watch: [src],
    exit: () => void ended++,
  })

  expect(runtime).toBeDefined()
  closers.push(() => runtime!.close())
  expect(findService(join(dir, "sessions", "W", "p"))).resolves.toMatchObject({ port: runtime!.port })
  writeFileSync(join(src, "app.ts"), "// edited")
  await poll(() => ended, { timeout: 5000 }).toBe(1)
  expect(findService(join(dir, "sessions", "W", "p"))).resolves.toBeUndefined()

  // The next runtime has a new page address.
  const again = await startRuntime(app(dir), ["--session", "W"], { env: { BABAVOSS_HOME: dir }, entry: join(dir, "scripts/open.ts"), idleMs: 60_000, log: () => {} })

  expect(again).toBeDefined()
  closers.push(() => again!.close())
  expect(again!.port).not.toBe(runtime!.port)
})

it("reads the version from the package beside the app entry", () => {
  const dir = scratch()
  const entry = join(dir, "scripts/open.ts")

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "2.3.4" }))
  expect(appVersion(entry)).toBe("2.3.4")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "3.0.0" }))
  expect(appVersion(entry)).toBe("3.0.0")
})
