// Environment the harness gives the agent's shell and tooling.
export const vars = { sessionId: "CLAUDE_CODE_SESSION_ID", configDir: "CLAUDE_CONFIG_DIR" } as const

export type Env = Readonly<Record<string, string | undefined>>
