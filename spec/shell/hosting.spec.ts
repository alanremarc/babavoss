// Source pages are bundled on demand and again after an edit; built pages are served as files.
import { appendFileSync, cpSync, readFileSync, symlinkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import { BUILT, shellUi, buildUi, migrated, withSettings } from "../../framework/shell/src/hosting.ts"
import { readSettings, writeSettings } from "../../framework/shell/settings/src/store.ts"
import { DEFAULTS } from "../../framework/shell/settings/src/settings.ts"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("a built page", () => {
  it("is served as files from ui/dist: index.html for any path, its assets under /_/, nothing from outside", async () => {
    const ui = realpathSync(mkdtempSync(join(tmpdir(), "hosting-")))

    dirs.push(ui)
    mkdirSync(join(ui, BUILT, "assets"), { recursive: true })
    writeFileSync(join(ui, BUILT, "index.html"), '<script type="module" src="/_/assets/root.js"></script>')
    writeFileSync(join(ui, BUILT, "assets", "root.js"), "export {}")
    writeFileSync(join(ui, "secret.txt"), "source, not shipped to a browser")

    const hosted = await shellUi(ui)({} as Server)
    const get = (url: string) => {
      const sent: { status?: number; type?: string; body?: string; passed?: true } = {}

      hosted.assets(
        { url } as IncomingMessage,
        {
          writeHead: (status: number, headers: Record<string, string>) => ((sent.status = status), (sent.type = headers["content-type"])),
          end: (body: Buffer) => (sent.body = String(body)),
        } as unknown as ServerResponse,
        () => (sent.passed = true)
      )

      return sent
    }

    expect(await hosted.page("/tabs/1")).toContain("/_/assets/root.js")
    expect(get("/_/assets/root.js")).toEqual({ status: 200, type: "text/javascript", body: "export {}" })
    expect(get("/_/assets/missing.js")).toEqual({ passed: true })
    expect(get("/_/../secret.txt")).toEqual({ passed: true })
    await hosted.close()
  })
})

for (const root of ["spec/support/notes"]) {
  it(`${root}: bundles source, reloads edits and serves the release`, async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "hosting-root-")))

    dirs.push(dir)
    for (const name of ["ui", "src"]) cpSync(resolve(root, name), join(dir, name), { recursive: true })
    symlinkSync(resolve("node_modules"), join(dir, "node_modules"))

    const serve = async () => {
      const hosted = await shellUi(join(dir, "ui"))({} as Server)
      const server = createServer((req, res) => {
        if (req.url === "/") {
          void hosted.page("/").then((html) => {
            res.writeHead(200, { "content-type": "text/html" })
            res.end(html)
          })
        } else
          hosted.assets(req, res, () => {
            res.writeHead(404)
            res.end()
          })
      })

      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))

      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

      return {
        base,
        close: async () => {
          server.closeAllConnections()
          await new Promise<void>((done) => server.close(() => done()))
          await hosted.close()
        },
      }
    }
    const inspect = async (base: string) => {
      const response = await fetch(base)

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")

      const html = await response.text()
      const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map((match) => match[1]!)

      expect(assets.some((asset) => asset.endsWith(".js"))).toBe(true)
      // One stylesheet: the root's, which imports the shell's, so no rule is there twice to override the other.
      expect(assets.filter((asset) => asset.endsWith(".css"))).toHaveLength(1)

      let scripts = ""
      let styles = ""

      for (const asset of assets) {
        const response = await fetch(base + asset)

        expect(response.status).toBe(200)

        const text = await response.text()

        if (asset.endsWith(".css")) styles += text
        else scripts += text
      }
      expect(styles).toContain(".flex")
      expect(styles).toContain(".items-center")
      expect(styles).not.toContain('@import "tailwindcss"')
      expect(scripts).not.toMatch(/(?:from\s*|import\s*)["'](?:react|babavoss|lucide-react)["'/]/)

      return scripts
    }
    const source = await serve()

    try {
      await inspect(source.base)
      appendFileSync(join(dir, "ui/main.tsx"), '\nconsole.log("source-edit-probe")\n')
      expect(await inspect(source.base)).toContain("source-edit-probe")
    } finally {
      await source.close()
    }
    await buildUi(join(dir, "ui"), join(dir, "ui", BUILT))
    rmSync(join(dir, "node_modules"))
    rmSync(join(dir, "src"), { recursive: true })

    const release = await serve()

    try {
      expect(await inspect(release.base)).toContain("source-edit-probe")
    } finally {
      await release.close()
    }
  })
}

