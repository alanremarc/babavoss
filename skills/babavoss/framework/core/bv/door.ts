// An app's one entry: serve a session, or register it and pass its request to the standalone client.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import type { AppDefinition } from "../app.ts"
import { appVersion, startRuntime } from "../runtime/runtime.ts"
import { recordSessionCwd, sessionCwd, stateDir } from "../state/state.ts"
import { bv, VERSION, load, save, sessionArgs, registryFile, type OpenApp } from "./bv.ts"

/** Whether version `a` comes after `b`, by their numbers; what is not a number counts as 0. */
const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map((n) => Number.parseInt(n) || 0))

  for (let i = 0; i < 3; i++) if ((x![i] ?? 0) !== (y![i] ?? 0)) return (x![i] ?? 0) > (y![i] ?? 0)

  return false
}

/**
 * Says once, in a home, that an app opened at a newer version than it last did there, and where its changes are written:
 * an app is updated by replacing its directory, so its door is the first to know and the agent the one to tell the person.
 */
function versionNote(app: AppDefinition, directory: string) {
  try {
    const file = join(process.env.BABAVOSS_HOME!, "versions.json")
    const seen = load<Record<string, string>>(file) ?? {}
    const now = appVersion()
    const was = seen[app.name]

    if (was === now) return
    if (was && newer(now, was)) {
      const changelog = join(directory, "CHANGELOG.md")

      console.log(`${app.name} was updated from ${was} to ${now}${existsSync(changelog) ? `; what changed is in ${changelog}: tell the person what matters to them` : ""}`)
    }
    save(file, { ...seen, [app.name]: now })
  } catch {}
}

export async function main(app: AppDefinition, notes?: (cwd: string) => Record<string, string>) {
  const args = process.argv.slice(2)
  const directory = dirname(dirname(realpathSync(process.argv[1]!)))
  const personal = [
    join(homedir(), ".agents/skills"),
    join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "skills"),
    join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills"),
  ].some((path) => {
    try {
      path = realpathSync(path)
    } catch {}

    return directory.startsWith(path + "/")
  })
  const root = personal ? undefined : /^(.*)\/\.(?:agents|claude|codex)\/skills\//.exec(directory)?.[1] ?? process.cwd()

  process.env.BABAVOSS_HOME ??= join(root ?? homedir(), ".babavoss")

  if (args[0] === "--serve") {
    if (!(await startRuntime(app, ["--session", args[1]!], { command: args[2] ?? `bv ${app.name}` }))) process.exitCode = 0

    return
  }
  try {
    const session = sessionArgs([...args])
    const state = stateDir(app, { id: session })

    const file = registryFile(session)

    try {
      if (root) {
        mkdirSync(process.env.BABAVOSS_HOME, { recursive: true })
        writeFileSync(join(process.env.BABAVOSS_HOME, ".gitignore"), "*\n")
      }
      recordSessionCwd(state, process.cwd())

      const apps = load<Record<string, OpenApp>>(file) ?? {}

      apps[app.name] = { ...apps[app.name], directory: sessionCwd(state)!, entry: resolve(process.argv[1]!), state }
      save(file, apps)
    } catch {
      throw new Error("cannot register the app under ~/.babavoss; allow writing the registry (under a sandbox, in the harness settings)")
    }

    versionNote(app, directory)

    const bin = process.env.BABAVOSS_BIN ?? (root ? join(process.env.BABAVOSS_HOME, "bin") : dirname(process.execPath))
    const target = join(bin, "bv")
    const local = root !== undefined && process.env.BABAVOSS_BIN === undefined
    const client = local ? relative(root, target) : "bv"
    let command = `${client} ${app.name}`

    try {
      if (local) mkdirSync(bin, { recursive: true })

      let version = 0

      try {
        version = Number(/export const VERSION = (\d+)/.exec(readFileSync(target, "utf8"))?.[1] ?? 0)
      } catch {}
      if (version < VERSION) {
        copyFileSync(new URL("./bv.ts", import.meta.url), target)
        chmodSync(target, 0o755)
        console.log(`bv is now a command on this machine, at ${target}; call it as ${client}`)
      }
    } catch {
      command = `bun '${resolve(process.argv[1]!).replaceAll("'", "'\"'\"'")}'`
      console.log(`cannot put bv beside bun at ${target}; allow writing there (under a sandbox, in the harness settings); use ${command}`)
    }
    try {
      const word = join(dirname(target), app.name)
      const called = local ? relative(root!, word) : app.name
      const existing = local ? undefined : Bun.which(app.name)
      const ours = (path: string) => {
        try {
          return realpathSync(path) === realpathSync(target)
        } catch {
          return false
        }
      }

      if (command === `${client} ${app.name}` && (!existing || ours(existing))) {
        if (!ours(word)) {
          symlinkSync(target, word)
          console.log(
            `${app.name} is now a command on this machine, at ${word}; call it as ${called}${local ? ", from the project directory" : ""}`
          )
        }
        command = called
      }
    } catch {}

    const apps = load<Record<string, OpenApp>>(file)!

    apps[app.name]!.command = command
    save(file, apps)
    process.exitCode = await bv(args, app.name, command)
    if (process.exitCode === 0 && notes) {
      const file = join(state, "notes.json")
      const told = load<Record<string, string[]>>(file) ?? {}

      for (const [name, note] of Object.entries(notes(sessionCwd(state)!))) {
        if (told[name]?.includes(note)) continue
        console.log(`${name}: ${note}`)
        told[name] = [...(told[name] ?? []), note]
      }
      save(file, told)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = error instanceof SyntaxError ? 2 : 1
  }
}
