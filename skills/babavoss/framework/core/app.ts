// An app is a definition: its identity, where its state lives, its surface, and the ui that shows it.
// Every app has all of them; whatever works with an app assumes both a surface and a ui, so a definition without them fails here.
import type { Ui } from "./runtime/door.ts"
import type { AnySurface } from "./surface/surface.ts"

export type AppDefinition = {
  name: string
  surface: AnySurface
  /** The page: a directory with index.html and assets served under /_/, or a hosting that serves them. */
  ui: Ui
}

export const defineApp = (definition: AppDefinition): AppDefinition => {
  const missing = (["surface", "ui"] as const).filter((part) => !definition[part])

  if (missing.length) throw new Error(`app ${definition.name || "(unnamed)"} has no ${missing.join(" and no ")}: every app has a surface and a ui`)

  return definition
}
