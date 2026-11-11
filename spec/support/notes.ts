// Materialize the notes fixture as an app inside a spec's temporary directory.
import { cpSync, mkdirSync, realpathSync, symlinkSync } from "node:fs"
import { join } from "node:path"

export function notesApp(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const name of ["scripts", "src", "ui"]) cpSync(new URL(`./notes/${name}`, import.meta.url), join(dir, name), { recursive: true })
  cpSync(new URL("../../skills/baba/package.json", import.meta.url), join(dir, "package.json"))
  symlinkSync(new URL("../../node_modules", import.meta.url).pathname, join(dir, "node_modules"))

  return realpathSync(dir)
}
