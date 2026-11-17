// The shell page: bundle source on demand; built releases serve files directly. What the page is built from is installed
// by the root's door before it opens. Following the source, as in dev mode, it is built again after an edit; else it is
// built once, the page of the code the runtime runs, until it restarts. A page that does not build leaves the last one that
// did: it is served until a change builds, so a surface's broken page never takes the root's page down. Every
// page is served with the person's settings in it, so it paints in their appearance at once, and /_/settings.json gives
// them again, read from their file each time (settings/src/store.ts).
import { existsSync, readFileSync, mkdtempSync, readdirSync, statSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import type { IncomingMessage, ServerResponse } from "node:http"
import { dirname, extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { UiHosting } from "../../core/index.ts"
import { appearanceOf, choiceIn, nameOf, numbersOf, type Appearance, type Mode } from "../settings/src/settings.ts"
import { machineMode } from "../settings/src/system/index.ts"
import { kept, readSettings, settingsFile, writeSettings } from "../settings/src/store.ts"

const here = dirname(fileURLToPath(import.meta.url))
const frameworkRoot = resolve(here, "../..")

/** Where a release puts the built page, under the root's ui directory. */
export const BUILT = "dist"

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
}

/** The built page, served as files: index.html for every path, what it loads from under /_/. */
const built = (dir: string): Awaited<ReturnType<UiHosting>> => ({
  page: async () => readFileSync(join(dir, "index.html"), "utf8"),
  assets(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname).slice("/_/".length)
    const file = normalize(join(dir, path))

    if (!file.startsWith(dir + sep) || !existsSync(file)) return next()
    // A built file's name carries its hash, so it never changes under its name.
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" })
    res.end(readFileSync(file))
  },
  close: async () => {},
})

/** A page built from source: where, and from what, as the files' times. */
type Build = { dir: string; stamp: string }

const PAGES = Symbol.for("babavoss.pages")
/**
 * The last page that built, by the root's ui directory, for the process: served while a later one does not build; removed
 * when a later one builds, and as the process ends.
 */
const lastBuilt = (): Map<string, Build> => {
  const held = globalThis as { [PAGES]?: Map<string, Build> }

  if (!held[PAGES]) {
    const pages = new Map<string, Build>()

    held[PAGES] = pages
    process.once("exit", () => {
      for (const page of pages.values()) rmSync(page.dir, { recursive: true, force: true })
    })
  }

  return held[PAGES]
}

/** Where the page finds the person's settings as it is served, before anything else in its head: index.html reads it. */
export const SETTINGS_ID = "babavoss-settings"

/**
 * The page with the person's settings in its head, as JSON no markup in it can close, with `paint`, what each mode is
 * painted in, its theme's name and numbers, so the page paints it before its first frame. Where the file has no appearance
 * yet, none is given, and the page paints by the cookie an older page kept until it is taken in. `machine` tells the
 * machine's mode, where it is known: what "system" means to the page, over what its browser says.
 */
export function withSettings(html: string, file = settingsFile(), machine: () => Mode | undefined = machineMode): string {
  const { appearance, ...rest } = readSettings(file)
  const system = machine()
  const paint = Object.fromEntries((["light", "dark"] as const).map((mode) => [mode, painted(appearance, mode)]))
  const given = { ...(kept(file)?.appearance === undefined ? rest : { appearance, paint, ...rest }), ...(system && { system }) }

  return html.replace(/<head>/i, `<head><script type="application/json" id="${SETTINGS_ID}">${JSON.stringify(given).replaceAll("<", "\\u003c")}</script>`)
}

/** What a mode is painted in: its theme's name, a preset's id or dynamic, and its numbers. */
const painted = (appearance: Appearance, mode: Mode) => {
  const choice = choiceIn(appearance, mode)

  return { theme: nameOf(choice), ...numbersOf(choice) }
}

const APPEARANCE_COOKIE = "babavoss.appearance"

/**
 * The appearance a browser kept in its cookie before the settings had a file, taken into the file once: where the file
 * says no appearance of its own. Answers whether it was taken.
 */
export function migrated(cookie: string | undefined, file = settingsFile()): boolean {
  const found = new RegExp(`(?:^|;\\s*)${APPEARANCE_COOKIE.replace(".", "\\.")}=([^;]*)`).exec(cookie ?? "")?.[1]

  if (found === undefined || kept(file)?.appearance !== undefined) return false
  try {
    writeSettings(file, { ...readSettings(file), appearance: appearanceOf(JSON.parse(decodeURIComponent(found))) })

    return true
  } catch {
    return false
  }
}

/** The person's settings and the machine's mode, at /_/settings.json, read each time; the cookie of an older page is taken in first. */
const settingsAsset = (req: IncomingMessage, res: ServerResponse): boolean => {
  if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/_/settings.json") return false
  migrated(req.headers.cookie)
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
  const system = machineMode()

  res.end(JSON.stringify({ ...readSettings(settingsFile()), ...(system && { system }) }))

  return true
}

/**
 * Serve a built release, or build source: again on the next request after an edit where it `follow`s the source, else once;
 * each page with the person's settings.
 */
export function shellUi(dir: string | URL, { follow = true }: { follow?: boolean } = {}): UiHosting {
  const hosting = pageUi(dir, follow)

  return async (server) => {
    const hosted = await hosting(server)

    return {
      page: async (path) => {
        const html = await hosted.page(path)

        return html === undefined ? html : withSettings(html)
      },
      assets: (req, res, next) => void (settingsAsset(req, res) || hosted.assets(req, res, next)),
      close: () => hosted.close(),
    }
  }
}

