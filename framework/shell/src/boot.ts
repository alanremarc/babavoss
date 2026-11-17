// What the shell's page shows first, so the door gives it with the html (the door's boot island): the shell at /, its
// tabs and where the agent brought the person; the highlights, for the tabs they mark; and, where the page
// is a tab's, that tab's view at its / and at its route. The other tabs are read once they are shown.
import { HIGHLIGHTS } from "./activity.ts"
import { addressed } from "./surface.ts"

/** The paths whose views the page at `path` needs in its first frame: a tab's by the address the path names it by. */
export function bootPaths(path: string): string[] {
  const tab = addressed(path)
  const address = tab && ("n" in tab ? `/tabs/${tab.n}` : `/${tab.name}`)

  return ["/", HIGHLIGHTS, ...(address ? [address, ...(tab.path === "/" ? [] : [address + tab.path])] : [])]
}
