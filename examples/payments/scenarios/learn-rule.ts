// Continue the reviewed month and ask the agent to learn from the person’s correction.
import type { Scenario } from "#babavoss/core/index.ts"
export default {
  description: "Read the person’s corrections and record a rule",
  async run(user) {
    await user.say("I have reviewed March on the page. Read what I corrected and record a rule in one sentence for what it teaches.")
    await user.read("/rules")
  },
} satisfies Scenario
