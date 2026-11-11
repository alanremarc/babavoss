# BabaVoss

Canonical design. Details and limits belong in code and specs.

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

Authoring
  brief        What an app is to be, agreed before it is written: its job, the agent's part, the person's part, the open questions
               and the steps of building it.

Playground
  preset       What a workspace starts from: files in the app's repository, with a short description.
  workspace    A place made from a preset for one app: the agent's files, the harness's home and the app's state, in one directory.
  run          One agent session in a workspace, with the app installed, under a setup; one live at a time, watched by the person.
  setup        What a run holds fixed, by name: harness, model, effort, sandbox; the person may pick another model or effort over it.
  scenario     What the user side does in a run, in order, as a program: messages to the agent and calls on the surface as the person.
  trace        The run as the agent saw it: prompts, thinking, calls and results, the app's view as it changed, cost.
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

```text
Authoring
  start   → the person says what they want → the agent writes the brief and asks what it cannot decide → the person approves it
            on the page → the app is made from the template, and its page is handed over before the first step is built
  change  → the person says what they want → the agent edits the app → a scenario runs it in the playground
  look    → the same run for both: the person at the trace and the app's page, the agent at the trace through its handles
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

## App

```text
is:        one skill, in the shape skills have: SKILL.md; references/, know-how read when needed; scripts/open.ts, its door;
           assets/, what it ships that is not code; then its software, and package.json, naming the framework it depends
           on. The directory is what is installed and updated
owns:      its code, skill, state, surface, and its ui where it has one
always:    a surface; a ui where the person has something to see or do
skill:     its description says what the app does and when to use it; its text says to open it and how any app is operated, and holds the app's own know-how; chooses whether the agent sees it, and so may open it itself, or only the person does
process:   one per session; woken by a request to its word; lives while needed
install:   the directory among a harness's skills, for the person or in a project; an app keeps what it writes beside where
           it is installed
```

## Harness

```text
asks:      skills and a shell; an app uses nothing else of a harness: no hooks, no plugin, no registered tools, no entry per harness
session:   { harness, id, cwd }, read by bv from what the harness gives its shell, one variable per harness; what a session
           has open is kept by its id
subagent:  shares its session's shell and id, so it acts in the session's name; nothing tells it apart
sandbox:   bv wakes the runtime, so both run inside whatever the harness puts its shell in
adapters:  one per harness, the harness as it is, verified against one version; for tooling that runs a harness, as the playground does;
           no app imports them
```

A call is admitted against the view the session is offered, and an answer carries the change since the session was last answered. Agents that share a session share both.

## State and present

```text
state:     the surface's model, one per session, framework-persisted; written only by update
present:   compressed current state: whole at open, which may be run again; otherwise the diff against what the session was last answered
depth:     present names what can be read; the agent reads further through the app's word
history:   an optimisation for present and audit; never a contract
outlives:  what must outlive the session is not state: it is kept outside, in files or a service, and the model is what was last read from there
```

## Surface

```text
for:       the agent; the person interacts with it too, through the ui, by the same calls
owns:      domain decisions and operation status
state:     one model; only pure update writes it
views:     same domain object for every actor; offered handles may differ by actor; asks are offered to the person only
execution: serialized messages; concurrent commands; events return to the queue
admission: the caller's current view must offer the handle and accept its arguments, the fixed ones repeated
failure:   invalid call → refused; persistence inconsistency → the surface fails
agent:     present is the view at / and what changed since; the handles it is offered are its tools; no tool layer beside the surface
process:   the session's runtime, and nowhere else; a spec or a tool may run a surface in its own process, a harness never reaches one that way
tests:     at the boundary, as stories: actors bring the surface to a state by calls, an actor calls what its view offers,
           and the test asserts what each actor sees, is offered and is told; effects are settled by the test; the model is never read
