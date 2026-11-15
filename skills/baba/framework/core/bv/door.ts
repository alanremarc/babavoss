// An app's one entry: serve a session, or register it and pass its request to the standalone client.
import { chmodSync, copyFileSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import type { AppDefinition } from "../app.ts"
import { startRuntime } from "../runtime/runtime.ts"
import { installedIn, SKILL_FOLDERS } from "../skill-folders.ts"
import { recordSessionCwd, sessionCwd, stateDir } from "../state/state.ts"
import { bv, VERSION, load, save, sessionArgs, registryFile, type OpenApp } from "./bv.ts"

export async function main(app: AppDefinition) {
  const args = process.argv.slice(2)
  const directory = dirname(dirname(realpathSync(process.argv[1]!)))
  const personal = SKILL_FOLDERS.map((folder) => folder.personal()).some((path) => {
    try {
      path = realpathSync(path)
    } catch {}

    return directory.startsWith(path + "/")
  })
  const root = personal ? undefined : (installedIn(directory) ?? process.cwd())

  process.env.BABAVOSS_HOME ??= join(root ?? homedir(), ".babavoss")

  if (args[0] === "--serve") {
    // Another process serves this session already. Under hot reload a process with nothing to do would stay, so it ends here.
    if (!(await startRuntime(app, ["--session", args[1]!], { command: args[2] ?? `bv ${app.name}` }))) process.exit(0)

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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = error instanceof SyntaxError ? 2 : 1
  }
}
