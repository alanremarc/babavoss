// Exercises how a headless harness handles an interrupted process and the next turn.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { antigravityCli } from "../../framework/core/harness/index.ts"

test("Antigravity resumes the interrupted conversation and sends waiting messages in order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "baba-agy-"))
  const path = process.env.PATH

  writeFileSync(join(dir, "agy"), `#!/usr/bin/env bun
const resumed = process.argv.at(-2) === "--conversation"
const id = resumed ? process.argv.at(-1) : "agy-thread"
process.on("SIGINT", () => process.exit(130))
let first = true
for await (const line of console) {
  const text = JSON.parse(line).message.content
  if (first) {
    console.log(JSON.stringify({ event: "init", conversation_id: id }))
    first = false
  }
  if (!resumed) continue
  console.log(JSON.stringify({
    event: "step_update",
    step_update: { step_type: "agent_response", state: "DONE", text_delta: text },
  }))
  console.log(JSON.stringify({ event: "result", result: { status: "SUCCESS" } }))
}
`, { mode: 0o700 })
  process.env.PATH = `${dir}:${path ?? ""}`

  try {
    const session = antigravityCli().start({ home: dir, project: dir, session: "requested", model: "" })
    const events = session.events[Symbol.asyncIterator]()
    const next = async () => {
      const event = await events.next()

      return event.done ? undefined : event.value
    }

    try {
      session.say("interrupted message")
      expect(await next()).toEqual({ kind: "message", text: "interrupted message" })
      expect(await next()).toMatchObject({ kind: "started", session: "agy-thread" })
      session.stop()
      session.say("first after interrupt")
      session.say("second after interrupt")

      expect(await next()).toMatchObject({ kind: "turn", ok: false, text: "interrupted" })
      expect(await next()).toEqual({ kind: "message", text: "first after interrupt" })
      expect(await next()).toMatchObject({ kind: "started", session: "agy-thread" })
      expect(await next()).toEqual({ kind: "reply", text: "first after interrupt" })
      expect(await next()).toMatchObject({ kind: "turn", ok: true })
      expect(await next()).toEqual({ kind: "message", text: "second after interrupt" })
      expect(await next()).toEqual({ kind: "reply", text: "second after interrupt" })
      expect(await next()).toMatchObject({ kind: "turn", ok: true })
      await session.end()
      expect(await next()).toMatchObject({ kind: "ended" })
      expect(await next()).toBeUndefined()
    } finally {
      await session.end()
    }
  } finally {
    if (path === undefined) delete process.env.PATH
    else process.env.PATH = path
    rmSync(dir, { recursive: true, force: true })
  }
})
