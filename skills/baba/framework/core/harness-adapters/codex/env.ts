// Environment the harness gives the agent's shell and tooling.
export const vars = { sessionId: "CODEX_THREAD_ID", home: "CODEX_HOME" } as const

export type Env = Readonly<Record<string, string | undefined>>
