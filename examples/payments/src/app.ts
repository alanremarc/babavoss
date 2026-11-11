// Match monthly payments to invoices, keeping uncertain decisions with the person and durable data in payments.json.
import { readFile, writeFile, rename } from "node:fs/promises"
import { resolve } from "node:path"
import { action, defineApp, surface, view, type Update, type View } from "babavoss/core/index.ts"
import { shellUi } from "babavoss/shell/index.ts"

type Payment = {
  id: string
  date: string
  payer: string
  amount: number
  reference: string
  status: "unmatched" | "unsure" | "matched" | "left"
  guess?: string
  invoice?: string
  corrected?: boolean
}
type Invoice = { number: string; customer: string; amount: number }
type Month = { name: string; payments: Payment[]; invoices: Invoice[] }
type Data = { months: Month[]; rules: string[] }
// `busy`: the data is not all here yet, a load or an import is running. `saving` and `unsaved` are the write behind a change.
type Model = Data & { busy: boolean; saving: boolean; unsaved: boolean; error: string | null }
type Command = { kind: "load" } | { kind: "import"; month: string; payments: string; invoices: string } | { kind: "save"; data: Data }
type Event = { kind: "loaded"; data: Data } | { kind: "imported"; month: Month } | { kind: "saved" } | { kind: "failed"; error: string }

const empty = (): Data => ({ months: [], rules: [] })
const at = (month: string) => `/months/${encodeURIComponent(month)}`
const paymentAt = (month: string, id: string) => `${at(month)}/payments/${encodeURIComponent(id)}`
const counts = (m: Month) => ({
  payments: m.payments.length,
  matched: m.payments.filter((p) => p.status === "matched").length,
  unsure: m.payments.filter((p) => p.status === "unsure").length,
  unmatched: m.payments.filter((p) => p.status === "unmatched" || p.status === "left").length,
})
// A change is written behind it, one write at a time: a change made during a write is written when that write lands, so
// nobody waits on the file to act and no two writes cross.
const save = (m: Model): Update<Model, Command> =>
  m.saving ? { model: { ...m, unsaved: true } } : { model: { ...m, saving: true, unsaved: false }, commands: [{ kind: "save", data: { months: m.months, rules: m.rules } }] }
const imported = action({
  name: "import",
  description: "Import a month from two CSV files; busy is true until it has finished, so wait for that",
  subject: {},
  inputs: { month: "string", payments: "string", invoices: "string" },
  update: (m: Model, args): Update<Model, Command> => {
    if (!args.month.trim()) return { refused: "Give the month a name." }
    if (m.months.some((x) => x.name === args.month)) return { refused: "That month is already imported; read its month path." }

    return { model: { ...m, busy: true, error: null }, commands: [{ kind: "import", ...args }] }
  },
})
const certain = action({
  name: "match-certain",
  description: "Match exact amounts and invoice references",
  subject: { month: "string" },
  inputs: {},
  update: (m: Model, { month }): Update<Model, Command> => {
    const next = structuredClone(m)
    const found = next.months.find((x) => x.name === month)!

    for (const p of found.payments.filter((p) => p.status === "unmatched" || p.status === "unsure")) {
      const candidates = found.invoices.filter(
        (i) => i.amount === p.amount && p.reference.trim() === i.number && !found.payments.some((p) => p.invoice === i.number)
      )

      if (candidates.length === 1) {
        p.status = "matched"
        p.invoice = candidates[0]!.number
        delete p.guess
      } else p.status = "unsure"
    }

    return save(next)
  },
})

function decide(m: Model, month: string, id: string, kind: string, number?: string): Update<Model, Command> {
  const next = structuredClone(m)
  const found = next.months.find((x) => x.name === month)!
  const p = found.payments.find((p) => p.id === id)!

  if (p.status !== "unsure") return { refused: "This payment is not unsure; read the month's unsure path." }
  if (kind === "confirm") number = p.guess
  if (kind !== "leave") {
    if (!found.invoices.some((i) => i.number === number)) return { refused: "That invoice does not exist; choose a number from this month's invoices." }
    if (found.payments.some((p) => p.invoice === number)) return { refused: "That invoice is already matched; choose an open invoice." }
  }
  if (kind === "guess") p.guess = number
  else {
    p.corrected = kind === "choose" && !!p.guess && p.guess !== number
    p.status = kind === "leave" ? "left" : "matched"
    if (number) p.invoice = number
  }

  return save(next)
}

