// What baba provides to every app: the framework, which is in this directory, and the packages it runs on, installed
// here once. An app holds neither. Its door finds this file and calls open, which installs the packages where they are
// missing, links the app to them and opens it through the framework's door. Only a failure is said.
// Nothing here may import a package: this is what runs before there are any.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { AppDefinition } from "../framework/core/app.ts"

const baba = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))))
const needed = Object.keys((JSON.parse(readFileSync(join(baba, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies)

const real = (path: string): string | undefined => {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}
const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

/** The node_modules a directory resolves babavoss from: the nearest one, there or above, that holds it. */
const resolvedFrom = (dir: string): string | undefined => {
  for (; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules/babavoss"))) return real(join(dir, "node_modules"))
    if (dir === dirname(dir)) return undefined
  }
}

/** Baba's packages: the node_modules it resolves from, where babavoss is this directory and every package it names is there. */
const packages = (): string | undefined => {
  const at = resolvedFrom(baba)

  return at && real(join(at, "babavoss")) === baba && needed.every((name) => existsSync(join(at, name, "package.json"))) ? at : undefined
}

/** Installs baba's packages, and puts the framework among them as babavoss, a link to this directory. */
function install(): string {
  const result = Bun.spawnSync([process.execPath, "install"], { cwd: baba, stdout: "pipe", stderr: "pipe" })

  if (result.exitCode !== 0)
    fail(
      `cannot install the packages baba runs on; allow bun to reach the package registry (under a sandbox, in the harness settings), ` +
        `or run: cd '${baba}' && bun install\n${result.stderr.toString().trim().split("\n").slice(-4).join("\n")}`
    )
  if (!packages()) {
    const self = join(baba, "node_modules/babavoss")

    mkdirSync(dirname(self), { recursive: true })
    rmSync(self, { recursive: true, force: true })
    symlinkSync("..", self)
  }

  return packages() ?? fail(`baba's packages are still not found after installing; run: cd '${baba}' && bun install`)
}

/** Links an app's node_modules to baba's, unless it resolves from them already. Whether a link was made. */
function link(root: string, at: string): boolean {
  if (resolvedFrom(root) === at) return false

  const own = join(root, "node_modules")
  const stat = lstatSync(own, { throwIfNoEntry: false })

  if (stat && !stat.isSymbolicLink()) fail(`${own} holds packages of the app's own; an app runs on baba's: remove that directory and open the app again`)
  try {
    rmSync(own, { force: true })
    symlinkSync(at, own)
  } catch {
    fail(`cannot link the app to baba's packages; allow writing ${own} (under a sandbox, in the harness settings), or run: ln -s '${at}' '${own}'`)
  }

  return true
}

/** Opens the app in the directory `root`: a session, or its resident runtime. */
export async function open(root: string) {
  const found = packages()
  const at = found ?? install()

  if (link(real(root) ?? root, at) || !found) {
    // A process started before the packages were there does not find them once they are: the door starts again, once.
    if (process.env.BABAVOSS_PROVIDED) fail(`the app still does not find baba's packages at ${at}`)

    const again = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, BABAVOSS_PROVIDED: "1" },
    })

    process.exit(again.exitCode ?? 1)
  }

  const { main } = await import("../framework/core/bv/door.ts")
  const { default: app } = (await import(join(root, "src/app.ts"))) as { default: AppDefinition }

  await main(app)
}