function pageUi(dir: string | URL, follow: boolean): UiHosting {
  const root = typeof dir === "string" ? resolve(dir) : fileURLToPath(dir)

  return async () => {
    if (existsSync(join(root, BUILT, "index.html"))) return built(join(root, BUILT))

    const pages = lastBuilt()
    /** The files' times a build last failed at, and why: not built again until they change. */
    let failed: { stamp: string; why: string } | undefined
    let pending: Promise<void> | undefined
    const changed = (dir: string): string =>
      readdirSync(dir, { withFileTypes: true })
        .filter((entry) => !["node_modules", ".git", "dist"].includes(entry.name))
        .map((entry) => {
          const path = join(dir, entry.name)

          return entry.isDirectory() ? changed(path) : `${path}:${statSync(path).mtimeMs}`
        })
        .join(";")
    const ready = async () => {
      if (pending) return pending
      if (!follow && pages.has(root)) return

      const next = changed(dirname(root)) + changed(frameworkRoot)

      if (pages.get(root)?.stamp === next || failed?.stamp === next) return
      // A fresh process: it sees packages installed after this runtime started. Built beside the page served, which it
      // takes the place of only once it built.
      pending = (async () => {
        const out = mkdtempSync(join(tmpdir(), "babavoss-ui-"))
        const build = Bun.spawn([process.execPath, join(here, "../scripts/build.ts"), root, out], { stdout: "pipe", stderr: "pipe" })
        const [stdout, stderr, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])

        if (code !== 0) {
          rmSync(out, { recursive: true, force: true })
          failed = { stamp: next, why: [stdout, stderr].join("\n").trim() }
          if (pages.has(root)) console.error(`the page does not build, and the last one that did is served: ${failed.why}`)

          return
        }

        const before = pages.get(root)

        failed = undefined
        pages.set(root, { dir: out, stamp: next })
        if (before) rmSync(before.dir, { recursive: true, force: true })
      })().finally(() => {
        pending = undefined
      })
      await pending
    }

    /** The page served: the last that built, or why there is none. */
    const hosted = async () => {
      await ready()

      const page = pages.get(root)

      if (!page) throw new Error(failed?.why ?? "the page was not built")

      return built(page.dir)
    }

    return {
      page: async (path) => (await hosted()).page(path),
      assets(req, res, next) {
        void hosted()
          .then((page) => page.assets(req, res, next))
          .catch((error: unknown) => {
            res.writeHead(500)
            res.end(String(error))
          })
      },
      close: async () => {
        await pending
      },
    }
  }
}

/** Every import of React, from any package: one copy for the page, the framework's, or a library's hooks would run on another. */
const REACT = /^react(?:-dom)?(?:\/.*)?$/

/**
 * Bundle the same page for source hosting and dependency-free releases. React is the framework's wherever it is imported
 * from, so a library installed in .baba/ that brought its own, or a framework installed with its own node_modules, still
 * gives the page one.
 */
export async function buildUi(dir: string | URL, out: string): Promise<void> {
  const root = typeof dir === "string" ? resolve(dir) : fileURLToPath(dir)

  rmSync(out, { recursive: true, force: true })

  const styles = new Map<string, string>()
  let shell = false
  const { compile } = await import("@tailwindcss/node")
  const { Scanner } = await import("@tailwindcss/oxide")
  const result = await Bun.build({
    entrypoints: [join(root, "index.html")],
    outdir: resolve(out),
    target: "browser",
    publicPath: "/_/",
    plugins: [
      {
        name: "tailwind",
        setup(build) {
          build.onResolve({ filter: REACT }, (args) => ({ path: Bun.resolveSync(args.path, frameworkRoot) }))
          // Noted only: the framework is resolved as the package it is.
          build.onResolve({ filter: /^babavoss\/(?:shell\/ui|kit)\// }, () => {
            shell = true

            return undefined
          })
          build.onLoad({ filter: /\.css$/ }, async (args) => {
            const base = dirname(args.path)
            const compiler = await compile(readFileSync(args.path, "utf8"), { base, shouldRewriteUrls: true, onDependency() {} })
            const scanner = new Scanner({
              sources: [...compiler.sources, ...(compiler.root === "none" ? [] : [compiler.root ?? { base, pattern: "**/*" }])].map((source) => ({
                ...source,
                negated: false,
              })),
            })
            let css = compiler.build(scanner.scan())

            for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
              const url = match[1]!

              if (/^(?:data:|https?:|\/|#)/.test(url)) continue

              const asset = resolve(base, url)
              const name = `${Bun.hash(readFileSync(asset)).toString(16)}${extname(asset)}`

              await Bun.write(join(out, name), Bun.file(asset))
              css = css.replaceAll(url, `/_/${name}`)
            }

            const name = `${Bun.hash(css).toString(16)}.css`

            styles.set(name, css)

            return { contents: "", loader: "js" }
          })
        },
      },
    ],
  })

  if (!result.success) throw new AggregateError(result.logs, "page build failed")
  // The shell's page brings no styles of its own, so that they are compiled once: without the root's, it would show bare.
  if (shell && !styles.size)
    throw new Error("the page has no stylesheet: import one from its entry, such as ./styles.css, which imports the kit's styles.css")
  for (const [name, css] of styles) await Bun.write(join(out, name), css)

  const index = join(out, "index.html")

  await Bun.write(
    index,
    readFileSync(index, "utf8").replace("</head>", [...styles.keys()].map((name) => `<link rel="stylesheet" href="/_/${name}">`).join("") + "</head>")
  )
}
