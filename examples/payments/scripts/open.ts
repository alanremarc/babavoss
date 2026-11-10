// The app entry opens a session or serves its resident runtime.
import { main } from "#babavoss/core/bv/door.ts"
import app from "../src/app.ts"

await main(app)