```

The model commits before publication. Independent domain state is another surface.

## Runtime

```text
process:   one per session and app; one surface, addressed by the app's directory within the session's, owned exclusively
lifetime:  woken by bv when a request finds none up; exits when idle or told to close; drains before exit; a change in its code is
           loaded into the running process once nothing runs, or after a bounded wait that cuts what still runs, so its address
           and its open pages stay
address:   an instance takes the address its session last had, where that is free; the first answer names a new one, and the agent
           passes it on to the person
directory: started in the directory open was run in, and kept for the session
doors:     the app's door, scripts/open.ts, opens it in a session and puts its word in place: a link to bv, the one program
           behind every word. A view prints each handle as the command that calls it, under the app's word. Where the word is
           already another command's, the app answers to `bv NAME`, which every app does; bv alone lists what the session has open.
           The door takes the same requests and passes them on
requires:  a resident process, a file lock, loopback on this machine and a place for state the shell may write;
           where the harness's configuration denies them the app does not run, and the configuration is the person's to change
failure:   response lost after dispatch = uncertain outcome; read state before retrying; stopping effects does not undo them
http:      the surface's paths are the URLs; GET reads the view, POST calls a handle, GET accepting an event stream watches changes
           and hears each call as it is answered;
           plain text for the agent, JSON for a program, the app's page for a browser; /_/ is the page's own;
           only this machine's clients, by token
ui:        the framework serves a page and owns none; what a page is, is the shell's
page:      the session's; the agent hands its address to the person, and again when it changes; an open page finds a new instance
           at its address by itself, and loads again when the page's own code changes; no browser is opened for them
```

## Shell

```text
is:        the preset ui layer and application structure over the primitives; an app is built on the framework alone or on the shell
surface:   a shell of utils in tabs: home at / lists the utils and the open tabs, each tab with its util's facts at /, so what changes
           in a tab is in the agent's present; a util opens as a tab at /tabs/N, its surface under it, and the paths its views name
           under `at` are given whole; a util that is always open has one tab, from the start
page:      the shell page, with its design language and theming; a util brings its component and its icon
layouts:   every layout has the header, a menu bar with the util's menus and the layout's own controls;
           the workbench, toolbars of tools the person arranges around the open documents;
           the plain layout, the header and a page;
           the welcome page for a util with scopes, until one is open
```

## Authoring

```text
app:       baba, built on the shell; opened in the project where an app is being written
utils:     build, the app's brief and the steps of building it, always open; promptware, an app's promptware as the agent gets it;
           the playground
brief:     the agent writes it and records what the person answers; approving it is an ask; a change to it after that is approved
           again; kept in the app's directory
promptware: an app's promptware is its skill: the description, in context from the start where the skill shows it; the text, when opened;
           what open answers with. The promptware util shows each, with its size in characters and an estimate in tokens, the last computed by running the app's door
later:     the surface as a map in the promptware util; primitives for an app's settings page, where the person tunes its promptware the way
           the app intends, and the app nudges
skill:     one, with references: what an app is, and to start, design its surface and its page, try, diagnose and contribute
place:     a project's own apps live in skills/NAME and are installed in that project by links to them from the harness's skill
           folders, .claude/skills and .agents/skills; build makes the directory and the links
template:  the app a new one starts from: a shell of one util, always open, its page showing and offering a decision; its first spec a story
order:     each next babavoss is built and tried through the previous one, in its playground
```

## Playground

```text
scope:      an app; a project with several lists them first, a project that is one opens on it
preset:     assets/presets/<name>/ in the app, with assets/presets/<name>.md describing it; the agent writes them with the person; empty is always there
workspace:  made from a preset on the person's word, kept until they delete it, which moves it to the trash; never the project, never typed;
            one directory owns everything: files/ the agent works in, home/ the harness's own, state/ the app's;
            kept with the author's data, by app, so it outlives the session it was made in
run:        a child of its workspace, prompted by the person or by a scenario; one live at a time; a stopped one is resumed where it
            was, since the harness's record of it and the app's state are still in the workspace
