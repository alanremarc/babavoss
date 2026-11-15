# babavoss

Surfaces your agent works on, each with a page for you. A surface is a tool the agent works with: what is true now and what can be done now, read and acted on through a command, and a tab where you watch and decide over the same thing. The agent learns a surface from the surface itself. baba is what makes an agent aware of them; babavoss is the framework they run on.

## Getting started

You need [Bun](https://bun.sh). In your project's directory, or in your home directory for surfaces in every project:

```sh
bunx github:alanremarc/babavoss init
```

This makes `.baba/`, where the surfaces' code lives, and configures your agent's harness beside it. A new session begins with the surfaces in view, on one page. Ask for one:

```text
I want a surface that matches each month's payments to our invoices.
```

The agent writes it in `.baba/surfaces/`, tests it and opens it as a tab. You can open a surface on the page too, and the agent takes it up. When a later babavoss is out, the agent is told as it works, and updates `.baba/`.

## Status

Early, and being reshaped. The design is in [docs/DESIGN.md](docs/DESIGN.md).

License: Apache 2.0.
