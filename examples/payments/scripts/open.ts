// The app's door: opens a session or serves its resident runtime. What the app depends on is installed first where it is
// missing, the framework among it, at the version package.json names; only a failure of that is said. Nothing here may
// import a package: this is what runs before there are any.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const named = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies.babavoss
/**
 * The framework's version as installed for this app: in a node_modules here or above, read as files, never through bun's
 * resolver, which answers from its own cache.
 */
const found = (): string | undefined => {
  for (let dir = root; ; dir = dirname(dir)) {
    try {
      return (JSON.parse(readFileSync(join(dir, "node_modules/babavoss/package.json"), "utf8")) as { version: string }).version
    } catch {
      if (dir === dirname(dir)) return undefined
    }
  }
}
// Installed at the version named; where a path or a link is named instead, as when a framework fix is tried, being there is enough.
const installed = () => found() !== undefined && (found() === named || !/^\d/.test(named ?? ""))

if (!installed()) {
  // Once: a door started again after installing does not install again.
  const install = process.env.BABAVOSS_INSTALLED ? undefined : Bun.spawnSync([process.execPath, "install"], { cwd: root, stdout: "pipe", stderr: "pipe" })

  if (install?.exitCode !== 0) {
    const why = install ? install.stderr.toString().trim().split("\n").slice(-4).join("\n") : `babavoss ${named} is still not found after installing`

    console.error(
      `cannot install what this app depends on; allow bun to reach the package registry (under a sandbox, in the harness settings), ` +
        `or run: cd '${root}' && bun install\n${why}`
    )
    process.exit(1)
  }
  // A process started before the packages were there does not find them once installed: the door starts again.
  const again = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, BABAVOSS_INSTALLED: "1" },
  })

  process.exit(again.exitCode ?? 1)
}

const { main } = await import("babavoss/core/bv/door.ts")
const { default: app } = await import("../src/app.ts")

await main(app)
