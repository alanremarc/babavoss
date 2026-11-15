# Changelog

What each version of babavoss changed, newest first. A release is the tag vX.Y.Z of this repository; a project's `.baba/` names one. Versions follow semantic versioning and are set by hand, in `package.json`, in the commit that makes the change. An agent reads this after taking a release, from the version its roles ran on up, to adapt them.

## 0.24.0

- The shell is now the root surface of `.baba/`, and there is no picker tab. At `/`, `utils` is now `surfaces`, each `{ name, description, open }`. With no surfaces, `/` has `empty`, and with no `.baba/` it has `missing`.
- A tab row's `util` is now `surface`: `tabs.N.util` → `tabs.N.surface`. `open util=NAME` → `open surface=NAME`.
- Since the picker no longer takes tab 1 and `tabs.0`, the first surface opened in a new session is `/tabs/1` and `tabs.0`. A session's kept state is migrated: its picker tab is dropped and its other tabs keep their numbers.
- Import paths: `babavoss/shell/ui/index.ts` → `babavoss/shell/ui/index.tsx`; change it in each surface's `ui/index.tsx`. `useTab().util` is now `useTab().surface`.
- The element that wraps a tab's content carries `data-surface="NAME"`, no longer `data-util`; a surface's `ui/styles.css` is scoped with `@scope ([data-surface="NAME"])`.
- `babavoss/shell/index.ts` is gone; hosting is `babavoss/shell/src/hosting.ts`. `babavoss/root/*` is gone.
- `"surfaces"` is no longer a reserved surface name.

## 0.23.0

- The kit's theming tokens are now one named contract, listed in `framework/kit/defaults.css` and in the "Looks" section of `skill/making-surfaces.md`. Replace literal colours, fonts and sizes in a surface's page with them: `text-badge`, `text-meta`, `text-body` and `text-large` for UI text.
- New colour tokens `success`, `warning` and `info` are defined for every palette and mode. Use `text-success`, `bg-warning/10` and so on instead of Tailwind's palette colours.
- Breaking: `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border` and `sidebar-ring` are removed. Use `foreground`, `primary`, `muted`, `border` and `ring`; `sidebar` remains.
- A surface may add `ui/styles.css`. The root includes it after the shell's styles, scoped to the surface's own tabs with `@scope ([data-util="NAME"])`. Set custom tokens, or override shell tokens for those tabs, on `:scope`, and do not import the file from `ui/index.tsx`. A file whose braces do not balance is left out.
- Every tab's content is now wrapped in an element carrying `data-util="NAME"`.

## 0.22.2

- The shell's strip now starts with a "+", the launcher: it opens a palette to open a surface, switch to an open tab or reach settings, filtered as you type, also on ⌘K / Ctrl+K anywhere on the page.
- Open tabs now run newest first: a new tab appears right after the "+". One the person opens becomes active; one the agent opens is marked with a dot until looked at and does not take focus.
- Closing the active tab now lands on the next older tab instead of the launcher page.
- Surfaces need no change.

## 0.22.1

- A running root no longer goes on serving old code after a hot reload fails or misses a change, as a checkout, a delete-and-recreate or briefly broken code can cause: its runtime notices before it answers, or when bun logs the failure, and gives way to a fresh one at the same address, which says so and what it cut.
- When a surface's code does not load, the answer now says why and in which file, instead of a message about the sandbox. While the code is broken the root is down; the next call after it is fixed wakes it.
- The root follows `surfaces/` again after that directory is replaced or made late.

## 0.22.0

- The UI kit left the shell and has its own name, `babavoss/kit`. In a surface's `ui/index.tsx`, components (`Button`, `Alert`, `Empty…`, `Dialog…`, `Popover…`, `Tooltip…`, `ToggleGroup…`, `Command…`, `Trace…`, `CodeBlock…`, `Thread…`, `Composer`, `Message…`, `Bubble…`, `MessageScroller…`, `InputGroup…`), layouts (`Plain`, `Workbench`, `Welcome`, `MenuBar`) and the workbench parts (`Workbench*`, `Dismiss`, `useNarrow` and their types) now import from `babavoss/kit/index.ts` instead of `babavoss/shell/ui/index.ts`.
- `useTab`, `useLive`, `TabProvider`, `read`, `call`, `changes` and `Shell` stay at `babavoss/shell/ui/index.ts`.
- `<Workbench>` now takes `address` and `util` props: pass them from `useTab()`.
- Paths into `babavoss/shell/ui/components/…` or `…/layouts/…` become `babavoss/kit/components/…` and `babavoss/kit/layouts/…`. A stylesheet that imported `babavoss/shell/ui/styles.css` for the design language alone imports `babavoss/kit/styles.css`; the root's page is unchanged.

## 0.21.3

