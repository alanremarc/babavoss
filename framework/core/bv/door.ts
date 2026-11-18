// A root's one entry: serve a session, or register it and pass its request to the standalone client.
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { spawn } from "node:child_process"
import type { RootDefinition } from "../root.ts"
import { startRuntime, type RuntimeOptions } from "../runtime/runtime.ts"
import { checkConfig, loadConfig } from "../config.ts"
import { ADAPTERS } from "../harness/index.ts"
import { adoptHome, findBaba, STATE_DIR, stateOf } from "../provision.ts"
import { latestRelease, updateNote } from "../update.ts"
import { recordSessionCwd, sessionCwd, stateDir } from "../state/state.ts"
import { bv, VERSION, load, save, sessionArgs, registryFile, type OpenRoot } from "./bv.ts"

/** `serve`: how its runtime runs, as the root's entry knows it: its mode, what its page is made of, and code it runs that it did not load. */
export async function main(root: RootDefinition, serve: Pick<RuntimeOptions, "dev" | "watch" | "code"> = {}) {
  const args = process.argv.slice(2)
  const directory = dirname(dirname(realpathSync(process.argv[1]!)))
  // A root is of a .baba/ directory and keeps what it writes beside it: in the person's home, or in a project. One run
  // from elsewhere keeps it beside the .baba/ of the directory the door was run in, or in that directory where there is none.
  const at = directory.lastIndexOf("/.baba/")
  const baba = at < 0 ? findBaba(process.cwd()) : directory.slice(0, at + "/.baba".length)
  const beside = baba ? dirname(baba) : process.cwd()
  const project = beside === realpathSync(homedir()) ? undefined : beside

  // In the .baba/ itself, .baba/.state; where there is none, the same place under the directory the door was run in.
  process.env.BABAVOSS_HOME ??= baba ? stateOf(baba) : join(project ?? homedir(), ".baba", STATE_DIR)
  // The person's settings, where an older release kept them; not where another file is named, as the specs name theirs.
  if (process.env.BABAVOSS_SETTINGS === undefined) adoptHome()

  if (args[0] === "--serve") {
    // A runtime that restarts wakes its successor as it was woken itself, logging where it logs.
    const successor = () =>
      spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", "ignore", "inherit"],
      }).unref()

    // Another process serves this session already: this one, with nothing to do, ends here.
    const latest = at < 0 ? undefined : () => latestRelease(process.env.BABAVOSS_HOME!)

    if (!(await startRuntime(root, ["--session", args[1]!], { ...serve, command: args[2] ?? `bv ${root.name}`, successor, latest }))) process.exit(0)

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
      throw new Error("cannot register the root in its state folder; allow writing the registry (under a sandbox, in the harness settings)")
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
        // Said by the answer that follows, which names the command; where it was put is not the agent's to know.
        if (!ours(word)) {
          // In the state folder every name is baba's: a link that no longer leads to the client, as one made before the
          // folder was moved, is replaced. There it names the client beside it, so it holds wherever the folder is.
          if (local && lstatSync(word, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(word)
          symlinkSync(local ? "bv" : target, word)
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

    // A configuration that does not load keeps every hook silent, so the answer says it instead.
    const baba = findBaba(process.cwd())
    const unloaded = baba && (await loadConfig(baba).then((config) => checkConfig(config, ADAPTERS)).then(() => undefined, (error: Error) => error.message))

    if (unloaded) console.log(`${unloaded}. The harnesses' hooks say nothing until it loads: correct it, and run \`bun run baba provision\` in .baba/`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = error instanceof SyntaxError ? 2 : 1
  }
}
