// The build util: the apps made in the project, and making a new one from the template.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

/** An app made in the project: `dir` is its directory, relative to the project. */
export type Made = { name: string; dir: string; description?: string }
export type Model = { apps: Made[]; loaded: boolean; making?: string; error?: string }
export type Command = { kind: "load" } | { kind: "create"; name: string }
export type Event = { kind: "loaded"; apps: Made[] } | { kind: "failed"; error: string }
export type BuildPorts = {
  project: string
  /** The apps in the project's skills/. */
  load(): Promise<Made[]>
  /** Makes the app in skills/NAME from the template, named, and links it; answers with the directory. */
  create(name: string): Promise<string>
}

const NAME = /^[a-z][a-z0-9-]*$/

export function buildSurface(ports: BuildPorts) {
  type Result = Update<Model, Command>

  const create = action({
    name: "create",
    description: "Make an app from the template in skills/NAME, lowercase kebab-case, and install it in this project by links from the harness's skill folders",
    subject: {},
    inputs: { name: "string" },
    update(model: Model, { name }): Result {
      if (!NAME.test(name)) return { refused: "An app's name is lowercase kebab-case, such as month-close" }
      if (model.apps.some((app) => app.name === name)) return { refused: `${name} is made already` }

      return { model: { ...model, error: undefined, making: name }, commands: [{ kind: "create", name }] }
    },
  })
  const pages = view([create], {
    "/": (model) => ({
      title: "Build",
      project: ports.project,
      ...(model.error && { error: model.error }),
      ...(!model.loaded && { reading: true }),
      ...(model.making && { making: model.making }),
      apps: model.apps.map((app) => ({ ...app, open: `bun ${app.dir}/scripts/open.ts` })),
      ...(model.loaded && !model.making && { create: create.bind({}) }),
    }),
  })

  return surface<Model, Event, Command>({
    description: "The apps made in the project, and making a new one from the template",
    init: () => ({ apps: [], loaded: false }),
    // The apps are read from the project again.
    restore: () => ({ apps: [], loaded: false }),
    start: () => [{ kind: "load" }],
    update(model, message): Result {
      if (message.kind === "call") return pages.update(model, message)
      if (message.kind === "loaded") return { model: { ...model, loaded: true, making: undefined, apps: message.apps } }

      return { model: { ...model, loaded: true, making: undefined, error: message.error } }
    },
    view: pages.view,
    async run(command, send) {
      if (command.kind === "create") await ports.create(command.name)
      send({ kind: "loaded", apps: await ports.load() })
    },
    failed: (_command, error) => ({ kind: "failed", error }),
  })
}
