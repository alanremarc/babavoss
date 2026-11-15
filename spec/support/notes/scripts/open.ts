// The app's door: opens a session or serves its resident runtime. An app runs on baba, the skill that holds the framework
// and its packages, and holds no copy of either: this finds baba where skills are kept and hands the app over to it.
// Nothing here may import a package: baba's are linked to the app when it first opens.
import { existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))))
const above = (dir: string): string[] => (dir === dirname(dir) ? [dir] : [dir, ...above(dirname(dir))])
/** Where baba may be, nearest first: where BABA_SKILL says, beside the app, among a harness's skills in a project above or the person's. */
const places = [
  process.env.BABA_SKILL,
  join(dirname(root), "baba"),
  ...[root, process.cwd(), homedir()].flatMap(above).flatMap((dir) => [".claude", ".agents", ".codex"].map((harness) => join(dir, harness, "skills/baba"))),
  process.env.CLAUDE_CONFIG_DIR && join(process.env.CLAUDE_CONFIG_DIR, "skills/baba"),
  process.env.CODEX_HOME && join(process.env.CODEX_HOME, "skills/baba"),
]
const baba = places.find((place) => place && existsSync(join(place, "scripts/provide.ts")))

if (!baba) {
  console.error(
    "this app runs on baba, which is not installed here or is older than 0.21.0. On the person's word, install it with " +
      "`bunx skills add alanremarc/babavoss -g -y`, or update it with `bunx skills update baba`, then open the app again"
  )
  process.exit(1)
}

const { open } = (await import(join(realpathSync(baba), "scripts/provide.ts"))) as { open(root: string): Promise<void> }

await open(root)
