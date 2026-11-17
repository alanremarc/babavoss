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
page       Shows the same surfaces to the person, at one address per session, opened as it is by a browser of this
           machine; what another site starts there is refused, but a link to the page.
```

### A surface

```text
              ┌─ surface ───────────────────────┐
              │  view at /         view at /a/1 │
   agent ─────┤    facts             facts      ├───── ui ───── person
   reads,     │    actions           actions    │      shows,
   calls      │    whose decision: said in the view, raised in the conversation
              │                                 │
              │  update ──► notice ─────────────┼──► the log; the agent, once
              │              highlight ─────────┼──► the person: a bubble, a dot
              └─────────────────────────────────┘
```

```text
surface    What is true now and what can be done now, as a program. Shared and live.
view       What a surface says at a path: facts, and the actions offered there.
action     Something that can be done now, offered alike to the agent and the person.
fact       What stands: true until the surface says otherwise.
notice     What happened: one line an update gives, kept in its entry of the log and told once to the agent; in no view.
highlight  A notice marked important to the person, by its surface or by the agent: a bubble, and a dot on its tab
           until they open its drawer.
ui         A surface's part of the page: its views, shown to the person.
```

### The shell

```text
   ┌─ shell ─────────────────────────────────────────────┐
   │  tab ── surface        ┐                            │
   │  tab ── surface        ├─ each with its ui,         │
   │  tab ── surface        ┘  built with the kit        │
   │                                                     │
   │  home · highlights · turn · addresses · activity    │
   │  frame · theme · settings · health                  │
   └───────▲──────────┬──────────────────────┬───────────┘
           │          │ present,             │ rail and drawers,
   a surface speaks   │ for the agent        │ for the person
   to the shell:
     facts at /   title, broken
     notices      what happened; a highlight what the person should see
```

```text
shell      The root surface, from the framework: the desktop. It holds every other surface as a tab.
tab        An open surface; the same surface may be open in several.
rail       The tabs, at a side of the page the person chooses; home's mark first, the newest beside it.
drawer     A tab's panel, home's too: its menu drawn from its views, over its activity as a thread: its highlights,
           everything else folded between them; home's also opens the closed tabs, read only.
kit        What pages are built with: primitives and theming tokens; it follows the conventions unasked.
conventions  How the person wants pages to be, from their settings and the machine: motion, text scale, a sidebar's side,
           where the rail stands, the mode. Handed to every page, which follows them by its own code; expected, never enforced.
border     What a project may import: the framework's entries, core/index.ts for a surface, kit/index.ts and
           shell/ui/index.tsx for a page; nothing else resolves.
present    The shell at /: every open tab's facts and actions, each with its command, a list's rows' as one pattern.
```

What the shell offers, it offers twice: on the page for the person, in the present for the agent.

```text
home            the mark on the rail: a desktop of the surfaces, or the project's own home.tsx; its drawer the shell's own, with the closed tabs under its thread
highlights      what the person should see, raised by a surface or by the agent: a bubble beside the tab for a moment, a
                dot on it until its drawer is opened, standing out in its thread
turn            whose move it is, said by the mark: its eyes look about while the agent works
addresses       every place has a link, a tab by its surface's name, and the agent can highlight it and bring it to the front
activity        a log of actions, for auditing and not replay: who, the person, the agent or the world; what was called,
                with its inputs; done, or refused and why; the surface's lines about it. Kept with each tab in its own
                log: in its drawer; read on demand by the agent; a closed tab's, read only, at /activity/closed
frame           title, menus and a surface's actions, in the same place for every surface: a tab's drawer
theme           tokens every page uses, derived from a hue: a preset or the person's own, per mode if they wish
settings        the person's own, the same in every session and project: appearance, where the tabs stand, the preferences pages
                follow by convention, shortcuts, the mark's motion, how long closed tabs are kept; and clearing them
health          what is broken, and why; a page that lost its runtime says so and finds it again
```

### A turn

```text
   session starts ── hook ──► baba's words + the whole present ──────────► agent
   resumed, compacted ── hook ──► the same words + the whole present ─────► agent

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
baba       The command the agent reads and acts with, one call at a time or as one program of many, answered by one
           summary; and the words that teach it to.
hook       Where the harness lets context in: at a session's start, with each message, after each tool call. It adds, and never blocks.
skill      The same words where a harness has no hooks, and the way back in.
adapter    The one place that knows a harness: how to set it up, start a session in it, and read its stream. A hook
           names its adapter, so a runtime knows which harness its agent runs in.
wake       Every request wakes the runtime with a strength: a session's start weakly, a few minutes; the person's message,
           the agent's command and the person's action strongly, half an hour; a page that only watches, not at all. It
           sleeps, its state kept, once the furthest is spent and nothing runs, or at once when the agent says `sleep`
           at the end of its work; the session's end leaves a minute. Any command wakes it; the page never does.
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
   └─ .babavoss/                  what sessions keep: each tab's state and log, closed tabs read only, cleared by a rolling window
```

```text
.baba/     A project's surfaces. One command makes it; the shell is not in it.
framework  One version, named in .baba/. The agent is told of a later one, takes it, and adapts the surfaces.
```

## Agent, surface, person

```text
shared    both act on the surface, at any time. A change by the person is a move to take up, never to undo
learned   a surface is all an agent learns of how it works: its description to choose it, its views to work it; never
          what to do, which the person and their instructions say
dynamic   a surface made, changed or removed runs once the shell restarts: at once in dev mode, else when the agent
          restarts it, the present saying the code changed until then
soft      hooks add context and never block; a surface offers both sides the same and locks nothing: what is the
          person's, the agent asks for in the conversation; hard limits stay the person's, in the harness
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
