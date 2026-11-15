// The role's door: opens it in a session, or serves the session's runtime. The agent runs it; nothing else does.
import { main } from "babavoss/core/bv/door.ts"
import role from "../src/role.ts"

await main(role)
