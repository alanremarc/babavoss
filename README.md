# Baba Voss

Baba is a work surface you share with your agent.

```text
           agent ◄───── state ─────► surface
             ▲                          │ ui
   ┌─────────┴─────────┐      ┌─────────▼─────────┐
   │ chat: the input   │      │ page: the face    │
   └─────────▲─────────┘      └─────────┬─────────┘
             │ ask                      │ see
             └────────── you ───────────┘
```

## Getting started

Copy this to your agent:

```text
Install babavoss in this project: read https://babavoss.org/llms.txt and follow it.
```

Then say what you want. "I want a surface…"

**Software development**
- …that tracks what still blocks the next release.
- …that lists every failing test with the commit that broke it.
- …where I approve your database migrations one by one.

**Running a business**
- …that matches each month's payments to our invoices.
- …that shows which subscriptions we pay for and when each renews.
- …that keeps every open customer request with who answers it.

**Research and writing**
- …that collects the papers we read, with your summary and my verdict.
- …that compares five interviews answer by answer.
- …that tracks each chapter's draft, its open questions and its sources.

The agent writes it in `.baba/surfaces/`, tests it and opens it as a tab. You can open a surface on the page too, and the agent takes it up. When a later babavoss is out, the agent is told as it works, and offers to update `.baba/`.

## Installing by hand

You need [Bun](https://bun.sh) 1.4 or later. In your project's directory, or in your home directory for surfaces in every project, name your agent's harness:

```sh
bunx github:alanremarc/babavoss init claude       # Claude Code
bunx github:alanremarc/babavoss init codex        # Codex
bunx github:alanremarc/babavoss init antigravity  # Antigravity
```

Name several for all of them. This makes `.baba/`, where the surfaces' code lives, and sets up each harness named beside it. A new session begins with the surfaces in view, on one page.

## Status

Early, and being reshaped. The design is in [docs/DESIGN.md](docs/DESIGN.md).

License: Apache 2.0.
