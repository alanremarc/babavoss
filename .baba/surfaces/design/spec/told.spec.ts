// How the page reads a told text: prose apart from what the framework prints, and each printed line cut into spans of a
// kind, every character kept. The texts here are samples of the shapes, written to be read; the design document's own
// spec reads every text the plays gave.
import { expect, test } from "bun:test"
import { parts, readLine, readLines, type Part, type Span } from "../ui/told.ts"

/** A text cut into parts, checked to be the text again, every part, line and span of it. */
function exact(text: string): Part[] {
  const read = parts(text)

  expect(read.map((p) => p.text).join("\n")).toBe(text)
  for (const p of read)
    if (p.kind === "shaped") {
      expect(p.lines.map((l) => l.text).join("\n")).toBe(p.text)
      for (const l of p.lines) expect(l.spans.map((s) => s.text).join("")).toBe(l.text)
    }

  return read
}
const kinds = (spans: Span[]) => spans.filter((s) => s.text.trim()).map((s) => [s.kind, s.text])

const START = [
  "This project has surfaces. A surface is a tool you work with for the person, read and acted on through a command.",
  "",
  "## The shell",
  "",
  "- An answer shows what is true now. Do not look for it in a surface's code, and never change either to get something done.",
  "- `highlight` at `/` marks a place for the person. Mark a result or a decision, not each step.",
  "",
  "The shell of .baba/ was started for this session, and answered:",
  "page: http://127.0.0.1:4000",
  ".baba/.state/bin/baba PATH — read",
  "baba 0.43.8",
  'title: "baba"',
  "surfaces: name\tdescription",
  '"tasks"\t"Track the project\'s tasks. Use when work is asked for."',
  "open: .baba/.state/bin/baba / open surface=NAME   open a NAME tab",
  "",
  '/tabs/1 tasks "Tasks"',
  "actions: add   each one's command is at /tabs/1",
  "tasks: []",
].join("\n")

test("a session's start is baba's words as prose, then the shell's answer as printed", () => {
  const read = exact(START)

  expect(read.map((p) => [p.kind, p.from])).toEqual([
    ["prose", 0],
    ["shaped", 7],
  ])
  expect(read[0]!.text).toContain("## The shell")
})

test("what changed: a lead, sections, a heading per tab, additions, removals and changes, the old value apart", () => {
  const text = [
    "In the shell of .baba/: what was heard, then what changed at / since you were last told it, by who changed it:",
    "notices:",
    "tasks /tabs/1/tasks/3: Task 3, Bump the version, is approved (by the person)",
    "highlight build /tabs/2: The build failed (by the surface)",
    "changed by the person:",
    "- note",
    '/tabs/1 tasks "Tasks"',
    '/tabs/1/tasks/3: status "review" → "done"',
    "runs: 0 → 4",
    "+ specs: 214",
    "tasks: order now 1, 2, 4, 3",
  ].join("\n")
  const [part] = exact(text)

  expect(part!.kind).toBe("shaped")

  const lines = (part as Extract<Part, { kind: "shaped" }>).lines

  expect(lines.map((l) => l.kind)).toEqual(["lead", "section", "notice", "notice", "section", "remove", "heading", "fact", "fact", "add", "fact"])
  expect(kinds(lines[2]!.spans)).toEqual([
    ["surface", "tasks"],
    ["path", "/tabs/1/tasks/3"],
    ["plain", ": "],
    ["plain", "Task "],
    ["number", "3"],
    ["plain", ", Bump the version, is approved"],
    ["who", " (by the person)"],
  ])
  expect(lines[2]!.spans.find((s) => s.kind === "who")!.who).toBe("person")
  // A highlight is marked by its first word, before who says it and where.
  expect(kinds(lines[3]!.spans).slice(0, 3)).toEqual([
    ["keyword", "highlight"],
    ["surface", "build"],
    ["path", "/tabs/2"],
  ])
  expect(kinds(lines[7]!.spans)).toEqual([
    ["path", "/tabs/1/tasks/3"],
    ["plain", ": "],
    ["plain", "status "],
    ["old", '"review"'],
    ["arrow", "→"],
    ["string", '"done"'],
  ])
  expect(kinds(lines[8]!.spans)).toEqual([
    ["key", "runs"],
    ["plain", ": "],
    ["old", "0"],
    ["arrow", "→"],
    ["number", "4"],
  ])
  expect(kinds(lines[6]!.spans)).toEqual([
    ["path", "/tabs/1"],
    ["surface", "tasks"],
    ["string", '"Tasks"'],
  ])
})

test("a table is its head, then its rows by tab, until a line with none", () => {
  const lines = readLines(["tasks: at\tn\ttitle\tstatus", '"/tabs/1/tasks/1"\t1\t"Write the notes"\t"todo"', '"/tabs/1/tasks/2"\t2\t"Tag it"\t"done"', "add: .baba/.state/bin/baba /tabs/1 add title=string   Add a task"])

  expect(lines.map((l) => l.kind)).toEqual(["head", "row", "row", "fact"])
  expect(kinds(lines[3]!.spans)).toEqual([
    ["key", "add"],
    ["plain", ": "],
    ["command", ".baba/.state/bin/baba /tabs/1 add title=string"],
    ["description", "Add a task"],
  ])
})

test("what reads as neither is kept as it is, and nothing is lost of a text with odd spacing", () => {
  expect(readLine("nothing at /tabs/1/tasks/1")).toMatchObject({ kind: "plain" })
  expect(kinds(readLine('/tasks "Tasks" (tab 1)').spans)).toEqual([
    ["path", "/tasks"],
    ["string", '"Tasks"'],
    ["surface", " (tab 1)"],
  ])
  for (const text of ["", "\n", "  \n\t x", "refused: nothing at /tabs/1", "a \"quoted \\\" string\" → 3", "```\ncode: not a fact\n```", "- pointed\n- done"]) exact(text)
})
