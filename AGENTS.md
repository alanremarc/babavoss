# babavoss

A TypeScript framework for software that agents operate. An app is one skill: its directory holds the skill, a surface the agent reads and acts on through a command, and a page where the person watches and steers over the same surface. This repository is one product at one version: the framework and its shell, published to npm as babavoss, and baba, the skill that authors apps on it.

## Rules

- Read docs/DESIGN.md before a change. Design leads code: use its vocabulary and name any divergence.
- A change to docs/DESIGN.md needs proposed wording and a reason, then the person's approval, before it is written.
- Before each commit run `bun check && bun test`. There is no other tool: no linter, no formatter. `bun install` is for dependencies only.
- Commit messages follow Conventional Commits: `type(scope): summary`, the summary in the imperative, lower case, with no full stop. Types are feat, fix, docs, refactor, test and chore; a breaking change takes `!` before the colon. The scope is optional and names the part changed: core, shell, app, payments, site. A commit or pull request carries no line crediting an agent or a tool: no Co-Authored-By, no "generated with".
- Every file and concept earns its keep.

## Layout

```text
packages/babavoss/          the framework, the npm package babavoss; an app depends on it and holds no copy
  core/                     the framework's layers; bv/ holds bv and the door
  shell/                    the shell: tabs, page hosting and build, layouts, components
skills/baba/                the product's skill, baba; also the authoring app's skill directory
  SKILL.md  references/     the authoring app's skill and know-how
  scripts/open.ts           its door; every app's entry is scripts/open.ts, which installs the app's packages where missing
  assets/template/          the app a new one starts from: a shell of one util; the build util copies it
  src/  ui/                 the authoring app: app.ts, utils/{build,promptware,playground}, its page
  scenarios/                its own scenarios, run in its playground: first-app asks for a new app
spec/{core,shell,app}/      the product's specs, mirroring its code
spec/support/notes/         the small app the framework's specs use
examples/payments/          an example app, with its own spec/, scenarios/ and assets/
docs/DESIGN.md              the design
site/                       babavoss.org: one page, its favicon and llms.txt, published as they are by the Pages workflow
.claude/skills/  .agents/skills/   links to skills/baba: a harness started here runs this checkout
.codex/config.toml          the shell sandbox with loopback open, so a command reaches its runtime
.babavoss/                  what sessions here write; ignored by git
```

## Code

- Bun runs the TypeScript source: keep syntax erasable and import with `.ts` extensions.
- Apps import the framework only as the package, `babavoss/core/…`, and the shell as `babavoss/shell/…`; an app names the framework's exact version in its package.json. Here the workspace links the package.
- Production never imports spec.
- Versions are semantic, in package.json, set by hand: the package, the skill, and what the skill, the template and the example depend on are one version; a spec holds them equal.
- A release is a tag vX.Y.Z on the commit to release: the Release workflow checks it and publishes the framework to npm. Merge that commit to main only once the version is published; main is what skills.sh installs.

Style, which no tool enforces:

- no semicolons; double quotes; lines up to 160 columns
- what fits on one line stays on one line; trailing commas where a list spans lines
- a blank line before a return, and before and after a group of const and let declarations
- no `any`
- every file opens with a comment that says what it is for

## Specs

- Specs mirror the code: spec/core/ one per layer, spec/shell/, spec/app/; an example's under its own spec/.
- A surface's rules are stories, with `story()` from the framework: actors see, call and are told; the test settles the world's effects; the model is never read.

## Skills

- A description says what the app does and when to use it: a phrase and a "use when", never a sentence about the skill.
- The opening and the "Operating it" section are the same in every SKILL.md; a spec holds them equal. The app's own part follows them.
