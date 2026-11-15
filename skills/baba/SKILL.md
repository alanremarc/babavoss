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

1. Give the person the page address before anything else.
2. Agree with the person what the app is for: its job, the agent's part, what the person sees on the page and what they decide there. Ask what only they can decide.
3. Call `create` on the build tab. The app is made from the template in skills/NAME and installed in this project.
4. Open it with the command the build tab prints, and give the person its page before changing anything.
5. Replace the template's greeting with the app's own work, one step at a time, each ending in something the person can see on the page. A running app loads a change in its code by itself.

An app holds no framework: it runs on this skill's, in `framework/` here, and imports it as `babavoss/core/…` and `babavoss/shell/…`. Read the framework's code there rather than guessing its interfaces. Check an app with `bun check` and `bun test` from its directory.
