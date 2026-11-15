// A root's one entry: serve a session, or register it and pass its request to the standalone client.
import { chmodSync, copyFileSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { spawn } from "node:child_process"
import type { RootDefinition } from "../root.ts"
import { startRuntime } from "../runtime/runtime.ts"
import { findBaba } from "../provision.ts"
import { laterRelease, updateNote } from "../update.ts"
import { recordSessionCwd, sessionCwd, stateDir } from "../state/state.ts"
import { bv, VERSION, load, save, sessionArgs, registryFile, type OpenRoot } from "./bv.ts"

export async function main(root: RootDefinition) {
  const args = process.argv.slice(2)
  const directory = dirname(dirname(realpathSync(process.argv[1]!)))
  // A root is of a .baba/ directory and keeps what it writes beside it: in the person's home, or in a project. One run
  // from elsewhere keeps it beside the .baba/ of the directory the door was run in, or in that directory where there is none.
  const at = directory.lastIndexOf("/.baba/")
  const beside = at < 0 ? dirname(findBaba(process.cwd()) ?? join(process.cwd(), ".baba")) : directory.slice(0, at)
  const project = beside === realpathSync(homedir()) ? undefined : beside

  process.env.BABAVOSS_HOME ??= join(project ?? homedir(), ".babavoss")

  if (args[0] === "--serve") {
    // Woken under hot reload: a runtime that gives way wakes its successor as it was woken itself, logging where it logs.
    const successor = () =>
      spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", "ignore", "inherit"],
      }).unref()

    // Another process serves this session already. Under hot reload a process with nothing to do would stay, so it ends here.
    const latest = at < 0 ? undefined : () => laterRelease(process.env.BABAVOSS_HOME!)

    if (!(await startRuntime(root, ["--session", args[1]!], { command: args[2] ?? `bv ${root.name}`, successor, latest }))) process.exit(0)

    return
  }
  try {
    const session = sessionArgs([...args])
    const state = stateDir(root, { id: session })

    const file = registryFile(session)

    try {
      if (project) {
        mkdirSync(process.env.BABAVOSS_HOME, { recursive: true })
        writeFileSync(join(process.env.BABAVOSS_HOME, ".gitignore"), "*\n")
      }
      recordSessionCwd(state, process.cwd())

      const roots = load<Record<string, OpenRoot>>(file) ?? {}

      roots[root.name] = { ...roots[root.name], directory: sessionCwd(state)!, entry: resolve(process.argv[1]!), state }
      save(file, roots)
    } catch {
      throw new Error("cannot register the root under ~/.babavoss; allow writing the registry (under a sandbox, in the harness settings)")
    }

    const bin = process.env.BABAVOSS_BIN ?? (project ? join(process.env.BABAVOSS_HOME, "bin") : dirname(process.execPath))
    const target = join(bin, "bv")
    const local = project !== undefined && process.env.BABAVOSS_BIN === undefined
    const client = local ? relative(project, target) : "bv"
    let command = `${client} ${root.name}`

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
      const word = join(dirname(target), root.name)
      const called = local ? relative(project!, word) : root.name
      const existing = local ? undefined : Bun.which(root.name)
      const ours = (path: string) => {
        try {
          return realpathSync(path) === realpathSync(target)
        } catch {
          return false
        }
      }

      if (command === `${client} ${root.name}` && (!existing || ours(existing))) {
        if (!ours(word)) {
          symlinkSync(target, word)
          console.log(
            `${root.name} is now a command on this machine, at ${word}; call it as ${called}${local ? ", from the project directory" : ""}`
          )
        }
        command = called
      }
    } catch {}

    const roots = load<Record<string, OpenRoot>>(file)!

    roots[root.name]!.command = command
    save(file, roots)
    process.exitCode = await bv(args, root.name, command)

    const note = at < 0 ? undefined : await updateNote(process.env.BABAVOSS_HOME, directory.slice(0, at + "/.baba".length))

    if (note) console.log(note)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = error instanceof SyntaxError ? 2 : 1
  }
}
