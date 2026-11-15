// Loaded before every spec: no spec asks the repository for the latest release, and none reads or writes the person's
// settings, which are kept in a file of the specs' own instead. One that needs either sets its own.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.BABAVOSS_LATEST ??= ""
process.env.BABAVOSS_SETTINGS ??= join(mkdtempSync(join(tmpdir(), "babavoss-settings-")), "settings.json")
