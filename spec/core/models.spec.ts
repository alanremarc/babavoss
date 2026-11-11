// What a harness offers to run under, asked of the harness: against shims that speak each harness's own protocol, the
// models in the common shape, the harness's default told apart, and a harness that says nothing or leaves, refused.
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import { harnessModels } from "../../packages/babavoss/core/index.ts"

const dirs: string[] = []
/** An executable that runs `body` with each line of stdin as `line` and `out(object)` to answer. */
const shim = (body: string) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "models-")))
  const file = join(dir, "harness")

  dirs.push(dir)
  writeFileSync(
    file,
    `#!/usr/bin/env bun
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
require("node:readline").createInterface({ input: process.stdin }).on("line", (text) => { const line = JSON.parse(text); ${body} })
`
  )
  chmodSync(file, 0o755)

  return file
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("harness models", () => {
  it("asks Claude Code with an initialize control request: the default entry names the model used unasked, efforts only where taken", async () => {
    const bin = shim(`
      if (line.type === "control_request" && line.request.subtype === "initialize")
        out({ type: "control_response", response: { subtype: "success", request_id: line.request_id, response: { models: [
          { value: "default", resolvedModel: "big-1", displayName: "Default" },
          { value: "big", resolvedModel: "big-1", displayName: "Big", description: "For hard work", supportsEffort: true, supportedEffortLevels: ["low", "high"] },
          { value: "small", resolvedModel: "small-1", displayName: "Small" },
        ] } } })`)

    expect(await harnessModels("claude-code", { bin })).toEqual([
      { id: "big", name: "Big", description: "For hard work", efforts: ["low", "high"], default: true },
      { id: "small", name: "Small", efforts: [] },
    ])
  })

  it("asks Codex's app server: initialize, then the list once it is acknowledged; hidden models left out", async () => {
    const bin = shim(`
      if (line.method === "initialize") out({ jsonrpc: "2.0", id: line.id, result: { userAgent: "shim" } })
      if (line.method === "initialized") globalThis.ready = true
      if (line.method === "model/list") out(globalThis.ready
        ? { jsonrpc: "2.0", id: line.id, result: { data: [
            { model: "sol", displayName: "Sol", isDefault: true, defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "ultra" }] },
            { model: "old", hidden: true },
          ] } }
        : { jsonrpc: "2.0", id: line.id, error: { message: "not initialized" } })`)

    expect(await harnessModels("codex", { bin })).toEqual([{ id: "sol", name: "Sol", efforts: ["low", "ultra"], effort: "low", default: true }])
  })

  it("rejects when the harness leaves, is silent past the timeout, or is not installed", async () => {
    expect(harnessModels("claude-code", { bin: shim(`console.error("Not logged in"); process.exit(1)`) })).rejects.toThrow(
      /exited 1 before listing its models: Not logged in/
    )
    expect(harnessModels("codex", { bin: shim(``), timeoutMs: 300 })).rejects.toThrow(/did not list its models in 0.3s/)
    expect(harnessModels("codex", { bin: join(tmpdir(), "no-such-harness") })).rejects.toThrow(/did not start/)
  })
})
