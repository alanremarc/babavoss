// The eval's task of adapting a surface across releases: a project whose surface was written for babavoss 0.64.0, before
// the kit was cut, `ask` removed, highlights, declared inputs and mechanics-only words, takes the current release, and its
// agent is told only to adapt. It is checked by the framework's rules, by the shape the release asks for, and by a judge's
// specs the agent never sees, which say what the surface did before in terms any allowed shape passes: so it cannot pass
// by deleting what failed, nor by changing what the surface does.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { rules } from "./fresh.ts"
import type { Call, Look, Task, Verdict } from "./tasks.ts"

/** A folder of files as a project's files, under `to`; a file's `.txt` ending, which keeps it from being checked here, dropped. */
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
const AT = ".baba/surfaces/expenses"
/** The expenses surface as 0.64.0 had it: its source, its page on the kit's internals, and its spec of five stories. */
export const EXPENSES = folder(join(HERE, "fresh/expenses-0.64"), AT)
/** The judge's spec, written into the surface's spec folder once the agent's turn ends. */
const JUDGE = folder(join(HERE, "fresh/expenses-judge"), `${AT}/spec`)
const STORIES = 5
/** The adaptation as this rig's author made it, which the dry run writes in the agent's place: proof the check can pass. */
const ADAPTED = folder(join(HERE, "fresh/expenses-adapted"), AT)

/** The text of each `how:` in a source, joined pieces of a string concatenation included. */
const howOf = (source: string) => /\bhow:\s*((?:(?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*\+?\s*)+)/.exec(source)?.[1]?.trim().replace(/["`]\s*\+\s*["`]/g, "").slice(1, -1) ?? ""
/** The surface's own description: the one in the call of `surface`. */
const describedAs = (source: string) => /\bsurface\s*(?:<[^>]*>)?\s*\(\s*\{[\s\S]*?\bdescription:\s*"((?:[^"\\]|\\.)*)"/.exec(source)?.[1] ?? ""
/** A sentence that opens with a verb told to the agent: what it should do, not what holds. */
const IMPERATIVE = /(^|[.:;]\s+)(log|submit|approve|reject|tell|show|wait|ask|use|keep|note|set|raise|highlight|let|make|mark)\b/i

/** The shape the releases since 0.64.0 ask of the surface, each true where it holds. */
export function shape(look: Look): Record<string, boolean> {
  const source = look.files[`${AT}/src/surface.ts`] ?? ""
  const all = Object.entries(look.files).filter(([p]) => p.startsWith(`${AT}/`) && !p.endsWith("behaviour.spec.ts"))
  const how = howOf(source)
  const description = describedAs(source)
  const spec = all.filter(([p]) => p.startsWith(`${AT}/spec/`)).map(([, t]) => t).join("\n")
  const tests = (spec.match(/\btest\s*\(/g) ?? []).length

  return {
    noShow: !all.some(([, t]) => /\bshow at=|`show`/.test(t)),
    usewhen: /\buse when\b/i.test(description) && !/^expenses\b/i.test(description),
    how: how !== "" && !IMPERATIVE.test(how),
    kept: tests >= STORIES && !/\btest\.(skip|todo)\b|\bit\.skip\b/.test(spec),
    judged: look.judged?.code === 0,
  }
}

/** The changelog's sections the agent read, by the versions in what its reads returned, and whether it read the framework's code. */
export function reading(calls: Call[] = []): { changelog: boolean; framework: number } {
  return {
    changelog: calls.some((c) => /CHANGELOG\.md/.test(c.input)),
    framework: calls.filter((c) => /node_modules\/babavoss\/(framework|template|skill\/making)/.test(c.input)).length,
  }
}

const said = (r: Record<string, boolean>) =>
  Object.entries(r)
    .map(([k, v]) => `${k}${v ? "+" : "-"}`)
    .join(" ")
const why = (look: Look) =>
  (["check", "test", "judged", "page"] as const)
    .filter((k) => look[k] && look[k]!.code !== 0)
    .map((k) => `${k}: ${look[k]!.out.split("\n").filter((l) => /error|fail|✗/i.test(l)).slice(0, 4).join(" | ").slice(0, 400)}`)
    .join("; ")

export const ADAPTING: Task[] = [
  {
    name: "adapt-0.64",
    kind: "probe",
    prompt: "A newer babavoss was taken in this project. Adapt its surfaces to it.",
    fresh: { files: EXPENSES, was: "0.64.0", judge: JUDGE },
    check: ({ look, calls }): Verdict => {
      if (!look) return { pass: false, reason: "the project could not be looked at" }

      const r = { ...rules(look, ["expenses"]), ...shape(look) }
      const read = reading(calls)

      return {
        pass: Object.values(r).every(Boolean),
        reason: [said(r), `changelog${read.changelog ? "+" : "-"} framework-reads ${read.framework}`, why(look)].filter(Boolean).join("; "),
      }
    },
    dry: { calls: [], writes: ADAPTED, answer: "Adapted the expenses surface from CHANGELOG.md." },
  },
]
