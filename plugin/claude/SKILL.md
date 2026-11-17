---
name: baba
description: Work through the surfaces of this project, tools with a page the person watches and steers on, and make new ones. Use when a surface fits the task, when the person opens one, or when a task deserves a tool of its own before it is done.
compatibility: Requires Bun 1.4 or later
---

This project has surfaces. A surface is a tool you work with for the person: what is true now and what can be done now, read and acted on through a command, and a tab on a page where they watch, decide and act on the same thing while you work. The surfaces are code in `.baba/`, at `<the directory this file is in>/../../../.baba`.

## The shell

`.baba/` has a shell, its root surface: one runtime for this session, with one page, the desktop that lists the surfaces and holds each one opened as a tab. Where this session began with these words, the shell is started and its answer follows them. Otherwise start it from `.baba/` with `bun run baba start`.

Its answer names the page's address, the command to use, the surfaces and the open tabs. Open the page in the harness's browser if it has one, and otherwise give its address to the person; do so again whenever an answer names a new address. The shell sleeps when it has not been used for a while, and any command wakes it where it was, its tabs and their state kept. There is nothing to keep running: when your work with the surfaces is over, put it to sleep with the command's `sleep`. It runs the code it started with: when that changes, `/` says so with the command that restarts it, unless `.baba/baba.config.ts` sets `dev: true`, and then it restarts at once by itself.

## Working with it

- An answer shows what is true now. Do not look for it in a surface's code or in what it keeps on disk, and never change either to get something done.
- A line that ends in a description is an action offered now, printed as the exact command. Copy it and give a value where it says `name=string`. An action that is not printed is not offered.
- A fact named `at` is a path with more behind it: read it with the command for its detail and the actions offered there; a path also reads one fact of the view above it, as `/queue/issues`. At `/` each open tab is a heading: its path, its title and its number. The path is `/NAME`, its surface's name, for the tab that holds it, and `/tabs/N` for a second tab of one; its facts are under it, what it calls detail counted, its actions by name, and their commands at its path. A path by the name works on after the person closes the tab and opens it again: write that one down.
- `highlight` at `/` marks a place in a tab for the person, why in one line: their page marks the tab until they look, and `front=true` brings it to the front. Mark a result or a decision waiting on them, not each step.
- A surface is shared and live: the person acts on the page while you work, and is meant to, and a surface's own work changes it too. What moved between two looks is that, not an error or a stale read.
- As you work you hear what just happened, under `notices`, one line each and once: what a surface reports, and where the person acted. Read there if it bears on your work. A `highlight` line, first, is one a surface marked for the person.
- With the person's message you are told what changed at `/` since you were last told it, by who: the person or a surface; a row by its path or name, with only what changed. What your own calls did is never told back: their answers said it; and what a notice said is not told again. A tab you neither read nor called in this turn or the last is one line: read it there. What is cut says where to read it whole. Reading `/` gives the present whole again, and what changed counts from there.
- `/activity` has who did what in this session, newest first, with what the surfaces said: read it first to catch up after a break or a compaction.
- What the person did is a move to take up and build on, never to undo or overwrite. Where they changed what you were about to, theirs stands: read again and work from it.
- A refusal gives its reason, which may be that the person or the surface moved first. Read again and act on what is offered; do not repeat the call.
- For more than a few calls, run one program: the command's `-e - <<'EOF'` runs the JavaScript that follows, with `await read(path)`, a view as data, `await call(path, handle, {name: value})` and `print(…)`. A refusal ends it; the answer is what it printed and a summary of its calls.

## Surfaces

The shell lists every surface with what it is for, and offers to open each. Open the one that fits the task, a second time for a second piece of work. The person may open one too, on the page, and then it is yours to take up. A surface has no instructions but its own: what an open tab says is what is true in it and how it is to be worked. Read it before acting in it.

To make a surface or change one, read `.baba/node_modules/babavoss/skill/making-surfaces.md` first. When an answer says a later babavoss is out, that file says how to take it.
