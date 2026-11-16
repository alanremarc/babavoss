// Provisioning: a project's surfaces are code in its .baba/ directory, and what the harnesses beside it are given is one
// thing, the content that makes an agent aware of them. Each harness's adapter writes it in that harness's way, and withdraws
// it where the configuration no longer enables that harness (harness/); here the adapters are run in turn, and the root is
// generated from the surfaces. What .baba/ is made with, its tsconfig.json and shadcn's components.json, is written where
// it is missing, so a .baba/ made by an older release gains it too. A surface has no skill and no instructions beside it:
// what it is for is its own description, and how it is worked is what its views say.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { CONFIG_FILE, checkConfig, loadConfig, sectionOf } from "./config.ts"
import { ADAPTERS } from "./harness/index.ts"
import { written } from "./harness/setup.ts"

export const SURFACES_DIR = "surfaces"
export const NAME = /^[a-z][a-z0-9-]*$/
/**
 * Names a surface cannot take: the shell's, which is the word; those of the surfaces that come with it; and the shell's
 * own paths, which /NAME, a tab's address by its surface's name, would stand on.
 */
export const RESERVED = ["baba", "settings", "tabs", "activity"]

/** The surfaces in a .baba/ directory, by name: each directory under surfaces/ that holds one, src/surface.ts. A name that cannot be one is left out. */
export function surfaces(baba: string): string[] {
  const dir = join(baba, SURFACES_DIR)

  return (existsSync(dir) ? readdirSync(dir).sort() : []).filter((name) => NAME.test(name) && !RESERVED.includes(name) && existsSync(join(dir, name, "src/surface.ts")))
}

/**
 * The TypeScript configuration a .baba/ is made with: Bun's, for a page and its specs, and `@/`, the alias by which a page
 * imports what the project keeps beside its surfaces, as `@/components/ui/button`; Bun's build resolves it by the same file.
 */
const TSCONFIG = {
  compilerOptions: {
    lib: ["ESNext", "DOM", "DOM.Iterable"],
    target: "ESNext",
    module: "Preserve",
    moduleDetection: "force",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    erasableSyntaxOnly: true,
    noEmit: true,
    types: ["bun"],
    strict: true,
    skipLibCheck: true,
    noUncheckedIndexedAccess: true,
    jsx: "react-jsx",
    paths: { "@/*": ["./*"] },
  },
  include: [SURFACES_DIR, CONFIG_FILE, "node_modules/babavoss/framework/shell/ui/css.d.ts"],
}

/**
 * shadcn's components.json for a .baba/: the kit's style, its components put in components/ui, the project's and shared by
 * its surfaces. The css file it names is never part of the page, so what the CLI writes there cannot set the theme: the
 * shell's tokens are the ones shadcn's components read.
 */
