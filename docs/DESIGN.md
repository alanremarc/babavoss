# BabaVoss

Canonical design, cut down to what holds while the product is reshaped: the vocabulary, the architecture, how agent, surface and person meet, and how a project's surfaces are kept, made known and updated. Details and limits belong in code and specs.

A TypeScript framework for surfaces an agent works on. The person talks to the agent; the agent is the interface, and a surface is a tool it works with for them: what is true now and what can be done now, read and acted on by the agent through a command. The person has a page over the same surface, where they watch and decide. The agent makes a surface before a task that deserves one, or when asked, and keeps it for later. A project's surfaces are code in its .baba/ directory. .baba/ has a root, which is itself a surface: the picker of surfaces, with each open surface beside it as a tab. An agent learns of surfaces, and of each one, from the surface alone. The framework is primitives; the shell is a preset over them; baba is what makes an agent aware.

## Vocabulary

```text
Parties
  person       Asks, decides, supplies what the agent cannot.
  agent        Computes the next step from context: input, instructions, current state.
  harness      Hosts the agent: Claude Code, Codex. Owns sessions, skills, hooks and the agent's shell.

Surface
  surface      A tool an agent works with for a person, as a program: init, restore, update, view, run, failed. What it is for
               is its description; how it is worked is what its views say. Code in .baba/, a tab of the root once opened.
  model        Private domain state.
  view         Public facts and handles at a path.
  handle       Offered action with fixed and typed open arguments.
  call         Request by an actor to invoke a handle.
  message      Input to update: admitted call or command event.
  command      Effect run outside update; reports events back.
  actor        Identity responsible for a call: the agent or the person.
  ask          Handle offered to the person only; the agent places it and waits on it.
  ui           A surface's part of the page, for the person: renders views and calls handles; presentation, navigation and
               private drafts are its own.

Root
  .baba/       The surfaces' package, in a project or in the person's home: it names the framework, and holds one directory per surface.
  root         What .baba/ is to a session: one runtime and one page. Its surface is the picker and the open tabs.
  picker       The root's first tab: the surfaces, each with what it is for.
  tab          A surface opened in the root, by the agent or by the person; the same surface may be open in several.
  word         The root's command, its own name, baba. How the agent reads views, calls handles, waits and closes it.
  bv           The one program behind the word: finds what the session has open, wakes the runtime and passes one request to it.
  state        What the open tabs hold, kept across the turns of a session.
  baba         The words that make an agent aware of the root and how it is worked; also the package's command: init, new, start, provision.
  provision    Writes what makes an agent aware beside .baba/: the framework's hook, and the skill baba.

Turns
  session      Harness conversation; the unit of state, runtime, page and directory. A subagent works within it, in its name.
  turn         One computation of the agent.
  present      The root at /, whole or as what changed since the session was last answered: every open tab's facts.

Shell
  util         A surface of its own in the shell, with its own component, opened as a tab. The root's utils are the picker and the surfaces.
  layout       The frame a util's page is built in: the workbench, the plain layout, the welcome page.
  document     What a workbench util works on, one at a time, in the strip of open ones; tools find, the document shows.
  scope        What a util with several opens first, a project or a repository; the welcome page lists them.
```

## Architecture

```text
person ↔ agent ↔ harness ──hooks; the word──↔ root's runtime ─┬─ root surface: picker, tabs ─ surface: model, views, commands
   └─────────────── browser ↔ page ─────────────────────┘      └─ state
```

```text
Start
  session starts → hook → the root starts → baba's words and the whole present reach the agent: the page's address, the
                   word, the surfaces and the open tabs; then, when a later release is out, how to take it
  without hooks  → the skill baba says the same words, and to start the root

Turn
  call → update → model → views → page; the answer carries the result and what else changed since the session was last answered
  hook → with the person's message, and after a tool call: what changed in the present since the session was last answered
  page → the agent opens the page in the harness's browser where it has one, else hands the person its address
  ask  → the agent places it and waits → the page offers it → the person answers → the wait returns with the answer
```

## Agent, surface, person

```text
agent → surface   the word: read a view, call a handle the view offers, wait
surface → agent   the answer to a command; and unasked, through hooks, what changed since the session was last answered
person → surface  the page: the same handles, called as the person; an ask answered; a surface opened from the picker
surface → person  the page: the views, live
agent ↔ person    the conversation, which the surface is no part of
learned           a surface has no skill and no instructions beside it. An agent chooses it by its description, in the
                  picker, and works it by what its views say, read once it is open. So a surface the person opens is the
                  agent's to take up as soon as the present tells of it
not woken         what the person does on the page while no turn runs reaches the agent with their next message; nothing
                  starts a turn
not a canvas      the page shows the surfaces' own views; the agent changes what the person sees only by calling handles
```

The agent is a surface's first user and it is built for it: a reader that reads everything each time and remembers nothing. The page is the same surface for the person. Neither is drawn by the other.

## .baba/

```text
.baba/:     a Bun package beside the harnesses' configuration, in a project or in the person's home; package.json names the
            framework, a release of this repository, and nothing else does; surfaces/NAME/ is a surface: src/surface.ts,
            the surface; ui/index.tsx, its component; spec/, its rules
root:       one runtime and one page per session, which the framework provides and generates from the surfaces. It runs
            with none at all. Its first tab is the picker; a surface is a util of it, opened as a tab as often as
            wanted. At / the agent is told what changes in any open tab
dynamic:    the root follows .baba/ by itself: a surface made or removed, and a change to one's code, are loaded into the
            running root, and the page follows. Nothing is provisioned for a surface
start:      by `baba start`, by hand or by the agent, and by the hook when a session starts; either way the answer is the
            framework's version, the page's address with the word to open it in the harness's browser where it has one,
            the surfaces and the open tabs. It sleeps when idle and any command wakes it where it was
aware:      one piece of content makes an agent aware: baba's words, how the root is worked, and after them the present.
            Hooks deliver it: whole at a session's start, with the root started, and as what changed with each message
            of the person and after each tool call. The skill baba is the same words for a harness without hooks, and
            the way back in
bootstrap:  one command, the package's init: makes .baba/, installs the framework and provisions
loop:       change a surface in .baba/ → test it → work it in the root
provision:  writes the framework's hook into the harness's settings beside .baba/, and the skill baba, which the package
            carries, into .claude/skills and .agents/skills; installing in .baba/ provisions
harness:    the harness's configuration beside .baba/ is compiled from .baba/: baba's is primary, the harness's follows.
            What is compiled is hooks where a harness has them, Claude Code's, into its settings, among the person's own,
            which are left as they are; and the one skill
hooks:      soft control only: a hook adds context, the words and the present, and never blocks or decides; what may not
            happen stays the person's to set in the harness. The person's own layer outranks a project's
versions:   none to match: the command, baba's words and the root all come from the framework .baba/ names, so they are
            always of one version
update:     the root's door says when a later release is out, asked of the repository at most once a day; the agent takes
            it in .baba/, reads the changelog from the version the surfaces ran on up, and adapts them
release:    a tag vX.Y.Z of this repository; every version on main is one, with its section in CHANGELOG.md, written for
            the agent that adapts a project to it
keeps:      what the root's sessions write is beside .baba/: ~/.babavoss/ for the person's home, the project's .babavoss/ otherwise
later:      a way for the page to start a turn, such as ending the person's move; tests that run a surface under a
            harness; hooks for harnesses besides Claude Code
```
