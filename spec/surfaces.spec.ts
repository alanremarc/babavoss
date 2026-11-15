// This repository's own surfaces' specs, run with the framework's: a test run skips .baba/, so one `bun test` covers both through here.
import { Glob } from "bun"
import { join } from "node:path"

const surfaces = join(import.meta.dir, "../.baba/surfaces")

for (const file of new Glob("*/spec/**/*.spec.{ts,tsx}").scanSync(surfaces)) await import(join(surfaces, file))
