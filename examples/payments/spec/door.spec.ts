// The payments door and bv import files, match certain payments and expose the unsure ones.
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { expect, test } from "bun:test"

test("the door imports March and bv matches its certain payments", () => {
  const root = mkdtempSync(join(tmpdir(), "payments-door-"))
  const entry = resolve("examples/payments/scripts/open.ts")
  const client = resolve("packages/babavoss/core/bv/bv.ts")
  const env = { ...process.env, BABAVOSS_HOME: root, BABAVOSS_BIN: root, CLAUDE_CODE_SESSION_ID: "payments", CODEX_THREAD_ID: "" }
  const run = (args: string[], file = client) => {
    const result = spawnSync(process.execPath, [file, ...args], { cwd: root, env, encoding: "utf8" })

    expect(result.status, result.stderr).toBe(0)

    return result.stdout
  }

  cpSync(resolve("examples/payments/assets/fixtures"), root, { recursive: true })
  try {
    expect(run([], entry)).toContain("payments 0.1.0")
    run(["/", "import", "month=March", "payments=march-payments.csv", "invoices=march-invoices.csv"])
    expect(run(["/months/March", "match-certain"])).toContain("matched")
    expect(run(["/months/March/unsure"])).toContain("payments.0")
  } finally {
    run(["close"])
    rmSync(root, { recursive: true, force: true })
  }
})