const guess = action({
  name: "guess",
  description: "Propose one of the open invoices for this payment, without matching it",
  subject: { month: "string", id: "string" },
  inputs: { invoice: "string" },
  update: (m: Model, a) => decide(m, a.month, a.id, "guess", a.invoice),
})
const choose = action({
  name: "choose",
  description: "Choose the invoice for this payment",
  subject: { month: "string", id: "string" },
  inputs: { invoice: "string" },
  update: (m: Model, a) => decide(m, a.month, a.id, "choose", a.invoice),
})
const confirm = action({
  name: "confirm",
  description: "Accept the proposed invoice",
  subject: { month: "string", id: "string" },
  inputs: {},
  update: (m: Model, a) => decide(m, a.month, a.id, "confirm"),
})
const leave = action({
  name: "leave",
  description: "Settle this payment without an invoice",
  subject: { month: "string", id: "string" },
  inputs: {},
  update: (m: Model, a) => decide(m, a.month, a.id, "leave"),
})
const add = action({
  name: "add",
  description: "Record a rule in one sentence",
  subject: {},
  inputs: { text: "string" },
  update: (m: Model, { text }): Update<Model, Command> =>
    text.trim() ? save({ ...m, rules: [...m.rules, text.trim()] }) : { refused: "A rule needs text; write one sentence." },
})
const remove = action({
  name: "remove",
  description: "Remove this rule",
  subject: { n: "number" },
  inputs: {},
  update: (m: Model, { n }) => save({ ...m, rules: m.rules.filter((_, i) => i !== n) }),
})
const payment = (m: Month, p: Payment): View => ({
  ...p,
  amount: (p.amount / 100).toFixed(2),
  at: paymentAt(m.name, p.id),
  ...(p.status === "unsure" && {
    guessInvoice: guess.bind({ month: m.name, id: p.id }),
    choose: choose.bind({ month: m.name, id: p.id }),
    leave: leave.bind({ month: m.name, id: p.id }),
    ...(p.guess && { confirm: confirm.bind({ month: m.name, id: p.id }) }),
  }),
})
const pages = view([imported, certain, guess, choose, confirm, leave, add, remove], {
  "/": (m: Model) => ({
    busy: m.busy,
    error: m.error,
    months: m.months.map((x) => ({ name: x.name, ...counts(x), at: at(x.name), unsureAt: `${at(x.name)}/unsure` })),
    unsure: m.months.reduce((n, x) => n + counts(x).unsure, 0),
    corrected: {
      count: m.months.flatMap((x) => x.payments).filter((p) => p.corrected).length,
      payments: m.months.flatMap((x) => x.payments.filter((p) => p.corrected).map((p) => paymentAt(x.name, p.id))),
    },
    rules: { count: m.rules.length, at: "/rules" },
    import: imported.bind({}),
  }),
  "/months/:month": (m, { month }) => {
    const x = m.months.find((x) => x.name === month)

    return (
      x && {
        name: x.name,
        ...counts(x),
        unsureAt: `${at(x.name)}/unsure`,
        invoices: x.invoices.map((i) => ({ ...i, amount: (i.amount / 100).toFixed(2), matched: x.payments.some((p) => p.invoice === i.number) })),
        matchCertain: certain.bind({ month: x.name }),
      }
    )
  },
  "/months/:month/unsure": (m, { month }) => {
    const x = m.months.find((x) => x.name === month)

    // The invoices a guess or a choice may name are listed where the unsure payments are, so nobody finds out by a refusal.
    return (
      x && {
        payments: x.payments.filter((p) => p.status === "unsure").map((p) => payment(x, p)),
        openInvoices: x.invoices
          .filter((i) => !x.payments.some((p) => p.invoice === i.number))
          .map((i) => ({ number: i.number, customer: i.customer, amount: (i.amount / 100).toFixed(2) })),
      }
    )
  },
  "/months/:month/payments/:id": (m, { month, id }) => {
    const x = m.months.find((x) => x.name === month)
    const p = x?.payments.find((p) => p.id === id)

    return x && p && payment(x, p)
  },
  "/rules": (m) => ({ rules: m.rules.map((text, n) => ({ text, at: `/rules/${n}` })), add: add.bind({}) }),
  "/rules/:n": (m, { n }) => (m.rules[Number(n)] === undefined ? undefined : { text: m.rules[Number(n)], remove: remove.bind({ n: Number(n) }) }),
})

