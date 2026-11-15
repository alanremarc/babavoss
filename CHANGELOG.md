# Changelog

What each version of babavoss changed, newest first. A release is the tag vX.Y.Z of this repository; a project's `.baba/` names one. Versions follow semantic versioning and are set by hand, in `package.json`, in the commit that makes the change. An agent reads this after taking a release, from the version its roles ran on up, to adapt them.

## 0.21.0

- What the agent operates is a role, no longer an app. A project's roles are code in its `.baba/` directory: a Bun package that names the framework, `"babavoss": "github:alanremarc/babavoss#v0.21.0"`, with one directory per role under `roles/`.
- The package has a command, `baba`. `baba init` makes `.baba/` in a directory, installs the framework and provisions; `baba new NAME` makes a role from the template; `baba provision` writes the skills.
- Provisioning gives each role to the harnesses as a skill beside `.baba/`, in `.claude/skills/NAME` and `.agents/skills/NAME`: one generated SKILL.md, made of the role's `ROLE.md` and the part that is the same for every role, how to open and operate it. Installing in `.baba/` provisions, so a clone has its skills after `bun install`.
- baba, the skill that maintains `.baba/`, is provisioned with the roles from the framework's own package, so it is always the one for the framework in use. It is no longer installed with `bunx skills add`.
- Provisioning also writes the framework's hook into Claude Code's `.claude/settings.json`, for SessionStart, UserPromptSubmit and PostToolUse, beside the person's own settings and hooks. It adds context and blocks nothing: at a session's start, which roles the session has open; with the person's message and after a tool call, what changed in an open role since the session last read it.
- A `.baba/` has a root, with or without roles: one runtime and one page for the session, which the framework provides. Its first tab lists the roles, and each role is a tab of it, opened the first time its skill is used. `baba start` starts it, and so does the hook when a session starts; its answer is the framework's version, its page's address, the roles and the open tabs.
- A role is a surface and a component: `src/role.ts` default-exports the surface, `ui/index.tsx` the component shown in its tab. It has no door, no page of its own and no runtime of its own. Its skill names one command, `baba role NAME`, which opens its tab where it has none and answers with what is true there.
- A session that starts under the hook is given what invoking the skill baba gives: its text, and the root started.
- A new page address is now told with: open it in the harness's browser if it has one, and otherwise give it to the person.
- A role's door says when a later babavoss is out, with the command that takes it. The repository is asked at most once a day.
- A role keeps what it writes beside its `.baba/`: in `~/.babavoss/` for roles in the person's home, in the project's `.babavoss/` otherwise.
- Gone, until the design settles: the authoring app with its build, promptware and playground utils, the agent launcher and the harness adapters, scenarios, the references, the payments example.
- To move an app from 0.20.0: run `bunx github:alanremarc/babavoss init` in the project, move the app's `src/`, `ui/` and `spec/` into `.baba/roles/NAME/`, export its util's surface as the default of `src/role.ts` and its util's component as the default of `ui/index.tsx`, delete its door and its page's own index.html, main.tsx and styles.css, write its SKILL.md's frontmatter description and its own part as `ROLE.md`, delete its package.json, tsconfig.json and installed copies among the skills, and run `bun run baba provision` in `.baba/`.

## 0.20.0

- The version follows on from the framework's earlier releases on npm, which ended at 0.19.1; the product had been 0.2.0. The framework is no longer released to npm.
- The skill is named baba; babavoss is the framework. Install the skill with `bunx skills add alanremarc/babavoss`; its command is `baba`.
- An app no longer holds a copy of the framework. It names a release of it in its package.json, `"babavoss": "github:alanremarc/babavoss#v0.20.0"`, and imports it as `babavoss/core/…` and `babavoss/shell/…`.
- An app's door installs what the app depends on before it first opens, and says so only when that fails: what to allow, and how to install by hand.
- The framework an app depends on follows this skill: a new app names this skill's version, and this skill says once when an app it works on names an older one.
- The page's packages are installed by the door, no longer when the page is first asked for.
- To move an app from 0.2.0: delete its `framework/`, replace the `imports` entry in its package.json with `"babavoss": "github:alanremarc/babavoss#v0.20.0"` under `dependencies`, name what its page imports there too (react, react-dom), write `babavoss/` for `#babavoss/` in its imports and stylesheet, and take scripts/open.ts from the template.

## 0.2.0

- A build tab is open from the start. The agent writes the app's brief there before any code, asks what only the person can decide, and waits for the person to approve the brief on the page. The app is then made from the template with one action, and its page runs before the first step is built.
- A project's own apps live in `skills/NAME`. Build makes a new app there and installs it in the project by links from `.claude/skills` and `.agents/skills`.
- The template is a shell app of one util that is always open. Its page shows the surface and offers one decision; it has no form.
- In a shell, the agent is told at `/` what changes in any tab, paths named under `at` are given whole, and a util can be always open.
- An action can be declared an ask, offered to the person only.
- agent-config is now promptware: a list of the description, SKILL.md, the open answer and the references, in the order they reach the agent, with the one in view rendered beside it.
- A running app loads a change in its code in place: the process, its address and the person's open page stay, and code that does not load leaves the code before it running. An open page loads again by itself when the page's own code changes.
- A runtime that was asleep wakes at the address its session last had.
- A shell page has one stylesheet, the app's; the build says so when it is missing.
- The authoring app lists a folder as an app only where it has both SKILL.md and scripts/open.ts.
- An app that still holds the 0.1.0 framework runs as before: it ends when its code changes and is woken by the next call. To take the new behaviour, replace its `framework/` with this version's and adapt the app, as the start reference says. In a shell app, what a wrapper did to sum up tabs at `/`, give paths whole or open a util at the start, the shell now does.

## 0.1.0

The first public version.
