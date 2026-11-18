// The eval's tasks on a fresh project: one that only ran `baba init`, as a person who just installed babavoss has, with no
// fixture. They ask whether the agent is an expert by default: it says truthfully what is there, makes a surface correctly
// when asked, changes one, adapts one to a later release, and leaves surfaces alone where a task needs none. A surface the
// agent wrote is checked by the framework's own rules, each reported on its own in the verdict's reason, as `rule+` or
// `rule-`, so a campaign's pass rate per rule can be read from its results.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Call, Checked, Look, Task, Verdict } from "./tasks.ts"

const ok = (reason = "as asked"): Verdict => ({ pass: true, reason })
const no = (reason: string): Verdict => ({ pass: false, reason })

/** A folder of files as a fresh project's files, under `to`; a file's `.txt` ending, which keeps it from being checked here, dropped. */
function folder(from: string, to: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}/${e.name}`)
      else out[`${to}${rel}/${e.name.replace(/\.txt$/, "")}`] = readFileSync(join(dir, e.name), "utf8")
  }

  walk(from, "")

  return out
}

const HERE = new URL(".", import.meta.url).pathname
/** The reference books surface, as a fresh project holds it. */
export const BOOKS = folder(join(HERE, "fresh/books"), ".baba/surfaces/books")
/** A surface written to babavoss 0.70.0's shape: `ask`, `attention`, bare inputs, descriptions and a `how` that dictate. */
const REVIEWS = folder(join(HERE, "fresh/reviews-0.70"), ".baba/surfaces/reviews")

/** The text between the brace after `at` and its match. */
function braced(source: string, at: number): string {
  const open = source.indexOf("{", at)
  let depth = 0

  for (let i = open; i >= 0 && i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i)
  }

  return ""
}

/** A string, template or arrow-made description's words, its `${…}` taken out. */
const words = (literal: string) => literal.replace(/\$\{[^}]*\}/g, "X")
const STRING = /(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/
/** Each `description:` of an action in `source`, with the action's name. */
function handleDescriptions(source: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []

  for (const m of source.matchAll(/\baction\s*(?:<[^>]*>)?\s*\(/g)) {
    const body = braced(source, m.index!)
    const name = /\bname:\s*"([^"]+)"/.exec(body)?.[1] ?? ""
    const d = new RegExp(`\\bdescription:\\s*(?:\\([^)]*\\)\\s*=>\\s*)?${STRING.source}`).exec(body)

    if (d) out.push({ name, text: words(d[1] ?? d[2] ?? d[3] ?? "") })
  }

  return out
}
/** Each `how:` text in `source`. */
const hows = (source: string) => [...source.matchAll(new RegExp(`\\bhow:\\s*${STRING.source}`, "g"))].map((m) => words(m[1] ?? m[2] ?? m[3] ?? ""))
/** The surface's own description: the one in the call of `surface`. */
const surfaceDescription = (source: string) => {
  const at = /\bsurface\s*(?:<[^>]*>)?\s*\(/.exec(source)

  return at ? (new RegExp(`\\bdescription:\\s*${STRING.source}`).exec(braced(source, at.index))?.slice(1).find((x) => x !== undefined) ?? "") : ""
}
/** Each input declared bare as text, `name: "string"`, in an action's `inputs`, where nothing says what it means. */
function bareText(source: string): string[] {
  return [...source.matchAll(/\binputs:\s*\{/g)].flatMap((m) =>
    [...braced(source, m.index!).matchAll(/(\w+)\s*:\s*"string"/g)].map((x) => x[1]!).filter((k) => k !== "type"),
  )
}
/** What reads as telling the agent what to do, or who decides, rather than saying how the thing works. */
const DICTATES =
  /\b(ask (the person|them|the user|first)|you should|should|the agent (must|should|may)|remember to|make sure|confirm with|before (you|acting|drafting)|always|never (approve|act|do)|wait for|whenever|do not|don't)\b/i
const ENTRIES = new Set([
  "babavoss/core/index.ts",
  "babavoss/kit/index.ts",
  "babavoss/shell/ui/index.tsx",
  "babavoss/core/config.ts",
  "babavoss/shell/ui/styles.css",
])
/** A colour or a size a token should give: a hex or rgb colour, Tailwind's own palette, a size in pixels. */
const HARD = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\b(bg|text|border)-(white|black|(gray|slate|zinc|neutral|stone|red|green|blue|yellow|amber|emerald|sky|indigo|violet|rose)-\d{2,3})\b|\btext-\[\d+px\]/

export type Rules = Record<string, boolean>

/**
 * The framework's rules for the surfaces `names` in a fresh project, each true where it holds: made as `baba new` makes
 * one; handle descriptions by the convention; text inputs that declare what they mean; words that are mechanics only; none
 * of the vocabulary dropped; imports only the package's entries; a spec written as a story; a page drawn by the tokens; and
 * the project's own checks and specs pass, each surface answers when opened, the page builds.
 */
export function rules(look: Look, names: string[]): Rules {
  const of = (name: string, part: string) => Object.entries(look.files).filter(([p]) => p.startsWith(`.baba/surfaces/${name}/${part}`))
  const sources = names.flatMap((n) => of(n, "src/")).map(([, t]) => t)
  const all = names.flatMap((n) => [...of(n, "src/"), ...of(n, "ui/"), ...of(n, "spec/")])
  const descs = sources.flatMap(handleDescriptions)
  const wordsOf = [...sources.flatMap(hows), ...descs.map((d) => d.text), ...sources.map(surfaceDescription)]
  const imports = all.flatMap(([, t]) => [...t.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!))

  return {
    made: names.length > 0 && names.every((n) => of(n, "src/surface.ts").length && of(n, "ui/index.tsx").length && of(n, "spec/").length),
    check: look.check.code === 0,
    specs: look.test.code === 0,
    opens: names.length > 0 && names.every((n) => /^\+ \//m.test(look.opened[n] ?? "") && !/broken/.test(look.opened[n] ?? "")),
    page: look.page.code === 0,
    descriptions:
      descs.length > 0 &&
      descs.every(
        ({ name, text }) =>
          text === "" ||
          (!/^[A-Z]/.test(text) && !/\.\s*$/.test(text) && !(name && new RegExp(`^${name.replace(/_/g, "[ _]")}s?\\b`, "i").test(text)) && !/\b(use when|call (this )?when|when you)\b/i.test(text)),
      ),
    inputs: sources.every((t) => bareText(t).length === 0),
    mechanics: wordsOf.every((t) => !DICTATES.test(t)),
    vocabulary: all.every(([, t]) => !/\bask\s*:\s*true|\battention\b|\.ask\b|\bshow\s*:/.test(t)),
    border: imports.every((i) => !i.startsWith("babavoss") || ENTRIES.has(i)) && !imports.some((i) => /node_modules|framework\//.test(i)),
    story: names.every((n) => of(n, "spec/").some(([, t]) => /\bstory\s*\(/.test(t))),
    tokens: names.every((n) => of(n, "ui/").every(([, t]) => !HARD.test(t))),
  }
}

/** The surfaces the agent made: those in the project now that were not among its files. */
const made = (look: Look, had: string[] = []) => look.surfaces.filter((n) => !had.includes(n))
const said = (r: Rules) =>
  Object.entries(r)
    .map(([k, v]) => `${k}${v ? "+" : "-"}`)
    .join(" ")
/** The first lines of what a failed check, spec run or page build said. */
const why = (look: Look) =>
  (["check", "test", "page"] as const)
    .filter((k) => look[k].code !== 0)
    .map((k) => `${k}: ${look[k].out.split("\n").filter((l) => /error|fail|✗/i.test(l)).slice(0, 3).join(" | ").slice(0, 300)}`)
    .join("; ")
/** Passes where every rule holds; the reason lists each, and why a check, the specs or the page failed. */
const judged = (r: Rules, look: Look, more = ""): Verdict => ({
  pass: Object.values(r).every(Boolean),
  reason: [said(r), more, why(look)].filter(Boolean).join("; "),
})

/** A run of the surfaces' command or of `baba`, however it is named. */
const WORDED = /(\.baba\/\.state\/bin\/(baba|bv)|\bbv\b|bun run baba|\bbaba (new|start|provision)\b)/
const usedSurfaces = (calls: Call[] = []) => calls.filter((c) => c.tool === "Bash" && WORDED.test(c.input))
/** Whether the agent read the changelog, by a tool or the shell. */
const readChangelog = (calls: Call[] = []) => calls.some((c) => /CHANGELOG\.md/.test(c.input) && (c.tool === "Read" || c.tool === "Grep" || c.tool === "Bash"))
/** What it looks like to leave surfaces alone: none made, the command never run. */
const leftAlone = ({ look, calls }: Checked): string | undefined => {
  if (!look) return "the project could not be looked at"
  if (look.surfaces.length) return `made ${look.surfaces.join(", ")}`
  if (usedSurfaces(calls).length) return `ran ${usedSurfaces(calls)[0]!.input.slice(0, 80)}`

  return undefined
}

const NEED = "I want to track the books I'm reading: add one, set its status, see them by status. Make me a surface for it."
const BOOKS_JSON = `${JSON.stringify(
  [
    { title: "Dune", status: "reading" },
    { title: "Middlemarch", status: "to-read" },
  ],
  null,
  2,
)}\n`
/** The person's own edit of books.json, as the rig makes it after the turn: one more book, whatever shape the file now has. */
const addPiranesi = (text: string) => {
  try {
    const value = JSON.parse(text) as unknown
    const book = { title: "Piranesi", status: "to-read" }

    if (Array.isArray(value)) return `${JSON.stringify([...value, book], null, 2)}\n`
    if (value && typeof value === "object") {
      const key = Object.entries(value).find(([, v]) => Array.isArray(v))?.[0]

      if (key) return `${JSON.stringify({ ...value, [key]: [...(value as Record<string, unknown[]>)[key]!, book] }, null, 2)}\n`
    }
  } catch {}

  return `${text}\n`
}
/** Three files that each count with a variable named `cnt`. */
const counter = (what: string, body: string) => `// Counts the ${what} of a text.\nexport const ${what} = (text: string) => {\n${body}\n\n  return cnt\n}\n`
const CODE = {
  "src/a.ts": counter("lines", '  let cnt = 0\n\n  for (const c of text) if (c === "\\n") cnt++'),
  "src/b.ts": counter("words", "  const cnt = text.split(/\\s+/).filter(Boolean).length"),
  "src/c.ts": counter("vowels", '  let cnt = 0\n\n  for (const c of text) if ("aeiou".includes(c)) cnt++'),
}
const SHOTS = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`screenshots/screen-${String(i + 1).padStart(2, "0")}.png`, ""]))

