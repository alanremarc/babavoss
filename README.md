# babavoss

Surfaces your agent works on, each with a page for you.

A surface is a small tool made for one job in your project: what is true now, and what can be done now. Your agent reads it and acts on it through a command. You watch the same thing in a tab on a page, and can act on it there too. The agent learns a surface from the surface itself, so there is nothing to explain to it twice.

## Getting started

You need [Bun](https://bun.sh) 1.4 or later, and a coding agent: Claude Code or Codex.

Copy this to your agent, in the project you want it in:

```text
Install babavoss in this project.

babavoss gives a project surfaces: small tools you work with through a command, while I watch
and act on the same thing on a page.

1. Check that Bun is 1.4 or later: bun --version
2. From the project's root, run: bunx github:alanremarc/babavoss init
   It makes .baba/, installs the framework in it, and sets up this harness beside it.
3. Read .baba/node_modules/babavoss/skill/SKILL.md. It says how surfaces are worked.
4. Start the shell: cd .baba && bun run baba start
   Give me the address of the page it prints.
5. Tell me what was set up. A new session of this harness begins with the surfaces in view,
   and is told what changes on them as we work.

Do not make a surface yet. I will say what I want next.
```

Then say what you want, in your own words:

```text
I want a surface that matches each month's payments to our invoices.
```

The agent writes it in `.baba/surfaces/`, tests it, and opens it as a tab.

## What you see

One page for the session, at an address on your own machine.

- **Tabs.** Each open surface is a tab on a rail at the side of the page, or along the top or bottom if you prefer.
- **Highlights.** When the agent, or a surface, has something you should look at, its tab gets a dot and a short bubble. Nothing else interrupts you.
- **A drawer for each tab.** It lists the surface's actions, and under them a log of who did what: you, the agent, or the world outside. Highlights are shown; the rest is folded until you open it.
- **Settings.** Theme, where the tabs stand, motion, text size. They are yours, the same in every project.

## Working with it

The conversation with your agent leads. Ask for what you want there; the agent does it on the surface and you see it happen.

You can also act on the page. Everything a surface offers is offered to both of you, and the agent is told what you did, so it builds on your change and does not undo it. A decision that is yours, the agent raises in the conversation.

A surface says how it works, never what the agent should do with it. If you want a standing habit, such as keeping a list current as work moves, write it in your project's own instructions to its agent:

```text
Keep the queue surface true as the work moves: add an issue for what I ask for, and mark it
done once it is merged.
```

## Changing and updating

Surfaces are plain code in `.baba/surfaces/`, kept in your repository. Ask the agent to change one as you would any other code.

- A running session keeps the code it started with. The agent restarts it to take a change, or you set `dev: true` in `.baba/baba.config.ts` while surfaces are being made, and each change restarts it at once.
- When a later babavoss is out, the agent is told as it works. It takes the release and adapts your surfaces by the changelog.

## Status

Early, and still changing between releases. Every release says what to adapt in [CHANGELOG.md](CHANGELOG.md).

It is built and measured with Claude Code. Codex is set up too, but that path is written from Codex's documentation and has not been proven against it.

The design is in [docs/DESIGN.md](docs/DESIGN.md).

License: Apache 2.0.
