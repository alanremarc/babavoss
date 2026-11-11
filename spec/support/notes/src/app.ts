// The notes fixture: notes the agent keeps for the person, with reminders. The core: harness-free, a surface over one model,
// with a page the person sees it through.
import { setTimeout as sleep } from "node:timers/promises"
import { action, defineApp, surface, view, type Update } from "babavoss/core/index.ts"
import { shellUi } from "babavoss/shell/index.ts"

type Note = { text: string; due?: "pending" | "due" }
type Model = { items: Note[] }
type Command = { kind: "remind"; n: number; seconds: number }
type Event = { kind: "due"; n: number } | { kind: "failed"; n: number; error: string }

const add = action({
  name: "add",
  description: "Keep a note",
  subject: {},
  inputs: { text: "string" },
  update: (m: Model, { text }): Update<Model, Command> => (text.trim() ? { model: { items: [...m.items, { text }] } } : { refused: "A note needs text" }),
})
const remove = action({
  name: "remove",
  description: ({ n }) => `Forget note ${n}`,
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }): Update<Model, Command> =>
    n >= 1 && n <= m.items.length ? { model: { items: m.items.filter((_, i) => i !== n - 1) } } : { refused: `No note ${n}` },
})
const remind = action({
  name: "remind",
  description: ({ n }) => `Mark note ${n} due after a delay`,
  subject: { n: "number" },
  inputs: { seconds: "number" },
  update: (m: Model, { n, seconds }): Update<Model, Command> =>
    seconds > 0
      ? { model: { items: m.items.map((note, i) => (i === n - 1 ? { ...note, due: "pending" } : note)) }, commands: [{ kind: "remind", n, seconds }] }
      : { refused: "seconds must be positive" },
})
const clear = action({
  name: "clear",
  description: "Forget every note",
  subject: {},
  inputs: {},
  update: (): Update<Model, Command> => ({ model: { items: [] } }),
})
const note = (x: Note, n: number) => ({
  at: `/notes/${n}`,
  n,
  text: x.text,
  ...(x.due && { due: x.due }),
  remove: remove.bind({ n }),
  ...(!x.due && { remind: remind.bind({ n }) }),
})
const pages = view([add, remove, clear, remind], {
  // The summary names where the notes are listed, so an agent shown only / can read on to each note's handles.
  "/": (m) => ({
    notes: { count: m.items.length, at: "/notes" },
    latest: m.items.at(-1)?.text ?? null,
    due: m.items.filter((x) => x.due === "due").length,
    add: add.bind({}),
    ...(m.items.length > 0 && { clear: clear.bind({}) }),
  }),
  "/notes": (m) => ({ notes: m.items.map((x, i) => note(x, i + 1)) }),
  "/notes/:n": (m, { n }) => {
    const found = m.items[Number(n) - 1]

    return found === undefined ? undefined : note(found, Number(n))
  },
})

export default defineApp({
  name: "demo",
  // The page: the notes as the person sees them, served from ui/ by the shell's hosting; the surface is the same.
  ui: shellUi(new URL("../ui/", import.meta.url)),
  surface: surface<Model, Event, Command>({
    description: "Notes the agent keeps for the person",
    init: () => ({ items: [] }),
    update: (m, message) =>
      message.kind === "call"
        ? pages.update(m, message)
        : { model: { items: m.items.map((x, i) => (i === message.n - 1 ? { ...x, due: message.kind === "due" ? "due" : undefined } : x)) } },
    view: pages.view,
    async run(command, send, signal) {
      await sleep(command.seconds * 1000, undefined, { signal })
      send({ kind: "due", n: command.n })
    },
    failed: (command, error) => ({ kind: "failed", n: command.n, error }),
  }),
})
