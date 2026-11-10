// Retry an asynchronous observation until its assertion passes, as the runtime settles.
import { expect } from "bun:test"
import { setTimeout } from "node:timers/promises"

export function poll(read: () => unknown, { timeout = 5000 } = {}) {
  const retry = async (check: (value: unknown) => void) => {
    const deadline = Date.now() + timeout

    for (;;) {
      try {
        check(await read())

        return
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await setTimeout(10)
      }
    }
  }

  return {
    toBe: (value: unknown) => retry((actual) => expect(actual).toBe(value)),
    toEqual: (value: unknown) => retry((actual) => expect(actual).toEqual(value)),
    toMatchObject: (value: object) => retry((actual) => expect(actual).toMatchObject(value)),
    toContain: (value: string) => retry((actual) => expect(actual).toContain(value)),
    toBeUndefined: () => retry((actual) => expect(actual).toBeUndefined()),
  }
}