/** The instruction the install task gives with --instruction: a plain one, which says each step. */
export const INSTALL = join(HERE, "fresh/install.md")
/** The README's line to copy to an agent, the block under Getting started, word for word: the install task's prompt by default. */
export const README_LINE = /Copy this to your agent:\s*```text\n([\s\S]*?)\n```/.exec(readFileSync(join(HERE, "../../../../README.md"), "utf8"))?.[1] ?? ""
/** The install task's prompt, the text of the instruction at `path`. */
export const withInstruction = (tasks: Task[], path: string): Task[] =>
  tasks.map((t) => (t.name === "install" ? { ...t, prompt: readFileSync(path, "utf8").trim() } : t))
/** What a set-up project has: .baba/ with its framework, the harnesses' files, the root's command. */
const SET_UP = [".baba/package.json", ".baba/node_modules/babavoss/package.json", ".claude/skills/baba", ".agents/skills/baba/SKILL.md", ".baba/.state/bin/baba"]
/**
 * Why a run on a just-installed project did more than it was asked, or did not give the page's address the root says:
 * a surface made, a file of the project's changed, anything outside it changed, or another address given.
 */
const beyond = ({ look, answer }: Checked): string | undefined => {
  if (!look) return "the project could not be looked at"
  if (look.surfaces.length) return `made ${look.surfaces.join(", ")}`
  if (look.strays.length) return `changed ${look.strays.join(", ")}`
  if (look.outside.length) return `changed outside the project: ${look.outside.slice(0, 5).join(", ")}`
  if (!look.up) return "no shell runs for the session"

  const page = look.address

  if (!page || !answer.includes(page)) return `gave no page's address, or not ${page}`

  return undefined
}
/** What a run opened, said in a verdict's reason. */
const browsedOf = (look?: Look) => `opened ${look?.browsed.join(" ") || "nothing"}`

