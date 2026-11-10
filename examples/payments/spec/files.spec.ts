// Real file commands import CSV and reload durable data in a temporary session directory.
import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { story } from "#babavoss/core/index.ts"
import app from "../src/app.ts"

test("CSV files become durable months that a fresh app reads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "payments-"))
  const cwd = process.cwd()

  try {
    process.chdir(dir)
    await writeFile("p.csv", 'id,date,payer,amount,reference\np1,2026-03-01,"Acme, Inc",12345,I1\n')
    await writeFile("i.csv", "number,customer,amount\nI1,Acme,12345\n")

    const s = story(app.surface, { effects: "real" })

    await s.world.idle()
    await s.agent.call("/", "import", { month: "March", payments: "p.csv", invoices: "i.csv" })
    await s.world.idle()
    expect(s.agent.sees("/months/March/payments/p1")).toMatchObject({ payer: "Acme, Inc", amount: "123.45" })
    await s.agent.call("/months/March", "match-certain", { month: "March" })
    await s.world.idle()
    expect(JSON.parse(await readFile("payments.json", "utf8"))).toMatchObject({ months: [{ name: "March" }] })

    const fresh = story(app.surface, { effects: "real" })

    await fresh.world.idle()
    expect(fresh.person.sees("/months/March/payments/p1")).toMatchObject({ invoice: "I1", status: "matched" })
  } finally {
    process.chdir(cwd)
    await rm(dir, { recursive: true, force: true })
  }
})
