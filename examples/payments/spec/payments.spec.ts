// The payments app's rules as stories; the world settles every file command.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import app from "../src/app.ts"

const month = {
  name: "March",
  payments: [
    { id: "1", date: "2026-03-01", payer: "Acme", amount: 10000, reference: "101", status: "unmatched" },
    { id: "2", date: "2026-03-02", payer: "Wire", amount: 20000, reference: "", status: "unmatched" },
    { id: "3", date: "2026-03-03", payer: "Refund", amount: -500, reference: "", status: "unmatched" },
  ],
  invoices: [
    { number: "101", customer: "Acme", amount: 10000 },
    { number: "102", customer: "Wire", amount: 20000 },
    { number: "103", customer: "Other", amount: 20000 },
  ],
}
const path = "/months/March/payments/2"
const args = { month: "March", id: "2" }

async function ready() {
  const s = story(app.surface)

  await s.world.settle({ kind: "loaded", data: { months: [], rules: [] } })

  return s
}
async function imported() {
  const s = await ready()

  await s.agent.call("/", "import", { month: "March", payments: "payments.csv", invoices: "invoices.csv" })
  await s.world.settle({ kind: "imported", month: structuredClone(month) })
  await s.world.settle({ kind: "saved" })

  return s
}
async function matched() {
  const s = await imported()

  await s.agent.call("/months/March", "match-certain", { month: "March" })
  await s.world.settle({ kind: "saved" })

  return s
}
async function guessed() {
  const s = await matched()

  await s.agent.call(path, "guess", { ...args, invoice: "102" })
  await s.world.settle({ kind: "saved" })

  return s
}
test("a month is imported and counted", async () => {
  const s = await imported()

  expect(s.agent.sees()).toMatchObject({ months: [{ name: "March", payments: 3, matched: 0, unsure: 0 }] })
})
test("the certain payments match and the rest need a decision", async () => {
  const s = await matched()

  expect(s.agent.sees("/months/March")).toMatchObject({ matched: 1, unsure: 2, unmatched: 0 })
  expect(s.agent.sees("/months/March/unsure")).toMatchObject({
    payments: [
      { id: "2", amount: "200.00" },
      { id: "3", amount: "-5.00" },
    ],
  })
})
test("the unsure payments come with the invoices still open, so a guess names one of them", async () => {
  const s = await matched()

  expect(s.agent.sees("/months/March/unsure")).toMatchObject({
    openInvoices: [
      { number: "102", customer: "Wire", amount: "200.00" },
      { number: "103", customer: "Other", amount: "200.00" },
    ],
  })
})
test("nobody waits on the file to act: a change made during a write is accepted, and written when that write lands", async () => {
  const s = await matched()

  expect(await s.agent.call(path, "guess", { ...args, invoice: "102" })).toMatchObject({ outcome: "written" })
  expect(await s.agent.call("/months/March/payments/3", "guess", { month: "March", id: "3", invoice: "103" })).toMatchObject({ outcome: "written" })
  expect(await s.person.call(path, "confirm", args)).toMatchObject({ outcome: "written" })
  expect(s.agent.sees()).toMatchObject({ busy: false })
  // One write at a time: the first is under way, and what came after it waits for it.
  expect(s.world.commands()).toHaveLength(1)
  await s.world.settle({ kind: "saved" })

  const [after] = s.world.commands()

  if (after?.kind !== "save") throw new Error("Expected a second save")
  expect(after.data.months[0]!.payments).toMatchObject([{ id: "1" }, { id: "2", status: "matched", invoice: "102" }, { id: "3", guess: "103" }])
  await s.world.settle({ kind: "saved" })
  expect(s.world.commands()).toHaveLength(0)
})
test("while a month is being imported a call is refused with what to wait for", async () => {
  const s = await ready()

  await s.agent.call("/", "import", { month: "March", payments: "payments.csv", invoices: "invoices.csv" })
  expect(s.agent.sees()).toMatchObject({ busy: true })
  expect(await s.agent.call("/rules", "add", { text: "Keep references." })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("busy is false") })
})
test("the person sees the agent's guess without a match", async () => {
  const s = await guessed()

  expect(s.person.sees(path)).toMatchObject({ guess: "102", status: "unsure" })
  expect(s.person.offered(path)).not.toContain("guess")
})
for (const handle of ["confirm", "choose", "leave"])
  test(`only the person may ${handle} an unsure payment`, async () => {
    const s = await guessed()

    expect(s.person.offered(path)).toContain(handle)
    expect(s.agent.offered(path)).not.toContain(handle)

    const input = { ...args, ...(handle === "choose" && { invoice: "103" }) }

    expect(await s.agent.call(path, handle, input)).toMatchObject({ outcome: "refused", reason: expect.stringContaining("not offered") })
    expect(await s.person.call(path, handle, input)).toMatchObject({ outcome: "written" })
    await s.world.settle({ kind: "saved" })
    expect(s.person.sees(path)).toMatchObject({
      status: handle === "leave" ? "left" : "matched",
      ...(handle !== "leave" && { invoice: handle === "confirm" ? "102" : "103" }),
    })
  })
