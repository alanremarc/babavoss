// The app's util: what is true and what can be done, made for the agent first. Here the agent proposes a greeting and the
// person, on the page, accepts or declines it. Replace the greeting with the app's own work and keep the shape: the agent
// does the work through handles, a fact at / says what is waited for, and what only the person may decide is an ask.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export type Model = { greeting: string; proposed?: string }
type Event = { kind: "none" }

const propose = action({
  name: "propose",
  description: "Propose a greeting; the person accepts or declines it on the page",
  subject: {},
  inputs: { text: "string" },
  update: (m: Model, { text }): Update<Model, never> => (text.trim() ? { model: { ...m, proposed: text.trim() } } : { refused: "A greeting needs text" }),
})
const accept = action({
  name: "accept",
  description: "Use the proposed greeting",
  subject: {},
  inputs: {},
  ask: true,
  update: (m: Model): Update<Model, never> => ({ model: { greeting: m.proposed ?? m.greeting } }),
})
const decline = action({
  name: "decline",
  description: "Keep the greeting as it is",
  subject: {},
  inputs: {},
  ask: true,
  update: (m: Model): Update<Model, never> => ({ model: { greeting: m.greeting } }),
})
const pages = view([propose, accept, decline], {
  "/": (m) => ({
    title: "Greeting",
    greeting: m.greeting,
    ...(m.proposed !== undefined && {
      proposed: m.proposed,
      waiting: "the person, to accept or decline the proposed greeting on the page",
      accept: accept.bind({}),
      decline: decline.bind({}),
    }),
    propose: propose.bind({}),
  }),
})

export const greeting = surface<Model, Event, never>({
  description: "A greeting the agent proposes and the person decides on",
  init: () => ({ greeting: "hello" }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
