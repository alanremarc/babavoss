// baba's door: opens a session or serves its resident runtime. baba is an app like any other, and the one that provides
// for itself.
import { realpathSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { open } from "./provide.ts"

await open(dirname(dirname(realpathSync(fileURLToPath(import.meta.url)))))
