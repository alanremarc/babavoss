// The app: a surface over one model, run in the session's runtime, with a page the person sees it through.
// The agent reaches it through scripts/open.ts and nowhere else.
import { action, defineApp, surface, view, type Update } from "#babavoss/core/index.ts"

type Model = { greeting: string }
type Event = { kind: "none" }

const greet = action({
  name: "greet",
  description: "Set the greeting",
  subject: {},
  inputs: { text: "string" },
  update: (_m: Model, { text }): Update<Model, never> => (text.trim() ? { model: { greeting: text } } : { refused: "A greeting needs text" }),
})
const pages = view([greet], { "/": (m) => ({ greeting: m.greeting, greet: greet.bind({}) }) })

export default defineApp({
  name: "my-app",
  ui: new URL("../ui/", import.meta.url),
  surface: surface<Model, Event, never>({
    description: "What this app is for",
    init: () => ({ greeting: "hello" }),
    update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
    view: pages.view,
    run: async () => {},
    failed: () => ({ kind: "none" }),
  }),
})
