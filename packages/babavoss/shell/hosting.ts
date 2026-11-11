// The shell page: bundle source on demand; built releases serve files directly. What the page is built from is installed
// by the app's door before it opens.
import { existsSync, readFileSync, mkdtempSync, readdirSync, statSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import type { IncomingMessage, ServerResponse } from "node:http"
import { dirname, extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { UiHosting } from "../core/index.ts"

const here = dirname(fileURLToPath(import.meta.url))
const frameworkRoot = resolve(here, "..")

/** Where a release puts the built page, under the app's ui directory. */
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

/** Serve a built release, or rebuild source on the next request after an edit. */
export function shellUi(dir: string | URL): UiHosting {
  const root = typeof dir === "string" ? resolve(dir) : fileURLToPath(dir)

  return async () => {
    if (existsSync(join(root, BUILT, "index.html"))) return built(join(root, BUILT))

    const out = mkdtempSync(join(tmpdir(), "babavoss-ui-"))
    const hosted = built(out)
    let stamp = ""
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

      if (next === stamp) return
      // A fresh process: it sees packages installed after this runtime started.
      pending = (async () => {
        const build = Bun.spawn([process.execPath, join(here, "build.ts"), root, out], { stdout: "pipe", stderr: "pipe" })
        const [stdout, stderr, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])

        if (code !== 0) throw new Error([stdout, stderr].join("\n").trim())
        stamp = next
      })().finally(() => {
        pending = undefined
      })
      await pending
    }

    return {
      page: async (path) => {
        await ready()

        return hosted.page(path)
      },
      assets(req, res, next) {
        void ready()
          .then(() => hosted.assets(req, res, next))
          .catch((error: unknown) => {
            res.writeHead(500)
            res.end(String(error))
          })
      },
      close: async () => {
        await pending
        rmSync(out, { recursive: true, force: true })
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
          build.onResolve({ filter: /^babavoss\/shell\/ui\// }, () => {
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
  // The shell's page brings no styles of its own, so that they are compiled once: without the app's, it would show bare.
  if (shell && !styles.size)
    throw new Error("the page has no stylesheet: import one from its entry, such as ./styles.css, which imports the shell's ui/styles.css")
  for (const [name, css] of styles) await Bun.write(join(out, name), css)

  const index = join(out, "index.html")

  await Bun.write(
    index,
    readFileSync(index, "utf8").replace("</head>", [...styles.keys()].map((name) => `<link rel="stylesheet" href="/_/${name}">`).join("") + "</head>")
  )
}
