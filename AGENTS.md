# Baba Voss

A TypeScript framework for surfaces an agent works on. A surface is a tool the agent works with for a person: what is true now and what can be done now, read and acted on through a command, and a tab where the person watches and steers over the same thing. A project's surfaces are code in its `.baba/` directory, a Bun package that names this framework. `.baba/` has a root, one runtime and one page per session: the shell, a surface the framework provides, which lists the surfaces and holds each open one as a tab. The session-start hook gives the agent baba's operating guidance and the root's present. The repository is being reshaped: much was cut so the design can change fast, and git history on main holds what was cut.

## Rules

- Read docs/DESIGN.md before a change. Design leads code: use its vocabulary and name any divergence.
- A change to docs/DESIGN.md needs proposed wording and a reason, then the person's approval, before it is written.
- Before each commit run `bun check && bun run spec`: the types, and the fast specs, a second or two. Before a pull request, and whenever a change touches what starts a process, the command or an install, run `bun run spec:whole`, every spec; CI runs it, and a pull request is merged only once its check is green. There is no other tool: no linter, no formatter. `bun install` is for dependencies only.
- Commit messages follow Conventional Commits: `type(scope): summary`, the summary in the imperative, lower case, with no full stop. Types are feat, fix, docs, refactor, test and chore; a breaking change takes `!` before the colon. The scope is optional and names the part changed: core, shell, kit, bin, skill. A commit or pull request carries no line crediting an agent or a tool: no Co-Authored-By, no "generated with".
- Every file and concept earns its keep.

## The queue

How this project's agent keeps its queue, `.baba/surfaces/queue`. The surface says only how it works; this is what to do with it.

- Keep the queue true as the work moves: add an issue for what the person asks for; what you would suggest is a draft, theirs to approve; once they say go ahead with a draft, start it.
- Start an issue in a free lane when a subagent takes it, note where it stands, and mark it done only once its work is merged into main. The backlog's top is next.

## Layout

```text
package.json                the package babavoss, at the repository's root, where a git dependency finds it
bin/baba.ts                 the package's command: init, which is given the harnesses to set up, new, start, provision, hook
framework/core/             the framework's layers; bv/ holds bv and the door; harness/ the adapters, one per harness, each the only code that
                            knows it: set up (provision, withdraw), hooks (its input and output), run; harness/setup.ts the one way a harness
                            is set up, a skill file and baba's hooks in the harness's own project file, the person's file copied first and
                            written whole; provision.ts, config.ts, hook.ts, update.ts
framework/shell/            the shell, the root of a .baba/, laid out as a surface: src/surface.ts its surface, a function of the project's
                            surfaces; ui/ its whole page, the tabs, home, the shortcuts and the tab hooks; scripts/open.ts its door,
                            which finds, generates and follows .baba/; src/hosting.ts and scripts/build.ts host and build any root's page;
                            settings/ the settings, a surface of its own that comes with it, kept in the person's ~/.baba/settings.json
framework/kit/              the kit: shadcn's primitives with one layer of opinions, the parts of a content, and the design language every
                            page is built with; it imports no shell
framework/core/session-start.md  baba's operating guidance, given by the session-start hook with the whole present
skill/SKILL.md              baba: the skill for authoring and maintaining .baba/, provisioned in the harness's skill folder
template/                   the surface a new one starts from: the surface, its component and a spec; `baba new` copies it
CHANGELOG.md                what each release changed; an agent reads it after taking one
spec/{core,shell,kit,bin}/  the specs, mirroring the code
spec/support/               the notes fixture the framework's specs use; offline.ts keeps specs off the network; word.ts, a root set up for
                            the specs of the client and the door
spec/surfaces.spec.ts       runs .baba/'s surfaces' fast specs with the framework's, as bun check checks their types with it
spec/border.spec.ts         the border: the package exports only its entries, and what a project keeps imports nothing else; the
                            internals this repository's own surfaces may reach, and why
docs/DESIGN.md              the design
site/                       babavoss.org as it is served, no build: index.html, the page; llms.txt, what an agent asked to install follows;
                            the Site workflow publishes it
.baba/                      this repository's own surfaces: its framework is the checkout, linked by its postinstall, not a release
.baba/surfaces/lab/eval/    the eval: a campaign of tasks run by headless agents on variants, checkouts, of a fixture surface; tokens and
                            what the agent did, tabled; eval.ts is its command, --dry plays scripts through the fake harness for free
.claude/  .agents/  .codex/ provisioned from .baba/, each harness the same way: baba's skill in .claude/skills/baba and .agents/skills/baba,
                            and the framework's hook among this repository's own in .claude/settings.json and .codex/hooks.json
.codex/config.toml          the shell sandbox with loopback open, so a command reaches its runtime
.baba/.state/               what sessions here write; ignored by git
```

