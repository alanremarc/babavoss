---
name: babavoss
description: Build an app your agent operates. Use when making, changing or trying a babavoss app, or software for an agent to run.
compatibility: Requires Bun 1.4 or later
---

Run `bun <the directory this file is in>/scripts/open.ts` from the project's directory. Its answer is the app.

If `bun` is missing, tell the person to install it with `curl -fsSL https://bun.sh/install | bash`. If the door says something must be allowed, pass that line to the person.

## Operating it

- An answer shows everything that is true now. Do not look for it in the app's code or in what it keeps on disk, and never change either to get something done.
- A line that ends in a description is an action offered now, printed as the exact command. Copy it and give a value where it says `name=string`. An action that is not printed is not offered.
- Every answer says what changed since you last looked, including what the person did on the page.
- A refusal gives its reason. Read again and act on what is offered; do not repeat the call.
- The person watches and acts on the page. Give them its address whenever the app names a new one.
- For more than a few calls of one kind, write one program with the command's `-e`: `app.read(path)`, `app.call(path, handle, args)` and `app.wait(seconds)`. Print each result and stop at the first refusal.

## Building an app

- agent-config: inspect the app's skill, references and computed open answer, with character counts and estimated token counts.
- playground: try the app in a workspace under a setup, by hand or with a scenario, and inspect the trace with the person.

Read the reference when its subject applies:

- [App](references/app.md): understand what an app owns before designing it.
- [Start](references/start.md): make an app from the template, install it or contribute a framework fix.
- [Surface](references/surface.md): design facts, handles, commands, asks and stories.
- [Page](references/page.md): design what the person sees and does; choose a shell layout.
- [Playground](references/playground.md): write presets and scenarios, try the task and inspect its trace.
- [Diagnosis](references/diagnosis.md): investigate a missing answer, refusal or unexpected state.
