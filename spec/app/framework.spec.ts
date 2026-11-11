// The note that the app being written depends on an older framework than this skill does: said only then.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, it } from "bun:test"
import { frameworkNotes } from "../../skills/baba/src/framework.ts"

const root = mkdtempSync(join(tmpdir(), "framework-"))
const holding = (name: string, version: string) => {
  mkdirSync(join(root, name, "src"), { recursive: true })
  writeFileSync(join(root, name, "package.json"), JSON.stringify({ dependencies: { babavoss: `github:alanremarc/babavoss#v${version}` } }))

  return join(root, name)
}

afterAll(() => rmSync(root, { recursive: true, force: true }))

it("says when the app's framework is behind the skill's, from anywhere in the app, and nothing otherwise", () => {
  const author = holding("author", "0.10.0")

  expect(frameworkNotes(join(holding("behind", "0.9.0"), "src"), author).framework).toMatch(/^this app depends on babavoss 0\.9\.0; baba is at 0\.10\.0\./)
  expect(frameworkNotes(holding("level", "0.10.0"), author)).toEqual({})
  expect(frameworkNotes(holding("ahead", "0.11.0"), author)).toEqual({})
  expect(frameworkNotes(holding("prerelease", "0.10.0-rc.1"), author).framework).toContain("0.10.0-rc.1")
  expect(frameworkNotes(tmpdir(), author)).toEqual({})
})

it("tells the framework note once through the authoring cli, and omits it when versions agree", async () => {
  const { readFileSync } = await import("node:fs")
  const entry = new URL("../../skills/baba/scripts/open.ts", import.meta.url).pathname
  const carried = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version
  const cwd = holding("cli-app", "0.0.0")
  const env = {
    ...process.env,
    BABAVOSS_HOME: join(root, "machine"),
    BABAVOSS_BIN: root,
    CLAUDE_CONFIG_DIR: join(root, "claude"),
    CODEX_HOME: join(root, "codex"),
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_THREAD_ID: "",
  }
  const run = async (command = "/") => {
    const child = Bun.spawn([process.execPath, entry, "--session", "framework-note", ...(command ? [command] : [])], {
      env,
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = await new Response(child.stdout).text()
    const err = await new Response(child.stderr).text()

    expect(await child.exited, err).toBe(0)

    return out
  }

  try {
    expect(await run("")).toContain("this app depends on babavoss 0.0.0")
    expect(await run()).not.toContain("this app depends on babavoss")
    expect(await run("")).not.toContain("this app depends on babavoss")
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { babavoss: `github:alanremarc/babavoss#v${carried}` } }))
    expect(await run("")).not.toContain("this app depends on babavoss")
  } finally {
    await run("close")
  }
})