A project that uses it:

```text
.baba/                      the surfaces' package: package.json names the framework, installing provisions
  surfaces/NAME/            a surface: src/surface.ts, ui/index.tsx, spec/
  baba.config.ts            which harnesses are made aware, each by its adapter's name, with enable and the adapter's options; `baba init` writes it from the harnesses it is given
  .root/                    generated from the surfaces: one module that names each, loaded on its own, and the shell's page with each one's component
  .state/                   what the root's sessions write, ignored by git: each tab's state and log, the command, and backups/, each of the
                            person's files below as it was before baba changed it
.claude/skills/baba/        generated: the skill baba, SKILL.md, for Claude Code
.claude/settings.json       the person's, with the framework's hook for each of Claude Code's events among theirs
.agents/skills/baba/        generated: the same skill, for Codex and the rest
.codex/hooks.json           the person's, with the framework's hook for each of Codex's events among theirs; Codex asks the person to review it
```

## Code

- Bun runs the TypeScript source: keep syntax erasable and import with `.ts` extensions.
- A surface imports the framework only as the package, and the package exports only its entries: `babavoss/core/index.ts` for a surface's source and specs, `babavoss/kit/index.ts` and `babavoss/shell/ui/index.tsx` for a page, `babavoss/core/config.ts` for baba.config.ts, and `babavoss/shell/ui/styles.css` for the generated root's stylesheet. A file not exported does not resolve. Here the root package links itself.
- This repository's own surfaces that show or run the framework's internals, the guide and the design document, reach them by a relative path into the checkout, and only those spec/border.spec.ts allows, each with why; a project cannot. The framework's specs import it by relative path.
- In the core, a root is what a runtime serves: a name, a surface and a page. The shell, the root of a .baba/, is one; the specs' notes fixture is another, with the shell's hosting and none of its surface.
- Production never imports spec.
- The version is semantic, in package.json, set by hand. Every version on main is a release: a change to the package raises it and adds its section to CHANGELOG.md, written for the agent that adapts a project's surfaces to it. On main, the Release workflow tags a new version vX.Y.Z; tags are never moved.

Style, which no tool enforces:

- no semicolons; double quotes; lines up to 160 columns
- what fits on one line stays on one line; trailing commas where a list spans lines
- a blank line before a return, and before and after a group of const and let declarations
- no `any`
- every file opens with a comment that says what it is for

## Specs

- Specs mirror the code: spec/core/ one per layer, spec/shell/, spec/kit/, spec/bin/.
- Two tiers, told by a file's name. NAME.spec.ts is fast: in process, starting no runtime of its own process, running none of the package's commands and installing nothing, so the whole tier runs in a second or two; where it must see that nothing happens, it waits a moment, tens of milliseconds. NAME.whole.spec.ts starts a runtime's process, runs the command or installs. `bun test` and `bun run spec` run the fast ones; `bun run spec:whole` runs all, each file in a worker of its own.
- A spec never waits out real time or fills a real bound: what takes time or size in use takes a clock, a duration or a bound the spec gives, as the runtime's `now` and `lookMs` and the log's bound. A wait for something to happen is on that, by `poll`, never a fixed sleep.
- A surface's rules are stories, with `story()` from the framework: actors see, call and are told; the test settles the world's effects; the model is never read.

## Skills

- framework/core/session-start.md is given to every session of a project, so every line earns its place. skill/SKILL.md covers authoring and maintenance.
- A surface's description says what it does and when to use it: a phrase and a "use when". How it is worked is said by its views; no file of instructions stands beside a surface.
