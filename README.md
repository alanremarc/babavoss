# Baba Voss

Surfaces you and your agent work on together.

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

Then ask for a surface:

```text
I want a surface that matches each month's payments to our invoices.
```

The agent writes it in `.baba/surfaces/`, tests it and opens it as a tab. You can open a surface on the page too, and the agent takes it up. When a later babavoss is out, the agent is told as it works, and updates `.baba/`.

## Status

Early, and being reshaped. The design is in [docs/DESIGN.md](docs/DESIGN.md).

License: Apache 2.0.
