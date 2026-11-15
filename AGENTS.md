# babavoss

A TypeScript framework for roles an agent plays. A role is a tool the agent works with for a person: a surface the agent reads and acts on through a command, and a page where the person watches and steers over the same surface. A project's roles are code in its `.baba/` directory, a Bun package that names this framework; provisioning gives each to the harnesses as a skill. baba is the skill that maintains `.baba/`, carried by the framework's package and provisioned with the roles. The repository is being reshaped: much was cut so the design can change fast, and git history on main holds what was cut.

## Rules

- Read docs/DESIGN.md before a change. Design leads code: use its vocabulary and name any divergence.
- A change to docs/DESIGN.md needs proposed wording and a reason, then the person's approval, before it is written.
- Before each commit run `bun check && bun test`. There is no other tool: no linter, no formatter. `bun install` is for dependencies only.
- Commit messages follow Conventional Commits: `type(scope): summary`, the summary in the imperative, lower case, with no full stop. Types are feat, fix, docs, refactor, test and chore; a breaking change takes `!` before the colon. The scope is optional and names the part changed: core, shell, bin, skill. A commit or pull request carries no line crediting an agent or a tool: no Co-Authored-By, no "generated with".
- Every file and concept earns its keep.

## Layout

```text
package.json                the package babavoss, at the repository's root, where a git dependency finds it
bin/baba.ts                 the package's command: init, new, provision, hook
framework/core/             the framework's layers; bv/ holds bv and the door; provision.ts, hook.ts, update.ts
framework/shell/            the shell: tabs, page hosting and build, layouts, components
skill/SKILL.md              baba, the skill that maintains .baba/; provisioned as it is
template/                   the role a new one starts from: a shell of one util; `baba new` copies it
CHANGELOG.md                what each release changed; an agent reads it after taking one
spec/{core,shell,bin}/      the specs, mirroring the code
spec/support/               the notes fixture the framework's specs use; offline.ts keeps specs off the network
docs/DESIGN.md              the design
.baba/                      this repository's own roles: its framework is the checkout, linked by its postinstall, not a release
.claude/  .agents/          provisioned from .baba/: baba's skill and the framework's hook; a harness started here runs this checkout
.codex/config.toml          the shell sandbox with loopback open, so a command reaches its runtime
.babavoss/                  what sessions here write; ignored by git
```

A project that uses it:

```text
.baba/                      the roles' package: package.json names the framework, installing provisions
  roles/NAME/               a role: ROLE.md, scripts/open.ts, src/, ui/, spec/
  provisioned.json          the skills provisioning wrote last
.claude/skills/NAME/  .agents/skills/NAME/   generated: one SKILL.md per role, and baba's
.claude/settings.json       the person's, with the framework's hook written into it
.babavoss/                  what the roles' sessions write
```

## Code

- Bun runs the TypeScript source: keep syntax erasable and import with `.ts` extensions.
- A role imports the framework only as the package, `babavoss/core/…`, and the shell as `babavoss/shell/…`. Here the root package links itself.
- Production never imports spec.
- The version is semantic, in package.json, set by hand. Every version on main is a release: a change to the package raises it and adds its section to CHANGELOG.md, written for the agent that adapts a project's roles to it. On main, the Release workflow tags a new version vX.Y.Z; tags are never moved.

Style, which no tool enforces:

- no semicolons; double quotes; lines up to 160 columns
- what fits on one line stays on one line; trailing commas where a list spans lines
- a blank line before a return, and before and after a group of const and let declarations
- no `any`
- every file opens with a comment that says what it is for

## Specs

- Specs mirror the code: spec/core/ one per layer, spec/shell/, spec/bin/.
- A surface's rules are stories, with `story()` from the framework: actors see, call and are told; the test settles the world's effects; the model is never read.

## Skills

- A description says what the role does and when to use it: a phrase and a "use when", never a sentence about the skill.
- How a role is opened and operated is the same in every skill: provisioning writes it, from framework/core/provision.ts.
