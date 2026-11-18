// The border between the framework and a project's surfaces: the package exports only its entries, and nothing a project
// keeps, here .baba/ and the template a new surface starts from, imports the framework by any other path. This repository's
// own guide and design document reach some of the framework's internals, because their work is to show or run them; they
// do it by a relative path into the checkout, which a project cannot take, and only to the files listed in INTERNALS.
import { Glob } from "bun"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { describe, expect, test } from "bun:test"

const checkout = join(import.meta.dir, "..")

/** What a project may import, each for whom: these and the package's package.json are all the package exports. */
const ENTRIES = {
  "./core/index.ts": "a surface's source and specs: surfaces, views, actions, stories, a harness",
  "./core/config.ts": ".baba/baba.config.ts: the project's configuration",
  "./kit/index.ts": "a page: the kit's primitives, cn and the theme",
  "./shell/ui/index.tsx": "a page: its tab, its live views, the shell's services and the person's conventions",
  "./shell/ui/styles.css": "the generated root's stylesheet: the shell's page in the kit's design language",
}

/**
 * The allow-list: the framework's internals this repository's own surfaces may reach, by a relative path into the checkout,
 * and why. It holds here because .baba/'s framework is this checkout; it is not part of what a project may import, and
 * the package does not export it.
 */
const INTERNALS: Record<string, { why: string; files: string[] }> = {
  guide: {
    why: "the Design Guide shows the shell's real parts, drawn by the shell's own code, and its samples are views made on the page",
    files: [
      "core/surface/view.ts",
      "shell/settings/src/settings.ts",
      ...["actions.tsx", "bubbles.tsx", "client.ts", "closed.tsx", "commands.ts", "connection.tsx", "drawer.tsx", "gaze.ts", "home.ts", "home.tsx", "inputs.tsx"].map((f) => `shell/ui/${f}`),
      ...["live.ts", "mark.tsx", "rail.ts", "rail.tsx", "tab.tsx", "tabs.tsx", "thread.ts", "turn.ts"].map((f) => `shell/ui/${f}`),
    ],
  },
  design: {
    why: "the design document plays the framework's real runtime and page, and its spec holds its words to the framework's own",
    files: ["core/hook.ts", "core/runtime/service.ts", "core/runtime/turn.ts", "shell/ui/pointing.ts", "shell/ui/rail.ts"],
  },
}

const exported = (JSON.parse(readFileSync(join(checkout, "package.json"), "utf8")) as { exports: Record<string, string> }).exports
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"'\n]+)["']/g

/** Every module a file imports, by its specifier: an import, an export from, a dynamic import, a stylesheet's @import. */
const imports = (file: string) => [...readFileSync(file, "utf8").matchAll(SPECIFIER)].map((m) => m[1]!)

/** What a project keeps, from the checkout: its surfaces, its own files beside them, and the template. */
const kept = () => [
  ...new Glob(".baba/*.{ts,tsx,css}").scanSync({ cwd: checkout, dot: true }),
  ...new Glob(".baba/surfaces/**/*.{ts,tsx,css}").scanSync({ cwd: checkout, dot: true }),
  ...new Glob("template/**/*.{ts,tsx,css}").scanSync(checkout),
]

describe("the border", () => {
  test("the package exports its entries and nothing else", () => {
    expect(
      Object.keys(exported).sort(),
      "package.json's exports are the package's entries. Put what a surface needs into one of them, babavoss/core/index.ts for its source, babavoss/kit/index.ts or babavoss/shell/ui/index.tsx for a page, rather than exporting a file; a new entry is the person's decision, written in AGENTS.md and skill/SKILL.md, and in ENTRIES here",
    ).toEqual([...Object.keys(ENTRIES), "./package.json"].sort())
    for (const [entry, target] of Object.entries(exported)) {
      expect(target, `${entry} is exported as itself under framework/`).toBe(entry === "./package.json" ? "./package.json" : `./framework/${entry.slice(2)}`)
      expect(existsSync(join(checkout, target)), `${entry} names ${target}, which is not there`).toBe(true)
    }
  })

  test("nothing a project keeps imports the framework outside its entries; this repository's own surfaces reach only the internals allowed", () => {
    const found: string[] = []
    const reached = new Set<string>()

    for (const file of kept()) {
      const surface = /^\.baba\/surfaces\/([^/]+)\//.exec(file)?.[1]
      const home = file.startsWith("template/") ? "template" : ".baba"

      for (const specifier of imports(join(checkout, file))) {
        if (specifier === "babavoss" || specifier.startsWith("babavoss/")) {
          const entry = `.${specifier.slice("babavoss".length)}`

          if (!(entry in exported))
            found.push(
              `${file} imports ${specifier}, which the package does not export: import from babavoss/core/index.ts in a surface's source and specs, babavoss/kit/index.ts and babavoss/shell/ui/index.tsx in a page; what it needs beyond them belongs in the surface's own folder`,
            )
          continue
        }
        if (!specifier.startsWith(".")) continue

        const at = relative(checkout, resolve(dirname(join(checkout, file)), specifier))

        if (at === home || at.startsWith(`${home}/`)) continue
        if (surface && INTERNALS[surface]?.files.some((f) => at === `framework/${f}`)) {
          reached.add(`${surface} ${at}`)
          continue
        }
        found.push(
          `${file} reaches ${at} by a relative path, outside what a project keeps: import the framework by its entries, babavoss/core/index.ts, babavoss/kit/index.ts or babavoss/shell/ui/index.tsx; only this repository's own surfaces that show or run an internal reach it, listed with why in INTERNALS in spec/border.spec.ts`,
        )
      }
    }
    expect(found).toEqual([])

    // The allow-list holds only what is reached: an internal no longer used comes off it.
    const listed = Object.entries(INTERNALS).flatMap(([surface, { files }]) => files.map((f) => `${surface} framework/${f}`))

    expect(
      listed.filter((entry) => !reached.has(entry)),
      "INTERNALS in spec/border.spec.ts lists an internal its surface no longer imports: take it off the list",
    ).toEqual([])
  })

  test("knows an import when it sees one", () => {
    const seen = (text: string) => [...text.matchAll(SPECIFIER)].map((m) => m[1])

    expect(seen('import { a } from "babavoss/kit/cn.ts"\nimport type { B } from "x"\nexport { c } from "./c.ts"\nawait import("y")\n@import "z.css";')).toEqual([
      "babavoss/kit/cn.ts",
      "x",
      "./c.ts",
      "y",
      "z.css",
    ])
  })
})
