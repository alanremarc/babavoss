// The harness environment, command line and paths used by tooling.
export const codex = {
  name: "codex",
  bin: "codex",
  /** The version these primitives were verified against; the harnesses skill says where to re-verify. */
  verified: "0.167.0",
  docs: { config: "https://learn.chatgpt.com/docs/config-file/config-reference", cli: "https://learn.chatgpt.com/docs/developer-commands?surface=cli" },
} as const

export * from "./env.ts"
export * from "./paths.ts"
export * from "./launch.ts"
