// A new app asked for, as a person asks: the agent writes its brief before any code, asks what it cannot decide, waits for
// the person's approval on the page, and only then makes the app and hands over its page. Each step checks what the build
// tab shows, so a run that skipped the brief never reads as one that went right.
import type { Scenario } from "#babavoss/core/index.ts"

type Listed = { at: string; name: string; state: string; unanswered?: number }
type Build = { briefs?: Listed[] }
type Brief = Listed & { agent: string[]; sees: string[]; decides: string[]; questions: { n: number; text: string; answer?: string }[]; dir?: string }

export default {
  description: "A new app asked for: its brief first, questions asked, approval waited for, then the app made",
  setup: "claude-code",
  async run(user) {
    await user.say(
      "I want an app for a social media post creation - for now specializing in insta carousels.\n\nWe will have image generation API connections, I want most things to be done by agent while I review and steer via UI."
    )

    const started = ((await user.read("/tabs/1")) as Build | undefined)?.briefs?.[0]

    if (!started) throw new Error("the agent ended its turn without a brief in the build tab")

    const first = (await user.read(started.at)) as Brief

    user.note(
      `After the first turn: brief ${first.name}, ${first.state}; ${first.agent.length} agent lines, ${first.sees.length} seen, ${first.decides.length} decided; ` +
        `${first.questions.length} questions, ${first.unanswered ?? 0} unanswered; the app is ${first.dir ? "made" : "not made"}.`
    )
    if (first.dir) throw new Error("the agent made the app before the person approved its brief")
    if (first.unanswered)
      await user.say(
        "Images come from OpenAI, with the key in the project's .env. I say what I want changed in chat; the page is for looking at the post as it will appear in the Instagram app. Decide the rest yourself."
      )

    const ready = (await user.read(started.at)) as Brief

    if (ready.unanswered) throw new Error(`${ready.unanswered} questions are still unanswered after the person answered in chat`)

    const approved = await user.call(started.at, "approve", { name: started.name })

    if (approved.outcome === "refused") throw new Error(`approve was refused: ${approved.reason}`)
    await user.say("I approved the brief on the page. Make the app and give me its page; stop there for now, before building anything.")

    const made = (await user.read(started.at)) as Brief

    if (!made.dir) throw new Error("the brief was approved and the agent did not make the app")
    user.note(`The app was made in ${made.dir}/.`)
  },
} satisfies Scenario
