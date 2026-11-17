// The surface: what is true and what can be done, made for the agent first. The shell runs it as a tab. It is all an
// agent ever learns of this tool: `description` is how the shell lists it, and so how it is chosen; `how`, a fact
// at /, is how it is to be worked, read each time. Here the agent proposes a greeting, and whether to use it is the
// person's decision: the agent raises it in the conversation, and either of them accepts or declines it, the agent on
// the person's word or the person on the page. Replace the greeting with the surface's own work and keep the shape: both
// are offered the same handles, `how` says whose each decision is, `attention` at / says who is needed and why, and a
// notice says what just happened.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export type Model = { greeting: string; proposed?: string }
type Event = { kind: "none" }

const propose = action({
  name: "propose",
  description: "a greeting, for the person to decide on",
  subject: {},
  inputs: { text: { type: "string", kind: "line" } },
  update: (m: Model, { text }): Update<Model, never> => (text.trim() ? { model: { ...m, proposed: text.trim() } } : { refused: "A greeting needs text" }),
})
const accept = action({
  name: "accept",
  description: "uses the proposed greeting",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, never> => ({ model: { greeting: m.proposed ?? m.greeting }, notices: [`The greeting is now "${m.proposed}"`] }),
})
const decline = action({
  name: "decline",
  description: "keeps the greeting as it is",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, never> => ({ model: { greeting: m.greeting }, notices: [`"${m.proposed}" was declined`] }),
})
const pages = view([propose, accept, decline], {
  "/": (m) => ({
    title: "Greeting",
    how: "Propose a greeting when the person asks for another. Whether to use it is the person's decision: ask them in the conversation, and accept or decline it as they say; they may do it on the page instead.",
    greeting: m.greeting,
    ...(m.proposed !== undefined && {
      proposed: m.proposed,
      attention: { who: "person", why: "to accept or decline the proposed greeting" },
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