// CSV quoting, escaped quotes and embedded newlines are accepted; all amounts must already be integer cents.
function csv(text: string, headers: string[]) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = !quoted
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""))
      cell = ""
      if (c === "\n") {
        rows.push(row)
        row = []
      }
    } else cell += c
  }
  if (quoted) throw new Error("Unclosed CSV quote")
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""))
    rows.push(row)
  }
  if (JSON.stringify(rows.shift()) !== JSON.stringify(headers)) throw new Error(`CSV headers must be ${headers.join(",")}`)

  const seen = new Set<string>()

  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (r.length !== headers.length || !r[0] || seen.has(r[0])) throw new Error("CSV rows need unique identifiers and all columns")
      seen.add(r[0])

      const data = Object.fromEntries(headers.map((h, i) => [h, r[i]!]))

      if (!/^-?\d+$/.test(data.amount!) || !Number.isSafeInteger(Number(data.amount))) throw new Error("Amounts must be integer cents")

      return data
    })
}
export default defineApp({
  name: "payments",
  ui: shellUi(new URL("../ui/", import.meta.url)),
  surface: surface<Model, Event, Command>({
    description: "Match bank payments to invoices with the person's decisions",
    init: () => ({ ...empty(), busy: true, saving: false, unsaved: false, error: null }),
    start: () => [{ kind: "load" }],
    update(m, event) {
      if (event.kind === "call") {
        if (m.error) return { refused: "A file failed; resolve the error shown at / and reopen the app before changing data." }
        if (m.busy) return { refused: "The data is still being read; wait until busy is false, then read again." }

        return pages.update(m, event)
      }
      if (event.kind === "loaded") return { model: { ...event.data, busy: false, saving: false, unsaved: false, error: null } }
      if (event.kind === "imported") return save({ ...m, busy: false, months: [...m.months, event.month] })
      if (event.kind === "saved") return m.unsaved ? save({ ...m, saving: false }) : { model: { ...m, saving: false } }

      return { model: { ...m, busy: false, saving: false, error: event.error } }
    },
    view(m, path, actor) {
      const result = pages.view(m, path)

      if (!result) return result

      const filter = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(filter)
        if (!value || typeof value !== "object") return value

        const obj = value as Record<string, unknown>

        return Object.fromEntries(
          Object.entries(obj)
            .filter(
              ([, v]) =>
                !(
                  v &&
                  typeof v === "object" &&
                  (v as { kind?: string }).kind === "handle" &&
                  (actor === "person" ? (v as { name: string }).name === "guess" : ["confirm", "choose", "leave"].includes((v as { name: string }).name))
                )
            )
            .map(([k, v]) => [k, filter(v)])
        )
      }

      return filter(result) as View
    },
    async run(command, send) {
      const file = resolve("payments.json")

      if (command.kind === "load") {
        let data: Data

        try {
          data = JSON.parse(await readFile(file, "utf8"))
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
          data = empty()
        }
        if (
          !data ||
          !Array.isArray(data.months) ||
          !Array.isArray(data.rules) ||
          !data.rules.every((r) => typeof r === "string" && r.trim()) ||
          !data.months.every(
            (m) =>
              typeof m.name === "string" &&
              Array.isArray(m.payments) &&
              Array.isArray(m.invoices) &&
              m.payments.every(
                (p) =>
                  p &&
                  [p.id, p.date, p.payer, p.reference].every((v) => typeof v === "string") &&
                  Number.isSafeInteger(p.amount) &&
                  ["unmatched", "unsure", "matched", "left"].includes(p.status) &&
                  (p.guess === undefined || typeof p.guess === "string") &&
                  (p.invoice === undefined || typeof p.invoice === "string")
              ) &&
              m.invoices.every((i) => i && typeof i.number === "string" && typeof i.customer === "string" && Number.isSafeInteger(i.amount))
          )
        )
          throw new Error("payments.json must contain valid months, payments, invoices and rules")
        send({ kind: "loaded", data })
      } else if (command.kind === "save") {
        await writeFile(`${file}.tmp`, JSON.stringify(command.data, null, 2))
        await rename(`${file}.tmp`, file)
        send({ kind: "saved" })
      } else {
        const payments = csv(await readFile(resolve(command.payments), "utf8"), ["id", "date", "payer", "amount", "reference"]).map((p) => ({
          ...p,
          amount: Number(p.amount),
          status: "unmatched" as const,
        })) as Payment[]
        const invoices = csv(await readFile(resolve(command.invoices), "utf8"), ["number", "customer", "amount"]).map((i) => ({
          ...i,
          amount: Number(i.amount),
        })) as Invoice[]

        send({ kind: "imported", month: { name: command.month, payments, invoices } })
      }
    },
    failed: (command, error) => ({ kind: "failed", error: `${command.kind} failed: ${error}. Check the files and reopen the app.` }),
  }),
})
