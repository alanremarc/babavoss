# babavoss

A TypeScript framework for surfaces an agent works on. A surface is a tool the agent works with for a person: what is true now and what can be done now, read and acted on through a command, and a tab where the person watches and steers over the same thing. A project's surfaces are code in its `.baba/` directory, a Bun package that names this framework. `.baba/` has a root, one runtime and one page per session, whose first tab is the picker of surfaces and which holds each open surface as a tab. An agent is made aware by one piece of content, baba's words and the root's present, delivered by hooks and, where there are none, by the skill baba. The repository is being reshaped: much was cut so the design can change fast, and git history on main holds what was cut.

## Rules

- Read docs/DESIGN.md before a change. Design leads code: use its vocabulary and name any divergence.
- A change to docs/DESIGN.md needs proposed wording and a reason, then the person's approval, before it is written.
- Before each commit run `bun check && bun test`. There is no other tool: no linter, no formatter. `bun install` is for dependencies only.
- Commit messages follow Conventional Commits: `type(scope): summary`, the summary in the imperative, lower case, with no full stop. Types are feat, fix, docs, refactor, test and chore; a breaking change takes `!` before the colon. The scope is optional and names the part changed: core, shell, bin, skill. A commit or pull request carries no line crediting an agent or a tool: no Co-Authored-By, no "generated with".
- Every file and concept earns its keep.

## Layout

```text
package.json                the package babavoss, at the repository's root, where a git dependency finds it
bin/baba.ts                 the package's command: init, new, start, provision, hook
framework/core/             the framework's layers; bv/ holds bv and the door; provision.ts, hook.ts, update.ts
framework/shell/            the shell: tabs, page hosting and build, layouts, components
framework/root/             the root of a .baba/: the one runtime and page of a session, the picker and the surfaces as its tabs
skill/SKILL.md              baba: the words that make an agent aware of the surfaces; provisioned as a skill, and given by the hook
skill/making-surfaces.md    how a surface is made and changed; read from the package when needed
template/                   the surface a new one starts from: the surface, its component and a spec; `baba new` copies it
CHANGELOG.md                what each release changed; an agent reads it after taking one
spec/{core,shell,bin}/      the specs, mirroring the code
spec/support/               the notes fixture the framework's specs use; offline.ts keeps specs off the network
docs/DESIGN.md              the design
.baba/                      this repository's own surfaces: its framework is the checkout, linked by its postinstall, not a release
.claude/  .agents/          provisioned from .baba/: baba's skill and the framework's hook; a harness started here runs this checkout
.codex/config.toml          the shell sandbox with loopback open, so a command reaches its runtime
.babavoss/                  what sessions here write; ignored by git
```

A project that uses it:

```text
.baba/                      the surfaces' package: package.json names the framework, installing provisions
  surfaces/NAME/            a surface: src/surface.ts, ui/index.tsx, spec/
  .root/                    generated from the surfaces: all of them as one module, and the root's page
.claude/skills/baba/  .agents/skills/baba/   generated: baba's SKILL.md
.claude/settings.json       the person's, with the framework's hook written into it
.babavoss/                  what the root's sessions write
```

## Code

- Bun runs the TypeScript source: keep syntax erasable and import with `.ts` extensions.
- A surface imports the framework only as the package, `babavoss/core/…`, and the shell as `babavoss/shell/…`. Here the root package links itself.
- In the core, a root is what a runtime serves: a name, a surface and a page. The root of a .baba/ is one; the specs' notes fixture is another.
- Production never imports spec.
- The version is semantic, in package.json, set by hand. Every version on main is a release: a change to the package raises it and adds its section to CHANGELOG.md, written for the agent that adapts a project's surfaces to it. On main, the Release workflow tags a new version vX.Y.Z; tags are never moved.

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

- skill/SKILL.md is given to every session of a project, so every line of it earns its place; what is needed only to make a surface is in skill/making-surfaces.md.
- A surface's description says what it does and when to use it: a phrase and a "use when". How it is worked is said by its views; no file of instructions stands beside a surface.
