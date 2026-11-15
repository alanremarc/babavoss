// What the shell's page shows first, so the door gives it with the html (the door's boot island): the shell at /, its
// tabs, who is needed and where the agent pointed; the notices, for the bell and the tabs they dot; and, where the page
// is a tab's, that tab's view at its / and at its route. The other tabs are read once they are shown.
import { NOTICES } from "./activity.ts"
import { addressed } from "./surface.ts"

/** The paths whose views the page at `path` needs in its first frame: a tab's by the address the path names it by. */
export function bootPaths(path: string): string[] {
  const tab = addressed(path)
  const address = tab && ("n" in tab ? `/tabs/${tab.n}` : `/${tab.name}`)

  return ["/", NOTICES, ...(address ? [address, ...(tab.path === "/" ? [] : [address + tab.path])] : [])]
}
