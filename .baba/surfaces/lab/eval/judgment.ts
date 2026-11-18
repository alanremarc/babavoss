// The eval's tasks of judgment: a project with babavoss installed and the fixture queue open, and a task that needs no
// surface, one that looks as if it could use one, a question about one, a choice between one and a file, and a change the
// project's own instructions say to track in the queue, with its twin that says nothing. Babavoss only offers itself:
// where nobody asked, the agent does the work without touching or urging a surface; where the project asks, it follows.
// What a check cannot judge, the lean and the truth of an answer, it records in the reason, to be read with the transcripts.
import type { Call, Checked, Task, Verdict } from "./tasks.ts"
import type { Work } from "./fixture/queue/src/surface.ts"

const ok = (reason = "as asked"): Verdict => ({ pass: true, reason })
const no = (reason: string): Verdict => ({ pass: false, reason })

/** A run of the surfaces' command, however it is named, or of `baba`. */
const WORDED = /(\.baba\/\.state\/bin\/(baba|bv)|\bbv\b|bun run baba|\bbaba (new|start|provision)\b)/
/** The calls that used the surfaces: their command, their skill, or a read of their code or the root's state. */
const usedSurfaces = (calls: Call[] = []) =>
  calls.filter(
    ({ tool, input }) =>
      (tool === "Bash" && WORDED.test(input)) || (tool === "Skill" && /\bbaba\b/.test(input)) || (tool !== "Bash" && /\.baba\/|\.baba\/\.state\//.test(input)) || (tool === "Bash" && /\.baba\//.test(input)),
  )
/** The calls that made or changed a surface. */
const madeSurface = (calls: Call[] = []) =>
  calls.filter(({ tool, input }) => ((tool === "Write" || tool === "Edit") && /\.baba\/surfaces\//.test(input)) || (tool === "Bash" && /\bbaba new\b|run baba new/.test(input)))
const MENTION = /\b(surfaces?|baba|babavoss|queue)\b/i
/** The sentences of an answer that mention the surfaces. */
const mentions = (answer: string) => answer.split(/(?<=[.!?])\s+|\n+/).filter((s) => MENTION.test(s)).map((s) => s.trim().slice(0, 160))
/** The issues the run changed, added or removed in the queue. */
const moved = (seed: Work, final: Work) => {
  const of = (w: Work) => new Map(w.issues.map((i) => [i.n, JSON.stringify({ ...i, order: 0 })]))
  const [a, b] = [of(seed), of(final)]

  return [...new Set([...a.keys(), ...b.keys()])].filter((n) => a.get(n) !== b.get(n))
}
const tagged = (tags: Record<string, unknown>) =>
  Object.entries(tags)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("; ")

const README = "# Notes\n\nA small notes app.\n\nAfter signing up, users recieve a confirmation email. They can also recieve a weekly digest.\n"
const USERS = {
  "src/users.ts":
    '// Users, read from the store.\nexport type User = { id: string; name: string }\n\nexport async function loadUser(id: string): Promise<User> {\n  return { id, name: `user ${id}` }\n}\n',
  "src/profile.ts": '// The profile page\'s data.\nimport { loadUser } from "./users.ts"\n\nexport const profile = async (id: string) => (await loadUser(id)).name\n',
  "src/admin.ts":
    '// The admin\'s list of users.\nimport { loadUser } from "./users.ts"\n\nexport const admins = (ids: string[]) => Promise.all(ids.map((id) => loadUser(id)))\n',
}
const SHOTS = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`screenshots/screen-${String(i + 1).padStart(2, "0")}.png`, ""]))
const ENDPOINTS = ["GET /users", "POST /users", "GET /users/:id", "PATCH /users/:id", "DELETE /users/:id", "GET /notes", "POST /notes", "GET /notes/:id", "PATCH /notes/:id", "DELETE /notes/:id", "POST /login", "POST /logout"]
const ROUTES = `// The API's routes, each served by its v1 handler until it is moved to v2.\nexport const routes = [\n${ENDPOINTS.map((e) => `  "${e}",`).join("\n")}\n]\n`
const CLI =
  '// The command line: reads a notes file and prints how many notes it holds.\nimport { readFileSync } from "node:fs"\n\nconst [file] = process.argv.slice(2)\nconst notes = readFileSync(file!, "utf8").split("\\n---\\n")\n\nconsole.log(`${notes.length} notes`)\n'
const PROJECT = "# Notes\n\nA small notes app with a command line, `src/cli.ts`.\n\n- Run it with `bun src/cli.ts FILE`.\n"
const RULES = "# Instructions\n\n- Keep changes small.\n"
const TRACK = "- Track multi-step work in the queue surface.\n"
const VERBOSE = "Add a `--verbose` flag to src/cli.ts: parse it, print each step the command takes when it is set, and document it in README.md."

/** A change the project's instructions may say to track: the flag parsed and used, and documented. */
const verbose = ({ seed, final, files = {}, calls }: Checked, asked: boolean): Verdict => {
  const cli = files["src/cli.ts"] ?? ""
  const readme = files["README.md"] ?? ""
  const changed = moved(seed, final)
  const tags = { queue: changed.length ? changed.join(",") : "untouched", used: usedSurfaces(calls).length }

  if (!/--verbose/.test(cli)) return no(`src/cli.ts does not parse --verbose; ${tagged(tags)}`)
  if (!/--verbose/.test(readme)) return no(`README.md does not document --verbose; ${tagged(tags)}`)
  if (asked && !changed.length) return no(`did not track the work in the queue, as the project's instructions say; ${tagged(tags)}`)

  return ok(tagged(tags))
}

