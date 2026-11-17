// Materialize the notes fixture as a root inside a spec's temporary directory.
import { cpSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** The framework's internals, which the fixture reaches as only a root of the framework does: by a path into this checkout. */
const FRAMEWORK = "../../../../framework/"
const OWN = ["scripts/open.ts", "src/root.ts", "ui/styles.css"]

/** Copies the fixture's directories into `dir`: its paths are written for where it sits here, and made absolute in the copy. */
export function copyNotes(dir: string, names = ["scripts", "src", "ui"]) {
  const framework = fileURLToPath(new URL("../../framework/", import.meta.url))

  mkdirSync(dir, { recursive: true })
  for (const name of names) cpSync(new URL(`./notes/${name}`, import.meta.url), join(dir, name), { recursive: true })
  for (const file of OWN.filter((own) => names.includes(own.split("/")[0]!)))
    writeFileSync(join(dir, file), readFileSync(join(dir, file), "utf8").replaceAll(FRAMEWORK, framework))
}

export function notesRoot(dir: string) {
  copyNotes(dir)
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "notes", version: "0.1.0", private: true, type: "module" }))
  // Linked to baba's packages, as its door does when it first opens: a spec may import the root without opening it.
  symlinkSync(new URL("../../node_modules", import.meta.url).pathname, join(dir, "node_modules"))

  return realpathSync(dir)
}
