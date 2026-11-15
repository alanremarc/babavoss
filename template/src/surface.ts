// The surface: what is true and what can be done, made for the agent first. The root of .baba/ runs it as a tab. It is
// all an agent ever learns of this tool: `description` is how the picker lists it, and so how it is chosen; `how`, a fact
// at /, is how it is to be worked, read each time. Here the agent proposes a greeting and the person, on the page,
// accepts or declines it. Replace the greeting with the surface's own work and keep the shape: the agent does the work
// through handles, a fact at / says what is waited for, and what only the person may decide is an ask.
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
    how: "Propose a greeting when the person asks for another. Accepting or declining it is theirs, on the page: wait for it, and do not propose again meanwhile.",
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

export default surface<Model, Event, never>({
  description: "Keep a greeting the person has agreed to. Use when the greeting is to be changed.",
  init: () => ({ greeting: "hello" }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
