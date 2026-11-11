// The build util: an app's brief, agreed with the person before the app is written, and the steps of building it. The
// agent writes the brief and records what the person answers; approving it is the person's, an ask; a change to what was
// approved is approved again. Once approved, the app is made from the template, and the brief is kept in its directory.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export const PARTS = ["agent", "sees", "decides", "needs"] as const
export type Part = (typeof PARTS)[number]
export const STATUSES = ["todo", "doing", "done"] as const
export type Status = (typeof STATUSES)[number]
export type Question = { n: number; text: string; answer?: string }
export type Step = { n: number; text: string; status: Status }
/** What an app is to be. `agent` is the agent's part; `sees` and `decides` the person's, on the page; `needs` what must come from outside. */
export type Brief = {
  name: string
  job: string
  agent: string[]
  sees: string[]
  decides: string[]
  needs: string[]
  questions: Question[]
  steps: Step[]
  approved: boolean
  /** The next number a question or a step takes. */
  next: number
}
/** A brief as the util holds it: `dir` once the app's directory exists, relative to the project. */
export type Entry = Brief & { dir?: string; creating?: boolean }
export type Model = { briefs: Entry[]; loaded: boolean; error?: string }
export type Command = { kind: "load" } | { kind: "save"; dir: string; brief: Brief } | { kind: "create"; brief: Brief }
export type Event =
  | { kind: "loaded"; briefs: Entry[] }
  | { kind: "saved" }
  | { kind: "created"; name: string; dir: string }
  | { kind: "failed"; error: string; name?: string }
export type BuildPorts = {
  project: string
  /** The briefs of the apps in the project, each with its directory. */
  load(): Promise<Entry[]>
  save(dir: string, brief: Brief): Promise<void>
  /** Makes the app in skills/NAME from the template and the framework, named, with its brief, and links it; answers with the directory. */
  create(brief: Brief): Promise<string>
}

const NAME = /^[a-z][a-z0-9-]*$/
const LABEL: Record<Part, string> = {
  agent: "the agent's part",
  sees: "what the person sees on the page",
  decides: "what the person decides on the page",
  needs: "what it needs from outside",
}

export const brief = ({ dir: _dir, creating: _creating, ...b }: Entry): Brief => b
const open = (b: Brief) => b.questions.filter((q) => q.answer === undefined)

/** What remains to be done for a brief now, in the order the work goes. */
export function nextOf(b: Entry): string {
  if (!b.agent.length || !(b.sees.length + b.decides.length))
    return "write the agent's part, what the person sees and what they decide; add what you cannot decide as questions"
  if (open(b).length) return `ask the person the ${open(b).length === 1 ? "open question" : `${open(b).length} open questions`} in chat, and record each answer`
  if (!b.approved) return "give the person the page and wait: approving the brief is theirs"
  if (b.creating) return "the app is being made: wait"
  if (!b.dir) return "create the app"
  if (!b.steps.length) return `open it with \`bun ${b.dir}/scripts/open.ts\` and give the person its page; then list the steps of building it`

  const doing = b.steps.find((s) => s.status === "doing")
  const todo = b.steps.find((s) => s.status === "todo")

  if (doing) return `step ${doing.n} is under way: ${doing.text}; mark it done once the person can see it on the app's page`
  if (todo) return `start step ${todo.n}: ${todo.text}`

  return "every step is done: try the first task in the playground with the person"
}

const state = (b: Entry) => (b.dir ? (b.approved ? "being built" : "changed, to approve again") : b.approved ? "approved" : "draft")

