// The root's own util, the picker: the surfaces in a .baba/, each with what it says it is for. A surface is made and
// changed in code, by the agent; here they are seen, and the root offers to open each as a tab.
import { surface, view } from "../../core/index.ts"

type Listed = { name: string; description: string }
type Event = { kind: "none" }

/** `baba` is the .baba/ directory, undefined where the session's directory has none; `surfaces` are the ones the root holds. */
export function picker(baba: string | undefined, surfaces: Listed[]) {
  const pages = view([], {
    "/": () => ({
      title: "Surfaces",
      ...(baba ? { baba } : { missing: "there is no .baba/ in this directory or above: make one with `baba init`" }),
      surfaces,
    }),
  })

  return surface<null, Event, never>({
    description: "The surfaces in this .baba/",
    init: () => null,
    update: (model) => ({ model }),
    view: pages.view,
    run: async () => {},
    failed: () => ({ kind: "none" }),
  })
}
