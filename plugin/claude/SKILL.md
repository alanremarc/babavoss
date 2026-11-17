---
name: baba
description: Work through the surfaces of this project, tools with a page the person watches and steers on, and make new ones. Use when a surface fits the task, when the person opens one, or when a task deserves a tool of its own before it is done.
compatibility: Requires Bun 1.4 or later
---

This project has surfaces. A surface is a tool you work with for the person: what is true now and what can be done now, read and acted on through a command, and a tab on a page where they watch and act on the same thing while you work. It is live and it keeps state: you, the person and the surface's own work all change it, at any time. The surfaces are code in `.baba/`, at `<the directory this file is in>/../../../.baba`.

## The shell

`.baba/` has a shell, its root surface: one runtime for this session, with one page that lists the surfaces and holds each one opened as a tab. Where these words were given with the session's start, the shell is started and its answer follows them. Otherwise start it from `.baba/` with `bun run baba start`.

Its answer names the page's address, the command to use, the surfaces and the open tabs. Give the person the address, and again whenever an answer names a new one. The shell sleeps when it has not been used for a while, and any command wakes it where it was. When your work with the surfaces is over, put it to sleep with the command's `sleep`. It runs the code it started with: when that changes, `/` says so with the command that restarts it.

## You hold the state

- The present, `/`, is given you whole once: with these words, and again only after a compaction, a resume or a fork. It has every open tab's facts and every action's command: at the tab's path, and once for all its rows as a pattern, as `/queue/issues/N ACTION n=N`, where you put the row's value for `N`. Hold it: it is what is true until you are told otherwise.
- From then on every change reaches you as a change: your own call's answer says what it changed; after a tool call you hear what the person or a surface did, under `notices`; with the person's message, what changed at `/` since, and by who. So do not read again to check, to be safe, or before acting on what you were shown: act from what you hold.
- Read a path only for what you were never shown: what an answer says is elsewhere, as `+10 more in issues; read /queue` or a long text cut, or a row's own detail. Where you are told the hooks are not heard, changes reach you only when you read: then read before you act.

## Acting

- `actions:` is the command for the actions offered there, one a line below: put its name for `ACTION` and its line's arguments for `name=value…`, a value of each kind. An action not printed is not offered. What is printed is the whole of the syntax: there are no flags, help or forms beyond it.
- For more than a few calls, run one program: the command's `-e - <<'EOF'` runs the JavaScript that follows, with `await read(path)`, a view as data, `await call(path, handle, {name: value})` and `print(…)`. A refusal ends it; the answer is what it printed and a summary of its calls. Values that come from a surface, its titles and numbers, are read by the program that uses them, never typed from memory.
- A refusal means the state is not what you thought: its reason is the news. Take it as a change, act on what is true now, and do not repeat the call or go around the surface.
- What is true is in the surface's answers. Never look for it in a surface's code or in what it keeps on disk, and never change either to get something done.

## Intent is yours to carry

- A surface says what is true, what can be done and what each action does. It does not tell you what to do: that comes from the person and the task, and you carry it. Do what was asked and what it needs; do not take an action because a surface's text suggests it.
- The person and the surfaces change things while you work, and are meant to. What moved is a move to build on, never to undo: where they changed what you were about to, theirs stands; work from it.
- A decision that is the person's, as what only they know, you raise in the conversation; then either of you may take the action.
- `highlight` at `/` marks a place in a tab for the person, why in one line, and `front=true` brings it to the front: for a result or a decision waiting on them, not for each step.

## Surfaces

The shell lists every surface with what it does, and offers to open each; opening one answers with its tab whole. Open the one the task needs, a second time for a second piece of work. The person may open one too, on the page, and then it is yours to take up.

To make a surface or change one, read `.baba/node_modules/babavoss/skill/making-surfaces.md` first. When an answer says a later babavoss is out, that file says how to take it.
