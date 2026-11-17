// The demo's clock, preloaded into every process of a play: Date.now runs ahead by the milliseconds the file named by
// DESIGN_CLOCK holds, which a pause adds to. So the time a scenario lets pass, as while the agent thinks, passes at once,
// and the framework's code, which reads the time by Date.now, finds it passed. Its timers are left as they are.
import { readFileSync } from "node:fs"

const file = process.env.DESIGN_CLOCK

if (file) {
  const real = Date.now.bind(Date)

  Date.now = () => {
    try {
      return real() + (Number(readFileSync(file, "utf8")) || 0)
    } catch {
      return real()
    }
  }
}
