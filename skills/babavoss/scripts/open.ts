// The app entry opens a session or serves its resident runtime.
import { main } from "#babavoss/core/bv/door.ts"
import app from "../src/app.ts"
import { frameworkNotes } from "../src/framework.ts"

await main(app, (cwd) => frameworkNotes(cwd, new URL("../", import.meta.url).pathname))
