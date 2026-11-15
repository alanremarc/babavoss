// The root's util: the roles in a .baba/, read from its directory. A role is made and changed in code, by the agent
// through the skill baba; here they are only seen.
import { action, surface, view, type Update } from "../../core/index.ts"
import { describedRoles } from "../../core/provision.ts"

/** A role as the list names it: what it does and when to use it. Its know-how is told by its tab. */
type Listed = { name: string; description: string }
export type Model = { roles: Listed[]; error?: string }
type Command = { kind: "read" }
type Event = { kind: "read"; roles: Listed[] } | { kind: "failed"; error: string }

/** `baba` is the .baba/ directory; undefined where the session's directory has none. */
export function rolesSurface(baba: string | undefined) {
  const read = action({
    name: "read",
    description: "Read the roles from .baba/ again, after one was made, changed or removed",
    subject: {},
    inputs: {},
    update: (model: Model): Update<Model, Command> => ({ model, commands: [{ kind: "read" }] }),
  })
  const pages = view([read], {
    "/": (model) => ({
      title: "Roles",
      ...(baba ? { baba } : { missing: "there is no .baba/ in this directory or above: make one with `baba init`" }),
      ...(model.error && { error: model.error }),
      roles: model.roles,
      ...(baba && { read: read.bind({}) }),
    }),
  })

  return surface<Model, Event, Command>({
    description: "The roles in this .baba/",
    init: () => ({ roles: [] }),
    // The roles are read from the directory again.
    restore: () => ({ roles: [] }),
    start: () => (baba ? [{ kind: "read" }] : []),
    update: (model, message): Update<Model, Command> =>
      message.kind === "call" ? pages.update(model, message) : message.kind === "read" ? { model: { roles: message.roles } } : { model: { ...model, error: message.error } },
    view: pages.view,
    run: async (_command, send) => send({ kind: "read", roles: describedRoles(baba!).map(({ name, description }) => ({ name, description })) }),
    failed: (_command, error) => ({ kind: "failed", error }),
  })
}
