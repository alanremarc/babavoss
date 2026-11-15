// A role's one entry: serve a session, or register it and pass its request to the standalone client.
import { chmodSync, copyFileSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import type { RoleDefinition } from "../role.ts"
import { startRuntime } from "../runtime/runtime.ts"
import { updateNote } from "../update.ts"
import { recordSessionCwd, sessionCwd, stateDir } from "../state/state.ts"
import { bv, VERSION, load, save, sessionArgs, registryFile, type OpenRole } from "./bv.ts"

export async function main(role: RoleDefinition) {
  const args = process.argv.slice(2)
  const directory = dirname(dirname(realpathSync(process.argv[1]!)))
  // A role lives in a .baba/ directory and keeps what it writes beside it: in the person's home, or in a project. One run
  // from elsewhere keeps it where the door was run.
  const at = directory.lastIndexOf("/.baba/")
  const beside = at < 0 ? process.cwd() : directory.slice(0, at)
  const root = beside === realpathSync(homedir()) ? undefined : beside

  process.env.BABAVOSS_HOME ??= join(root ?? homedir(), ".babavoss")

  if (args[0] === "--serve") {
    // Another process serves this session already. Under hot reload a process with nothing to do would stay, so it ends here.
    if (!(await startRuntime(role, ["--session", args[1]!], { command: args[2] ?? `bv ${role.name}` }))) process.exit(0)

    return
  }
  try {
    const session = sessionArgs([...args])
    const state = stateDir(role, { id: session })

    const file = registryFile(session)

    try {
      if (root) {
        mkdirSync(process.env.BABAVOSS_HOME, { recursive: true })
        writeFileSync(join(process.env.BABAVOSS_HOME, ".gitignore"), "*\n")
      }
      recordSessionCwd(state, process.cwd())

      const roles = load<Record<string, OpenRole>>(file) ?? {}

      roles[role.name] = { ...roles[role.name], directory: sessionCwd(state)!, entry: resolve(process.argv[1]!), state }
      save(file, roles)
    } catch {
      throw new Error("cannot register the role under ~/.babavoss; allow writing the registry (under a sandbox, in the harness settings)")
    }

    const bin = process.env.BABAVOSS_BIN ?? (root ? join(process.env.BABAVOSS_HOME, "bin") : dirname(process.execPath))
    const target = join(bin, "bv")
    const local = root !== undefined && process.env.BABAVOSS_BIN === undefined
    const client = local ? relative(root, target) : "bv"
    let command = `${client} ${role.name}`

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
      const word = join(dirname(target), role.name)
      const called = local ? relative(root!, word) : role.name
      const existing = local ? undefined : Bun.which(role.name)
      const ours = (path: string) => {
        try {
          return realpathSync(path) === realpathSync(target)
        } catch {
          return false
        }
      }

      if (command === `${client} ${role.name}` && (!existing || ours(existing))) {
        if (!ours(word)) {
          symlinkSync(target, word)
          console.log(
            `${role.name} is now a command on this machine, at ${word}; call it as ${called}${local ? ", from the project directory" : ""}`
          )
        }
        command = called
      }
    } catch {}

    const roles = load<Record<string, OpenRole>>(file)!

    roles[role.name]!.command = command
    save(file, roles)
    process.exitCode = await bv(args, role.name, command)

    const note = at < 0 ? undefined : await updateNote(process.env.BABAVOSS_HOME, directory.slice(0, at + "/.baba".length))

    if (note) console.log(note)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = error instanceof SyntaxError ? 2 : 1
  }
}
