// A told text read for its shape, so the page can show it dense and coloured without changing a character of it. A text is
// cut into parts by its lines: prose, written as markdown, such as baba's words; and shaped, what the framework prints:
// lead lines, sections, a heading per tab, `key: value` facts, tables of tab-separated rows, commands, `+` and `-` lines,
// `a → b` changes, notices, a highlight marked so, and who did what. A shaped line is cut into spans, each of a kind. Nothing is made here: the
// parts' texts joined by newlines are the text, a part's lines joined by newlines are its text, and a line's spans joined
// are the line, exactly.

export type SpanKind = "plain" | "path" | "key" | "string" | "number" | "keyword" | "command" | "description" | "sign" | "arrow" | "old" | "who" | "surface"
export type Span = { kind: SpanKind; text: string; who?: "person" | "surface" | "agent" }
/** What a shaped line is: a table's head names its columns after its key; a row is one of its rows, cells by tab. */
export type LineKind = "blank" | "lead" | "section" | "heading" | "fact" | "add" | "remove" | "head" | "row" | "notice" | "plain"
export type Line = { kind: LineKind; text: string; spans: Span[] }
export type Part = { kind: "prose"; text: string; from: number } | { kind: "shaped"; text: string; from: number; lines: Line[] }

/** A heading of a tab at /: its path, its surface where it is said, its title, and its number where it is said. */
const HEADING = /^(\/[^\s:]*)( )(?:([a-z][\w-]*)( ))?("(?:[^"\\]|\\.)*")( \(tab \d+\))?$/
const FACT = /^([\w.[\]/-]+)(: ?)(.*)$/
const SECTION = /^([a-z][\w ]{0,40}):$/i
const LEAD = /^(Heard in|In|The shell of) .+:$/
const SIGNED = /^([+-])( )(.*)$/
/** A value's tokens, in order of what wins: a quoted string, a who, a command, an arrow, a path, a number, a keyword. */
const TOKEN =
  /("(?:[^"\\]|\\.)*")|( \(by the (?:person|surface|agent)\))|((?:\.babavoss\/bin\/|\bbaba )\S[^\t]*?(?=   |\t|$))|(→)|((?<![\w/.])\/[\w./:\-*]*)|((?<![\w.-])-?\d+(?:[.,]\d+)?(?![\w.]))|(\b(?:true|false|null)\b)/g