test("the agent learns how many the person corrected and where", async () => {
  const s = await guessed()

  s.agent.told()
  await s.person.call(path, "choose", { ...args, invoice: "103" })
  await s.world.settle({ kind: "saved" })
  expect(s.agent.told().join("\n")).toContain("unsure: 2 → 1")
  expect(s.agent.sees()).toMatchObject({ corrected: { count: 1, payments: [path] } })
  expect(s.agent.sees(path)).toMatchObject({ corrected: true })
})
test("a month already imported tells me to read it", async () => {
  const s = await imported()

  expect(await s.agent.call("/", "import", { month: "March", payments: "p", invoices: "i" })).toMatchObject({
    outcome: "refused",
    reason: expect.stringContaining("already imported"),
  })
})
test("an unreadable file tells me what failed and what to do", async () => {
  const s = await ready()

  await s.agent.call("/", "import", { month: "March", payments: "missing", invoices: "i" })
  await s.world.fail("Cannot read missing")
  expect(s.agent.sees()).toMatchObject({ error: expect.stringContaining("Check the files") })
})
for (const invoice of ["missing", "101"])
  test(`an invoice ${invoice === "101" ? "already matched" : "that does not exist"} is refused`, async () => {
    const s = await matched()

    expect(await s.agent.call(path, "guess", { ...args, invoice })).toMatchObject({
      outcome: "refused",
      reason: expect.stringContaining(invoice === "101" ? "already matched" : "does not exist"),
    })
    expect(await s.person.call(path, "choose", { ...args, invoice })).toMatchObject({ outcome: "refused" })
  })
test("a guess on a settled payment is refused with its available next actions", async () => {
  const s = await matched()

  expect(await s.agent.call("/months/March/payments/1", "guess", { month: "March", id: "1", invoice: "102" })).toMatchObject({
    outcome: "refused",
    reason: expect.stringContaining("not offered"),
  })
})
test("an empty rule tells me to write a sentence", async () => {
  const s = await ready()

  expect(await s.agent.call("/rules", "add", { text: " " })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("write one sentence") })
})
test("a rule is counted at home and can be removed", async () => {
  const s = await ready()

  expect(s.person.offered("/rules")).toContain("add")
  await s.agent.call("/rules", "add", { text: "Refunds match by reference." })
  await s.world.settle({ kind: "saved" })
  expect(s.agent.sees()).toMatchObject({ rules: { count: 1, at: "/rules" } })
  expect(s.person.sees("/rules")).toMatchObject({ rules: [{ text: "Refunds match by reference." }] })
  await s.person.call("/rules/0", "remove", { n: 0 })
  await s.world.settle({ kind: "saved" })
  expect(s.agent.sees()).toMatchObject({ rules: { count: 0 } })
})
test("the next month starts with the rules and decisions the first left", async () => {
  const s = await guessed()

  await s.person.call(path, "choose", { ...args, invoice: "103" })
  await s.world.settle({ kind: "saved" })
  await s.agent.call("/rules", "add", { text: "Wire payments belong to Other." })
  await s.world.settle({ kind: "saved" })
  await s.agent.call("/", "import", { month: "April", payments: "p", invoices: "i" })
  await s.world.settle({ kind: "imported", month: { ...structuredClone(month), name: "April" } })
  await s.world.settle({ kind: "saved" })
  expect(s.agent.sees()).toMatchObject({
    months: [
      { name: "March", matched: 2 },
      { name: "April", matched: 0 },
    ],
    rules: { count: 1 },
    corrected: { count: 1 },
  })
})
test("restarting reads the durable months and rules again", async () => {
  const s = await guessed()

  await s.agent.call("/rules", "add", { text: "Keep references." })

  const command = s.world.commands()[0]!

  expect(command.kind).toBe("save")
  await s.world.settle({ kind: "saved" })
  await s.restart()
  if (command.kind !== "save") throw new Error("Expected save")
  await s.world.settle({ kind: "loaded", data: command.data })
  expect(s.person.sees(path)).toMatchObject({ guess: "102" })
  expect(s.agent.sees()).toMatchObject({ rules: { count: 1 }, unsure: 2 })
})
