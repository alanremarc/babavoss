// Builds a root's page for a release:  bun node_modules/babavoss/framework/shell/scripts/build.ts UI_DIR OUT_DIR
import { buildUi } from "../src/hosting.ts"

const [ui, out] = process.argv.slice(2)

if (!ui || !out) {
  console.error("build UI_DIR OUT_DIR")
  process.exit(2)
}
await buildUi(ui, out)
