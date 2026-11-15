// The session's directory, as a surface's command finds it from the runtime it runs in: beside its roots' state, and none outside one.
import { expect, test } from "bun:test"
import { stateDir } from "../../framework/core/index.ts"
import { sessionDir } from "../../framework/core/state/session-dir.ts"

test("a runtime's session directory holds its roots' state, and a process that serves none has none", () => {
  const env = { BABAVOSS_HOME: "/p/.babavoss" }
  const dir = sessionDir(["bun", "/p/.baba/.root/open.ts", "--serve", "s/1", "baba"], env)

  expect(dir).toBe("/p/.babavoss/sessions/s-1")
  expect(stateDir({ name: "baba" }, { id: "s/1" }, env)).toBe(`${dir}/baba`)
  expect(sessionDir(["bun", "test"], env)).toBeUndefined()
  expect(sessionDir(["bun", "open.ts", "--serve", "s"], {})).toBeUndefined()
})
