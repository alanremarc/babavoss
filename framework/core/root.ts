// A root is a definition: its identity, where its state lives, its surface, and the ui that shows it.
// Every root has all of them; whatever works with a root assumes both a surface and a ui, so a definition without them fails here.
import type { Ui } from "./runtime/door.ts"
import type { Ports } from "./surface/run.ts"
import type { AnySurface } from "./surface/surface.ts"

export type RootDefinition = {
  name: string
  surface: AnySurface
  /** The page: a directory with index.html and assets served under /_/, or a hosting that serves them. */
  ui: Ui
  /** The paths whose views the page at a path needs first: given with its html, read as the person (door.ts). */
  boot?: (path: string) => string[]
  /** How the surface's model is kept in the root's state directory: one file, model.json, where it says nothing (state.ts). */
  keep?: (dir: string) => Pick<Ports<unknown>, "load" | "save">
  /** What the root does once its runtime serves, given its state directory: the shell sweeps its project's archive. */
  started?: (dir: string) => void
}

export const defineRoot = (definition: RootDefinition): RootDefinition => {
  const missing = (["surface", "ui"] as const).filter((part) => !definition[part])

  if (missing.length) throw new Error(`root ${definition.name || "(unnamed)"} has no ${missing.join(" and no ")}: every root has a surface and a ui`)

  return definition
}
