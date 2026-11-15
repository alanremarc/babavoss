// Loaded before every spec: the apps the specs open run on this checkout's baba, never on one installed on the machine.
import { fileURLToPath } from "node:url"

process.env.BABA_SKILL = fileURLToPath(new URL("../../skills/baba", import.meta.url))
