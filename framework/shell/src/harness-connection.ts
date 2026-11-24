// What the project has provisioned and what the session has proved through Baba's runtime.
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { load } from "../../core/bv/bv.ts"
import { loadConfig, sectionOf } from "../../core/config.ts"
import { ADAPTERS } from "../../core/harness/index.ts"
import { AGENT_COMMAND, PRESENT_READY, STARTUP_HEARD } from "../../core/state/session-dir.ts"

type Installation = "configured" | "missing" | "disabled" | "no-events" | "unreadable"

export type HarnessConnection = {
  hooks: { name: string; title: string; status: Installation }[]
  startupHeard: boolean
  recovered: boolean
  commandReached: boolean
}

export async function harnessConnection(baba: string, directory: string): Promise<HarnessConnection> {
  const config = await loadConfig(baba).catch(() => undefined)
  const hooks = ADAPTERS.map((adapter) => {
    let status: Installation = "unreadable"

    try {
      if (config) {
        const { enable, events } = sectionOf(config, adapter)

        status = !enable ? "disabled" : !events.length ? "no-events" : adapter.installed(dirname(baba), events) ? "configured" : "missing"
      }
    } catch {}

    return { name: adapter.name, title: adapter.title, status }
  })

  return {
    hooks,
    startupHeard: existsSync(join(directory, STARTUP_HEARD)),
    recovered: load<{ recovered?: boolean }>(join(directory, PRESENT_READY))?.recovered === true,
    commandReached: existsSync(join(directory, "baba", AGENT_COMMAND)),
  }
}
