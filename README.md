# babavoss

Roles your agent plays, each with a page for you. A role is a tool the agent works with: a surface it reads and acts on through a command, and a page where you watch and decide over the same surface. baba is the skill that makes and maintains them; babavoss is the framework they run on.

## Getting started

You need [Bun](https://bun.sh). In your project's directory, or in your home directory for roles in every project:

```sh
bunx github:alanremarc/babavoss init
```

This makes `.baba/`, where the roles' code lives, and gives your agent the skill baba. In a new session, ask for a role:

```text
/baba I want a role that matches each month's payments to our invoices.
```

The agent writes the role in `.baba/roles/`, tests it, and provisions it as a skill of its own. When a later babavoss is out, the agent is told as it works, and updates `.baba/`.

## Status

Early, and being reshaped. The design is in [docs/DESIGN.md](docs/DESIGN.md).

License: Apache 2.0.