/** Whether a line reads as markdown prose: a heading, or a sentence. */
function prose(line: string): boolean {
  if (/^#{1,6} /.test(line) || /^```/.test(line)) return true
  if (/^(- |\* |\d+\. )/.test(line)) return line.length > 60 && /[.:;]$|\. /.test(line) && !FACT.test(line.slice(2))
  if (/^(\.babavoss\/|baba |bv )/.test(line) || LEAD.test(line) || /\t/.test(line) || HEADING.test(line) || /\(by the (person|surface|agent)\)$/.test(line) || /^[a-z][\w-]* \/\S*: /.test(line)) return false
  if (FACT.test(line) && !/ /.test(line.split(":")[0]!)) return false

  return line.length >= 40 && /[.!?`)]$/.test(line) && / \w+ \w+ /.test(line)
}

/** A value cut into spans; before an arrow it is the old value. */
export function valueSpans(text: string): Span[] {
  const spans: Span[] = []
  let at = 0

  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) spans.push({ kind: "plain", text: text.slice(at, m.index) })

    const [all, str, who, command, arrow, path, number, keyword] = m

    if (str) spans.push({ kind: "string", text: all })
    else if (who) spans.push({ kind: "who", text: all, who: /person/.test(who) ? "person" : /surface/.test(who) ? "surface" : "agent" })
    else if (command) spans.push({ kind: "command", text: all })
    else if (arrow) spans.push({ kind: "arrow", text: all })
    else if (path) spans.push({ kind: "path", text: all })
    else if (number) spans.push({ kind: "number", text: all })
    else if (keyword) spans.push({ kind: "keyword", text: all })
    at = m.index + all.length
  }
  if (at < text.length) spans.push({ kind: "plain", text: text.slice(at) })

  // A description after a command, set off by three spaces, is quiet.
  const command = spans.findIndex((s) => s.kind === "command")

  if (command >= 0) {
    const rest = spans.slice(command + 1).map((s) => s.text).join("")
    const gap = /^ {3,}/.exec(rest)

    if (gap) spans.splice(command + 1, spans.length, { kind: "plain", text: gap[0] }, { kind: "description", text: rest.slice(gap[0].length) })
  }

  const arrow = spans.findIndex((s) => s.kind === "arrow")

  // The old value is the token just before the arrow.
  for (let i = arrow - 1; i >= 0; i--)
    if (spans[i]!.text.trim()) {
      spans[i] = { ...spans[i]!, kind: "old" }
      break
    }

  return spans
}

/** A fact's spans: its key, then its value. */
function factSpans(text: string): Span[] {
  const m = FACT.exec(text)

  if (!m) return valueSpans(text)

  return [{ kind: m[1]!.startsWith("/") ? "path" : "key", text: m[1]! }, { kind: "plain", text: m[2]! }, ...valueSpans(m[3]!)]
}

/** One shaped line read, with what section it stands in and whether a table runs above it. */
export function readLine(text: string, section = "", table = false): Line {
  if (!text.trim()) return { kind: "blank", text, spans: text ? [{ kind: "plain", text }] : [] }
  if (LEAD.test(text)) return { kind: "lead", text, spans: [{ kind: "plain", text }] }
  if (table && text.includes("\t")) return { kind: "row", text, spans: valueSpans(text) }
  if (SECTION.test(text) && !text.includes(": ")) return { kind: "section", text, spans: [{ kind: "key", text: text.slice(0, -1) }, { kind: "plain", text: ":" }] }

  const heading = HEADING.exec(text)

  if (heading)
    return {
      kind: "heading",
      text,
      spans: [
        { kind: "path", text: heading[1]! },
        { kind: "plain", text: heading[2]! },
        ...(heading[3] ? [{ kind: "surface" as const, text: heading[3] }, { kind: "plain" as const, text: heading[4]! }] : []),
        { kind: "string", text: heading[5]! },
        ...(heading[6] ? [{ kind: "surface" as const, text: heading[6] }] : []),
      ],
    }

  const signed = SIGNED.exec(text)

  if (signed) return { kind: signed[1] === "+" ? "add" : "remove", text, spans: [{ kind: "sign", text: signed[1]! }, { kind: "plain", text: signed[2]! }, ...factSpans(signed[3]!)] }

  const fact = FACT.exec(text)

  if (fact && fact[3]!.includes("\t")) return { kind: "head", text, spans: [{ kind: "key", text: fact[1]! }, { kind: "plain", text: fact[2]! }, { kind: "plain", text: fact[3]! }] }
  if (section === "notices") {
    // A highlight is marked by its first word.
    const marked = /^highlight (?=\S)/.exec(text)?.[0] ?? ""
    const rest = text.slice(marked.length)
    const mark: Span[] = marked ? [{ kind: "keyword", text: marked.trimEnd() }, { kind: "plain", text: " " }] : []
    const notice = /^([a-z][\w-]*)( )(\/\S*?)(: )(.*)$/.exec(rest)

    if (notice)
      return {
        kind: "notice",
        text,
        spans: [...mark, { kind: "surface", text: notice[1]! }, { kind: "plain", text: notice[2]! }, { kind: "path", text: notice[3]! }, { kind: "plain", text: notice[4]! }, ...valueSpans(notice[5]!)],
      }

    return { kind: "notice", text, spans: [...mark, ...valueSpans(rest)] }
  }
  if (fact) return { kind: "fact", text, spans: factSpans(text) }

  return { kind: "plain", text, spans: valueSpans(text) }
}

/** A shaped part's lines read in order: a section holds until a blank line, a heading or another section; a table until a line with no tab. */
export function readLines(lines: string[]): Line[] {
  let section = ""
  let table = false

  return lines.map((text) => {
    const line = readLine(text, section, table)

    if (line.kind === "section") section = text.slice(0, -1)
    else if (line.kind === "blank" || line.kind === "heading" || line.kind === "lead") section = ""
    table = line.kind === "head" || (table && line.kind === "row")

    return line
  })
}

/** A told text cut into prose and shaped parts, by its lines; a blank line or one that could be either goes with the part before it. */
export function parts(text: string): Part[] {
  const lines = text.split("\n")
  const kinds = lines.map((line) => (!line.trim() ? undefined : prose(line) ? "prose" : LEAD.test(line) || readLine(line).kind !== "plain" ? "shaped" : undefined))
  const first = kinds.find((k) => k !== undefined) ?? "shaped"
  const out: { kind: "prose" | "shaped"; from: number; lines: string[] }[] = []
  let kind = first
  let inFence = false

  lines.forEach((line, i) => {
    // Within a fenced block of prose, every line is prose.
    if (/^```/.test(line)) inFence = !inFence
    else if (!inFence && kinds[i]) kind = kinds[i]!
    if (inFence) kind = "prose"

    const last = out.at(-1)

    if (last?.kind === kind) last.lines.push(line)
    else out.push({ kind, from: i, lines: [line] })
  })

  return out.map((p) => (p.kind === "prose" ? { kind: "prose", from: p.from, text: p.lines.join("\n") } : { kind: "shaped", from: p.from, text: p.lines.join("\n"), lines: readLines(p.lines) }))
}
