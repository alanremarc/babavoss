// The shell page: bundle source on demand; built releases serve files directly. What the page is built from is installed
// by the root's door before it opens. A page that does not build leaves the last one that did: it is served until a change
// builds, through a reload of the root's code too, so a surface's broken page never takes the root's page down.
import { existsSync, readFileSync, mkdtempSync, readdirSync, statSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import type { IncomingMessage, ServerResponse } from "node:http"
import { dirname, extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { UiHosting } from "../../core/index.ts"

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
 * The last page that built, by the root's ui directory. Kept on globalThis, which a hot reload leaves as it is, so the
 * hosting a reload makes serves it while the page does not build; removed when a later one builds, and as the process ends.
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

/** Serve a built release, or rebuild source on the next request after an edit. */
export function shellUi(dir: string | URL): UiHosting {
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
      // The page built stays for the hosting that takes this one's place, as a reload of the root's code makes.
      close: async () => {
        await pending
      },
    }
  }
}

/** Bundle the same page for source hosting and dependency-free releases. */
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
