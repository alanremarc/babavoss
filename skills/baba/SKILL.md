---
name: baba
description: Build an app your agent operates. Use when making, changing or trying a babavoss app, or software for an agent to run.
compatibility: Requires Bun 1.4 or later
---

Run `bun <the directory this file is in>/scripts/open.ts` from the project's directory. Its answer is the app.

If `bun` is missing, tell the person to install it with `curl -fsSL https://bun.sh/install | bash`. If the door says something must be allowed, pass that line to the person.

## Operating it

- An answer shows everything that is true now. Do not look for it in the app's code or in what it keeps on disk, and never change either to get something done.
- A line that ends in a description is an action offered now, printed as the exact command. Copy it and give a value where it says `name=string`. An action that is not printed is not offered.
- A fact named `at` is a path with more behind it: read it with the command for its detail and the actions offered there. Where the app has tabs, a tab's actions are offered at the tab's path, not at `/`.
- Every answer says what changed since you last looked, including what the person did on the page.
- A refusal gives its reason. Read again and act on what is offered; do not repeat the call.
- The person watches and acts on the page. Give them its address whenever the app names a new one.
- For more than a few calls of one kind, write one program with the command's `-e`: `app.read(path)`, `app.call(path, handle, args)` and `app.wait(seconds)`. Print each result and stop at the first refusal.

## Building an app

The build tab is open from the start, and its `next` says what remains to do. Work in this order:

1. Give the person the page address before anything else. They follow the brief there while you write it.
2. Write the brief from what the person asked, before any code: the app's job in one sentence, the agent's part, what the person sees on the page, what they decide there, and what the app needs from outside. The person changes things by telling the agent; the page shows what is true and offers only the decisions that are theirs.
3. Decide what you sensibly can. What only the person can decide, such as which service or account to use, what must not happen without them, or what the page is for, note as a question, ask it in chat and record the answer. Do not guess those.
4. Wait for the person to approve the brief on the page. Approving is theirs. If they want it changed, change the brief and wait again.
5. Create the app. It runs at once, from the template: open it and give the person its page before you build anything.
6. List the steps of building it, each ending in something the person can see on the app's page. Do one at a time, mark it, and tell the person in a line what to look at.
7. Before you say it is done, try the first task in the playground with a scenario and look at the trace with the person.

To change an app that has a brief, change the brief first; a change to what was approved is approved again.

The other utils:

- promptware: read the app's skill, its references and its computed open answer as the agent gets them, each with its size in characters and estimated tokens.
- playground: try the app in a workspace under a setup, by hand or with a scenario, and inspect the trace with the person.

Read the reference when its subject applies:

- [App](references/app.md): understand what an app owns before designing it.
- [Start](references/start.md): make an app from the template, install it or contribute a framework fix.
- [Surface](references/surface.md): design facts, handles, commands, asks and stories.
- [Page](references/page.md): design what the person sees and does; choose a shell layout.
- [Playground](references/playground.md): write presets and scenarios, try the task and inspect its trace.
- [Diagnosis](references/diagnosis.md): investigate a missing answer, refusal or unexpected state.
