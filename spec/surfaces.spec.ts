// This repository's own surfaces' specs, run with the framework's fast ones: a test run skips .baba/, so one `bun test`
// covers both through here. Those that start processes, *.whole.spec.ts, are run where they are, by `bun run spec:whole`.
import { Glob } from "bun"
import { join } from "node:path"

const surfaces = join(import.meta.dir, "../.baba/surfaces")

for (const file of new Glob("*/spec/**/*.spec.{ts,tsx}").scanSync(surfaces)) if (!/\.whole\.spec\.tsx?$/.test(file)) await import(join(surfaces, file))