export function buildSurface(ports: BuildPorts) {
  type Result = Update<Model, Command>

  const found = (model: Model, name: string) => model.briefs.find((b) => b.name === name)
  /** A brief changed: the model with it, and the save where the app's directory holds it. */
  const changed = (model: Model, next: Entry): Result => ({
    model: { ...model, error: undefined, briefs: model.briefs.map((b) => (b.name === next.name ? next : b)) },
    commands: next.dir ? [{ kind: "save", dir: next.dir, brief: brief(next) }] : [],
  })
  /** An action on one brief: refused where there is none of that name. */
  const on =
    <A extends { name: string }>(change: (b: Entry, args: A, model: Model) => Entry | Result) =>
    (model: Model, args: A): Result => {
      const b = found(model, args.name)

      if (!b) return { refused: `no brief ${args.name}` }

      const result = change(b, args, model)

      return "name" in result ? changed(model, result) : result
    }
  const text = (value: string): string => value.trim().replace(/\s+/g, " ")
  const start = action({
    name: "start",
    description: "Start the brief of a new app: its name, lowercase kebab-case, and its job in one sentence",
    subject: {},
    inputs: { name: "string", job: "string" },
    update(model: Model, { name, job }): Result {
      if (!NAME.test(name)) return { refused: "An app's name is lowercase kebab-case, such as month-close" }
      if (found(model, name)) return { refused: `${name} has a brief already, at /briefs/${name}` }
      if (!text(job)) return { refused: "A brief starts with the app's job, in one sentence" }

      const b: Entry = { name, job: text(job), agent: [], sees: [], decides: [], needs: [], questions: [], steps: [], approved: false, next: 1 }

      return { model: { ...model, error: undefined, briefs: [...model.briefs, b] } }
    },
  })
  const restate = action({
    name: "restate",
    description: "Say the app's job again, in one sentence",
    subject: { name: "string" },
    inputs: { text: "string" },
    update: on<{ name: string; text: string }>((b, args) =>
      text(args.text) ? { ...b, job: text(args.text), approved: false } : { refused: "The job is one sentence" }
    ),
  })
  const add = action({
    name: "add",
    description: `Add a line to a part: ${PARTS.map((p) => `${p}, ${LABEL[p]}`).join("; ")}`,
    subject: { name: "string" },
    inputs: { part: "string", text: "string" },
    update: on<{ name: string; part: string; text: string }>((b, args) => {
      const part = PARTS.find((p) => p === args.part)

      if (!part) return { refused: `A part is one of: ${PARTS.join(", ")}` }
      if (!text(args.text)) return { refused: "A line needs text" }

      return { ...b, [part]: [...b[part], text(args.text)], approved: false }
    }),
  })
  const remove = action({
    name: "remove",
    description: "Remove a line from a part, by its number there",
    subject: { name: "string" },
    inputs: { part: "string", n: "number" },
    update: on<{ name: string; part: string; n: number }>((b, args) => {
      const part = PARTS.find((p) => p === args.part)

      if (!part) return { refused: `A part is one of: ${PARTS.join(", ")}` }
      if (!b[part][args.n - 1]) return { refused: `${part} has no line ${args.n}` }

      return { ...b, [part]: b[part].filter((_, i) => i !== args.n - 1), approved: false }
    }),
  })
  const ask = action({
    name: "ask",
    description: "Note a question only the person can answer; ask it in chat, then record the answer",
    subject: { name: "string" },
    inputs: { text: "string" },
    update: on<{ name: string; text: string }>((b, args) =>
      text(args.text) ? { ...b, questions: [...b.questions, { n: b.next, text: text(args.text) }], next: b.next + 1 } : { refused: "A question needs text" }
    ),
  })
  const answer = action({
    name: "answer",
    description: "Record what the person answered to a question, in their words",
    subject: { name: "string" },
    inputs: { n: "number", text: "string" },
    update: on<{ name: string; n: number; text: string }>((b, args) => {
      if (!b.questions.some((q) => q.n === args.n)) return { refused: `no question ${args.n}` }
      if (!text(args.text)) return { refused: "An answer needs text" }

      return { ...b, questions: b.questions.map((q) => (q.n === args.n ? { ...q, answer: text(args.text) } : q)) }
    }),
  })
  const step = action({
    name: "step",
    description: "Add a step of building it: one that ends in something the person can see on the app's page",
    subject: { name: "string" },
    inputs: { text: "string" },
    update: on<{ name: string; text: string }>((b, args) =>
      text(args.text) ? { ...b, steps: [...b.steps, { n: b.next, text: text(args.text), status: "todo" }], next: b.next + 1 } : { refused: "A step needs text" }
    ),
  })
  const mark = action({
    name: "mark",
    description: `Say where a step stands: ${STATUSES.join(", ")}`,
    subject: { name: "string" },
    inputs: { n: "number", status: "string" },
    update: on<{ name: string; n: number; status: string }>((b, args) => {
      const status = STATUSES.find((s) => s === args.status)

      if (!status) return { refused: `A step is one of: ${STATUSES.join(", ")}` }
      if (!b.steps.some((s) => s.n === args.n)) return { refused: `no step ${args.n}` }

      return { ...b, steps: b.steps.map((s) => (s.n === args.n ? { ...s, status } : s)) }
    }),
  })
  const approve = action({
    name: "approve",
    description: "Approve the brief: this is the app to build",
    subject: { name: "string" },
    inputs: {},
    ask: true,
    update: on<{ name: string }>((b) => ({ ...b, approved: true })),
  })
  const create = action({
    name: "create",
    description: "Make the app from the template in skills/NAME, and install it in this project by links from the harness's skill folders",
    subject: { name: "string" },
    inputs: {},
    update: on<{ name: string }>((b, _args, model) => ({
      model: { ...model, error: undefined, briefs: model.briefs.map((x) => (x.name === b.name ? { ...b, creating: true } : x)) },
      commands: [{ kind: "create", brief: brief(b) }],
    })),
  })
  const discard = action({
    name: "discard",
    description: "Drop this brief; nothing was made from it",
    subject: { name: "string" },
    inputs: {},
    update: on<{ name: string }>((b, _args, model) => ({ model: { ...model, briefs: model.briefs.filter((x) => x.name !== b.name) } })),
  })
  const listed = (b: Entry) => ({
    at: `/briefs/${b.name}`,
    name: b.name,
    job: b.job,
    state: state(b),
    ...(open(b).length && { unanswered: open(b).length }),
    ...(b.steps.length && { steps: `${b.steps.filter((s) => s.status === "done").length}/${b.steps.length}` }),
    next: nextOf(b),
  })
  const ready = (b: Entry) => b.agent.length > 0 && b.sees.length + b.decides.length > 0 && !open(b).length
  const pages = view([start, restate, add, remove, ask, answer, step, mark, approve, create, discard], {
    "/": (model) => ({
      title: "Build",
      project: ports.project,
      ...(model.error && { error: model.error }),
      ...(!model.loaded && { reading: true }),
      ...(model.loaded && !model.briefs.length && { next: "write the brief of the app the person asked for, before any code: start" }),
      briefs: model.briefs.map(listed),
      ...(model.loaded && { start: start.bind({}) }),
    }),
    "/briefs/:name": (model, { name }) => {
      const b = found(model, name ?? "")

      if (!b) return undefined

      const subject = { name: b.name }

      return {
        ...listed(b),
        agent: b.agent,
        sees: b.sees,
        decides: b.decides,
        needs: b.needs,
        questions: b.questions.map((q) => ({ n: q.n, text: q.text, ...(q.answer !== undefined && { answer: q.answer }) })),
        steps: b.steps,
        approved: b.approved,
        ...(b.dir && { dir: b.dir }),
        ...(model.error && { error: model.error }),
        restate: restate.bind(subject),
        add: add.bind(subject),
        ...(PARTS.some((p) => b[p].length) && { remove: remove.bind(subject) }),
        ask: ask.bind(subject),
        ...(b.questions.length && { answer: answer.bind(subject) }),
        step: step.bind(subject),
        ...(b.steps.length && { mark: mark.bind(subject) }),
        ...(!b.approved && ready(b) && { approve: approve.bind(subject) }),
        ...(b.approved && !b.dir && !b.creating && { create: create.bind(subject) }),
        ...(!b.dir && !b.creating && { discard: discard.bind(subject) }),
      }
    },
  })

  return surface<Model, Event, Command>({
    description: "An app's brief, agreed with the person before it is written, and the steps of building it",
    init: () => ({ briefs: [], loaded: false }),
    // What is not yet an app is kept by the session; what is, is read from its directory again.
    restore: (saved) => {
      const kept = (saved ?? {}) as Partial<Model>

      return { briefs: (kept.briefs ?? []).filter((b) => !b.dir).map((b) => ({ ...b, creating: undefined })), loaded: false }
    },
    start: () => [{ kind: "load" }],
    update(model, message): Result {
      if (message.kind === "call") return pages.update(model, message)
      if (message.kind === "loaded") {
        const made = new Set(message.briefs.map((b) => b.name))

        return { model: { ...model, loaded: true, briefs: [...message.briefs, ...model.briefs.filter((b) => !b.dir && !made.has(b.name))] } }
      }
      if (message.kind === "created")
        return { model: { ...model, briefs: model.briefs.map((b) => (b.name === message.name ? { ...b, creating: undefined, dir: message.dir } : b)) } }
      if (message.kind === "failed") {
        const briefs = model.briefs.map((b) => (b.name === message.name ? { ...b, creating: undefined } : b))

        return { model: { ...model, loaded: true, error: message.error, briefs } }
      }

      return { model }
    },
    view: pages.view,
    async run(command, send) {
      if (command.kind === "load") return send({ kind: "loaded", briefs: await ports.load() })
      if (command.kind === "save") {
        await ports.save(command.dir, command.brief)

        return send({ kind: "saved" })
      }

      send({ kind: "created", name: command.brief.name, dir: await ports.create(command.brief) })
    },
    failed: (command, error) => ({ kind: "failed", error, ...(command.kind === "create" && { name: command.brief.name }) }),
  })
}
