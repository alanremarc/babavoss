// A harness for stories: nothing is started; a session's stream is what the story emits, and what it was told is kept,
// so a surface that drives a harness is tested at its boundary as it would run under a real one.
import type { Harness, HarnessEvent, Session, Start } from "./harness.ts"

export type FakeHarness = ReturnType<typeof fakeHarness>

export function fakeHarness() {
  const queue: (HarnessEvent | undefined)[] = []
  let wake: (() => void) | undefined
  const push = (event: HarnessEvent | undefined) => {
    queue.push(event)
    wake?.()
  }
  const world = {
    started: [] as Start[],
    homes: [] as string[],
    released: [] as string[],
    /** What each session was told, in order: a message's text, or `stop` and `end`. */
    told: [] as string[],
    /** Events of the session started last, as its harness would report them. */
    emit: (...events: HarnessEvent[]) => events.forEach(push),
    /** The process ends with `code`: its last event, and the end of its stream. */
    exit: (code: number) => {
      push({ kind: "ended", code, stderr: "" })
      push(undefined)
    },
  }
  const harness: Harness = {
    name: "fake",
    home(home) {
      world.homes.push(home)

      return "a fake login"
    },
    release: (home) => void world.released.push(home),
    start(options): Session {
      world.started.push(options)
      queue.length = 0

      return {
        events: (async function* () {
          for (;;) {
            if (!queue.length) await new Promise<void>((done) => (wake = done))

            const event = queue.shift()

            if (event === undefined) return
            yield event
          }
        })(),
        say: (text) => void world.told.push(text),
        stop: () => void world.told.push("stop"),
        async end() {
          world.told.push("end")
          world.exit(143)
        },
      }
    },
  }

  return { harness, ...world }
}
