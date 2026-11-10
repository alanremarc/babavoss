// The doors' way to a session's surface: always through the session's runtime, woken when it is not up. A surface is never
// run in a door's own process; where the environment refuses a runtime what it requires, the app does not run here.
import { resolve } from "node:path"
import { recordSessionCwd, stateDir, type Env } from "../state/state.ts"
import type { Answer } from "../surface/run.ts"
import type { Args, View } from "../surface/view.ts"
import type { AppDefinition } from "../app.ts"
import type { Session } from "../session.ts"
import { Denied, deniedState, serviceClient } from "./service.ts"

export type Reach = {
  read(path: string, actor: string): Promise<View | undefined>
  call(path: string, handle: string, args: Args, actor: string): Promise<Answer>
  changes(actor: string, signal: AbortSignal): AsyncGenerator<void>
  /** The page's address: the session's runtime. */
  page: string
}

/**
 * The first caller records the session's directory; later callers cannot move it.
 * Throws Denied, saying "NAME does not run here" and why, when the environment refuses the runtime.
 */
export async function reach(
  app: AppDefinition,
  session: Pick<Session, "id"> & { cwd?: string },
  options: { env?: Env; entry?: string | URL } = {}
): Promise<Reach> {
  const dir = stateDir(app, session, options.env)
  const denied = (why: string) => new Denied(`${app.name} does not run here: ${why}`)
  const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      const refused = deniedState(error, dir)

      if (refused instanceof Denied) throw denied(refused.message)
      throw error
    }
  }
  const client = serviceClient(dir, session.id, options.entry ?? process.argv[1]!, options.env as NodeJS.ProcessEnv | undefined)
  const encoded = (path: string) => path.split("/").map(encodeURIComponent).join("/")
  const endpoint = await guarded(async () => {
    if (session.cwd) recordSessionCwd(dir, resolve(session.cwd))

    return client.ready()
  })

  return {
    page: `http://127.0.0.1:${endpoint.port}`,
    async *changes(actor, signal) {
      const response = await client.request("/", { actor, accept: "text/event-stream", signal })

      if (!response.ok || !response.body) throw new Error("The runtime change stream did not open")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ""

      try {
        while (true) {
          const chunk = await reader.read()

          if (chunk.done) break
          pending += decoder.decode(chunk.value, { stream: true })

          let end: number

          while ((end = pending.indexOf("\n\n")) !== -1) {
            const event = pending.slice(0, end)

            pending = pending.slice(end + 2)
            if (event.startsWith("event: change\n")) yield
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
    },
    read: (path, actor) =>
      guarded(async () => {
        const response = await client.request(encoded(path), { actor })

        if (response.status === 404) {
          await response.body?.cancel()

          return undefined
        }
        if (!response.ok) throw new Error(((await response.json()) as { error: string }).error)

        return (await response.json()) as View
      }),
    call: (path, handle, args, actor) =>
      guarded(async () => {
        const response = await client.request(encoded(path), { method: "POST", actor, body: JSON.stringify({ handle, args }) })

        if (response.status !== 200 && response.status !== 409) throw new Error(((await response.json()) as { error: string }).error)

        return (await response.json()) as Answer
      }),
  }
}
