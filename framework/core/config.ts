// The configuration of a .baba/, .baba/baba.config.ts, optional: which harnesses are made aware of its surfaces, and how.
// A section per harness, by its adapter's name, starting with `enable`; the rest is the adapter's options. Where there is
// no file, or no section, a harness is enabled with its adapter's defaults. Provisioning reads it, and withdraws a harness
// not enabled; the hook reads it too as it runs, so `events` changes what is told with nothing provisioned.
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { ClaudeOptions } from "./harness/claude.ts"
import type { CodexOptions } from "./harness/codex.ts"
import type { Adapter } from "./harness/harness.ts"

export type Section<O> = { enable: boolean } & Partial<O>
export type Config = { harnesses?: { claude?: Section<ClaudeOptions>; codex?: Section<CodexOptions> } }

/** Types a configuration, which is what it answers: `export default config({ … })`. */
export const config = (value: Config): Config => value

export const CONFIG_FILE = "baba.config.ts"

/** The configuration of `baba`: none where there is no file; one that does not load, or does not default-export an object, throws. */
export async function loadConfig(baba: string): Promise<Config> {
  const file = join(baba, CONFIG_FILE)

  if (!existsSync(file)) return {}

  let value: unknown

  try {
    value = ((await import(file)) as { default?: unknown }).default
  } catch (error) {
    throw new Error(`.baba/${CONFIG_FILE} does not load: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`.baba/${CONFIG_FILE} does not default-export config({ … })`)

  return value as Config
}

/**
 * A harness's section of `config`, its options filled in from the adapter's defaults; throws where it names an option the
 * adapter has not, an event the harness has not, or gives an option of the wrong kind.
 */
export function sectionOf<O extends { events: string[] }>(config: Config, adapter: Adapter<O>): { enable: boolean } & O {
  const section = ((config.harnesses ?? {}) as Record<string, Record<string, unknown> | undefined>)[adapter.name] ?? { enable: true }
  const wrong = (what: string): never => {
    throw new Error(`.baba/${CONFIG_FILE}: harnesses.${adapter.name}${what}`)
  }

  if (typeof section.enable !== "boolean") wrong(".enable is true or false")
  for (const [key, value] of Object.entries(section)) {
    if (key === "enable") continue

    const like = (adapter.defaults as Record<string, unknown>)[key]

    if (like === undefined) wrong(` has no option ${key}; it has enable, ${Object.keys(adapter.defaults).join(", ")}`)
    if (Array.isArray(like) !== Array.isArray(value) || typeof like !== typeof value) wrong(`.${key} is ${Array.isArray(like) ? "a list" : typeof like}`)
  }
  for (const event of (section.events ?? []) as unknown[])
    if (typeof event !== "string" || !adapter.events.includes(event)) wrong(`.events has ${JSON.stringify(event)}; ${adapter.name}'s are ${adapter.events.join(", ")}`)

  return { ...adapter.defaults, ...section } as { enable: boolean } & O
}

/** Checks every section of `config` against the adapters there are: a harness none of them is, is an error. */
export function checkConfig(config: Config, adapters: readonly Adapter[]) {
  for (const name of Object.keys(config.harnesses ?? {}))
    if (!adapters.some((adapter) => adapter.name === name)) throw new Error(`.baba/${CONFIG_FILE}: there is no harness ${name}; there are ${adapters.map((a) => a.name).join(", ")}`)
  for (const adapter of adapters) sectionOf(config, adapter)
}
