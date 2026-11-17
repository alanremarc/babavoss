// The surface: what is true and what can be done, made for the agent first. The shell runs it as a tab. It is all an
// agent ever learns of this tool: `description` is how the shell lists it, and so how it is chosen; `how`, a fact at /,
// says its mechanics: what each thing is, what each action does and what must hold for it, never when to act or who
// decides, which the person and the project's own instructions say. Here a greeting is proposed, and accepted or
// declined. Replace the greeting with the surface's own work and keep the shape: both sides are offered the same handles,
// and a notice says what just happened, marked a highlight where it waits on the person, which marks the tab on their
// page until they look.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export type Model = { greeting: string; proposed?: string }
type Event = { kind: "none" }

const propose = action({
  name: "propose",
  description: "a greeting, which stands beside the one in use until accepted or declined",
  subject: {},
  inputs: { text: { type: "string", kind: "line" } },
  update: (m: Model, { text }): Update<Model, never> =>
    text.trim()
      ? { model: { ...m, proposed: text.trim() }, notices: [{ text: `"${text.trim()}" is proposed, to accept or decline`, highlight: true }] }
      : { refused: "A greeting needs text" },
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
    how: "The greeting in use, and one proposed, if any: accepting puts it in use, declining drops it.",
    greeting: m.greeting,
    ...(m.proposed !== undefined && {
      proposed: m.proposed,
      accept: accept.bind({}),
      decline: decline.bind({}),
    }),
    propose: propose.bind({}),
  }),
})

export default surface<Model, Event, never>({
  description: "The greeting in use, and one proposed in its place. Use when the greeting is read or changed.",
  init: () => ({ greeting: "hello" }),
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : { model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => ({ kind: "none" }),
})
