// The app's one entry opens it; bv calls and reads its surface in an isolated session.
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"

test("the door opens the app and bv sets its greeting", () => {
  const root = mkdtempSync(join(tmpdir(), "app-door-"))
  const env = { ...process.env, BABAVOSS_HOME: root, BABAVOSS_BIN: root, CLAUDE_CODE_SESSION_ID: "spec", CODEX_THREAD_ID: "" }
  const run = (file: string, args: string[] = []) => {
    const result = spawnSync(file.endsWith(".ts") ? process.execPath : file, file.endsWith(".ts") ? [file, ...args] : args, { env, encoding: "utf8" })

    expect(result.status, result.stderr).toBe(0)

    return result.stdout
  }
  const client = join(root, "bv")

  try {
    expect(run(new URL("../scripts/open.ts", import.meta.url).pathname)).toContain('greeting: "hello"')
    run(client, ["/", "greet", "text=good morning"])
    expect(run(client, ["/"])).toContain('greeting: "good morning"')
  } finally {
    run(client, ["close"])
    rmSync(root, { recursive: true, force: true })
  }
})
