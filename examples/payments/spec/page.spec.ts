// The page’s review sequence uses offered person handles and exposes the correction to the agent.
import { expect, test } from "bun:test"
import { story } from "babavoss/core/index.ts"
import app from "../src/app.ts"

test("a confirmed guess and a changed invoice remain visible through the page’s views", async () => {
  const s = story(app.surface)

  await s.world.settle({
    kind: "loaded",
    data: {
      rules: [],
      months: [
        {
          name: "March",
          invoices: ["I8", "I9", "I10"].map((number) => ({ number, customer: number, amount: 100 })),
          payments: ["p8", "p9"].map((id) => ({ id, date: "2026-03-08", payer: id, amount: 100, reference: "", status: "unsure" })),
        },
      ],
    },
  })
  for (const [id, invoice] of [
    ["p8", "I8"],
    ["p9", "I9"],
  ] as const) {
    await s.agent.call(`/months/March/payments/${id}`, "guess", { month: "March", id, invoice })
    await s.world.settle({ kind: "saved" })
  }
  await s.person.call("/months/March/payments/p8", "confirm", { month: "March", id: "p8" })
  await s.world.settle({ kind: "saved" })
  await s.person.call("/months/March/payments/p9", "choose", { month: "March", id: "p9", invoice: "I10" })
  await s.world.settle({ kind: "saved" })
  expect(s.agent.sees()).toMatchObject({ corrected: { count: 1, payments: ["/months/March/payments/p9"] } })
  expect(s.person.sees("/months/March/unsure")).toMatchObject({ payments: [] })
  expect(s.person.sees("/months/March/payments/p9")).toMatchObject({ corrected: true, guess: "I9", invoice: "I10" })
})