const shadcn = (): string => {
  const kit = JSON.parse(readFileSync(new URL("../kit/components.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>

  return json({
    ...kit,
    tailwind: { ...kit.tailwind, css: "components/shadcn.css" },
    aliases: { components: "@/components", ui: "@/components/ui", utils: "@/lib/utils", lib: "@/lib", hooks: "@/hooks" },
  })
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/**
 * Writes what `baba` is made with where it is missing, and answers what it wrote: tsconfig.json, or in one of the person's
 * the alias `@/` where it has none and can be read as JSON; and components.json.
 */
export function scaffold(baba: string): string[] {
  const done: string[] = []
  const tsconfig = join(baba, "tsconfig.json")
  const components = join(baba, "components.json")

  if (!existsSync(tsconfig)) {
    written(tsconfig, json(TSCONFIG))
    done.push(tsconfig)
  } else {
    try {
      const mine = JSON.parse(readFileSync(tsconfig, "utf8")) as { compilerOptions?: { paths?: Record<string, string[]> } }

      if (!mine.compilerOptions?.paths?.["@/*"]) {
        mine.compilerOptions = { ...mine.compilerOptions, paths: { ...mine.compilerOptions?.paths, "@/*": ["./*"] } }
        written(tsconfig, json(mine))
        done.push(tsconfig)
      }
    } catch {}
  }
  if (!existsSync(components)) {
    written(components, shadcn())
    done.push(components)
  }

  return done
}

/** A .baba/'s own home, drawn in the desktop's place where it is there. */
export const HOME_FILE = "home.tsx"

/** Where the root of a .baba/ is generated: its surfaces named in one module, each loaded on its own, and the page that holds each in its tab. */
export const ROOT_DIR = ".root"

/**
 * Generates the root of `baba` from its surfaces, and answers with its directory: surfaces.ts, the surfaces by name, each
 * loaded when the shell's runtime asks; and the page, index.html, main.tsx and styles.css, the shell with each surface's component
 * and, scoped to its tabs, its own stylesheet, and the project's own home where `.baba/home.tsx` draws one.
 */
export function generateRoot(baba: string): string {
  const dir = join(baba, ROOT_DIR)
  const names = surfaces(baba)
  const paged = names.filter((name) => existsSync(join(baba, SURFACES_DIR, name, "ui/index.tsx")))
  const head = "// Generated by baba from the surfaces in this .baba/: change a surface, not this.\n"

  // Each surface is loaded when asked, so one whose code does not load leaves the others; the module itself always loads.
  written(
    join(dir, "surfaces.ts"),
    `${head}export default {\n${names.map((name) => `  ${JSON.stringify(name)}: () => import("../${SURFACES_DIR}/${name}/src/surface.ts"),\n`).join("")}}\n`
  )
  // The project's own home, where .baba/ draws one: its default export, in the desktop's place.
  const home = existsSync(join(baba, HOME_FILE))

  written(
    join(dir, "main.tsx"),
    `${head}import { createRoot } from "react-dom/client"\nimport Shell from "babavoss/shell/ui/index.tsx"\n` +
      paged.map((name, i) => `import * as p${i} from "../${SURFACES_DIR}/${name}/ui/index.tsx"\n`).join("") +
      (home ? `import Home from "../${HOME_FILE}"\n` : "") +
      `import "./styles.css"\n\ncreateRoot(document.getElementById("root")!).render(<Shell surfaces={{ ${paged.map((name, i) => `${JSON.stringify(name)}: p${i}`).join(", ")} }}${home ? " home={Home}" : ""} />)\n`
  )
  // A surface's own stylesheet, ui/styles.css, comes after the shell's, scoped to its tabs: it styles them and nothing else.
  // Its braces must balance outside comments and strings, or a stray one would close the scope; then it is left out, and
  // the comment says why.
  const balanced = (css: string) => {
    let depth = 0

    for (const brace of css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "").replace(/[^{}]/g, "")) {
      depth += brace === "{" ? 1 : -1
      if (depth < 0) return false
    }

    return depth === 0
  }
  // Its `@source` lines, which Tailwind takes only outside any scope, are lifted above the scopes, their paths from here.
  const sources: string[] = []
  const styled = paged.flatMap((name) => {
    const file = join(baba, SURFACES_DIR, name, "ui/styles.css")

    if (!existsSync(file)) return []

    let css = readFileSync(file, "utf8")
    const at = `${SURFACES_DIR}/${name}/ui/styles.css`

    if (!balanced(css)) return [`\n/* ${at} is left out: its braces do not balance. */\n`]
    for (const [line, not = "", , path, inline] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(SOURCE)) {
      css = css.replace(line, "")
      sources.push(`@source ${not}${inline ?? JSON.stringify(relative(dir, resolve(dirname(file), path!)))};\n`)
    }

    return [`\n/* ${at} */\n@scope ([data-surface="${name}"]) {\n${css.trim()}\n}\n`]
  })

  // Tailwind scans the whole of .baba/, all the project keeps, but node_modules and what git ignores there.
  written(
    join(dir, "styles.css"),
    `/* Generated by baba. The page is the shell's, in the kit's design language, and each surface's own styles in its tabs. */\n@import "babavoss/shell/ui/styles.css";\n\n@source "..";\n${sources.join("")}${styled.join("")}`
  )
  written(join(dir, "index.html"), readFileSync(new URL("../shell/ui/index.html", import.meta.url), "utf8"))

  return dir
}

/** A `@source` line of a surface's stylesheet: `not`, and a path or an `inline(…)`. */
const SOURCE = /@source\s+(not\s+)?(?:(["'])(.*?)\2|(inline\([^;]*\)))\s*;/g

/** The .baba/ directory of a directory: the one it is, or the nearest in it or above; undefined where there is none. */
export function findBaba(from: string): string | undefined {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const baba = basename(dir) === ".baba" ? dir : join(dir, ".baba")

    if (existsSync(join(baba, "package.json"))) return baba
    if (dir === dirname(dir)) return undefined
  }
}

/** What provisioning did: each path written, and each withdrawn, relative to the directory .baba/ is in, and what the adapters say to the person. */
export type Provisioned = { written: string[]; withdrawn: string[]; said: string[] }

/**
 * Provisions `baba`, a .baba/ directory: each harness its configuration enables is made aware of the surfaces by its
 * adapter, each it does not has that withdrawn, and the root is generated from the surfaces. A configuration that does not
 * load, or says what no adapter has, stops it before anything is written.
 */
export async function provision(baba: string): Promise<Provisioned> {
  const root = dirname(baba)
  const config = await loadConfig(baba)
  const done: Provisioned = { written: [], withdrawn: [], said: [] }

  checkConfig(config, ADAPTERS)
  done.written.push(...scaffold(baba).map((path) => relative(root, path)))
  for (const adapter of ADAPTERS) {
    const { enable, ...options } = sectionOf(config, adapter)
    const set = enable ? adapter.provision(root, options) : adapter.withdraw(root)

    done[enable ? "written" : "withdrawn"].push(...set.paths)
    if (set.said) done.said.push(set.said)
  }
  generateRoot(baba)
  done.written.push(relative(root, join(baba, ROOT_DIR)))

  return done
}
