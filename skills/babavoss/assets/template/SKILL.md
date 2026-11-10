---
name: NAME
description: Do WHAT for WHO. Use when TASK is needed.
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