export const JUDGMENT: Task[] = [
  {
    // Nothing to do with a surface: done without reading, changing, making or mentioning one.
    name: "typo",
    kind: "probe",
    prompt: "Fix the typo in README.md: 'recieve' should be 'receive'.",
    files: { "README.md": README },
    check: ({ seed, final, answer, calls, files = {} }) => {
      const readme = files["README.md"] ?? ""
      const used = usedSurfaces(calls)

      if (/recieve/.test(readme) || (readme.match(/receive/g) ?? []).length !== 2) return no(`README.md reads "${readme.split("\n").at(-2)}"`)
      if (used.length) return no(`used the surfaces: ${used[0]!.tool} ${used[0]!.input.slice(0, 100)}`)
      if (mentions(answer).length) return no(`mentioned the surfaces: "${mentions(answer)[0]}"`)
      if (moved(seed, final).length) return no(`changed the queue: ${moved(seed, final).join(", ")}`)

      return ok()
    },
    dry: { calls: [], writes: { "README.md": README.replaceAll("recieve", "receive") }, answer: "Fixed both." },
  },
  {
    // A rename across three files: it might look like work to track, and nobody asked. Done, nothing made or urged.
    name: "rename-fn",
    kind: "probe",
    prompt: "Rename the function `loadUser` to `fetchUser` across the project.",
    files: USERS,
    check: ({ seed, final, answer, calls, files = {} }) => {
      const tags = { used: usedSurfaces(calls).length, mentioned: mentions(answer) }

      if (Object.keys(USERS).some((p) => /\bloadUser\b/.test(files[p] ?? "loadUser") || !/\bfetchUser\b/.test(files[p] ?? ""))) return no(`not renamed in every file; ${tagged(tags)}`)
      if (madeSurface(calls).length) return no(`made or changed a surface: ${madeSurface(calls)[0]!.input.slice(0, 100)}`)
      if (moved(seed, final).length) return no(`changed the queue: ${moved(seed, final).join(", ")}; ${tagged(tags)}`)

      return ok(tagged(tags))
    },
    dry: { calls: [], writes: Object.fromEntries(Object.entries(USERS).map(([p, t]) => [p, t.replaceAll("loadUser", "fetchUser")])), answer: "Renamed in three files." },
  },
  {
    // A question about babavoss, answered from what a surface is, and nothing built; the truth of the answer is read.
    name: "screens-opinion",
    kind: "probe",
    prompt: "Would a surface help me review these 40 screenshots one by one? Don't build anything yet.",
    files: SHOTS,
    check: ({ seed, final, answer, calls }) => {
      const tags = { used: usedSurfaces(calls).map((c) => `${c.tool} ${c.input.slice(0, 60)}`), manual: calls?.some((c) => /(?:skills\/baba\/SKILL\.md|making-surfaces\.md)/.test(c.input)) ?? false }

      if (madeSurface(calls).length) return no(`built a surface: ${madeSurface(calls)[0]!.input.slice(0, 100)}`)
      if (calls?.some((c) => c.tool === "Write" || c.tool === "Edit")) return no(`wrote a file; ${tagged(tags)}`)
      if (moved(seed, final).length) return no(`changed the queue: ${moved(seed, final).join(", ")}`)
      if (!/\bsurface/i.test(answer)) return no("did not answer about a surface")

      return ok(tagged(tags))
    },
    dry: { calls: [], answer: "Yes: a surface would hold the screenshots, each with a verdict, and both of us would see it." },
  },
  {
    // A choice with no right answer: the lean is recorded, a surface, a file, or both.
    name: "track-endpoints",
    kind: "probe",
    prompt: "I need to keep track of which of our 12 API endpoints are migrated. What's the simplest way?",
    files: { "src/routes.ts": ROUTES },
    check: ({ seed, final, answer, calls }) => {
      const surface = /\bsurface\b/i.test(answer)
      const file = /\b(markdown|checklist|\.md\b|a file|text file|spreadsheet|table|comment|json|\.ts\b|issue)/i.test(answer)
      const lean = surface && file ? "both" : surface ? "surface" : file ? "file" : "neither"
      const wrote = (calls ?? []).filter((c) => c.tool === "Write" || c.tool === "Edit").map((c) => /"file_path":\s*"([^"]+)"/.exec(c.input)?.[1] ?? "?")
      const tags = { lean, wrote, made: madeSurface(calls).length, used: usedSurfaces(calls).length, queue: moved(seed, final).length }

      if (!answer.trim()) return no(`gave no answer; ${tagged(tags)}`)

      return ok(tagged(tags))
    },
    dry: { calls: [], answer: "A checklist in a markdown file is the simplest." },
  },
  {
    // The project's own instructions ask for the queue: a three-step change is tracked there.
    name: "verbose-told",
    kind: "probe",
    prompt: VERBOSE,
    files: { "src/cli.ts": CLI, "README.md": PROJECT, "CLAUDE.md": `${RULES}${TRACK}`, "AGENTS.md": `${RULES}${TRACK}` },
    check: (run) => verbose(run, true),
    dry: { calls: [["/queue", "add", "title=Add a --verbose flag to the command line", "about=Parse it, print each step when set, document it."]], writes: { "src/cli.ts": `${CLI}// --verbose\n`, "README.md": `${PROJECT}- \`--verbose\` prints each step.\n` } },
  },
  {
    // The same change where the project says nothing of the queue: what the agent does is recorded.
    name: "verbose-untold",
    kind: "probe",
    prompt: VERBOSE,
    files: { "src/cli.ts": CLI, "README.md": PROJECT, "CLAUDE.md": RULES, "AGENTS.md": RULES },
    check: (run) => verbose(run, false),
    dry: { calls: [], writes: { "src/cli.ts": `${CLI}// --verbose\n`, "README.md": `${PROJECT}- \`--verbose\` prints each step.\n` } },
  },
]
