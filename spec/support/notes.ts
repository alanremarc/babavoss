// Materialize the notes fixture as an app inside a spec's temporary directory.
import { cpSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export function notesApp(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const name of ["scripts", "src", "ui"]) cpSync(new URL(`./notes/${name}`, import.meta.url), join(dir, name), { recursive: true })
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "notes", version: "0.1.0", private: true, type: "module" }))
  // Linked to baba's packages, as its door does when it first opens: a spec may import the app without opening it.
  symlinkSync(new URL("../../node_modules", import.meta.url).pathname, join(dir, "node_modules"))

  return realpathSync(dir)
}
