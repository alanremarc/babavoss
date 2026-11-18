// The surface: what is true and what can be done, read by the agent through the command and by the person on the page.
// Here a greeting is proposed, then accepted or declined. Replace the greeting with the surface's own work and keep the
// shape, which the skill baba explains:
// - Its words are mechanics only. `description` is how the shell lists it: a phrase and a "Use when …". `how`, a fact at
//   /, says what the things are and what the actions do; never when to act or who decides.
// - Both sides are offered the same actions. Whether the proposal is taken is the person's decision: the agent raises it
//   in the conversation and acts on their word, or they take it on the page. Nothing here locks it.
// - An action's description adds what its name does not say, in lower case with no full stop; an input declares what it
//   means, here `kind: "line"`, one line of text.
// - A notice says what just happened; marked a highlight, it is what the person should see, and marks the tab until they look.
import { action, surface, view, type Update } from "babavoss/core/index.ts"

export type Model = { greeting: string; proposed?: string }
/** What its commands send. This surface runs none: a surface that hears a file or a process does, by a session command. */
type Event = { kind: "none" }

const propose = action({
  name: "propose",
  description: "stands beside the greeting in use until accepted or declined",
  subject: {},
  inputs: { text: { type: "string", kind: "line" } },
  update: (m: Model, { text }): Update<Model, never> =>
    text.trim()
      ? { model: { ...m, proposed: text.trim() }, notices: [{ text: `"${text.trim()}" is proposed, to accept or decline`, highlight: true }] }
      : { refused: "A greeting needs text" },
})
const accept = action({
  name: "accept",
  description: "puts the proposed greeting in use",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, never> => ({ model: { greeting: m.proposed ?? m.greeting }, notices: [`The greeting is now "${m.proposed}"`] }),
})
const decline = action({
  name: "decline",
  description: "drops the proposed greeting",
  subject: {},
  inputs: {},
  update: (m: Model): Update<Model, never> => ({ model: { greeting: m.greeting }, notices: [`"${m.proposed}" was declined`] }),
})
// Accept and decline are offered only while there is a proposal: an action that cannot be taken now is not offered.
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
