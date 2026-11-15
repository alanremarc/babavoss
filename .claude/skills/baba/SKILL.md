---
name: baba
description: Work through the surfaces of this project, tools with a page the person watches and steers on, and make new ones. Use when a surface fits the task, when the person opens one, or when a task deserves a tool of its own before it is done.
compatibility: Requires Bun 1.4 or later
---

This project has surfaces. A surface is a tool you work with for the person: what is true now and what can be done now, read and acted on through a command, and a tab on a page where they watch and decide over the same thing. The surfaces are code in `.baba/`, at `<the directory this file is in>/../../../.baba`.

## The root

`.baba/` has a root: one runtime for this session, with one page. Its first tab is the picker, which lists the surfaces; each surface is opened beside it as a tab. Where this session began with these words, the root is started and its answer follows them. Otherwise start it from `.baba/` with `bun run baba start`.

Its answer names the page's address, the command to use, the surfaces and the open tabs. Open the page in the harness's browser if it has one, and otherwise give its address to the person; do so again whenever an answer names a new address. The root sleeps when nothing has called it for a while, and any command wakes it where it was, its tabs and their state kept. There is nothing to keep running.

## Working with it

- An answer shows what is true now. Do not look for it in a surface's code or in what it keeps on disk, and never change either to get something done.
- A line that ends in a description is an action offered now, printed as the exact command. Copy it and give a value where it says `name=string`. An action that is not printed is not offered.
- A fact named `at` is a path with more behind it: read it with the command for its detail and the actions offered there. A tab's actions are offered at the tab's path, not at `/`.
- You are told what changed since you last looked, with the person's messages and as you work: what they did on the page, and what the surfaces did. What is told that way is the root at `/`; read a tab's path for the rest.
- A refusal gives its reason. Read again and act on what is offered; do not repeat the call.
- For more than a few calls of one kind, write one program with the command's `-e`: `root.read(path)`, `root.call(path, handle, args)` and `root.wait(seconds)`. Print each result and stop at the first refusal.

## Surfaces

The root lists every surface with what it is for, and offers to open each. Open the one that fits the task, a second time for a second piece of work. The person may open one too, on the page, and then it is yours to take up. A surface has no instructions but its own: what an open tab says is what is true in it and how it is to be worked. Read it before acting in it.

To make a surface or change one, read `.baba/node_modules/babavoss/skill/making-surfaces.md` first. When an answer says a later babavoss is out, that file says how to take it.
