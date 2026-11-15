// The shell's door: opens the shell of a .baba/ in a session, or serves the session's runtime. `baba start` runs it, and
// so does the framework's hook when a session starts. The shell is the root of .baba/ to its session, its one runtime and
// page, which the framework provides, so a .baba/ with no surfaces has an answer all the same. It works on the .baba/ of
// the directory the session runs in and is made from the surfaces there, as generated into .root/: when one is made or
// removed the generated module changes, and the running shell loads it. Each surface is loaded on its own: one whose code
// does not load is listed as broken, and the shell starts with the rest (loading.ts).
import { statSync, watch, type FSWatcher } from "node:fs"
import { dirname, join } from "node:path"
import { main } from "../../core/bv/door.ts"
import { defineRoot } from "../../core/root.ts"
import { findBaba, generateRoot, SURFACES_DIR } from "../../core/provision.ts"
import { shellUi } from "../src/hosting.ts"
import { loadSurfaces, type Loaders } from "../src/loading.ts"
import { shell } from "../src/surface.ts"

const baba = findBaba(process.cwd())
const generated = baba && generateRoot(baba)
const { surfaces, broken } = generated
  ? await loadSurfaces(((await import(join(generated, "surfaces.ts"))) as { default: Loaders }).default, dirname(baba!))
  : { surfaces: {}, broken: {} }

// A surface made or removed in .baba/ by hand is in the shell as soon as it is on disk: .root/ is generated again. What
// is watched is surfaces/, or .baba/ until there is one; when it is gone or made anew, as a checkout may, or the watch
// fails, it is watched again. A file read while it is replaced is read again after the next change.
const held = globalThis as { babavossSurfaces?: FSWatcher }
const inode = (dir: string) => {
  try {
    return statSync(dir).ino
  } catch {
    return undefined
  }
}
const follow = (baba: string) => {
  const dir = join(baba, SURFACES_DIR)
  const watched = inode(dir)
  let again: ReturnType<typeof setTimeout> | undefined
  const changed = () => {
    clearTimeout(again)
    again = setTimeout(() => {
      try {
        generateRoot(baba)
      } catch {}
      if (inode(dir) !== watched) follow(baba)
    }, 300)
    again.unref()
  }

  held.babavossSurfaces?.close()
  try {
    held.babavossSurfaces = watch(watched === undefined ? baba : dir, { recursive: watched !== undefined }, changed)
    held.babavossSurfaces.on("error", () => setTimeout(() => follow(baba), 300).unref())
    held.babavossSurfaces.unref()
  } catch {
    held.babavossSurfaces = undefined
  }
}

if (baba) follow(baba)
else held.babavossSurfaces?.close()

// Where there is no .baba/, the page is the shell's own, with no surface to hold.
await main(defineRoot({ name: "baba", ui: shellUi(generated ?? new URL("../ui/", import.meta.url)), surface: shell(surfaces, baba, broken) }))
