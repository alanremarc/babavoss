// The machine's mode, for a page whose person chose "system": asked of the adapter that fits this operating system and
// kept for a moment, so a page that asks often costs one asking. A browser can be wrong about its machine, an embedded
// one above all; the runtime is a process on it. BABAVOSS_SYSTEM_MODE=browser leaves the answer to the browser.
import type { Mode } from "../settings.ts"
import type { SystemAdapter } from "./adapter.ts"
import { macos } from "./macos.ts"

/** Every adapter; another operating system is one more file and one more name here. */
export const ADAPTERS: SystemAdapter[] = [macos]

export const adapterFor = (platform: NodeJS.Platform, adapters = ADAPTERS): SystemAdapter | undefined => adapters.find((a) => a.fits(platform))

const KEPT_MS = 2000

/** A reader of the machine's mode that asks `adapter` at most once in `keptMs`; with no adapter it knows nothing. */
export function reader(adapter: SystemAdapter | undefined, keptMs = KEPT_MS, now: () => number = Date.now): () => Mode | undefined {
  let at = -Infinity
  let mode: Mode | undefined

  return () => {
    if (!adapter) return undefined
    if (now() - at >= keptMs) {
      mode = adapter.read()
      at = now()
    }

    return mode
  }
}

const read = reader(adapterFor(process.platform))

/** This machine's mode now, or undefined: no adapter fits, it cannot tell, or the person left it to the browser. */
export const machineMode = (env: Record<string, string | undefined> = process.env): Mode | undefined => (env.BABAVOSS_SYSTEM_MODE === "browser" ? undefined : read())
