// Builds an app's page for a release:  bun node_modules/babavoss/packages/babavoss/shell/build.ts UI_DIR OUT_DIR
import { buildUi } from "./hosting.ts"

const [ui, out] = process.argv.slice(2)

if (!ui || !out) {
  console.error("build UI_DIR OUT_DIR")
  process.exit(2)
}
await buildUi(ui, out)
