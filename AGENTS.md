# babavoss

baba is a skill for making software an agent operates and a person steers. Each such app is one skill: its directory holds the skill, a surface the agent reads and acts on through a command, and a page for the person over the same surface. babavoss is the framework every app runs on; it lives in the baba skill, which provides it to them. The repository is being reshaped: much was cut so the design can change fast, and git history on main holds what was cut.

## Rules

- Read docs/DESIGN.md before a change. Design leads code: use its vocabulary and name any divergence.
- A change to docs/DESIGN.md needs proposed wording and a reason, then the person's approval, before it is written.
- Before each commit run `bun check && bun test`. There is no other tool: no linter, no formatter. `bun install` is for dependencies only.
- Commit messages follow Conventional Commits: `type(scope): summary`, the summary in the imperative, lower case, with no full stop. Types are feat, fix, docs, refactor, test and chore; a breaking change takes `!` before the colon. The scope is optional and names the part changed: core, shell, app. A commit or pull request carries no line crediting an agent or a tool: no Co-Authored-By, no "generated with".
- Every file and concept earns its keep.

## Layout

```text
package.json                the checkout's root: a workspace that installs the skill's packages; no product
skills/baba/                the product: the skill baba and the framework, babavoss; what is installed is this directory
  SKILL.md                  the skill
  package.json              the package babavoss: its version, its exports and every package an app runs on
  framework/core/           the framework's layers; bv/ holds bv and the door
  framework/shell/          the shell: tabs, page hosting and build, layouts, components
  scripts/open.ts           baba's door
  scripts/provide.ts        what an app's door hands over to: installs baba's packages, links the app to them, opens it
  assets/template/          the app a new one starts from: a shell of one util; the build util copies it
  src/  ui/                 the authoring app: app.ts, utils/build, its page
spec/{core,shell,app}/      the specs, mirroring the code
spec/support/               the notes app the framework's specs use; baba.ts points every spec at this checkout's baba
docs/DESIGN.md              the design
.claude/skills/  .agents/skills/   links to skills/baba: a harness started here runs this checkout
.codex/config.toml          the shell sandbox with loopback open, so a command reaches its runtime
.babavoss/                  what sessions here write; ignored by git
```

## Code

- Bun runs the TypeScript source: keep syntax erasable and import with `.ts` extensions.
- An app imports the framework only as `babavoss/core/…` and the shell as `babavoss/shell/…`. It holds no copy and no packages: its door, scripts/open.ts, finds baba and hands over, and its node_modules is a link to baba's.
- Every app's door is the template's, byte for byte; a spec holds them equal.
- Production never imports spec.
- The version is in skills/baba/package.json, set by hand. There are no releases while the design is being reshaped.

Style, which no tool enforces:

- no semicolons; double quotes; lines up to 160 columns
- what fits on one line stays on one line; trailing commas where a list spans lines
- a blank line before a return, and before and after a group of const and let declarations
- no `any`
- every file opens with a comment that says what it is for

## Specs

- Specs mirror the code: spec/core/ one per layer, spec/shell/, spec/app/.
- A surface's rules are stories, with `story()` from the framework: actors see, call and are told; the test settles the world's effects; the model is never read.

## Skills

- A description says what the app does and when to use it: a phrase and a "use when", never a sentence about the skill.
- The opening and the "Operating it" section are the same in every SKILL.md; a spec holds them equal. The app's own part follows them.
