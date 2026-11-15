// The root: what a .baba/ directory is to its session. The framework provides it, so a .baba/ with no surfaces has a
// runtime, a page and an answer all the same. Its first tab is the picker, which lists the surfaces; each surface is a
// util of the root, opened as a tab by the agent or by the person, as often as wanted. What a surface is for and how it
// is worked reaches the agent from the surface alone: its description in the picker, its views once it is open. The
// root works on the .baba/ of the directory the session runs in and is generated from the surfaces there: when one is
// made or removed the generated module changes, and the running root loads it.
import { statSync, watch, type FSWatcher } from "node:fs"
import { join } from "node:path"
import { main } from "../../core/bv/door.ts"
import { defineRoot } from "../../core/root.ts"
import { findBaba, generateRoot, SURFACES_DIR } from "../../core/provision.ts"
import type { AnySurface } from "../../core/surface/surface.ts"
import { shellUi } from "../src/hosting.ts"
import { picker } from "../src/picker.ts"
import { shell, util } from "../src/surface.ts"

const baba = findBaba(process.cwd())
const generated = baba && generateRoot(baba)
const surfaces = Object.entries(generated ? ((await import(join(generated, "surfaces.ts"))) as { default: Record<string, AnySurface> }).default : {})
const listed = surfaces.map(([name, surface]) => ({ name, description: surface.description }))

// A surface made or removed in .baba/ by hand is in the root as soon as it is on disk: the root is generated again. What
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

await main(defineRoot({
  name: "baba",
  ui: shellUi(generated ?? new URL("../ui/", import.meta.url)),
  surface: shell({
    title: "baba",
    utils: [util("surfaces", "The surfaces in this .baba/", picker(baba, listed), { open: "always" }), ...surfaces.map(([name, surface]) => util(name, surface.description, surface))],
  }),
}))
