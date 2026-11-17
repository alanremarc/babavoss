// The root's door: opens it in a session, or serves the session's runtime. The agent runs it; nothing else does.
import { main } from "../../../../framework/core/bv/door.ts"
import root from "../src/root.ts"

await main(root)
