// The shell's door: opens the shell of a .baba/ in a session, or serves the session's runtime. `baba start` runs it, and
// so does the framework's hook when a session starts. The shell is the root of .baba/ to its session, its one runtime and
// page, which the framework provides, so a .baba/ with no surfaces has an answer all the same. It works on the .baba/ of
// the directory the session runs in and is made from the surfaces there, as generated into .root/: when one is made or
// removed the generated module changes, which is changed code to its runtime, taken as its mode says (runtime.ts): at once
// in dev mode, set by .baba/baba.config.ts or BABAVOSS_DEV, else when the agent restarts it. Each surface is loaded on its
// own: one whose code does not load is listed as broken, and the shell starts with the rest (loading.ts); a change in its
// code is changed code too, though it was never loaded.
import { statSync, watch, type FSWatcher } from "node:fs"
import { dirname, join } from "node:path"
import { main } from "../../core/bv/door.ts"
import { devMode, sourceDirs } from "../../core/runtime/runtime.ts"
import { loadConfig, titleOf, type Config } from "../../core/config.ts"
import { defineRoot } from "../../core/root.ts"
import { findBaba, generateRoot, HOME_FILE, SURFACES_DIR } from "../../core/provision.ts"
import { shellState } from "../src/archive.ts"
import { bootPaths } from "../src/boot.ts"
import { shellUi } from "../src/hosting.ts"
import { loadSurfaces, type Loaders } from "../src/loading.ts"
import { shell } from "../src/surface.ts"

const baba = findBaba(process.cwd())
const generated = baba && generateRoot(baba)
const { surfaces, broken } = generated
  ? await loadSurfaces(((await import(join(generated, "surfaces.ts"))) as { default: Loaders }).default, dirname(baba!))
  : { surfaces: {}, broken: {} }

// A surface made or removed in .baba/ by hand changes .root/ as soon as it is on disk: it is generated again. What is
// watched is surfaces/, or .baba/ until there is one; when it is gone or made anew, as a checkout may, or the watch fails,
// it is watched again. The project's own home, .baba/home.tsx, made or removed, generates the page again too.
const held = globalThis as { babavossSurfaces?: FSWatcher; babavossHome?: FSWatcher }
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

/** Follows .baba/ itself for its home being made or removed: the page is generated again with it, or without it. */
const home = (baba: string) => {
  held.babavossHome?.close()
  try {
    held.babavossHome = watch(baba, (_, file) => {
      if (file !== HOME_FILE) return
      try {
        generateRoot(baba)
      } catch {}
    })
    held.babavossHome.on("error", () => (held.babavossHome = undefined))
    held.babavossHome.unref()
  } catch {
    held.babavossHome = undefined
  }
}

if (baba) {
  follow(baba)
  home(baba)
} else {
  held.babavossSurfaces?.close()
  held.babavossHome?.close()
}

// The root's title is the configuration's, or the project directory's name; a configuration that does not load names it
// so too, and the hook says what is wrong with it. Where there is no .baba/, the page is the shell's own, with no surface to hold.
const config: Config = baba ? await loadConfig(baba).catch(() => ({})) : {}
const title = baba ? titleOf(config, baba) : undefined
const dev = devMode(config.dev)
const state = shellState()

await main(
  defineRoot({
    name: "baba",
    ui: shellUi(generated ?? new URL("../ui/", import.meta.url), { follow: dev }),
    surface: shell(surfaces, baba, broken, undefined, title, state.archive),
    boot: bootPaths,
    keep: state.keep,
    started: state.started,
  }),
  // The page is the shell's and the surfaces' own: a change there changes the page, and a surface that did not load is code
  // the runtime runs all the same.
  baba
    ? { dev, watch: [...sourceDirs(), join(baba, SURFACES_DIR)], code: Object.keys(broken).map((name) => join(baba, SURFACES_DIR, name)) }
    : { dev },
)
