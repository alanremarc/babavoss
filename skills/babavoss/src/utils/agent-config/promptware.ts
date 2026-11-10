// Read an app's root skill and reference files without importing its code.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
export type Skill = { name: string; description: string; text: string; file: string }
export type Promptware = { skill: Skill; references: { name: string; file: string; text: string }[] }
export function frontmatter(text: string): { fields: Record<string, string>; body: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/)

  if (lines[0]?.trim() !== "---") return { fields: {}, body: text }

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---")

  if (end < 0) return { fields: {}, body: text }

  const fields: Record<string, string> = {}

  for (let i = 1; i < end; i++) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]!)

    if (!field) continue

    let value = field[2]!.trim()

    if (/^[|>][+-]?$/.test(value)) {
      const block: string[] = []

      while (i + 1 < end && (/^\s/.test(lines[i + 1]!) || !lines[i + 1]!.trim())) block.push(lines[++i]!.trim())
      value = block.join(value.startsWith("|") ? "\n" : " ").trim()
    } else if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
    fields[field[1]!] = value
  }

  return {
    fields,
    body: text
      .split("\n")
      .slice(end + 1)
      .join("\n"),
  }
}

export const size = (text: string) => ({ chars: text.length, tokens: Math.ceil(text.length / 4) })
export function readPromptware(dir: string, project: string): Promptware {
  const file = join(dir, "SKILL.md")
  const { fields, body } = frontmatter(readFileSync(file, "utf8"))
  const references: Promptware["references"] = []
  const visit = (at: string) => {
    if (!existsSync(at)) return
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(at, entry.name)

      if (entry.isDirectory()) visit(path)
      else if (entry.isFile())
        references.push({ name: relative(join(dir, "references"), path), file: relative(project, path), text: readFileSync(path, "utf8") })
    }
  }

  visit(join(dir, "references"))

  return { skill: { name: fields.name ?? "", description: fields.description ?? "", text: body, file: relative(project, file) }, references }
}