it("refuses to build a shell page that imports no stylesheet, and says what to import", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hosting-bare-")))

  dirs.push(dir)
  for (const name of ["ui", "src"]) cpSync(resolve("spec/support/notes", name), join(dir, name), { recursive: true })
  symlinkSync(resolve("node_modules"), join(dir, "node_modules"))
  writeFileSync(join(dir, "ui/main.tsx"), readFileSync(join(dir, "ui/main.tsx"), "utf8").replace('import "./styles.css"\n', ""))

  expect(buildUi(join(dir, "ui"), join(dir, "out"))).rejects.toThrow("the page has no stylesheet")
})

it("serves the last page that built while the page does not build, through a reload of the root's code too, and the next that builds", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hosting-broken-")))

  dirs.push(dir)
  for (const name of ["ui", "src"]) cpSync(resolve("spec/support/notes", name), join(dir, name), { recursive: true })
  symlinkSync(resolve("node_modules"), join(dir, "node_modules"))

  const main = join(dir, "ui/main.tsx")
  const mended = readFileSync(main, "utf8")
  const first = await shellUi(join(dir, "ui"))({} as Server)
  const good = await first.page("/")

  appendFileSync(main, "\nexport const broken = (\n")
  expect(await first.page("/")).toBe(good!)

  // The root's code loaded again makes a new hosting: it has the page that built, not none.
  await first.close()

  const reloaded = await shellUi(join(dir, "ui"))({} as Server)

  expect(await reloaded.page("/")).toBe(good!)
  writeFileSync(main, `${mended}\nconsole.log("mended")\n`)

  const next = await reloaded.page("/")

  expect(next).not.toBe(good!)
  await reloaded.close()
}, 30_000)

describe("the person's settings in the page", () => {
  const scratch = () => join(mkdtempSync(join(tmpdir(), "babavoss-page-settings-")), "settings.json")
  const given = (html: string) => JSON.parse(/<script type="application\/json" id="babavoss-settings">(.*?)<\/script>/.exec(html)![1]!) as Record<string, unknown>

  it("are given in its head as it is served, before what reads them, and no markup in them can close the script", () => {
    const file = scratch()

    writeSettings(file, { ...DEFAULTS, appearance: { mode: "dark", themes: { light: "neutral", dark: "claude" } } })

    const html = withSettings("<html><head><script>paint()</script></head></html>", file)

    expect(html.indexOf("babavoss-settings")).toBeLessThan(html.indexOf("paint()"))
    expect(given(html)).toMatchObject({ appearance: { mode: "dark", themes: { dark: "claude" } }, logo: { animate: true } })
    writeFileSync(file, JSON.stringify({ appearance: { mode: "</script><b>" } }))
    expect(withSettings("<head></head>", file)).not.toContain("</script><b>")
  })

  it("give no appearance while the file has none, so the page paints by an older page's cookie, which is taken into the file once", () => {
    const file = scratch()
    const cookie = `other=1; babavoss.appearance=${encodeURIComponent(JSON.stringify({ mode: "light", themes: { light: "claude", dark: "neutral" } }))}`

    expect(given(withSettings("<head></head>", file))).not.toHaveProperty("appearance")
    expect(migrated(cookie, file)).toBe(true)
    expect(readSettings(file).appearance).toEqual({ mode: "light", themes: { light: "claude", dark: "neutral" } })
    writeSettings(file, { ...readSettings(file), appearance: { mode: "dark", themes: { light: "claude", dark: "neutral" } } })
    expect(migrated(cookie, file)).toBe(false)
    expect(readSettings(file).appearance.mode).toBe("dark")
  })
})
