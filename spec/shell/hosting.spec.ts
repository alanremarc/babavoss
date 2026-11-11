// Source pages are bundled on demand and again after an edit; built pages are served as files.
import { appendFileSync, cpSync, readFileSync, symlinkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import { BUILT, shellUi, buildUi } from "../../packages/babavoss/shell/index.ts"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("a built page", () => {
  it("is served as files from ui/dist: index.html for any path, its assets under /_/, nothing from outside", async () => {
    const ui = realpathSync(mkdtempSync(join(tmpdir(), "hosting-")))

    dirs.push(ui)
    mkdirSync(join(ui, BUILT, "assets"), { recursive: true })
    writeFileSync(join(ui, BUILT, "index.html"), '<script type="module" src="/_/assets/app.js"></script>')
    writeFileSync(join(ui, BUILT, "assets", "app.js"), "export {}")
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

    expect(await hosted.page("/tabs/1")).toContain("/_/assets/app.js")
    expect(get("/_/assets/app.js")).toEqual({ status: 200, type: "text/javascript", body: "export {}" })
    expect(get("/_/assets/missing.js")).toEqual({ passed: true })
    expect(get("/_/../secret.txt")).toEqual({ passed: true })
    await hosted.close()
  })
})

for (const app of ["skills/baba", "spec/support/notes"]) {
  it(`${app}: bundles source, reloads edits and serves the release`, async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "hosting-app-")))

    dirs.push(dir)
    for (const name of ["ui", "src"]) cpSync(resolve(app, name), join(dir, name), { recursive: true })
    cpSync(resolve("skills/baba/package.json"), join(dir, "package.json"))
    symlinkSync(resolve("packages/babavoss"), join(dir, "framework"))
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
      // One stylesheet: the app's, which imports the shell's, so no rule is there twice to override the other.
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
    rmSync(join(dir, "framework"))
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
  for (const name of ["ui", "src"]) cpSync(resolve("skills/baba", name), join(dir, name), { recursive: true })
  cpSync(resolve("skills/baba/package.json"), join(dir, "package.json"))
  symlinkSync(resolve("packages/babavoss"), join(dir, "framework"))
  symlinkSync(resolve("node_modules"), join(dir, "node_modules"))
  writeFileSync(join(dir, "ui/main.tsx"), readFileSync(join(dir, "ui/main.tsx"), "utf8").replace('import "./styles.css"\n', ""))

  expect(buildUi(join(dir, "ui"), join(dir, "out"))).rejects.toThrow("the page has no stylesheet")
})
