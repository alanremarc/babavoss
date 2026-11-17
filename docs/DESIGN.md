# BabaVoss

A framework for surfaces. A surface is a tool an agent works with for a person: the agent reads and acts on it through a command, the person watches and acts on it on a page. Both see the same thing, and both change it. A project's surfaces are code in `.baba/`. The shell is the desktop they run on.

## Architecture

### The whole

```text
                          person
             talks │                  │ watches, acts
    ┌─ harness ────┴──────┐   ┌─ page ┴─────────────────┐
    │        agent        │   │ shell ui                │
    │                     │   │  ├─ surface ui          │
    └──┬───────────▲──────┘   │  └─ surface ui          │
       │ command   │ hooks    └──┬───────────▲──────────┘
       │ actions   │ present     │ actions   │ views
    ┌──▼───────────┴─────────────▼───────────┴──────────┐
    │ runtime, one per session                          │
    │   shell ─┬─ surface                               │
    │          └─ surface                               │
    └───────────────────────────────────────────────────┘
```

```text
person     Asks and decides.
agent      Does the work.
harness    Hosts the agent: Claude Code, Codex.
session    One conversation of the harness.
runtime    Holds the surfaces of a session: one state, changed by either side.
page       Shows the same surfaces to the person, at one address per session, opened by the link the agent gives:
           the session's key, kept by the browser, so it outlives a restart.
```

### A surface

```text
              ┌─ surface ───────────────────────┐
              │  view at /         view at /a/1 │
   agent ─────┤    facts             facts      ├───── ui ───── person
   reads,     │    actions           actions    │      shows,
   calls      │    ask ·····························►  only the person
              │                                 │
              │  update ──► notice ─────────────┼──► both, once
              └─────────────────────────────────┘
```

```text
surface    What is true now and what can be done now, as a program. Shared and live.
view       What a surface says at a path: facts, and the actions offered there.
action     Something that can be done now, by the agent or the person.
ask        An action only the person may take; the agent waits for it.
fact       What stands: true until the surface says otherwise.
notice     What happened: one line an update gives, told once to each side, kept in no view.
ui         A surface's part of the page: its views, shown to the person.
```

### The shell

```text
   ┌─ shell ─────────────────────────────────────────────┐
   │  tab ── surface        ┐                            │
   │  tab ── surface        ├─ each with its ui,         │
   │  tab ── surface        ┘  built with the kit        │
   │                                                     │
   │  home · attention · notifications · turn · addresses│
   │  activity · frame · theme · settings · health       │
   └───────▲──────────┬──────────────────────┬───────────┘
           │          │ present,             │ rail and drawers,
   a surface speaks   │ for the agent        │ for the person
   to the shell:
     facts at /   title, attention, broken
     notices      what happened
```

```text
shell      The root surface, from the framework: the desktop. It holds every other surface as a tab.
tab        An open surface; the same surface may be open in several.
rail       The tabs, at a side of the page the person chooses; home's mark first, the newest beside it.
drawer     A tab's panel, home's too: its menu drawn from its views, over its activity as a thread.
kit        What pages are built with: primitives and theming tokens; it follows the conventions unasked.
conventions  How the person wants pages to be, from their settings and the machine: motion, text scale, a sidebar's side,
           where the rail stands, the mode. Handed to every page, which follows them by its own code; expected, never enforced.
border     What a project may import: the framework's entries, core/index.ts for a surface, kit/index.ts and
           shell/ui/index.tsx for a page; nothing else resolves.
present    The shell at /: every open tab's facts.
```

What the shell offers, it offers twice: on the page for the person, in the present for the agent.

```text
home            the mark on the rail: a desktop of the surfaces, or the project's own home.tsx; its drawer the shell's own
attention       a surface says who it needs, and why: a dot on its tab, the why pinned in its drawer; first in the present
notifications   every notice: a bubble beside its tab for a moment, kept in the tab's thread; one line for the agent
turn            whose move it is, said by the mark: its eyes look about while the agent works
addresses       every place has a link, a tab by its surface's name, and the agent can point the person to it
activity        who did what, kept with each tab and going with it: in its drawer; read on demand by the agent
frame           title, menus and a surface's actions, in the same place for every surface: a tab's drawer
theme           tokens every page uses, derived from a hue: a preset or the person's own, per mode if they wish
settings        the person's own, the same in every session and project: appearance, where the tabs stand, the preferences pages
                follow by convention, shortcuts, the mark's motion
health          what is broken, and why; a page that lost its runtime says so and finds it again
```

### A turn

```text
   session starts ── hook ──► baba's words + the whole present ──────────► agent
   resumed, compacted ── hook ──► the words in short + the whole present ─► agent

   agent ── baba ──► action ──► surface changes ──► page follows ────────► person

   person ── page ──► action ──► surface changes ─┬─ notice ── hook, after a tool call ──► agent, at once
                                                  └─ what changed, and by whom ── hook, with their message ──► agent
```

State at boundaries, events in the flow.

```text
             session start   on demand   the person's message   during work
present      whole           whole       what changed           nothing
notices      none yet        yes         yes                    yes
```

```text
baba       The command the agent reads and acts with; and the words that teach it to.
hook       Where the harness lets context in: at a session's start, with each message, after each tool call. It adds, and never blocks.
skill      The same words where a harness has no hooks, and the way back in.
adapter    The one place that knows a harness: how to set it up, start a session in it, and read its stream. A hook
           names its adapter, so a runtime knows which harness its agent runs in.
```

### A project

```text
   project/
   ├─ .baba/                      the surfaces' package: it names the framework
   │   ├─ surfaces/NAME/
   │   │   ├─ src/surface.ts      the surface
   │   │   ├─ ui/index.tsx        its ui
   │   │   └─ spec/               its rules
   │   └─ baba.config.ts          optional: the project's title, and how each harness is set up
   ├─ .claude/ · .codex/ …        the harnesses, set up from .baba/: the hooks, baba's words
   └─ .babavoss/                  what sessions keep
```

```text
.baba/     A project's surfaces. One command makes it; the shell is not in it.
framework  One version, named in .baba/. The agent is told of a later one, takes it, and adapts the surfaces.
```

## Agent, surface, person

```text
shared    both act on the surface, at any time. A change by the person is a move to take up, never to undo
learned   a surface is all an agent learns of it: its description to choose it, its views to work it
dynamic   a surface made, changed or removed runs once the shell restarts: at once in dev mode, else when the agent
          restarts it, the present saying the code changed until then
soft      hooks add context and never block; hard limits stay the person's, in the harness
```

## Lab

A surface of this repository. An agent that built something drives an agent that uses it, on a copy of the project as it is now, and reads everything that entered its context. The person watches both.

## Later

```text
evals      scripted scenarios in the lab, scored on tokens and on what the agent did
wrapper    a harness the page can start a turn in, through the adapter
codex      its adapter is written from Codex's documents; run it against the real one
systems    the mode of the machine is read on macOS only; an adapter each for the others
```
