// The agent's text answers and session memory; JSON clients keep their own presentation.
import { join } from "node:path"
import { readJsonFile, writeJsonFile } from "../state/json-file.ts"
import { changes, flatten } from "../present/present.ts"
import { handles, type Args, type Handle, type Json } from "../surface/view.ts"
import type { Running } from "../surface/run.ts"

const isHandle = (v: Json | undefined): v is Handle => !!v && typeof v === "object" && !Array.isArray(v) && v.kind === "handle"

/**
 * Relative facts, quoted cells in uniform tables, and each handle as the command that calls it: `path` is where the view was read,
 * which is where its handles are called.
 */
export function textLines(value: Json | undefined, prefix = "", into = new Map<string, string>(), path = "/", command = "bv app"): Map<string, string> {
  if (isHandle(value)) {
    into.set(
      prefix,
      `${prefix || value.name}: ${[`${command} ${path} ${value.name}`, ...Object.entries(value.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`), ...Object.entries(value.open).map(([k, v]) => `${k}=${v}`)].join(" ")}   ${value.description}`
    )
  } else if (Array.isArray(value) && value.length && value.every((v) => v && typeof v === "object" && !Array.isArray(v) && !isHandle(v))) {
    const rows = value as Record<string, Json>[]
    const keys = Object.keys(rows[0]!).filter((k) => !isHandle(rows[0]![k]))
    const plain = (v: Json | undefined) => v === null || ["string", "number", "boolean"].includes(typeof v)

    if (rows.every((row) => JSON.stringify(Object.keys(row).filter((k) => !isHandle(row[k]))) === JSON.stringify(keys) && keys.every((k) => plain(row[k])))) {
      into.set(prefix, `${prefix}: ${keys.join("\t")}\n${rows.map((row) => keys.map((k) => JSON.stringify(row[k])).join("\t")).join("\n")}`)
      for (const [i, row] of rows.entries()) for (const [k, v] of Object.entries(row)) if (isHandle(v)) textLines(v, `${prefix}.${i}.${k}`, into, path, command)
    } else for (const [i, v] of value.entries()) textLines(v, `${prefix}.${i}`, into, path, command)
  } else if (value && typeof value === "object" && Object.keys(value).length) {
    for (const [k, v] of Object.entries(value)) if (v !== undefined) textLines(v, prefix ? `${prefix}.${k}` : k, into, path, command)
  } else into.set(prefix, `${prefix}: ${flatten(value).get("")}`)

  return into
}

/** Convert text at the boundary, leaving admission and fixed-argument matching to the surface. */
export function textArgs(view: Json | undefined, name: string, input: unknown): Args {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("args must be a JSON object")

  const offered = handles(view).filter((h) => h.name === name)
  const args: Args = {}

  for (const [key, value] of Object.entries(input)) {
    const types = offered.map((h) => h.open[key] ?? (Object.hasOwn(h.args, key) ? typeof h.args[key] : undefined)).filter(Boolean)
    const type = types[0] ?? "string"

    if (typeof value !== "string") throw new Error(`${key} must be text for ${type}`)
    if (type === "number") {
      if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${key} must be a number`)
      args[key] = Number(value)
    } else if (type === "boolean") {
      if (value !== "true" && value !== "false") throw new Error(`${key} must be a boolean`)
      args[key] = value === "true"
    } else args[key] = value
  }
  if (offered.length === 1) return { ...offered[0]!.args, ...args }

  return args
}

export function textSession<M>(running: Running<M>, dir: string, actor: string, command: string) {
  const file = join(dir, "presented", "text.json")
  let before = readJsonFile<Json>(file)
  const root = () => running.read("/", actor)
  const diff = (old: Json | undefined, now: Json | undefined) => {
    const lines = changes(flatten(old), flatten(now))

    for (const [key, line] of textLines(now, "", new Map(), "/", command)) {
      if (line.startsWith(`${key}: ${command} `)) {
        const index = lines.findIndex((v) => v.startsWith(`+ ${key}: `) || v.startsWith(`${key}: `))

        if (index !== -1) lines[index] = `${lines[index]!.startsWith("+ ") ? "+ " : ""}${line}`
      }
    }

    return lines
  }
  const told = (now: Json | undefined) => {
    if (now !== undefined) writeJsonFile(file, now)
    before = now
  }

  return {
    root,
    diff,
    changed: () => (before === undefined ? [...textLines(root(), "", new Map(), "/", command).values()] : diff(before, root())),
    /** `path` is where the answer's lines were read or called: what / says of that same path, in the same words, is not said again. */
    answer(lines: string[], whole = false, shown?: Json, path?: string) {
      const now = root()
      const flat = flatten(now)
      // The objects of / that name the answered path under `at`, as key prefixes: a shell's tab, a list's item.
      const here = path && path !== "/" ? [...flat].filter(([k, v]) => /(^|\.)at$/.test(k) && v === JSON.stringify(path)).map(([k]) => k.slice(0, -2)) : []
      const parts = (line: string) => {
        const [, mark = "", key = "", rest = ""] = /^([+-] )?([^:\s]+)(.*)$/.exec(line) ?? []

        return { mark, key, rest }
      }
      const repeated = (line: string) => {
        const said = parts(line)
        const prefix = here.find((h) => said.key.startsWith(h))

        if (prefix === undefined) return false

        const key = said.key.slice(prefix.length)
        const same = (k: string) => key === k || key.endsWith(`.${k}`)

        return (
          lines.some((l) => parts(l).mark === said.mark && parts(l).rest === said.rest && same(parts(l).key)) ||
          [...flatten(shown)].some(([k, v]) => same(k) && said.mark !== "- " && flat.get(said.key) === v)
        )
      }
      const extra = whole
        ? []
        : (before === undefined ? [...textLines(now, "", new Map(), "/", command).values()] : diff(before, now)).filter(
            (line) =>
              !lines.includes(line) &&
              !lines.includes(line.replace(/^\+ /, "")) &&
              ![...flatten(shown)].some(([k, v]) => (line === `+ ${k}: ${v}` || line.startsWith(`${k}: `)) && flat.get(k) === v) &&
              !repeated(line)
          )

      told(now)

      return [...new Set(lines), ...(extra.length ? ["changed:", ...extra] : [])].join("\n")
    },
  }
}