only:       the agent has the app and nothing of the person's: the home is the workspace's, so no settings, skills, plugins or
            connectors of theirs, and a shell that reads none of their startup files, with the runtime's own bun first on its path
credentials: the one thing of the person's the agent has: a token from the runtime's environment when one is set; else, on macOS, a link in
            the workspace's home to their login keychain, nothing copied; for Codex their auth file copied in; elsewhere a token, set once
page:       the workbench: one workspace worked in at a time, picked and made from a preset at the toolbar's head, its sessions
            under it and the scenarios beside; the run in view, its trace as a chat with the composer under it, which says what
            the run is on and how full its context is, the app's page beside it, where it has one
trace:      debug-grade: every message from the user side, every call on the surface from the user side, everything the agent did and was shown;
            a line per step, the app's part marked: its skill as it was opened, the calls to its word read back as surface calls;
            what each model call read, as the harness measured it, and of it the app's part, estimated
setup:      the app's version is read at the run, not written in the setup; setups in scenarios/setups.yaml;
            the model and effort may be picked over a setup, from what its harness itself lists when asked, for the run in view
            from its next call and for the setup's next runs
scenario:   scenarios/<name>.ts in the app, written by the agent from the person's description; the framework types it, the author runs it;
            a message waits for the agent's turn to end; a call is made as the person, as the page would make it;
            one that names a preset needs its files, so a run makes its own workspace from it and replaces the one its last run made,
            so it repeats; one that names none goes on in the open workspace; either can be run fresh, or in a workspace picked
judgement:  the person's, watching; no graders, no judges, no scores
sandbox:    the harness's own for shell commands, with loopback open and the workspace's state writable, so bv can wake the app's
            runtime and reach it
kinds:      a workspace is local now; a container is the same directory mounted, when it comes
```

## Tooling

```text
stack:        TypeScript on Bun, which the machine must have: one tool runs the source, tests it and bundles the page
commands:     scaffold from template, run without a harness
install:      an app is installed and updated by whatever puts a skill's directory among a harness's skills; baba itself
              through skills.sh. The framework is released to npm with the product; an app takes a new one by raising the
              version it names
home:         where everything babavoss keeps is held: by session, what is open, and by app within it, its state and where its
              runtime listens. For an app installed for the person it is ~/.babavoss/, with bv and the app's word beside bun.
              For an app installed in a project it is the project's .babavoss/, which ignores itself in git, with the word
              at .babavoss/bin/NAME and called by that path: a project install writes nothing outside the project. A word
              knows its home from where it sits
packages:     an app installed as source has none; its door installs them with bun before it first opens, the framework
              among them, and says so only when that fails
framework:    one package on npm, babavoss, at the product's version: the core and the shell. An app depends on it at a
              pinned version and holds no copy; a fix goes upstream as a pull request
```

## Repository

```text
packages/babavoss        the framework, published to npm as babavoss; imported as babavoss/core/… and babavoss/shell/…
  core/                  the framework's layers
  shell/                 the shell; its page served from source, or as built
skills/baba              the product's skill: the authoring app; what is installed is exactly this directory
  SKILL.md  references/  its skill
  scripts/open.ts        its door
  assets/template/       the app a new one starts from
  src/  ui/              the authoring app's utils and its page
spec/                    the product's specs, mirroring its code; they are the repository's, and no install carries them
app:                     the unit every layer produces; built on the framework alone or on the shell; the authoring app is one
order:                   the framework, proven by an app, then the shell, then the authoring app, running in an agent outside the developing harness
versions:                one version for all of it: the package and the skill are released together; the authoring app's
                         know-how describes the framework at its own version
examples/payments        the example app, a month's payments matched to invoices, where usage patterns are worked out
excluded:                hooks and harness plugins, agent orchestration, harness configuration rewriting, generated agent instructions,
                         hosted services, npm
```
