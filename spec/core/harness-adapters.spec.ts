import { describe, expect, it } from "bun:test"
import * as claudeCode from "../../skills/babavoss/framework/core/harness-adapters/claude-code/index.ts"
import * as codex from "../../skills/babavoss/framework/core/harness-adapters/codex/index.ts"

describe("claude-code", () => {
  it("builds a launch with a known session and only user settings", () => {
    expect(claudeCode.launch({ sessionId: "u-1", settingSources: ["user"], prompt: "hi" })).toEqual(["--session-id", "u-1", "--setting-sources", "user", "hi"])
    expect(claudeCode.launch({ resume: "u-1", fork: true, print: "q", outputFormat: "json", prompt: "ignored" })).toEqual([
      "--resume",
      "u-1",
      "--fork-session",
      "-p",
      "q",
      "--output-format",
      "json",
    ])
  })

  it("knows its environment and paths", () => {
    const env = { CLAUDE_CODE_SESSION_ID: "s", CLAUDE_CONFIG_DIR: "/c" }

    expect(claudeCode.transcriptPath("/Users/me/.claude/work", "s", env)).toBe("/c/projects/-Users-me--claude-work/s.jsonl")
  })
})

describe("codex", () => {
  it("builds a launch with a working root and config overrides, a resume and an exec", () => {
    expect(codex.launch({ cwd: "/w", config: { model: '"example"' } })).toEqual(["-C", "/w", "-c", 'model="example"'])
    expect(codex.resume({ last: true })).toEqual(["resume", "--last"])
    expect(codex.exec("q", { json: true, skipGitRepoCheck: true })).toEqual(["exec", "--json", "--skip-git-repo-check", "q"])
    // exec resume refuses -C and --sandbox after it: the launch options go to exec, before it.
    expect(codex.exec("q", { resume: "t1", cwd: "/w", sandbox: "workspace-write", json: true })).toEqual([
      "exec",
      "-C",
      "/w",
      "--sandbox",
      "workspace-write",
      "resume",
      "t1",
      "--json",
      "q",
    ])
  })

  it("knows its environment and paths", () => {
    const env = { CODEX_HOME: "/h" }

    expect(codex.sessionsDir(env)).toBe("/h/sessions")
    expect(codex.sessionIdOf("rollout-2026-11-03T00-24-22-01a19e94-035f-7991-b5a5-c1e924f60891.jsonl")).toBe("01a19e94-035f-7991-b5a5-c1e924f60891")
    expect(codex.sessionIdOf("history.jsonl")).toBeUndefined()
  })
})

describe("verified versions", () => {
  const installed = { claudeCode: claudeCode.installedVersion(), codex: codex.installedVersion() }

  it.skipIf(!installed.claudeCode)("match the installed Claude Code; a mismatch means re-verify the adapter", () => {
    expect(installed.claudeCode).toBe(claudeCode.claudeCode.verified)
  })
  it.skipIf(!installed.codex)("match the installed Codex; a mismatch means re-verify the adapter", () => {
    expect(installed.codex).toBe(codex.codex.verified)
  })
})
