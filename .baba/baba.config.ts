// This repository's .baba/: its root is named babavoss in every checkout, a worktree's too, not after the directory, and runs
// in dev mode, as the framework and its surfaces are made here: changed code restarts it at once.
import { config } from "babavoss/core/config.ts"

export default config({ title: "babavoss", dev: true })
