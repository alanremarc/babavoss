# BabaVoss

Canonical design, cut down to what holds while the product is reshaped: the vocabulary, the architecture, and how agent, app and person meet. Details and limits belong in code and specs.

A TypeScript framework for software that agents operate. The person talks to the agent; the agent operates the app and extracts its utility for them. An app's software is a surface: what is true now and what can be done now, read and acted on by the agent through the app's command line. Where the person has something to see or do, the app has a page over the same surface. An app is one skill: the skill is how it is opened, and the skill's directory is the whole app. The framework is primitives; the shell is a preset over them; the authoring app is how an app is written, tried and kept track of.

## Vocabulary

```text
Parties
  person       Asks, decides, supplies what the agent cannot.
  agent        Computes the next step from context: input, instructions, current state.
  harness      Hosts the agent: Claude Code, Codex. Owns sessions, skills and the agent's shell.
  app          Software and promptware an agent operates for a person; one skill, whose directory holds all of it.

App parts
  skill        The app's door: its name and description are in context where the skill lets the agent see it, its text when opened.
  reference    Know-how beside the skill's text, read when needed; never a further skill.
  word         An app's command, its own name: `payments /rules`. How the agent reads its views, calls its handles, waits and closes it.
  bv           The one program behind every app's word: finds what the session has open, wakes the runtime and passes one request to it.
  state        App data that persists across the turns of a session.
  surface      Program the app runs: init, restore, update, view, run, failed.
  ui           Web page over the surface, for the person: renders views and calls handles; presentation, navigation and private drafts are its own.

Surface
  model        Private domain state.
  view         Public facts and handles at a path.
  handle       Offered action with fixed and typed open arguments.
  call         Request by an actor to invoke a handle.
  message      Input to update: admitted call or command event.
  command      Effect run outside update; reports events back.
  actor        Identity responsible for a call: the agent or the person.
  ask          Handle offered to the person only; the agent places it and waits on it.

Turns
  session      Harness conversation; the unit of state, runtime, page and directory. A subagent works within it, in its name.
  turn         One computation of the agent.
  present      Current state and what changed since the session was last answered, carried by the answers to the app's word.

Shell
  util         A mini-app in the shell, one per workflow or job: its own surface, its own component, opened as a tab.
  layout       The frame a util's page is built in: the workbench, the plain layout, the welcome page.
  document     What a workbench util works on, one at a time, in the strip of open ones; tools find, the document shows.
  scope        What a util with several opens first, a project or a repository; the welcome page lists them.
```

## Architecture

```text
person ↔ agent ↔ harness ──skill, then its word─↔ app's runtime ─┬─ surface: model, views, commands
   └─────────────── browser ↔ ui ──────────────────────────┘      └─ state
```

```text
Open
  skill → the agent runs the app's door, scripts/open.ts → the app is open in this session and its word is on the path → the session's runtime
          wakes → the page's address, how to call, the whole view

Turn
  call → update → model → views → ui; the answer carries the result and what else changed since the session was last answered
  page → the agent hands the person the session's page when something is worth seeing or answering; nothing opens by itself
  ask  → the agent places it and waits → ui offers it → person answers → the wait returns with the answer
```

## Agent, app, person

```text
agent → app      the app's word: read a view, call a handle the view offers, wait, close
app → agent      the answer, written by the runtime, and nothing else: the whole view at open, after it what changed
                 since the session was last answered
person → app     the ui: the same handles, called as the person; an ask answered
app → person     the ui: the views, live
agent ↔ person   the conversation, which the app is no part of; the agent hands over the page's address when it is worth seeing
unasked          nothing: a closed app is its skill's description in context, where the skill shows it, and no process;
                 an open one speaks only when the agent calls it
aware            the agent learns what the person did on the page the next time it calls; the skill says when to look,
                 and wait holds a call until something changes
not a canvas     the page shows the app's own views; the agent changes what the person sees only by calling handles
```

The agent is the app's first user and the surface is built for it: a reader that reads everything each time and remembers nothing. The page is the same surface for the person. Neither is drawn by the other.
