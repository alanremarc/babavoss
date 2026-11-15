// The root's door: opens the root of a .baba/ in a session, or serves the session's runtime. `baba start` runs it, and so
// does the framework's hook when a session starts.
import { main } from "../../core/bv/door.ts"
import role from "../src/role.ts"

await main(role)
