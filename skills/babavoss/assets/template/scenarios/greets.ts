import type { Scenario } from "#babavoss/core/index.ts"

export default {
  description: "The greeting set by chat, then changed by the person, and the agent notices",
  async run(user) {
    await user.say('Set the greeting to "hola".')
    await user.read("/")
    await user.call("/", "greet", { text: "bonjour" })
    await user.say("What is the greeting now?")
  },
} satisfies Scenario
