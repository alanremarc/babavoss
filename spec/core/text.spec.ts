// Text requests exercise a session runtime without a harness or the person's home.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { defineApp } from "../../packages/babavoss/core/app.ts"
import { startRuntime } from "../../packages/babavoss/core/runtime/runtime.ts"
import { endpointFile, SERVICE_HEADER, type Endpoint } from "../../packages/babavoss/core/runtime/service.ts"
import { readJsonFile } from "../../packages/babavoss/core/state/json-file.ts"
import { handle } from "../../packages/babavoss/core/surface/view.ts"

const dirs: string[] = []
const closes: (() => Promise<void>)[] = []
const setup = async () => {
  const dir = mkdtempSync(join(tmpdir(), "text-runtime-"))

  dirs.push(dir)

  const app = defineApp({
    name: "text",
    ui: dir,
    surface: {
      description: "text fixture",
      init: () => ({ n: 0, yes: false }),
      update: (m: { n: number; yes: boolean }, msg) =>
        msg.kind === "call" ? { model: { n: msg.args.n as number, yes: msg.args.yes as boolean } } : { model: m },
      view: (m, path) =>
        path === "/" || path === "/one" || path === "/two"
          ? {
              n: m.n,
              yes: m.yes,
              rows: [
                { at: "/one", text: "two words", do: handle("set", "Set values", { id: 1 }, { n: "number", yes: "boolean" }) },
                ...(path === "/two" ? [{ at: "/two", text: "other", do: handle("set", "Set values", { id: 2 }, { n: "number", yes: "boolean" }) }] : []),
              ],
            }
          : undefined,
      run: async () => {},
      failed: () => ({ kind: "failed" }),
    },
  })

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1" }))

  let ended = 0
  const start = async () => {
    const runtime = await startRuntime(app, ["--session", "S"], {
      entry: join(dir, "scripts/open.ts"),
      env: { BABAVOSS_HOME: dir },
      idleMs: 60_000,
      watch: [],
      log: () => {},
      exit: () => {
        ended++
      },
    })

    if (!runtime) throw new Error("not started")
    closes.push(() => runtime.close())

    const endpoint = readJsonFile<Endpoint>(endpointFile(join(dir, "sessions", "S", "text")))!
    const request = async (path: string, call?: unknown, plain = true) =>
      fetch(`http://127.0.0.1:${runtime.port}${path}`, {
        method: call ? "POST" : "GET",
        headers: { accept: plain ? "text/plain" : "application/json", [SERVICE_HEADER]: endpoint.token },
        ...(call ? { body: JSON.stringify(call) } : {}),
      })

    return { runtime, request }
  }

  return { ...(await start()), start, ended: () => ended }
}

afterEach(async () => {
  for (const close of closes.splice(0)) await close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it("1: reads relative facts, quoted table rows and handle declarations; unknown paths are 404", async () => {
  const { request } = await setup()
  const response = await request("/one")
  const text = await response.text()

  expect(response.headers.get("content-type")).toBe("text/plain")
  expect(text).toContain('rows: at\ttext\n"/one"\t"two words"')
  expect(text).toContain("rows.0.do: bv text /one set id=1 n=number yes=boolean   Set values")
  expect(text).toContain("n: 0")

  const missing = await request("/missing")

  expect([missing.status, await missing.text()]).toEqual([404, "nothing at /missing"])
})
it("2: opens without client use lines and marks the session told", async () => {
  const { request } = await setup()
  const text = await (await request("/?open")).text()

  expect(text.startsWith("text 1\n")).toBe(true)
  expect(text).not.toContain("use:")
  expect(await (await request("/")).text()).not.toContain("changed:")
})
it("3: converts numbers and booleans, refuses invalid text and ambiguous fixed arguments, and returns changes only", async () => {
  const { request } = await setup()

  await request("/?open")

  const call = { handle: "set", args: { n: "2", yes: "true" } }
  const answer = await request("/one", call)
  const text = await answer.text()

  expect(answer.status).toBe(200)
  expect(text).toContain("n: 0 → 2")
  expect(text).toContain("yes: false → true")
  expect(text).not.toContain("rows:")
  expect(text.match(/n: 0 → 2/g)).toHaveLength(1)
  for (const args of [
    { n: "oops", yes: "true" },
    { n: "2", yes: "yes" },
  ]) {
    const bad = await request("/one", { handle: "set", args })

    expect(bad.status).toBe(409)
    expect(await bad.text()).toMatch(/refused: .*must be a (number|boolean)/)
  }
  expect((await request("/two", call)).status).toBe(409)
  expect((await request("/two", { handle: "set", args: { ...call.args, id: "2" } })).status).toBe(200)
  expect(await (await request("/one", call)).text()).toBe("nothing changed")
})
it("4: reports the person's change once in the agent's next GET", async () => {
  const { request } = await setup()

  await request("/?open")
  await request("/one", { handle: "set", args: { id: 1, n: 3, yes: true } }, false)
  expect(await (await request("/missing")).text()).toContain("changed:\nn: 0 → 3")
  expect(await (await request("/missing")).text()).toBe("nothing at /missing")
})
it("5: wait listens for a person's call and times out", async () => {
  const { request } = await setup()

  await request("/?open")

  const waiting = request("/_/wait?seconds=2")

  await request("/one", { handle: "set", args: { id: 1, n: 4, yes: false } }, false)
  expect(await (await waiting).text()).toContain("changed:\nn: 0 → 4")
  expect(await (await request("/_/wait?seconds=0.01")).text()).toBe("nothing changed")
})
it("6 and 7: closes, drains and carries the told view into the next runtime", async () => {
  const { request, runtime, start } = await setup()

  await request("/?open")
  expect(await (await request("/_/close", {})).text()).toBe("text closed; any call wakes it")
  await runtime.close()

  const next = await start()

  expect(await (await next.request("/missing")).text()).toBe("nothing at /missing")
})
it("7: a session never told receives the whole root, then persists its memory", async () => {
  const { request, runtime, start } = await setup()

  expect(await (await request("/missing")).text()).toContain("changed:\nn: 0")
  await request("/one", { handle: "set", args: { id: 1, n: 9, yes: true } }, false)
  await runtime.close()

  const next = await start()

  expect(await (await next.request("/missing")).text()).toContain("changed:\nn: 0 → 9")
  expect(await (await next.request("/missing")).text()).toBe("nothing at /missing")
})