- A call into a broken tab is now refused with why it is broken. The core adds a view's string fact `broken` to the "not offered" refusal, and any surface may use that fact at any path.
- A broken tab's reason now says what is known: the kept state could not be restored, the surface fails on the kept state but not on a fresh one (close the tab or fix the code), or it fails on a fresh one too (fix the code; closing will not help).
- A path a tab's surface cannot show no longer breaks the whole tab: reading it returns `{ at, broken }` with what failed there, and the rest of the tab works.
- `open` is refused, and no tab is made, when the surface fails in `init`, `start` or its view at `/`. An always-open util that cannot init is listed as a broken tab and is made again at the next restore.

## 0.21.2

- What the root tells the agent of `/`, in the hook and in the "changed" part of an answer, now names who made each change: `changed by the person:`, `changed by the surface:` for a command's event, or a combination such as `changed by the person and you:`. A change of no known cause, such as code loaded again, stays under `changed:`.
- What only the agent's own calls changed is no longer told back to it, including calls made by a `-e` program. Such changes do not end a `wait`.
- The hook's lead line no longer guesses that the person may have acted. It says: "What changed in the root of .baba/ at / since this session was last answered, by who changed it:".
- The skill baba now says that a surface is shared and live, that the person's moves are to be taken up and never undone, and that where the person changed something first, their change stands. A surface's own `how` need not say so again.
- `Running` has a new `cause()` that gives who made the last commit and whether it was a call. Anything that implements `Running` by hand must add it.

## 0.21.1

- A tab whose surface throws on the state it keeps, for example after the surface's code changed, no longer breaks the root. `/` lists it with `broken` saying why, in place of `title` and `facts`, and keeps `close` offered. Reading the tab says the same, calls into it are refused, and its page shows the reason. A surface that changes the shape of its model should still give a `restore` that takes the earlier shape.
- The session's command is installed again where it was still the one from before 0.21.0, whose programs were given `role` and not `root`.

## 0.21.0

- What the agent works with is a surface, no longer an app. A project's surfaces are code in its `.baba/` directory: a Bun package that names the framework, `"babavoss": "github:alanremarc/babavoss#v0.21.0"`, with one directory per surface under `surfaces/`.
- A surface is two files: `src/surface.ts` default-exports the surface, and `ui/index.tsx` the component shown in its tab. It has no door, no page of its own, no runtime of its own, no skill and no file of instructions.
- `.baba/` has a root, with or without surfaces: one runtime and one page for the session, which the framework provides. Its first tab is the picker, which lists the surfaces with what each says it is for; each surface is a tab of it, opened by the agent or by the person, as often as wanted.
- An agent learns a surface from the surface alone: its `description` is how the picker lists it, and how it is worked is what its views say. The template's `how`, a fact at `/`, is the place for what always holds.
- The root follows `.baba/` by itself: a surface made or removed, and a change to one's code, are loaded into the running root. Nothing is provisioned for a surface.
- The package has a command, `baba`. `baba init` makes `.baba/` in a directory, installs the framework and provisions; `baba new NAME` makes a surface from the template; `baba start` starts the root; `baba provision` configures the harness beside `.baba/`.
- Provisioning writes the framework's hook into Claude Code's `.claude/settings.json`, for SessionStart, UserPromptSubmit and PostToolUse, beside the person's own settings and hooks, and one skill, baba, into `.claude/skills/baba` and `.agents/skills/baba`. Installing in `.baba/` provisions. baba is no longer installed with `bunx skills add`.
- The hook adds context and blocks nothing. At a session's start it gives baba's words and starts the root, whose answer is the framework's version, the page's address, the surfaces and the open tabs. With the person's message and after a tool call it gives what changed since the session was last answered, such as what the person did on the page. The skill baba is the same words, for a harness without hooks.
- A new page address is now told with: open it in the harness's browser if it has one, and otherwise give it to the person.
- The root's door says when a later babavoss is out, with the command that takes it. The repository is asked at most once a day.
- What the root's sessions write is kept beside `.baba/`: in `~/.babavoss/` for one in the person's home, in the project's `.babavoss/` otherwise.
- In a program run with the word's `-e`, the root is `root`: `root.read`, `root.call`, `root.wait`.
- Gone, until the design settles: the authoring app with its build, promptware and playground utils, the agent launcher and the harness adapters, scenarios, the references, the payments example.
- To move an app from 0.20.0: run `bunx github:alanremarc/babavoss init` in the project; move the app's `src/`, `ui/` and `spec/` into `.baba/surfaces/NAME/`; export its util's surface as the default of `src/surface.ts` and its util's component as the default of `ui/index.tsx`; give the surface a `description` that says what it does and when to use it, and say in its views what its SKILL.md said of working it; delete its door, its page's own index.html, main.tsx and styles.css, its package.json, tsconfig.json, SKILL.md and its installed copies among the skills.

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
