// The eval's reference books surface, as a fresh project's agent might have made it from the template: books added by
// title, each with a status, listed by status. The task that changes a surface starts from it.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

const STATUSES = ["to-read", "reading", "read"] as const

type Status = (typeof STATUSES)[number]
type Book = { id: number; title: string; status: Status }
export type Model = { books: Book[]; next: number }
type Event = { kind: "none" }

const row = (b: Book) => ({ at: `/books/${b.id}`, id: b.id, title: b.title, status: b.status })

const add = action({
  name: "add",
  description: "to read",
  subject: {},
  inputs: { title: { type: "string", kind: "line" } },
  update: (m: Model, { title }): Update<Model, never> => {
    const t = title.trim()

    if (!t) return { refused: "A book needs a title" }

    return { model: { books: [...m.books, { id: m.next, title: t, status: "to-read" }], next: m.next + 1 }, notices: [{ text: `"${t}" added`, at: `/books/${m.next}` }] }
  },
})
const mark = action({
  name: "mark",
  description: "",
  subject: { id: "number" },
  inputs: { status: { type: "string", choices: [...STATUSES] } },
  update: (m: Model, { id, status }): Update<Model, never> => ({ model: { ...m, books: m.books.map((b) => (b.id === id ? { ...b, status } : b)) } }),
})
const remove = action({
  name: "remove",
  description: "",
  subject: { id: "number" },
  inputs: {},
  update: (m: Model, { id }): Update<Model, never> => ({ model: { ...m, books: m.books.filter((b) => b.id !== id) } }),
})

const pages = view([add, mark, remove], {
  "/": (m) => ({
    title: "Books",
    how: "Each book has one status: to-read, reading or read. A book added is to-read.",
    ...Object.fromEntries(STATUSES.map((s) => [s, m.books.filter((b) => b.status === s).map(row)])),
    add: add.bind({}),
  }),
  "/books/:id": (m, { id }) => {
    const b = m.books.find((x) => x.id === Number(id))

    return b && { ...row(b), mark: mark.bind({ id: b.id }), remove: remove.bind({ id: b.id }) }
  },
})

export default surface<Model, Event, never>({
  description: "The books the person reads, by status. Use when a book is added, its status set, or the list read.",
  init: () => ({ books: [], next: 1 }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