export const FRESH: Task[] = [
  {
    // The README's line, as a person copies it to an agent in a repository where nothing was run: it fetches llms.txt from
    // the site, served for the run, installs, provisions, starts the shell and gives the page's address, and makes no
    // surface. --instruction gives another text.
    name: "install",
    kind: "probe",
    prompt: README_LINE,
    fresh: { empty: true, site: true },
    check: (run) => {
      const { look, answer } = run

      if (!look) return no("the project could not be looked at")
      if (look.fetched.length && !look.fetched.includes("/llms.txt")) return no(`fetched ${look.fetched.join(", ")}, not /llms.txt`)

      const missing = SET_UP.filter((p) => !look.there[p])

      if (missing.length) return no(`missing ${missing.join(", ")}`)
      if (look.check.code !== 0) return no(`bun check in .baba/ fails: ${look.check.out.split("\n").slice(-2).join(" ")}`)

      const why = beyond(run)

      if (why) return no(why)
      if (!/\.baba|shell|installed|set up/i.test(answer)) return no("did not say what was set up")

      return ok(`babavoss ${look.framework}; fetched ${look.fetched.join(" ") || "nothing"}; ${browsedOf(look)}`)
    },
    dry: { calls: [] },
  },
  {
    // The first question after a person installed by hand: what is there, truthfully, how a surface comes to be, the page's
    // address, and nothing made. The session's own hook starts the shell.
    name: "first-contact",
    kind: "probe",
    prompt: "What can I do with this?",
    fresh: { cold: true },
    check: (run) => {
      const why = beyond(run)

      if (why) return no(why)
      // None of the project's own: said as none yet, or the shell's own settings named as the only one.
      const none = /\b(no|none|any|not yet|zero)\b[^.]{0,40}\bsurfaces?\b|\bsurfaces?\b[^.]{0,40}\b(none|yet|empty)\b/i
      const settingsAlone =
        /\bonly\b[^.]{0,60}\bsettings\b|\bsettings\b[^.]{0,80}\b(built.in|comes with|the shell's own|of the shell)\b/i.test(run.answer) ||
        (/\bsettings\b/i.test(run.answer) && /\b(only|one surface|no others|so far)\b/i.test(run.answer))

      if (!none.test(run.answer) && !settingsAlone) return no("did not say there are none yet")
      if (!/\b(ask|tell me|describe|say)\b/i.test(run.answer)) return no("did not say how one comes to be")

      return ok(browsedOf(run.look))
    },
    dry: { calls: [] },
  },
  {
    // The page asked for after installing by hand: its address, opened where the harness can, and nothing else.
    name: "open-page",
    kind: "probe",
    prompt: "Open the page.",
    fresh: { cold: true },
    check: (run) => {
      const why = beyond(run)

      if (why) return no(why)
      if (!run.look?.browsed.length && /\b(opened|is open|now open)\b/i.test(run.answer.split("\n")[0] ?? "")) return no("said the page was opened, and did not open it")

      return ok(browsedOf(run.look))
    },
    dry: { calls: [] },
  },
  {
    // A surface asked for in the person's words, in a project installed by hand a moment ago: the path end to end.
    name: "books-first",
    kind: "probe",
    prompt: "Make me a surface for tracking the books I'm reading.",
    fresh: { cold: true },
    check: ({ look }) =>
      look ? judged(rules(look, made(look)), look, `tab ${/books/.test(look.present) ? "open" : "not open"}; ${browsedOf(look)}`) : no("the project could not be looked at"),
    dry: { calls: [] },
  },
  {
    name: "make-books",
    kind: "probe",
    prompt: NEED,
    fresh: {},
    check: ({ look }) => (look ? judged(rules(look, made(look)), look) : no("the project could not be looked at")),
    dry: { calls: [] },
  },
  {
    // A surface over a file the person edits too: it hears the file by a session command named for what it hears, and the
    // person's edit is the world's in the log.
    name: "hear-books",
    kind: "probe",
    prompt:
      "I keep the books I'm reading in books.json. I want a surface for them: add one, set its status, see them by status, and it should notice when I edit books.json myself.",
    files: { "books.json": BOOKS_JSON },
    fresh: { touch: { "books.json": addPiranesi } },
    check: ({ look }) => {
      if (!look) return no("the project could not be looked at")

      const names = made(look)
      const r = rules(look, names)
      const src = Object.entries(look.files)
        .filter(([p]) => names.some((n) => p.startsWith(`.baba/surfaces/${n}/src/`)))
        .map(([, t]) => t)
        .join("\n")
      const kinds = [...src.matchAll(/kind:\s*"([\w-]+)"/g)].map((m) => m[1]!)
      const session = /\bsession\s*[:(]/.test(src) && /\bstart\s*[:(]/.test(src)
      const heardBy = look.heard.map((h) => h.by)

      return judged(
        { ...r, session, named: heardBy.some((b) => /watch|file|books|json|disk|hear|follow/.test(b)), heard: heardBy.length > 0 },
        look,
        `kinds ${[...new Set(kinds)].join(",")}; heard ${look.heard.map((h) => `${h.by}:${h.did}`).join(",") || "nothing"}`,
      )
    },
    dry: { calls: [] },
  },
  {
    // A change to a surface the project has: a declared range, the page and the spec with it, and the change running.
    name: "rate-books",
    kind: "probe",
    prompt: "Add a rating from 1 to 5 to the books surface.",
    fresh: { files: BOOKS },
    check: ({ look }) => {
      if (!look) return no("the project could not be looked at")

      const r = rules(look, ["books"])
      const src = look.files[".baba/surfaces/books/src/surface.ts"] ?? ""
      const ui = look.files[".baba/surfaces/books/ui/index.tsx"] ?? ""
      const spec = Object.entries(look.files)
        .filter(([p]) => p.startsWith(".baba/surfaces/books/spec/"))
        .map(([, t]) => t)
        .join("\n")
      // The change runs: restarted by the agent, or in dev mode by itself, so the root did not say its code changed.
      return judged({ ...r, range: /range:\s*\[\s*1\s*,\s*5\s*\]/.test(src), ui: /rating/i.test(ui), spec: /rating|rate/i.test(spec), runs: !look.stale }, look)
    },
    dry: { calls: [] },
  },
  {
    // A later release taken: the surface written to 0.70.0 adapted by the changelog, its checks and specs passing.
    name: "adapt-release",
    kind: "probe",
    prompt: "A newer babavoss was taken; adapt the surfaces.",
    fresh: { files: REVIEWS, was: "0.70.0" },
    check: ({ look, calls }) =>
      look ? judged({ ...rules(look, ["reviews"]), changelog: readChangelog(calls) }, look) : no("the project could not be looked at"),
    dry: { calls: [] },
  },
  {
    name: "plain-edit",
    kind: "probe",
    prompt: 'In README.md, change "A small app." to "A small app for notes."',
    fresh: {},
    check: (run) => {
      const why = leftAlone(run)
      const readme = run.look?.files["README.md"] ?? run.files?.["README.md"] ?? ""

      if (why) return no(why)
      if (!/A small app for notes\./.test(readme)) return no(`README.md reads "${readme.trim().split("\n").at(-1)}"`)
      if (/\bsurfaces?\b|\bbaba\b/i.test(run.answer)) return no(`mentioned the surfaces: "${run.answer.trim().slice(0, 100)}"`)

      return ok()
    },
    files: { "README.md": "# App\n\nA small app.\n" },
    dry: { calls: [] },
  },
  {
    name: "rename-var",
    kind: "probe",
    prompt: "Rename the variable `cnt` to `count` in src/a.ts, src/b.ts and src/c.ts.",
    files: CODE,
    fresh: {},
    check: (run) => {
      const why = leftAlone(run)
      const files = run.files ?? {}

      if (why) return no(why)
      if (Object.keys(CODE).some((p) => /\bcnt\b/.test(files[p] ?? "cnt") || !/\bcount\b/.test(files[p] ?? ""))) return no("not renamed in every file")

      return ok()
    },
    dry: { calls: [] },
  },
  {
    // A question about babavoss itself: answered truthfully, and nothing made unasked.
    name: "screenshots-ask",
    kind: "probe",
    prompt: "Would a surface help me review these 40 screenshots one by one?",
    files: SHOTS,
    fresh: {},
    check: (run) => {
      if (!run.look) return no("the project could not be looked at")
      if (run.look.surfaces.length) return no(`made ${run.look.surfaces.join(", ")}`)
      if (!/\bsurface/i.test(run.answer)) return no("did not answer about a surface")

      return ok()
    },
    dry: { calls: [] },
  },
]
