// The harness environment, command line and paths used by tooling.
export const claudeCode = {
  name: "claude-code",
  bin: "claude",
  /** The version these primitives were verified against; the harnesses skill says where to re-verify. */
  verified: "2.1.322",
  docs: { env: "https://code.claude.com/docs/en/env-vars", cli: "https://code.claude.com/docs/en/cli-reference" },
} as const

export * from "./env.ts"
export * from "./paths.ts"
export * from "./launch.ts"
