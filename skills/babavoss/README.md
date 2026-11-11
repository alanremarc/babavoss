# babavoss

The authoring app for software that agents operate.
Requires Bun 1.4 or later.
Install with `bunx skills add alanremarc/babavoss -g`.
Ask the agent to use SKILL.md in the project's directory.
The agent opens it with `bun <the directory this file is in>/scripts/open.ts` and follows what it answers.
promptware shows an app's skill, references and open answer with their sizes; the playground tries tasks with the person.
Each app copies framework/ from this directory.
