// March as the person asks for it: the agent imports and matches, then the person settles two unsure payments on the page,
// one by confirming the agent's guess and one by choosing an invoice: against a guess where the agent left another, which is
// a correction, and without one where it did not. Each step checks what the app shows, and a refused call fails the scenario,
// so a run that went wrong never reads as one that went right.
import type { Scenario } from "babavoss/core/index.ts"

type Unsure = { id: string; at: string; guess?: string | null }

export default {
  description: "Match March, confirm a guess and choose an invoice for another payment",
  preset: "march",
  async run(user) {
    await user.say("Match March's payments to our invoices from the two CSV files here. I'll decide the unsure ones myself on the page.")

    // The agent names the month as it likes, "March" or "2026-03"; the person goes by what the app lists.
    const root = (await user.read("/")) as { months?: { name: string; unsureAt: string }[] } | undefined
    const month = root?.months?.[0]

    if (!month) throw new Error("the agent imported no month")

    const view = (await user.read(month.unsureAt)) as { payments?: Unsure[] } | undefined
    const unsure = view?.payments ?? []

    if (!unsure.length) throw new Error(`the agent left nothing unsure in ${month.name} for the person`)

    const guessed = unsure.find((p) => p.guess)
    // A correction is a choice against a guess, so the person takes another guessed payment where the agent left one.
    const other = unsure.find((p) => p !== guessed && p.guess) ?? unsure.find((p) => p !== guessed)

    if (!guessed || !other) throw new Error(`the agent guessed ${unsure.filter((p) => p.guess).length} of ${unsure.length} unsure payments; two are needed`)

    const confirmed = await user.call(guessed.at, "confirm", { month: month.name, id: guessed.id })

    if (confirmed.outcome === "refused") throw new Error(`confirm ${guessed.id} was refused: ${confirmed.reason}`)

    const invoice = other.guess === "I10" ? "I9" : "I10"
    const chosen = await user.call(other.at, "choose", { month: month.name, id: other.id, invoice })

    if (chosen.outcome === "refused") throw new Error(`choose ${other.id} was refused: ${chosen.reason}`)
    user.note(`The person confirmed ${guessed.id} as ${guessed.guess} and matched ${other.id} to ${invoice}.`)
    await user.read("/")
  },
} satisfies Scenario
