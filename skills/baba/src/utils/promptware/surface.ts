// App promptware, selected from the project; open is computed afresh on selection and refresh.
import { action, surface, view, type Update } from "babavoss/core/index.ts"
import type { FoundApp } from "../playground/apps.ts"
import { size, type Promptware } from "./promptware.ts"
import type { OpenResult } from "./open.ts"
export type Entry = FoundApp & { promptware: Promptware }
export type Model = { apps?: Entry[]; app?: string; gen: number; answer?: { status: "running" } | OpenResult }
export type Command = { kind: "discover"; gen: number } | { kind: "open"; gen: number; dir: string }
export type Event =
  | { kind: "discovered"; gen: number; apps: Entry[] }
  | { kind: "opened"; gen: number; result: OpenResult }
  | { kind: "failed"; gen: number; error: string }
export type PromptwarePorts = { project: string; discover(): Promise<Entry[]>; open(dir: string, signal: AbortSignal): Promise<OpenResult> }

const choose = (model: Model, p: Entry, gen = model.gen + 1): Update<Model, Command> => ({
  model: { ...model, app: p.id, gen, answer: { status: "running" } },
  commands: [{ kind: "open", gen, dir: p.path }],
})

export function promptwareSurface(ports: PromptwarePorts) {
  const found = (model: Model) => model.apps ?? []
  const chosen = (model: Model) => found(model).find((p) => p.id === model.app)
  const select = action({
    name: "select",
    description: "Inspect the app's promptware",
    subject: { app: "string" },
    inputs: {},
    update(model: Model, { app }): Update<Model, Command> {
      const p = found(model).find((p) => p.id === app)

      return p ? choose(model, p) : { refused: "App not found" }
    },
  })
  const back = action({
    name: "back",
    description: "Return to apps",
    subject: {},
    inputs: {},
    update: (model: Model): Update<Model, Command> => ({
      model: { ...model, app: undefined, answer: undefined, gen: model.gen + 1 },
      commands: [{ kind: "discover", gen: model.gen + 1 }],
    }),
  })
  const refresh = action({
    name: "refresh",
    description: "Read files and compute open again",
    subject: {},
    inputs: {},
    update: (model: Model): Update<Model, Command> => ({
      model: { ...model, gen: model.gen + 1, answer: { status: "running" } },
      commands: [{ kind: "discover", gen: model.gen + 1 }],
    }),
  })
  const listed = (p: Entry) => ({
    id: p.id,
    name: p.name,
    dir: p.dir,
    ...(p.version && { version: p.version }),
    ...(p.description && { description: p.description }),
    at: `/apps/${p.id}`,
    select: select.bind({ app: p.id }),
  })
  const textView = (at: string, text: string) => ({ at, text, ...size(text) })
  /** A text as / lists it: where it is and how large. / stays small: it is in every answer that says what changed here. */
  const sized = (at: string, text: string) => ({ at, ...size(text) })
  const answer = (model: Model) => ({ at: "/open", ...model.answer, ...("text" in (model.answer ?? {}) ? size((model.answer as OpenResult).text) : {}) })
  const answered = (model: Model) => {
    const { text: _text, output: _output, command: _command, ...rest } = answer(model) as ReturnType<typeof answer> & Partial<OpenResult>

    return rest
  }
  const pages = view([select, back, refresh], {
    "/": (model) => {
      const p = chosen(model)

      return {
        title: "Promptware",
        project: ports.project,
        apps: found(model).map(listed),
        app: p ? listed(p) : null,
        refresh: refresh.bind({}),
        ...(p && {
          ...(found(model).length > 1 && { back: back.bind({}) }),
          description: sized("/description", p.promptware.skill.description),
          skill: { ...sized("/skill", p.promptware.skill.text), file: p.promptware.skill.file },
          references: p.promptware.references.map((r) => ({ at: `/references/${encodeURIComponent(r.name)}`, name: r.name, file: r.file, ...size(r.text) })),
          answer: answered(model),
        }),
      }
    },
    "/apps/:id": (model, { id }) => {
      const p = found(model).find((p) => p.id === id)

      return p && listed(p)
    },
    "/description": (model) => {
      const p = chosen(model)

      return p && textView("/description", p.promptware.skill.description)
    },
    "/skill": (model) => {
      const p = chosen(model)

      return p && { ...textView("/skill", p.promptware.skill.text), file: p.promptware.skill.file }
    },
    "/references/:name": (model, { name }) => {
      const r = chosen(model)?.promptware.references.find((r) => r.name === (name ?? ""))

      return r && { ...textView(`/references/${encodeURIComponent(r.name)}`, r.text), name: r.name, file: r.file }
    },
    "/open": (model) => chosen(model) && answer(model),
  })
  const live = new Map<AbortController, number>()

  return surface<Model, Event, Command>({
    description: "An app's skill and references as the agent reads them, and what open answers with, each with its size",
    init: () => ({ gen: 0 }),
    restore: (saved) => {
      const kept = (saved ?? {}) as Partial<Model>

      return { app: kept.app, gen: (kept.gen ?? 0) + 1 }
    },
    start: (model) => [{ kind: "discover", gen: model.gen }],
    update(model, message): Update<Model, Command> {
      if (message.kind === "call") return pages.update(model, message)
      if (message.gen !== model.gen) return { model }
      if (message.kind === "discovered") {
        const next = { ...model, apps: message.apps }
        const p = message.apps.find((p) => p.id === model.app) ?? (message.apps.length === 1 ? message.apps[0] : undefined)

        return p ? choose(next, p, model.gen) : { model: { ...next, app: undefined, answer: undefined } }
      }

      return {
        model: {
          ...model,
          answer: message.kind === "opened" ? message.result : { status: "failed", text: "", output: "", command: "", tookMs: 0, error: message.error },
        },
      }
    },
    view: pages.view,
    async run(command, send, signal) {
      for (const [ctrl, gen] of live) if (gen < command.gen) ctrl.abort()
      if (command.kind === "discover") return send({ kind: "discovered", gen: command.gen, apps: await ports.discover() })

      const ctrl = new AbortController()
      const stop = () => ctrl.abort()

      signal.addEventListener("abort", stop, { once: true })
      if (signal.aborted) ctrl.abort()
      live.set(ctrl, command.gen)
      try {
        send({ kind: "opened", gen: command.gen, result: await ports.open(command.dir, ctrl.signal) })
      } finally {
        live.delete(ctrl)
        signal.removeEventListener("abort", stop)
      }
    },
    failed: (command, error) => ({ kind: "failed", gen: command.gen, error }),
  })
}
