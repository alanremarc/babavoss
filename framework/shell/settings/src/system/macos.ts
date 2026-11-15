// macOS: the appearance is the global default AppleInterfaceStyle, "Dark" while the system is dark and absent while it
// is light, in the automatic appearance too. Asked of `defaults`, which every Mac has.
import { spawnSync } from "node:child_process"
import type { Mode } from "../settings.ts"
import type { SystemAdapter } from "./adapter.ts"

/** What `defaults read -g AppleInterfaceStyle` said: Dark is dark, a key that does not exist is light, anything else is not known. */
export function modeOf(status: number | null, stdout: string, stderr: string): Mode | undefined {
  if (status === 0) return stdout.trim() === "Dark" ? "dark" : undefined
  if (status === 1 && stderr.includes("does not exist")) return "light"

  return undefined
}

export const macos: SystemAdapter = {
  name: "macos",
  fits: (platform) => platform === "darwin",
  read: () => {
    try {
      const { status, stdout, stderr } = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], { encoding: "utf8", timeout: 1000 })

      return modeOf(status, stdout ?? "", stderr ?? "")
    } catch {
      return undefined
    }
  },
}
