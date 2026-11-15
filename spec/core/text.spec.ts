// Text requests exercise a session runtime without a harness or the person's home.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "bun:test"
import { defineRoot } from "../../framework/core/root.ts"
import { startRuntime } from "../../framework/core/runtime/runtime.ts"
import { ACTOR_HEADER, endpointFile, SERVICE_HEADER, type Endpoint } from "../../framework/core/runtime/service.ts"
import { readJsonFile } from "../../framework/core/state/json-file.ts"
import { handle } from "../../framework/core/surface/view.ts"
import { poll } from "../support/poll.ts"

const dirs: string[] = []
const closes: (() => Promise<void>)[] = []
const setup = async () => {
  const dir = mkdtempSync(join(tmpdir(), "text-runtime-"))

  dirs.push(dir)

  const root = defineRoot({
    name: "text",
    ui: dir,
    surface: {
      description: "text fixture",
      init: () => ({ n: 0, yes: false }),
      update: (m: { n: number; yes: boolean }, msg) =>
        msg.kind === "call"
          ? msg.handle === "later"
            ? { model: m, commands: [{ kind: "count" }] }
            : msg.handle === "say"
              ? { model: m, notices: [msg.args.text as string] }
              : { model: { n: msg.args.n as number, yes: msg.args.yes as boolean } }
          : msg.kind === "counted"
            ? { model: { ...m, n: m.n + 1 } }
            : { model: m },
      view: (m, path) =>
        path === "/" || path === "/one" || path === "/two"
          ? {
              n: m.n,
              yes: m.yes,
              later: handle("later", "Count one, by a command"),
              say: handle("say", "Notice a line", {}, { text: "string" }),
              rows: [
                { at: "/one", text: "two words", do: handle("set", "Set values", { id: 1 }, { n: "number", yes: "boolean" }) },
                ...(path === "/two" ? [{ at: "/two", text: "other", do: handle("set", "Set values", { id: 2 }, { n: "number", yes: "boolean" }) }] : []),
              ],
            }
          : undefined,
      run: async (_command: { kind: string }, send: (event: { kind: string }) => void) => send({ kind: "counted" }),
      failed: () => ({ kind: "failed" }),
    },
  })

  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1" }))

  let ended = 0
  const start = async () => {
    const runtime = await startRuntime(root, ["--session", "S"], {
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
    // Plain text is the agent's word; JSON is the page, the person's, unless an actor is named, as a program's calls name the agent.
    const request = async (path: string, call?: unknown, plain = true, actor?: string) =>
      fetch(`http://127.0.0.1:${runtime.port}${path}`, {
        method: call ? "POST" : "GET",
        headers: { accept: plain ? "text/plain" : "application/json", [SERVICE_HEADER]: endpoint.token, ...(actor && { [ACTOR_HEADER]: actor }) },
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
  expect(text).toContain("do: bv text /one set id=1 n=number yes=boolean   Set values")
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
  expect(await (await request("/missing")).text()).toContain("changed by the person:\nn: 0 → 3")
  expect(await (await request("/missing")).text()).toBe("nothing at /missing")
})
it("5: wait listens for a person's call and times out", async () => {
  const { request } = await setup()

  await request("/?open")

  const waiting = request("/_/wait?seconds=2")

  await request("/one", { handle: "set", args: { id: 1, n: 4, yes: false } }, false)
  expect(await (await waiting).text()).toContain("changed by the person:\nn: 0 → 4")
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
it("8: says who changed each fact: the person, the surface by a command's event, or the agent along with them", async () => {
  const { request } = await setup()

  await request("/?open")
  await request("/one", { handle: "set", args: { id: 1, n: 3, yes: false } }, false)
  await request("/", { handle: "later", args: {} }, false)
  await poll(async () => (await request("/", undefined, false)).json()).toMatchObject({ n: 4 })
  await request("/one", { handle: "set", args: { id: 1, n: 4, yes: true } }, false, "agent:S")
  // n was the person's, then the surface's; yes was the agent's alone, through a program, and is not told back to it.
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("changed by the person and the surface:\nn: 0 → 4")
})
it("9: what only the agent's own calls changed, through a program, is not told again, and does not end a wait", async () => {
  const { request } = await setup()

  await request("/?open")
  await request("/one", { handle: "set", args: { id: 1, n: 5, yes: true } }, false, "agent:S")
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("nothing changed")

  const waiting = request("/_/wait?seconds=2")

  await request("/one", { handle: "set", args: { id: 1, n: 6, yes: true } }, false, "agent:S")
  await request("/one", { handle: "set", args: { id: 1, n: 6, yes: false } }, false)
  expect(await (await waiting).text()).toBe("changed by the person:\nyes: true → false")
  // The agent's own change is passed over, not kept: the next answer starts from what is true now.
  expect(await (await request("/missing")).text()).toBe("nothing at /missing")
})
it("10: where the person changed a fact after the agent did, the person's change is told, with both named", async () => {
  const { request } = await setup()

  await request("/?open")
  await request("/one", { handle: "set", args: { id: 1, n: 1, yes: false } }, false, "agent:S")
  await request("/one", { handle: "set", args: { id: 1, n: 2, yes: false } }, false)
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("changed by the person and you:\nn: 0 → 2")
})
it("11: tells what was noticed once, with the next answer, by who caused it, but not what the agent's own calls gave; a notice ends a wait", async () => {
  const { request } = await setup()

  await request("/?open")
  await request("/", { handle: "say", args: { text: "mine" } }, false, "agent:S")
  expect(await (await request("/", { handle: "say", args: { text: "also mine" } })).text()).toBe("nothing changed")

  const waiting = request("/_/wait?seconds=2")

  await request("/", { handle: "say", args: { text: "the person said" } }, false)
  expect(await (await waiting).text()).toBe("notices:\nthe person said (by the person)")
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("nothing changed")
  await request("/", { handle: "say", args: { text: "again" } }, false)
  await request("/one", { handle: "set", args: { id: 1, n: 7, yes: false } }, false)
  expect(await (await request("/missing")).text()).toBe("nothing at /missing\nnotices:\nagain (by the person)\nchanged by the person:\nn: 0 → 7")
})
it("12: a read of / is the present whole, by the word or a program's root.read, and what changes is counted from it", async () => {
  const { request } = await setup()

  await request("/?open")
  await request("/one", { handle: "set", args: { id: 1, n: 3, yes: true } }, false)
  expect(await (await request("/")).text()).not.toContain("changed")
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("nothing changed")
  await request("/one", { handle: "set", args: { id: 1, n: 4, yes: true } }, false)
  await request("/", undefined, false, "agent:S")
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("nothing changed")
  // A program's read is JSON, which carries no notices: they wait for the next text answer.
  await request("/", { handle: "say", args: { text: "heard" } }, false)
  await request("/", undefined, false, "agent:S")
  expect(await (await request("/_/wait?seconds=0")).text()).toBe("notices:\nheard (by the person)")
})
