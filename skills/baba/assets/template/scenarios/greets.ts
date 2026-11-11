// The first task: the agent proposes, the person decides on the page, and the agent notices.
import type { Scenario } from "babavoss/core/index.ts"

export default {
  description: "A greeting proposed in chat, accepted by the person on the page, and the agent notices",
  async run(user) {
    await user.say('Propose "hola" as the greeting.')
    await user.read("/tabs/1")
    await user.call("/tabs/1", "accept", {})
    await user.say("What is the greeting now?")
  },
} satisfies Scenario
