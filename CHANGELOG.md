# Changelog

What each version of babavoss changed, newest first. A release is the tag vX.Y.Z of this repository; a project's `.baba/` names one. Versions follow semantic versioning and are set by hand, in `package.json`, in the commit that makes the change. An agent reads this after taking a release, from the version its surfaces ran on up, to adapt them.

## Adapting across several releases

Read every section from the version the surfaces ran on up, then write to the newest: where a later section says otherwise than an earlier one, the later stands. Taken from before 0.72.0, two things are easy to get wrong:

- **Who decides is never in a surface.** 0.71.0 said to write in `how` that a decision is the person's, and to keep `attention`; 0.72.0 removed `attention`, and 0.76.0 says a surface's words never say who decides or when to act. Write neither: baba's words have the agent raise such a decision in the conversation. What waits on the person is told by a highlight, the notice of the update that made it wait.
- **A `kind` changes how an input is shown and printed, never what is admitted.** Admission checks the base type, `choices` and `range` alone. Declare `{ type: "string", kind: "line" }` on a text input and keep your own check that it is not empty; drop only the checks that `choices` and `range` now make.

Then run `bun check` and the specs in `.baba/`, and restart the shell.

## 0.83.1

**A visible page keeps its runtime awake.** While connected, the page renews a 90-second lease every 30 seconds. Once the lease expires, the activity deadline applies again. The session's end still caps the remaining time at one minute, and `baba sleep` starts shutdown immediately. The agent leaves routine shutdown to the runtime, which logs why it slept and the last activity it heard.

Nothing in a project's surfaces needs to change.

## 0.83.0

**Antigravity is supported alongside Claude Code and Codex.** `baba init antigravity` (or `harnesses.antigravity` in `.baba/baba.config.ts`) sets up baba's skill in `.agents/skills/baba/` (shared with Codex, kept while either is enabled) and baba's hooks under `"babavoss"` in `.agents/hooks.json` (`SessionStart`, `PreInvocation`, `Stop`), among any hooks already there. Because Antigravity's `PostToolUse` returns `{}` and injects no context, `PreInvocation` carries both turn-start changes (`invocationNum === 0`) and mid-turn notices (`invocationNum > 0`) via `injectSteps.systemMessage`. The standalone client reads `ANTIGRAVITY_CONVERSATION_ID` (client `VERSION` is 22 and replaces itself), and `antigravityCli()` drives headless `agy --input-format stream-json --output-format stream-json` sessions.

Nothing in a project's surfaces needs to change. A `.baba/` whose configuration leaves out `harnesses.antigravity` enables it at the next `bun install` or `bun run baba provision`; set `antigravity: { enable: false }` in `.baba/baba.config.ts` to keep it out.

## 0.82.0

**Every surface gives an icon.** The skill says a surface's page exports `icon`, its mark on the rail, its tabs and home, a `lucide-react` icon chosen for what the surface is, where it named the export as optional; the template a new surface starts from exports one, a placeholder to change. A surface without one is still drawn with a dot.

A surface whose `ui/index.tsx` exports no `icon`: add one, `export const icon = <BookOpenIcon aria-hidden />`, imported from `lucide-react`.

## 0.81.0

**A desktop read no longer slows with the rows a tab lists, and a client's probe builds no view.** Reading `/` asked each tab's surface for its view at `/` once for every row it lists, to find the rows' actions: a tab of 300 rows was asked 301 times, on every read of `/` and after every change. It is asked once; the rows' actions and a broken tab are said as before. The command's probe for whether its runtime is up is answered `204` with the service's token and no body, where it was answered the whole of `/`: a runtime busy with large tabs is no longer taken for one that is down.

Nothing in a project's surfaces needs to change. A surface's view at a row's own path is still read once for each row on every read of `/`: keep it cheap.

## 0.80.0

**The session-start hook teaches the agent how to work with surfaces.** It gives the operating guidance and the whole present together, including when a session resumes, compacts or forks. The skill baba covers authoring and maintaining `.baba/`, in a single `SKILL.md`.

Nothing in a project's surfaces needs to change. Installing in `.baba/` refreshes the skill and removes the previous `making-surfaces.md` where it matches the text moved into the skill. Harnesses need the session-start hook to get the operating guidance automatically.

## 0.79.0

**The skill baba is set up whole: `making-surfaces.md` is beside `SKILL.md`** in `.claude/skills/baba/` and `.agents/skills/baba/`, where before a project had only `SKILL.md` and the manual was read from `.baba/node_modules/babavoss/skill/`. Baba's words name it as beside them; given by a hook, where they come with no file, they name its path in that harness's skill folder. `baba init`, the shell's answer with no surfaces, the template and `site/llms.txt` name it there too.

Nothing in a project's surfaces needs to change. `bun install` in `.baba/` provisions, and the second file appears in each skill folder: commit it with the project.

## 0.78.1

**Nothing a project's surfaces use changes.** The framework's own specs are in two tiers, and three things they waited on can be given by a spec: a runtime's options take `now`, `lookMs` and `reloadMs`; `shellKeep` takes the log's size bound; and `BABAVOSS_HUSH_MS` sets how long the hooks' silence is before it is said. In use each is as it was.

## 0.78.0

**Breaking: every harness is set up the same way, and `baba init` is given the harnesses to set up.** `baba init claude` sets up Claude Code, `baba init codex` Codex, `baba init claude codex` both. With none named, or a name that is no harness, it makes nothing and says which there are. It writes `.baba/baba.config.ts` with each harness named enabled and each other not, so installing a clone sets up the same; before, it wrote no configuration and set up both.

A harness is set up by one method: baba's skill as a file, `.claude/skills/baba/SKILL.md` or `.agents/skills/baba/SKILL.md`, and baba's hook for each event among the person's own in the harness's project file, `.claude/settings.json` or `.codex/hooks.json`. Claude Code no longer gets a link to a plugin in the package: `plugin/claude/` is gone.

- **The person's files are changed safely.** Only baba's own hook groups change; every other key, event, group and handler stays as it was, in its order, and that is checked before anything is written. The file as it was is copied to `.babavoss/backups/` first, the ten newest of each file kept. The new text is written beside the file, read back and checked, then moved into place in one step. The file keeps its indent and line ends. `.codex/config.toml` is written the same way.
- **A file that is not valid is not written.** Provisioning stops and says why where a hooks file is not a JSON object, where its `hooks` are not lists by event, or where it holds what could not be written back exactly: a number as `1.0` or a very large one, a key given twice, an escaped character. JSON with comments is not JSON.
- The hook's command is one for both harnesses but for the name: it finds the nearest `.baba/` up from the session's project.
- `site/llms.txt` has the installing agent name the harness it runs in; the README names both commands. An adapter has a `title`, what the person calls its harness.

- **Breaking: what sessions write is in `.baba/.state/`,** not `.babavoss/` beside `.baba/`: each tab's state and log, the archive of closed tabs, the backups, and the command, now `.baba/.state/bin/baba`, run from the project's directory as before. The folder ignores itself, so a project's `.gitignore` needs no line for it. An existing `.babavoss/` is moved there once, by the first provision or session's start after the update; remove `.babavoss` from the project's `.gitignore`. The person's own settings are in `~/.baba/settings.json`, moved there once from `~/.babavoss/settings.json`; a `.baba/` in the person's home has its older state moved the same way. Nothing is named `.babavoss` any more. The client's `VERSION` is 21 and replaces itself.

Nothing in a project's surfaces needs to change. After taking this release, `bun install` in `.baba/` provisions: `.claude/skills/baba` becomes a folder with the skill, baba's hooks are added to `.claude/settings.json`, and both are committed with the project. A `.baba/` made before has no `harnesses` in its configuration, or no configuration, and keeps both set up; to withdraw one, give it `enable: false` in `.baba/baba.config.ts` and run `bun run baba provision` there. A Claude Code session started before the update keeps the hooks it loaded: start a new one.

## 0.77.0

**Making a surface is learned from the manual alone.** `skill/making-surfaces.md` is rewritten in the order a first surface is made, each statement checked against the code. It covers route params, `view(...)`, the rule that puts an action in a list's pattern, hearing the world by a session command named for what it hears, highlights, and stories that `await` the world's events and name a command by a test. It no longer teaches `useShell().toast`. The template's comments teach the same shape.

- `baba init`, the shell's answer in a project with no surfaces of its own, and the note of a later release say what is there and how: they no longer urge a surface or an update. Whether a later release is taken is the person's.
- The command ends quietly where its reader closed early, as with `| head`. The line about reviewing Codex's hooks says it is for those who use Codex. The client's `VERSION` is 20 and replaces itself.
- The site, babavoss.org, is in this repository's `site/`: its page, and `llms.txt`, what an agent asked to install follows.

Measured on a fresh project, against the release before: a first surface takes a median 6 tool calls where it took 14, and the agent reads nothing past the manual, where it read the framework's source about 7 times a run; every rule of a correct surface passed in both. An agent given only the README's line installed, started the shell and gave the page's address in 10 runs of 10.

Nothing in a project's surfaces needs to change.

## 0.76.0

**Baba's words are rewritten: the agent holds the state and carries the intent.** They say that the present is given whole once and every change after it as a change, so the agent does not read again to check; that a surface says what is true and what can be done, never what to do; that values from a surface are read by the program that uses them; that what is printed is the whole of the syntax; that a refusal is news about the state.

- **Breaking: no more reminder.** `skill/reminder.md` is removed. After a compaction, a resume or a fork the agent is given the same words and the whole present as at a start. A project that copied the reminder anywhere removes the copy.
- **Each open tab's actions are printed with their commands at `/`,** and the actions every row of a list offers at its own path once, as a pattern, `/NAME/items/N ACTION n=N`: acting on a row needs no read. For a surface's action to be in the pattern, give each row its own path under `at`, and offer the action there with the same inputs and the row's value as its argument. The shell's `/` view carries `actions` as `[{ at, offers }]`, where it was a list of names.
- **Opening a tab answers with the tab whole.** A short change in a tab the agent is not working in is told in full, where it was "read it". A program's `read(path)` of a fact's path returns that fact, as the command does.
- **`baba new` copies the template's own files only,** not what a file manager left beside them.

**Adapt each surface to mechanics only.** Its `how`, descriptions and facts say what things are, what actions do and what must hold for them: never when to act, how to run the work, or who decides. A standing behaviour a project wants is the person's to write in the project's own instructions to its agent; babavoss writes it nowhere.

- Before: `how: "Start an issue when a subagent takes it in a lane, note where it stands, and mark it done only once it is merged"`
- After: `how: "Each of the 5 lanes holds one issue at a time. Done means the issue's work is merged into main. A note is one line on where an issue stands."`

Measured, on 23 tasks against the release before it: every run passed where 5 of 115 had failed; a single action is one call and no read, where it was a read of a whole view and a call; what an agent is told after a session's start is down by more than half. A `how` that dictated made agents take actions nobody asked for, whatever the words said.

## 0.75.0

**Breaking: handles are printed once a view, descriptions follow one convention, and inputs declare what they mean.**

An answer prints a view's handles as one block: `actions: COMMAND PATH ACTION <shared args> name=value…`, then a line a handle with its name, its own arguments and its description. A view's key is never printed for a handle; its name is.

**Rewrite every handle's description** to one clause that adds what the name does not say: the effect, or when to use it. Never repeat the name, its subject or the command; lower case, no full stop; empty where the name says it all. A surface's own `description` stays a phrase and a "use when".

- Before: ``description: ({ n }) => `Give issue ${n} to a lane, 1 to 5, when a subagent begins on it` ``
- After: `description: "when a subagent begins on it"`

**Declare what an input means** where its type alone does not say: `{ type, kind }`, `{ type, choices }` or `{ type, range }` in place of the bare type.

- Before: `inputs: { lane: "number", about: "string", mode: "string" }`
- After: `inputs: { lane: { type: "number", range: [1, 5] }, about: { type: "string", kind: "markdown" }, mode: { type: "string", choices: ["light", "dark"] } }`
- `line`, `markdown` and `path` are text the form knows. Any other kind is the surface's own word, printed with its type, as `id(string)`.
- Admission refuses a value outside the choices or the range and says what is allowed: drop your own checks for these. The refusal reads `HANDLE: INPUT must be …`: update a spec that expected your old wording.
- The shell's form draws a picker for choices or a narrow range, and a box of several lines for markdown.

**Menu entries** for one handle bound to several subjects are named by the `title` or `name` of the row the handle stands in, "Close Queue", no longer by its description: put such handles in rows that have one.

Baba's line on reading an answer changed with the form. Measured against the form before it: the same pass rate, an issue's page about 30% smaller.

## 0.74.0

**The drawer shows highlights; the rest is folded.** A tab's drawer shows its highlights, each with who raised it, when and where it goes. Every other entry, a surface's ordinary notice lines among them, sits in a fold between the highlights, one line saying how many and by whom ("14 actions: 9 by the agent, 3 by you, 2 heard"), opened in place. Only the newest ordinary entry shows unasked, as one faint line under the fold at the foot.

- So a line the person must see is a highlight, `notices: [{ text, highlight: true }]`; an ordinary notice is found only by opening the fold.
- The calls of one `-e` program fold into one line, "12 calls by the agent, one command", saying where a refusal stopped it.
- Home's drawer lists the closed tabs under its thread, newest first, each opening its log read only.
- A custom `.baba/home.tsx` changes nothing: the drawer is the shell's, and `HomeProps` is as it was.

## 0.73.0

**The program door.** `COMMAND [PATH] -e - <<'EOF' … EOF` runs the JavaScript or TypeScript that follows. In scope: `await read(path)`, a view as data with each action as `{ handle, args, inputs }` and each input as `{ type }`; `await call(path, handle, {name: value})`, which returns what the call changed and throws on a refusal; and `print(…)`.

- A path before `-e` is the base for relative paths.
- The answer is what the program printed, then one summary of its calls: the same change grouped once with its count, and each refusal with why.
- A refusal ends the program unless it is caught; the calls before it stay done. A program that arrives split into words, or put after a handle, is refused with the reason.
- `root.read`, `root.call`, `root.wait` and `root.page` still work.
- Every call of one program carries the id `program:XXXXXXXX` in `/activity`, and the drawer folds them into one line: "Agent made 12 calls in one command, the 12th refused".
- Baba's line about batches teaches the heredoc program. The client's `VERSION` is 19 and replaces itself.

Measured against the door before it, on four batch tasks: the same pass rate, a fifth less cost and fewer tool calls, no refusal. Nothing in a project's surfaces needs to change.

## 0.72.0

**Breaking: highlight replaces `attention`, `show` and `/activity/notices`.** A surface no longer says who is needed at `/`. Where it said `attention` because something waits on the person, mark the notice that tells what happened as a highlight: their tab gets a bubble and a dot until they open its drawer, and the agent hears it first among its notices.

Before:

```ts
"/": (m) => ({ …, ...(m.proposed && { attention: { who: "person", why: "to accept or decline" } }) })
update: … ({ model: { ...m, proposed: text } })
```

After:

```ts
"/": (m) => ({ … })
update: … ({ model: { ...m, proposed: text }, notices: [{ text: `"${text}" is proposed, to accept or decline`, highlight: true }] })
```

- Remove every `attention` fact. One that was for the agent goes too, or becomes a plain fact or a highlighted notice. `/` no longer has `needs`.
- A bubble appears only for a highlight; an ordinary notice is kept in its entry of the log and told to the agent once, as before.
- The agent's `show at=…` is `highlight at=… why=… front=true`: a place marked for the person, with why, and brought to the front where asked.
- `/activity/notices` is gone: the surfaces' lines are in `/activity`, the highlights in `/activity/highlights`. The person's `seen` and `looked` are gone; opening a tab's drawer is what clears its dot.
- In stories, `noticed()` gives a highlight as `highlight: TEXT`, and `agent.told()` no longer has `- attention` or `need` lines.
- A home page's `HomeProps.tabs[].mark` is `"broken" | "highlight"`, where it was `"broken" | "person" | "agent"`.

**The shell's state is kept per tab, and closed tabs are archived.** A session's root no longer keeps one `model.json`: `shell.json` holds the shell's own part, and each open tab has `tabs/N/state.json` and `tabs/N/log.jsonl`. A session kept from before is migrated on its first start.

- Closing a tab no longer drops its state: it is kept read only in `closed/N`, and the agent reads it at `/activity/closed` and `/activity/closed/N`. A closed tab is never reopened with its state.
- The archive clears itself as a runtime starts, at most once a day: closed tabs and the folders of sessions that are over go after 30 days, and the oldest first past 200 MB a project. Both numbers are the person's settings, at `/settings/archive`, which also clears this session's closed tabs or the project's.
- The log holds a tab's newest 200 entries in the model, per tab; the rest stay on disk.
- Surfaces need no change. A tool that read `.babavoss/sessions/S/ROOT/model.json` reads `shell.json` and `tabs/N/state.json` instead.

## 0.71.0

Three changes to the shape of a surface and its page.

**Breaking: `ask` is removed.** An action no longer takes `ask`, `handle()` no longer takes a fifth argument, and a handle carries no `ask` mark. The agent is offered and may call every handle the person can. A tab's surface is no longer given the reading actor in `view(model, path, actor)`. To adapt:

- Delete `ask: true` from every `action({...})`, and the fifth argument of `handle(...)`. Drop any `actor` branching in a surface's `view`.
- A page that read `handle.ask`, or a tab row's `asks`, reads nothing in their place.
- Where a decision is the person's, say so in the view, in `how` or where it stands: "Approving it is the person's decision: ask them in the conversation, and approve or reopen it as they say; they may do it on the page instead." Keep `attention` while their word is waited for. Since 0.76.0 a surface's words say mechanics only: write neither this nor `attention`; see "Adapting across several releases" above.
- Rewrite specs that asserted the agent was refused an ask: both actors are offered it.

**The activity is a log of actions, each with its actor.** An entry at `/activity` is one action: `who` (`person`, `agent` or `world`), `by` (the world's hearer), `at`, `did` (the handle and its inputs, or the event heard), `times`, `refused`, `said` (the surface's lines), `own` and `id`; `surface` only where `at` does not name it. It replaces `kind`, `tab` and `what`.

- Refused calls are kept, with why. Inputs past 200 characters are cut, with their length; values that look like credentials are kept as `(hidden)`.
- An event from a session command is the world's, named by the command's `kind`: name commands for what they hear. Its silent events in a row fold into one entry with a count; one that changed nothing and said nothing leaves no entry.
- `/activity/notices` lists the entries that carry `said`. A surface may give `refused(model, call, reason)`; the shell uses it.
- To adapt: code that reads `/activity` reads `did` and `said` for `what`, `who: "world"` for `"surface"`, and `own` for `tab`. State kept from before is migrated as it is restored.

**The page opens at its bare address again.** `page:` is `http://127.0.0.1:PORT`, with no `?key=`: give the person that address. `page.key`, its cookie and the "opened by the link" page are gone, with `pageKey`, `pageKeyFile`, `pageLink` and `PAGE_KEY_PARAM`.

- A request a browser labels `cross-site` or `same-site` is refused, 403, except a GET navigation to the page's HTML: into a window from another site, or into a window or frame from another port of this host. A page that frames a root's page uses the same host name as it.
- Without the service token `babavoss-actor` is ignored: such a request is the person's.
- The session's state folder is private: directories 0700, files 0600, older folders made so as a runtime starts.
- The client's `VERSION` is 18 and replaces itself.

## 0.70.0

A runtime stays up for what woke it, in place of 30 minutes after any request.

- A session's start, resume or compaction keeps it 5 minutes. The person's message, the agent's commands, a hook after a tool call and the person's actions on the page keep it 30 minutes. A page that only watches no longer keeps it up. The session's end leaves 1 minute.
- It sleeps, its state kept, once that time is spent and nothing runs; any command wakes it. A restart keeps the time that was left.
- `<word> sleep` puts the root to sleep when the agent's work with the surfaces is over; baba's words say so. `close` still works and means the same.
- The page says when the runtime is asleep: "Asleep; it wakes when the agent next works with it". It finds the runtime again once it is back, and never wakes it.
- Breaking, for code that starts a runtime itself: the `idleMs` option is gone, use `strengths: { weak, strong, end }` in milliseconds or `BABAVOSS_WAKE_MS=weak=…,strong=…,end=…`; `IDLE_MS` is no longer exported; the door's option `touched` is `woken(signal)`.
- The client's `VERSION` is 17 and replaces itself.

No surface code needs to change.

## 0.69.0

Breaking: the package exports only its entries. A surface's source and specs import `babavoss/core/index.ts`; a page `babavoss/kit/index.ts` and `babavoss/shell/ui/index.tsx`; `.baba/baba.config.ts` imports `babavoss/core/config.ts`; the generated root's stylesheet `babavoss/shell/ui/styles.css`. Any other path into the package no longer resolves. Search the surfaces for `babavoss/` and change each import:

- `babavoss/kit/cn.ts` → `cn` from `babavoss/kit/index.ts`
- `babavoss/kit/components/*.tsx` → `babavoss/kit/index.ts` (`Toggle` and `toggleVariants` are there too now)
- `babavoss/kit/theme.ts` → `babavoss/kit/index.ts` (`PRESETS`, `presetOf`, `derive`, `varsOf`, `Theme`, `PresetId`)
- `babavoss/kit/layouts/*` → `babavoss/kit/index.ts` (`MenuItem`, `WorkbenchToolbar`, `WorkbenchSpacer`, `WorkbenchSegments`, `WorkbenchPage`, `WorkbenchEmpty`, `useNarrow`); what is not exported there, copy into the surface's own folder
- `babavoss/kit/styles.css` → nothing: the root's stylesheet already brings the kit's design language, and a surface's `ui/styles.css` is scoped under it
- `babavoss/core/state/session-dir.ts` → `sessionDir` from `babavoss/core/index.ts`
- `babavoss/core/harness/index.ts` → `babavoss/core/index.ts`: `claudeCode`, `fakeHarness`, `sessionEnv`, `NONE`, and the types `Harness`, `HarnessEvent`, `Tokens`, `FakeHarness` and `ClaudeOptions`; its `Session` type is `HarnessSession` there
- `babavoss/core/surface/*`, `babavoss/core/runtime/*` → `babavoss/core/index.ts`, which exports what a surface uses from them
- `babavoss/shell/ui/*` other than `index.tsx`, `babavoss/shell/src/*`, `babavoss/shell/settings/*`, `babavoss/core/hook.ts`, `babavoss/core/update.ts`, `babavoss/core/bv/*` → not for surfaces. Use `useTab`, `useLive`, `useShell`, `useConventions`, `read`, `call`, `changes` and their types from `babavoss/shell/ui/index.tsx`, and keep anything more in the surface's own folder.

The kit and the shell keep to the type scale of four: `text-badge`, `text-meta`, `text-body`, `text-large`. The kit's titles (`EmptyTitle`, `DialogTitle`, `PopoverTitle`) are 13px where they were 14px, and `Input` and `Textarea` are 13px where they were 14px below 768px wide. For a surface the scale is advice: one that wants another size sets it by its own class.

To adapt: run `bun check` in `.baba/`; each import it cannot find is in the list above.

## 0.68.0

Breaking: the page is opened only by its link.

- The shell's answer names the page as `page: http://127.0.0.1:PORT/?key=…`: give the person that link whole. It opens the page in any browser, which then keeps a cookie for 30 days, so reloads and runtime restarts need nothing more. `localhost` and `127.0.0.1` each need the link once.
- Opened without the key, the page says only that it is opened by the link its agent gives. A tab open before this release shows that once: give the person the link again.
- The key is the session's, kept in its state directory as `page.key`, readable by its owner alone. Never write it into files, commits or notices.
- A program that fetches the page or its `/_/` files sends the service token from `service.json` in the `babavoss-service` header, as it already does for reads and calls.
- The runtime no longer sends the token back in answers, except to a request that carried it, and no longer replaces `%TOKEN%` in a root's `index.html`.
- The client's `VERSION` is 16 and replaces itself.

No surface code needs to change.

## 0.67.0

Breaking: the shell no longer reloads its code under running work. There are two modes, each simple.

- **Normal mode, the default.** A runtime runs the code it started with; it no longer runs under `bun --hot`. After changing `.baba/` or taking a release, run `<word> restart`. Until then `/` and the hooks say `code: changed on disk since instance … started; it runs once restarted`.
- **Restart with work under way drains.** The runtime takes no new calls, restarts once the work has ended, and the command exits at once, naming the instance. `<word> follow ID [SECONDS]` returns when the next instance answers, or at once where that instance is already gone. `<word> close` cuts the work instead.
- **Dev mode.** `dev: true` in `.baba/baba.config.ts`, or `BABAVOSS_DEV=1` (`0` turns it off). Any change to the code the runtime loaded restarts it at once and cuts running commands; the next answer says what was cut. Use it while surfaces are being built.
- A restart, in either mode, is a fresh process at the same address with the state as saved; an open page reloads itself.
- The version told is the one running. The client's `VERSION` is 15 and replaces itself.
- A runtime ends within a moment of its state directory being removed, so none is left behind by a deleted project.

To adapt a project's surfaces:

- A cut command sends no event: make long work resumable from the model, and do not count running jobs in the model.
- Nothing on `globalThis` survives a reload any more.
- A spec that starts a real runtime and expects an edit to be live sets `BABAVOSS_DEV=1`.
- Decide the project's mode: set `dev: true` while its surfaces are being made, and leave it out otherwise.

## 0.66.0

Conventions: the shell hands every page, home included, how the person wants pages to be.

- `motion`: `full` or `reduced`. `scale`: the text size, 1 by default. `side`: `left` or `right`, where a page's own sidebar stands. `rail`: where the shell's tabs stand. `mode`: `light` or `dark`, as shown.
- Read them with `useConventions()` from `babavoss/shell/ui/index.tsx`, or in CSS: each stands on the page's root as `data-NAME`, a number also as `--NAME`, with the variants `motion-safe:`, `motion-reduce:`, `side-left:`, `side-right:`, `rail-left:`, `rail-right:`, `rail-top:` and `rail-bottom:`.
- The kit follows them unasked: nothing animates where motion is reduced, and everything sized in rem follows the scale. `motion-safe:` and `motion-reduce:` now follow the person's setting, and the browser's preference only where there is none.
- The settings gain `preferences`: `motion` (system, full, reduced), `scale` (0.9, 1, 1.1, 1.25, 1.5) and `side`, each with an action of its name at `/settings`, and a row under Appearance.
- A page follows them by its own code. It is expected and never enforced: a page that follows none works as before.

To adapt a project's surfaces: stand a page's sidebar at `side`, for example `side-left:flex-row-reverse` on its row with the border swapped; check `motion` before animating or scrolling smoothly in script; size text in rem, never px.

## 0.65.0

Breaking: the kit is shadcn's primitives with one layer of opinions, and nothing else. What it no longer holds, and what to use instead:

- `Workbench`, `Plain`, `Welcome` and their types: draw the page in the surface's own `ui/`, with the kit's `WorkbenchToolbar`, `WorkbenchSpacer`, `WorkbenchSegments`, `WorkbenchPage` and `WorkbenchEmpty` where they fit; `useNarrow` stays too.
- `WorkbenchButton`, `WorkbenchProperties`, `WorkbenchCode`, `WorkbenchInfo`, `WorkbenchPicker`, `WorkbenchMark`, `WorkbenchMeter`, `WorkbenchNotice`, `WorkbenchSection`, `WorkbenchFold`, `WorkbenchSetting`, `WorkbenchList`, `WorkbenchTree`, `WorkbenchSplitter`, `Dismiss`, and the types `WorkbenchAction`, `WorkbenchChoice`, `WorkbenchIcon`, `WorkbenchFacts`, `WorkbenchOption`, `WorkbenchRow`, `WorkbenchGroup`, `WorkbenchNode`: write what you use in the surface's own folder. For a fold, `bunx shadcn@latest add collapsible` in `.baba/`; for a splitter, the kit's `ResizableHandle`; for a picker, the kit's `DropdownMenu`.
- From `babavoss/kit/layouts/menu.tsx`: `MenuItems`, `SearchMenu`, `MenuDropdown`, `MenuTriggers`, `ContextKit`, `DropdownKit`, `menuContent`, `menuRow`, the `Menu` type and `muted`. A menu of actions in a page is the kit's `DropdownMenu`. `MenuItem`, `filtered`, `matches` and `quietScroll` stay.
- From `babavoss/kit/layouts/parts.tsx`: `SearchField` and the class constants `muted`, `ring`, `iconButton` and `bar`.
- `Command…`: `bunx shadcn@latest add command` in `.baba/`. `Sheet`, `SheetContent`, `SheetTitle`: `bunx shadcn@latest add sheet`.
- `Toasts`, `TOAST_MS`, `ToastItem`: `useShell().toast(text, at?)`, a bubble beside the tab.
- The conversation set, `Thread…`, `useThreadDetail`, `Composer`, `ComposerCompletion`, `Message…`, `Bubble…`, `MessageScroller…`, `useMessageScroller`, `Trace…`, `Marker…`, `CodeBlock…`, `InputGroup…`, `Collapsible…`: it is the lab's own now. Copy what you use from this repository's `.baba/surfaces/lab/ui/components/` into the surface's own `ui/`, or add shadcn's own with its CLI. A copied message scroller needs `bun add @shadcn/react` in `.baba/`.
- The files `babavoss/kit/components/{command,sheet,toast,thread,composer,bubble,message,message-scroller,trace,marker,code-block,collapsible,input-group}.tsx`, `babavoss/kit/layouts/{workbench,plain,welcome}.tsx` and `babavoss/kit/layouts/arrange.ts` are gone.
- `cmdk` and `@shadcn/react` are no longer the package's dependencies: a project that imports either adds it to `.baba/`.
- The `.markdown-body` styles are gone from the kit's CSS: a page that renders markdown with that class styles it itself.

To adapt: run `bun check` in `.baba/`; each import it cannot find is in the list above.

## 0.64.1

- A tab's close, offered at `/`, names what runs in the tab beside its number: "close tab 3, Queue; its state is dropped". Home's menu, drawn from it, tells several tabs apart. The command is unchanged: `close n=3`.
- docs/DESIGN.md says the rail and a tab's drawer, as built in 0.61.0.

Nothing to adapt in a project's surfaces.

## 0.64.0

- Home tells the person when the session's hooks are not heard, never heard or heard and gone quiet: a bubble beside the mark, kept in home's thread, a dot on the mark, and a line pinned in home's drawer that says what to do. The dot and the line clear when a hook is heard again. It begins when the runtime tells the agent its one line of the silence, never from a timer of the page's.
- The runtime's turn carries `unheard: { ever, since }` while that lasts, and the session's `hooks.json` keeps `since`. What the agent is told is unchanged. Nothing to adapt.

## 0.63.0

- An agent run non-interactively through an adapter gets baba's hooks. Claude Code's run loads the project's plugin by `--plugin-dir`: a plugin in `.claude/skills` runs its hooks only in a folder trusted in the home, and a `-p` run does not count as trust, so the skill loaded and no hook ran. The plugin's manifest says `"skills": []`, so its `SKILL.md` stays one skill.
- Codex's adapter has a run face: `codex exec`, a process a turn, the later ones resuming the thread, with `--trust` and `--dangerously-bypass-hook-trust` for that run alone, the person's login linked into the run's home and never copied. What a hook added is read from Codex's session file, whose format is not documented.
- A run's stream carries `hook` for a hook that ran and added nothing.
- In this repository a lab run lists the hooks it heard, and says "no hook heard" on its timeline and its page when there were none. The lab still starts Claude Code only.
- Nothing to adapt in a project's surfaces.

## 0.62.0

- `baba init`, `provision` and `start` say in one line when Claude Code's managed settings keep baba's plugin or its hook from running, naming the settings file and what to do: `strictPluginOnlyCustomization`, a `strictKnownMarketplaces` without `{ "source": "skills-dir" }`, `blockedMarketplaces` naming it, `enabledPlugins` turning `baba@skills-dir` off, `disableAllHooks`, or `allowManagedHooksOnly`. Settings given from the claude.ai console and the Windows registry are not read. An adapter may say the same of its harness by an optional `blocked()`.
- "This session's hooks are not being heard" is no longer said because of runs made in the session's name from elsewhere, another session's agent using `--session` or a script: only the session's own agent's runs count. The client is version 14 and replaces installed copies.
- After a resume followed at once by a compaction, baba's short words and the present are given once, not again at each start with nothing heard between.
- Nothing to adapt in a project's surfaces.

## 0.61.1

- In this repository the queue's map is replaced by Narratives: a list of the narratives and a page for each with its issues as an outline of what came out of what, links to other narratives said in words. The agent reads it at `/queue/narratives`, `/queue/narratives/ID` and `/queue/narratives/ID/open`; `/queue/map` is gone. The package is unchanged. Nothing to adapt.

## 0.61.0

- Breaking: the strip, the activity button and its drawer, toasts, the tab's dropdown menu and home's palette are gone. The tabs stand on a rail at a side of the page the person chooses, left, right, top or bottom, and every tab, home included, has a drawer: its menu at the head, drawn from its surface's views as before, over its activity as a thread, newest at the foot. A click shows a tab; a click on the tab shown, a right click, the menu key or the shortcut opens its drawer.
- Breaking: the `home` shortcut is `drawer`, mod+p by default: it opens and closes the shown tab's drawer. A person's own `home` binding carries over to it. The `menu` command is gone; shift+F10 and the menu key still open the drawer of a focused tab.
- Breaking: when a tab closes its activity entries go with it; home's thread keeps the line that it closed. An entry of `/activity` no longer gives `title`. `show` at `/` is offered to the agent alone.
- Breaking, for code that imported the shell's page: `babavoss/shell/ui/home.tsx`, `notifications.tsx`, `activity.tsx`, `channels.ts` and `strip.ts` are gone; there are `rail.ts` and `rail.tsx`, `thread.ts`, `drawer.tsx` and `feed.ts`, and `TabMenu` is `useTabMenu`. A surface that used `useShell().toast` needs no change: it shows a bubble beside the tab.
- A notice appears as a bubble beside the tab it is in, beside the mark where it is in none, for three seconds; hovering keeps it and a click opens that tab's drawer. Opening a drawer marks its tab's notices seen.
- Home is a desktop, an icon a surface. A project draws its own with `.baba/home.tsx`: its default export, given `HomeProps` from `babavoss/shell/ui/index.tsx`, the title, the surfaces each with a way to open one, the open tabs each with a way to go there, and what home's foot says. See `skill/making-surfaces.md`.
- The person's settings have `appearance.rail: { side, from, drawer }`: where the rail stands, the end it starts from at a side, and the side a drawer opens at under a rail along the top or bottom; left, bottom and left by default, and a file from before reads so. The settings surface sets it by one quiet action, `rail`, and its page has the mark's animation under Appearance.
- What a surface's people were told of "the strip" or "notifications" should speak of the rail and a tab's drawer. An action's description shown as a menu's entry starts with a capital.

## 0.60.0

- The mark is drawn exactly: its eyes are two round patches of one size on a sphere, seen by a camera three and a half of its radii away, and each is the true outline of its edge as that camera sees it. Near the middle an eye is large; towards the limb it is smaller and, faster, narrower; over the camera's horizon it is cut by the sphere's own outline, and behind it is gone. The ellipse squashed by one rule and shrunk by a lens is gone.
- Breaking, for code that drew the mark itself: `framework/shell/ui/gaze.ts` no longer has `drawn`, `EYES`, `Eye`, `Drawn`, `TURNED` or the old `SPHERE`. It has `SPHERE`, a `Sphere` of `camera`, `radius`, `eye`, `apart` and `turned`; `SIDES`; `outline(side, gaze, sphere?)`, an eye as an SVG path; `edgeOf`, its points and whether it is cut; `centreOf` and `seen`. `Logo` and `Eyes` are as they were. The moves turn the head a fifth further. Nothing to adapt in a project that only uses the shell.
- This repository's Design Guide tunes the sphere at `/guide/mark/sphere`: its numbers on sliders beside the shell's mark, through each move, and following the pointer.

## 0.59.4

- The exact sphere tried in this repository's Design Guide starts from the numbers the person chose. Nothing to adapt.

## 0.59.3

- This repository's Design Guide has a pad at `/guide/mark/sphere` where the exact sphere and the shell's mark both look where the pointer is, so any pose can be held and looked at with no move played. Nothing to adapt.

## 0.59.2

- This repository's Design Guide tries the mark as an exact sphere at `/guide/mark/sphere`: two round patches of one size seen by a close camera, each drawn as the true outline of its edge and cut by the sphere's horizon, beside the shell's mark, with the camera's distance, the sphere's and the eyes' size, their spacing and the resting turn on sliders. The shell's mark is unchanged. Nothing to adapt.

## 0.59.1

- The mark's lens is one smooth curve: an eye that turns away from the middle shrinks all the way to nothing at the sphere's edge as it narrows. It used to stop at a least size a third of the way round and go on narrowing, a sliver of fixed height. At rest the eyes are as they were. Nothing to adapt.

## 0.59.0

- A caller may name a call: the request header `babavoss-call-id`, `CALL_ID_HEADER`, which `serviceClient` can send. The name is on the call, `Call.id`, and the shell's activity keeps it on the entry, given as `id` at `/activity`, so whoever made a call can tell its entry from another's made at the same moment. Nothing to adapt.
- `Harness.release` is said as it is: it leaves the transcripts to whoever made the home.
- In this repository the lab reads a run cleared at its start as cleared, with nothing to close; tells its own act from the person's click by the call's name, not by time; and answers its timeline empty when no run is shown. Two specs that failed on a busy machine wait for what they test.

## 0.58.1

- This repository's Design Document plays dependably: a play always ends, played or failed with its reason; a full play takes 3 seconds where it took 13, a scenario's pause passing on a clock the demo reads; a play removes its directory and its demo runtime on every way out, and the next one sweeps what a killed one left; the strip tells a hook that ran and said nothing, `0 tok`, from no hook, `—`; and the preview puts in front the tab the shell's page would, home until the person moves. The package is unchanged. Nothing to adapt.

## 0.58.0

- A call's value may be a file: `name=@PATH`, where PATH begins `/`, `./`, `../` or `~/`, is read from that file, and refused where there is none; it used to be sent as that text. `name=@-` reads standard input as before, and is how text that looks like such a path is given. Other text that begins with `@` is sent as written. The client is version 13 and replaces installed copies.
- In a story, `world.idle()` no longer waits for a session command, which never ends, only for work that does: a spec that waited by a timer for a surface with a store can call `idle()`.
- In this repository the queue shows a tab just opened as reading, not as empty; begins again when the session's `work.json` is removed; and groups its archive by narrative, newest first, saying so when nothing is done. Nothing to adapt.

## 0.57.0

- The root's title is the project's: an optional `title` in `.baba/baba.config.ts`, else the name of the project's directory, where it was the word "baba". It is home's heading, the page's title and the `title` the agent is told at `/`. The root reads it as it starts. A spec that matched `title: "baba"` must match the directory's name, or the project sets `title`.
- A tab not shown is dotted for an ask at any depth of its surface, not only at its top or where it was last shown: at `/` the person's row of each tab carries `asks`, how many are offered anywhere in it. The agent's `/` has no such fact.
- The activity names each channel for one tab: a closed tab keeps the title it had across a reload, a row of `/activity` giving it as `title`, and channels that would share a name add their tab's address, "Queue · /tabs/3".
- A tab's menu no longer reads a place above its route that no view names, so the browser's console is not told of a 404 each time.
- Home's foot says that Enter with the command key opens another tab while the chosen line is an open tab; the alert for a place the agent points to wraps a long path beside its buttons.
- In the framework's code `shell()` takes `title` as its fifth parameter and `activityView` takes `{ at, title }` where it took a function. Nothing else to adapt.

## 0.56.0

- Breaking: an ask inside a list is kept from the agent, as one that is an object's property always was; it used to reach the agent as an ordinary action it could call. A surface that relied on the agent calling such an action must offer it as an ordinary one.
- Breaking: `laterRelease` is gone from `babavoss/core/update.ts`. `latestRelease` gives the latest release whatever runs, and `running()` the package's version as it is now; the runtime's `latest` option gives the latest release, unfiltered. A later release is told against the version running, so a root whose package was updated under it no longer offers the release it runs.
- A surface broken by importing a file that does not exist comes back by itself once the file is made, where the file is under `surfaces/`. Nothing to adapt.

## 0.55.0

- The mark is redrawn: two eyes of one size on the sphere, under a lens that stays at its middle. The head rests turned to the right, so at rest the left eye, near the middle, is whole and round and the right one smaller and narrower; as the head turns, an eye grows towards the middle and shrinks towards the edge. The two circles of unequal size are gone.
- While the agent works the head may also spin once round, a move named spin.
- A page that lost its runtime dims the eyes and has them look slowly from one side to the other. The red eye and the eye going round it are gone, with `orbiting` and `ORBIT_MS`; `Logo` and `Eyes` no longer take `pair` or `lostAs`, an eye no `lens`, `yaw` or `lid`. Nothing to adapt in a project.

## 0.54.3

- An eye of the mark has no `dx`: a lens stays at the mark's middle, and a face that rests turned rests its eyes to one side of it. Only this repository's Design Guide used it. Nothing to adapt.

## 0.54.2

- The mark's eye model, for variants being tried in this repository's Design Guide: an eye's `lens` now draws it as a patch of the sphere as seen, whole at the middle and smaller and narrower towards the edge, with `yaw`, a turn the face rests at, and `dx`; a gaze may say `lid`, how open the eyes are; and `Logo` and `Eyes` take `lostAs`, how a lost runtime is said: "orbit", as now and by default, or "doze", "search" or "pulse". The shell's mark is unchanged. Nothing to adapt.

## 0.54.1

- The preset claude is named clay, "Clay": `theme=clay`, `presetOf("clay")`. A settings file that says claude reads as clay; a call or code that names the preset must say clay.
- An eye of the mark may have a `lens`: it grows as a turn brings it to the sphere's middle and shrinks towards the edge. The brand's eyes have none and the shell's mark is unchanged; this repository's Design Guide tries it at `/guide/mark/variants`, beside the brand's.

## 0.54.0

- Breaking: the kit's palettes are generated. A theme is three numbers, `{ hue, tint, vivid }`: a hue from 0 to 360, how strongly the greys are tinted toward it and how vivid the accent is, each from 0 to 100. Every colour token is derived from them in CSS, over lightness fixed per mode, so text keeps its contrast at any hue; `framework/kit/theme.ts` is the source and `theme.css` is written from it. The token names are unchanged, so a component that reads them, shadcn's among them, follows the theme as before.
- Breaking: the root's `data-theme` no longer selects a palette and `:root[data-theme="claude"]` rules are gone: the colours come from `--theme-hue`, `--theme-tint` and `--theme-vivid`. A surface's stylesheet that keyed on `data-theme` must stop. Any element with `data-theme` and those three variables takes that theme's tokens, in its own mode where it has the class `dark` or `light`.
- The presets are neutral, claude, slate, sand, moss, ocean and plum, a row each in `PRESETS`; "dynamic" is a theme whose numbers are the person's. The generated claude keeps its accent; its light ground is white where it was cream, and its dark ground is darker. Light `success`, `warning` and the thread's context colour are a little darker, and `chart-1` to `chart-5` are a ramp of the accent: greys under neutral.
- The person's settings: `appearance` is `{ mode, same, themes: { light, dark } }`, a theme a preset's id or `{ hue, tint, vivid }`; with `same`, the default, `themes.light` is both modes'. A file from before reads as it was. The settings surface's actions: `theme mode=both|light|dark theme=PRESET|dynamic`, `dynamic mode= hue= tint= vivid=`, and `same on=`; `mode=both` is for modes that are the same, `light` and `dark` for distinct ones.
- `useShell().appearance` is `{ mode, theme, numbers }`: `theme` a preset's id or "dynamic", `numbers` the theme's three numbers, current while a dynamic theme is dragged.
- The kit has `ThemePicker` (`babavoss/kit/components/theme-picker.tsx`): `value`, `onChange` on every move, `onCommit` on release; and exports `PRESETS`, `presetOf`, `derive` and `varsOf`.

## 0.53.2

- The mark takes the two eyes it draws and moves: `pair` on `Logo` and `Eyes`, and as `orbiting`'s third argument, the brand's `EYES` by default, so a variant of the mark can be tried. This repository's Design Guide shows such variants at `/guide/mark/variants`, eyes of one size among them. The mark in the shell is unchanged. Nothing to adapt.

## 0.53.1

- This repository's Design Document surface opens on a scenario picker, and a scenario is two screens of one frame over a strip of its steps: the person's page after the chosen step, and what the agent was given at it. The scenario and the step are the tab's route, `/design/scenarios/NAME/N`. Each scenario's row at `/design` carries `about` as detail. The package is unchanged. Nothing to adapt.

## 0.53.0

- The shell's page exports the parts of it that only show: `ActivityButton` and `ActivityLevels` (notifications.tsx), `RefusedAlert` and `PointedAlert` (connection.tsx), `TabBroken`, `TabFailed` and `TabNoPage` (tabs.tsx), `RefusedLine` (actions.tsx). `TabMenu` takes an optional door, and a tab's own controls are one function, `controlsOf` in commands.ts. The mark takes an optional named move, `MOVES` in gaze.ts, and repeats it. The shell looks and behaves as before. Nothing to adapt.
- This repository's `.baba/` has a surface `guide`, the Design Guide: the mark in each state, the kit's tokens, components and layouts, and the shell's elements, each drawn by the real component. Its spec fails when a file of `framework/kit/components` or `framework/kit/layouts` has no specimen.

## 0.52.0

- A session's runtime knows which harness its agent runs in: a hook names its adapter with what it tells of the turn, in the header `babavoss-harness`, and the runtime keeps the one last heard beside the session's state. The page is given it in the turn, as `harness`, and home's foot says it after the session: Claude Code, Codex, or an adapter's own name. A session whose hooks were never heard has none. `hookContext(event, baba, harness)` takes the adapter's name as its third argument. Nothing to adapt in a project.

## 0.51.4

- An open tab's line in home's list carries its mark on its icon, as its pill in the strip does: broken, waiting on the person, or needing the agent. The words beside its name are gone, what it needs and "previous" alike; hovering the icon says them. Nothing to adapt.

## 0.51.3

- A line of home's list ends with its action alone, without the Enter sign, and a surface with no tab open says "Open in new tab". Nothing to adapt.

## 0.51.2

- Each line of home's list says at its end what Enter does on it, "Go to tab" or "Open", the same whether it is the chosen line or not; it no longer says what kind of thing the line is, and home's foot no longer repeats the chosen line's action. Enter with the command key still opens another tab of an open tab's surface. Nothing to adapt.

## 0.51.1

- Home no longer offers a command that ends the person's move, "End my move" or "Copy the message that ends my move": the person writes to the agent themselves. What they did on the page still waits for its next turn and is counted on the activity's button. Nothing to adapt.

## 0.51.0

- The appearance's mode "system" follows the machine the runtime is on, where the runtime can tell its mode, and the browser's `prefers-color-scheme` only where it cannot: an embedded browser can report light on a dark machine. The page is served with the machine's mode, so its first frame is right, and a page shown in system mode asks again every five seconds. Today the runtime can tell on macOS, from `AppleInterfaceStyle`; elsewhere nothing changes. `BABAVOSS_SYSTEM_MODE=browser` in the runtime's environment leaves the answer to the browser.
- How a machine is asked is an adapter, `framework/shell/settings/src/system/`: one file per operating system with `name`, `fits(platform)` and `read()`, named in `ADAPTERS` in its `index.ts`. Nothing to adapt in a project.

## 0.50.3

- The activity's button in the strip shows a log's lines in place of a stack. Nothing to adapt.

## 0.50.2

- The tab shortcuts' defaults are swapped: `mod+j` goes to the previous tab, the one to the left, and `mod+k` to the next, to the right. A person who bound their own keys keeps them. Nothing to adapt.

## 0.50.1

- A tab's menu opens from three dots that take the icon's place only while the pointer is on the icon, no longer from a caret shown wherever the tab is hovered. A click on the icon opens the menu; a click on the rest of the tab selects it, and a right click anywhere on it still opens the menu. Nothing to adapt.

## 0.50.0

- A session's runtime no longer stays alive and deaf after changed code is loaded. After a failed hot reload, a file gone for a moment in a checkout or code that does not parse, bun stops waking the process for its timers, and a runtime restarting for the framework's changed code then waited for ever with its port closed. A runtime now gives way to a fresh process once bun has said a reload failed in it. Its close is bounded by the clock, and after every load in place it checks that its door still answers; where it does not, it ends and a fresh runtime takes the state. Nothing to adapt.
- A command whose runtime is alive but refuses connections for longer than a close takes ends that process, only if it is this session's runtime, starts a fresh one with the state kept, and says so in one line. The client is version 12 and replaces installed copies.

## 0.49.0

- A surface's page may use any React library: `bun add NAME` in `.baba/` and import it. The page always has one React, the framework's, whatever a library or the install brings, so "Invalid hook call … more than one copy of React" no longer happens.
- `.baba/` is ready for shadcn: `bunx shadcn@latest add NAME` in `.baba/` writes the component to `components/ui/`, shared by every surface and imported as `@/components/ui/NAME`. It reads the shell's tokens, so it follows the palette and the mode. `baba init` writes `components.json` and the `@/` alias in `tsconfig.json`; provisioning adds both to an existing `.baba/` where they are missing. Commit them.
- Tailwind scans the whole of `.baba/` except `node_modules`, so the project's own components are styled. A `@source` line in a surface's `ui/styles.css` now works, its path from that file, for a package whose classes must be generated.
- `useShell()` from `babavoss/shell/ui/index.tsx` gives a page the shell's services by convention: `toast(text, at?)`, a toast from the tab that is not kept and not told to the agent; `open(surface)`; `go(at)`; and `appearance`, `{ mode, theme }`. A surface's notices from `update` remain how both sides are told what happened.
- The kit's theme defines shadcn's `sidebar-*` tokens from each palette.
- Nothing to adapt.

## 0.48.0

- What the agent is told is cut to what it needs. A quiet action, `action({ quiet: true })`, or an update returning `quiet: true`, is the page's own bookkeeping, told to the agent in no way and kept out of the activity; the shell's seen and looked and every settings change are quiet. A change no one made, as changed code or a restored state makes, is not told. A notice stands for the changes of the update that gave it; a need of the agent's is told all the same. A tab the agent neither read nor called in this turn or the last, and that does not need it, is one line at a boundary.
- `detail(value)` from `babavoss/core/index.ts` marks a fact or a row as detail: read whole at the tab's path and by the page, counted in one line in the present at `/`. Mark finished rows and counters with it.
- Breaking for specs that match tellings: a tab opened is one line, `+ PATH "TITLE", actions: a, b; read PATH`; an action offered or withdrawn reads `+ action NAME` and `- action NAME`, also in a story's `told()`; a reorder reads `PATH moved up` and never `order now …`. A path names one fact of the view above it, as `/queue/issues`.

## 0.47.0

- Kit: `DropdownMenu` and its parts, `Badge`, `Marker`, an inline line or labelled separator in a conversation, and `ResizablePanelGroup`, `ResizablePanel` and `ResizableHandle`, from shadcn, in the type scale. `ThreadStep` takes `onOpenChange` and `ThreadSteps` takes `initial`, so a page can keep the open step in its route. The kit's class merger keeps a type-scale size, `text-meta` and the others, beside a text colour; it used to drop it, so some small labels in messages, the composer and the shell were the wrong size. Nothing to adapt.
- In this repository the lab shows a run as a conversation: bubbles for what is said, folded steps for what entered the context between, a divider per turn, a header for the run's lifecycle and the runs kept, and a composer that picks the model and starts a run from its first message.

## 0.46.0

- Breaking: a tab stands at its surface's name. The tab opened while no other tab of its surface holds the name is `/NAME` until it closes, so `/queue/issues/42` survives the tab being closed and opened again; a second tab of a surface is `/tabs/N`, and `/tabs/N` still reaches any tab. Reads, calls, `show at=` and the page's URLs take either; every path the shell gives, tab rows, `at` facts, notices, needs, `pointed` and activity, is said by the address. At `/` a tab's heading is `/queue "Queue" (tab 10)`, and a second one `/tabs/11 queue "Queue"`. A spec matching `/tabs/1 NAME "Title"`, `at: "/tabs/1…"` or `NAME /tabs/1` in what the agent is told now matches `/NAME "Title" (tab 1)`, `at: "/NAME…"` and `/NAME`.
- A path into a tab that is closed, or into a surface with no tab open, is answered with what happened and where to go, `/tabs/3, the queue tab 3, was closed by the person; queue is now at /queue (tab 10)`, instead of `nothing at`. A surface may say the same for its own paths with the optional `absent(model, path)`.
- Breaking: `tabs` and `activity` are reserved names, like `baba` and `settings`. Rename a project surface called either.

## 0.45.0

- A session resumed, forked or compacted is given a short reminder of baba's words (`skill/reminder.md`, also in the plugin) and then the whole present, instead of the whole words again. A new or cleared session still gets them whole.
- The first answer names the page and the command, and no longer says where `bv` and `baba` were put or repeats the skill's help.
- A command's answer says once when this session's hooks have gone quiet, or never spoke, and calls alone no longer keep the page's turn reading as working.
- While changed surface code loads, reads and calls are held, up to about 40s, and answered by the new code. A call the old code took as it stopped is given to the new one. The agent is told of a reload only when work was cut or the new code did not start.
- A call whose answer was lost says its outcome is unknown: read before retrying.
- The client is version 11 and replaces installed copies.

## 0.44.1

- Home is one list with each thing once, and no headings: the open tabs, the surfaces with no tab open, then the shell's commands. A line names the thing and says what kind it is; the chosen line and the foot say what Enter does on it, Go to tab, Open or Run. Enter with the command key opens another tab of an open tab's surface. Nothing to adapt.

## 0.44.0

- The activity is gathered into channels, one a tab, as a messaging app lists its conversations. A channel shows its surface's icon, its name and when it last said something, then a preview of that, or what the tab needs of the person. Channels go newest first, and a tab that needs the person is pinned above. The shell's own opening and closing of tabs is one more channel, named after the root. A closed tab's channel stays, marked closed. Choosing a channel shows its history, newest first, grouped by when, each entry opening to its whole. Escape, Backspace or the left arrow go back, and Go to tab brings the tab forward. Notices · All stays, and Needs you is gone, since a need is shown on its channel. The agent sees next is one folded item at the top that opens into the person's waiting calls. Nothing to adapt.
- Seeing is per channel: opening the activity no longer sees everything. Opening a channel sees its notices, which stay dotted until it is left. Mark all seen sees them all, and clicking a toast opens the activity on its channel. For the person, `/activity/notices` also gives `fresh`, the numbers of the notices not yet seen. Every row of `/activity` gives `tab`, the tab it was in, even once that tab is closed; the shell's own opening, closing and showing of tabs has none. Nothing to adapt.

## 0.43.8

- A submenu stands a little off its parent, by the gap a tab's menu keeps from the strip, and no longer over it. Nothing to adapt.

## 0.43.7

- A tab's menu is an ordinary one again, rounded and lined all round, standing a little under the strip. A submenu opens over its parent's edge, covering the arrow it grew from, its first entry level with the entry it grew from. Nothing to adapt.

## 0.43.6

- The activity's button is a stack, and carries the count of the person's changes that wait for the agent's next turn, which the mark no longer does. The activity opens on them, under The agent sees next: what the agent is told with the person's next message. Nothing to adapt.

## 0.43.5

- A tab's menu hangs from the same spot however it is opened: the caret's button keeps its place and size, and only the caret in it grows into view. It used to hang a few pixels high and to the right when opened before the caret had grown. Nothing to adapt.

## 0.43.4

- A tab's menu has no line along its top and starts on the pixel under the strip's lower border, which is its top edge. Nothing to adapt.

## 0.43.3

- A page that lost its runtime shows it in the mark alone: the larger eye comes to the centre and turns red, the smaller goes round it, and hovering the mark says Reconnecting. The bubble under the mark is gone. Nothing to adapt.

## 0.43.2

- Home lists a surface by its name alone. Its description, written for the agent to choose it by, still finds it in the search and is told on hover. Nothing to adapt.

## 0.43.1

- A menu that is longer than its room scrolls up and down with no bar to show for it, the search being the way through it, and never sideways: every entry is cut at the menu's edge. The kit exports `quietScroll` for a list that scrolls so. Nothing to adapt.
- In this repository the queue switches between its list and its map from a toolbar of icons floating at the page's foot.

## 0.43.0

- A refresh is drawn whole in its first frame: the root's door serves the page with an island of JSON, `<script type="application/json" id="babavoss-boot">`, holding the stream's version, the turn and the views the root names for the page's path (`RootDefinition.boot`); the shell names `/`, the notices and the shown tab's views at its `/` and route. Nothing says connecting on a normal load, and the shell's alerts stand over the content without moving it.
- A tab's page is shown once its first `useLive` reads have answered, dependent ones too, on its quiet ground meanwhile; a new path keeps the old view until its own lands, and a change replaces views in place. Each tab keeps one cache of its views, for its page and its menu. Nothing to adapt, but a page should draw no loading state of its own: an empty state it draws is now always true.
- While the runtime is out of reach a page keeps the views it read, with no error; `useLive`'s `error` is for a path that refuses or is not there.

## 0.42.2

- A page whose runtime is gone stays as it is, reconnecting, and loads again only once its address answers; it used to load into the browser's own error page. Nothing to adapt.

## 0.42.1

- A page that lost its runtime says so in a small bubble under the mark, Reconnecting, and the mark's eyes shut until it is back; the bar under the strip is gone, and a page still loading shows neither. The dot on a tab stands still while its icon gives way to the caret. Nothing to adapt.

## 0.42.0

- Breaking: ⌘P or Ctrl+P goes home and back; ⌘K no longer does. ⌘J and ⌘K go to the next and previous tab, home first, wrapping round. They work anywhere on the page but in a text field, so a page should not bind them itself.
- Breaking: home is the shell's own page: the surfaces to open, the tabs to switch to, and the shell's commands. A surface's actions and places are only in its tab's menu. Check that nothing tells the person to find them on home.
- Settings is a surface that comes with the shell, listed as `settings`. It holds the appearance, the shortcuts (`bind command= keys=`, `reset command=NAME|all`) and whether the mark animates while the agent works (`animate on=`). They are the person's, kept in `~/.babavoss/settings.json` (`BABAVOSS_SETTINGS` names another file), the same in every session and project. A browser's earlier appearance cookie is taken in once.
- Breaking: `settings` is a reserved name, like `baba`. Rename a project surface called `settings`.

## 0.41.0

- The notifications are an activity log: one line an entry, who as a small mark, what, its place as a quiet token, how long ago, grouped Now, Earlier today, Yesterday, then by date, with what needs the person pinned above under Needs you. Hierarchy is carried by type and colour alone: what was new when the log opened stays in the foreground with a dot until it closes. It opens on Notices; All adds a line for every call; Mark all seen clears what is new. The bell carries one dot. While the log is open no toast is shown: a toast on screen leaves into it and a notice heard comes in as its newest line. Toasts are one line. Nothing to adapt.
- Kit: `ToastItem.title` is optional, and a toast takes `mark`; `Toasts` takes `away` to send every toast away at once. The `Sheet` sets the frame's body size on its content. Nothing to adapt.

## 0.40.2

- A tab's menu's search also finds an entry by its way in the menu: "go" finds every place, Go being where they are listed, and a word of where an action is offered finds it. What meets the query by its label comes first, then by its way, then by its path or description; among equals what waits on the person. A place found says Go beside it. Nothing to adapt.

## 0.40.1

- In a menu the mark of what waits on the person stands at an entry's right, so a menu keeps no room at its left for it. Nothing to adapt.

## 0.40.0

- `sessionDir()` from `babavoss/core/state/session-dir.ts` gives a surface's command the session's own directory under the project's `.babavoss/`, where a surface may keep what belongs to the session and not to a tab; it gives nothing outside a runtime. Nothing to adapt.
- In this repository the queue and the map are one surface, the session's work seen as a list and as a map, kept in the session's directory and shared by its tabs.

## 0.39.5

- A tab's menu hangs from the strip: its top is square and on the strip's lower border. It opens from a caret that takes the tab's icon's place and turns over as it opens, and from a right click anywhere on the tab. The surface's own actions stand in it without the surface's title, which the tab has. `MenuDropdown` in the kit takes `sideOffset`, `alignOffset` and `className`. Nothing to adapt.

## 0.39.4

- A tab under the keyboard's focus has no ring: it reads as one hovered, with its ground and its dots. Nothing to adapt.

## 0.39.3

- A menu keeps room at its left only where it has something to put there, a mark of what waits on the person or a tick; without one its entries start at its edge. The kit's `menuItem` class is now `menuRow`, without the padding. Nothing else to adapt.

## 0.39.2

- A working agent unheard by the hooks for 90 seconds, with no call of its own under way, reads as unknown; it was five minutes. So a turn whose end the hooks missed stops showing as work soon. The mark's eyes settle to rest from wherever they were. Nothing to adapt.

## 0.39.1

- The mark's ground changes at once, as a tab's does. Nothing to adapt.

## 0.39.0

Harnesses are set up by adapters, and `.baba/baba.config.ts` chooses them.

- Breaking: Claude Code is made aware by a project plugin: `.claude/skills/baba` is a link to `node_modules/babavoss/plugin/claude`, which holds the skill and the hook. Provisioning removes babavoss's hooks from `.claude/settings.json` and replaces the old skill folder; reinstall in `.baba/` and commit the link. A folder of your own named `.claude/skills/baba` stops provisioning.
- Breaking: `baba hook` takes the harness, `baba hook claude` or `baba hook codex`, defaulting to `claude`. `provision()` is async and answers `{ written, withdrawn, said }`. `provisionHooks`, `SKILL_FOLDERS`, `HOOK_EVENTS`, `HookInput` and `hookOutput` are gone from core. `hookContext` takes a `HookEvent`.
- Codex gets the hook in `.codex/hooks.json`, among your own hooks; Codex asks you to review it once with `/hooks`.
- Optional `.baba/baba.config.ts`: `config({ harnesses: { claude: { enable, events }, codex: { enable, events, network } } })` from `babavoss/core/config.ts`. `enable: false` withdraws at the next provisioning; `events` is read as the hook runs. A config that does not load stops provisioning and keeps the hooks silent, and `baba start` says so.
- The Claude run face trusts the session's project, and a worktree's main checkout, in its own home, so the plugin loads in lab runs.
- The mark has a dim ground while the agent works.

## 0.38.1

- The mark's eyes sit on an invisible sphere, the circle of home's tab: while the agent works the face looks about as one that thinks, down, aside, across, narrowing to focus, each turn eased and in no fixed order, an eye narrowing as it nears the sphere's edge. Frames run only while the eyes turn, and not on a page that is not shown. Nothing to adapt.

## 0.38.0

- The bar above every tab is gone; a page fills its tab under the strip. Each tab in the strip carries its surface's menu behind dots that replace its icon on hover or focus, and on a right click or Shift+F10. The menu holds a search of the tree's actions and places, the actions at `/` under the surface's `title`, the current place's actions under its name, `Go`, and the shell's Close tab, Close other tabs, Copy link and Reload. `menu` facts, `title` or `name` on rows, and drawers work as before. Nothing to adapt, but check that a page does not assume a bar above it.
- What waits on the person carries one dot, on the tab and on every step of the way to it in the menu: an ask, or a notice not yet seen about a place. Give asks and notices an `at` where they belong, so the dot leads there.
- Home is the babavoss mark, which also shows whose move it is: still, looking about while the agent works, and counting the person's changes that wait for its next turn. Home offers to end the person's move. The turn indicator at the strip's right is gone.
- The notifications open as a drawer from the right edge.
- The menu-bar setting and ⌘\ are gone. The kit gains `MenuDropdown`, `SearchMenu`, `DropdownKit` and `Sheet`.

## 0.37.0

- Breaking: the bar above every tab is the shell's alone, made from the surface's views. A menu named by the surface's `title` holds the actions at `/`. Where the route is below `/`, a menu for that place holds its actions, asks first. `Go` lists the places the view names under `at`, by their row's `title` or `name`, and the way back up. `Help` searches the actions and places of the tree below the tab. `useMenus`, `MenuBar`, `MenuHostContext` and `MenuHost` are gone from `babavoss/kit`, and `Plain` and `Workbench` no longer take `label`, `menus` or `viewMenu`. Move every entry a page put in the header into the page's content, a toggle or a button in its own toolbar, as page state; none of it becomes an action of the surface.
- An action with inputs opens a modal: the shell's form, or the page's own drawer, `export const drawers = { NAME: Component }` with `{ handle, path, view, submit, close }` (`DrawerProps` from `babavoss/shell/ui/index.tsx`). `submit` resolves with the refusal reason, which the modal shows while staying open.
- A view may order its actions in the bar with a `menu` fact, `[{ label, actions: [names] }]`. Give it below `/` so it stays out of the present.
- Name each place by a `title` or `name` in its row, so `Go` and `Help` can name it.
- The person can hide the menu bar from home, Settings or ⌘\. Nothing to adapt.

## 0.36.0

- The strip is the page's header, at the top: home's `+`, the tabs newest first, and at its right whose move it is and the notifications. Below it stand a tab's frame and its content. The notifications panel opens downward and toasts come in under the bell. A surface whose page assumed a strip at the bottom should check its layout.
- The `+` is home, the first tab, at `/`. It is the palette filling the page: the asks, actions and menus of the tab shown before it, the surfaces to open, the open tabs and the settings. ⌘K or Ctrl+K goes home from any tab, and back; Escape returns. A surface that does not load is listed there as broken, with its error, and cannot be opened. The popover launcher is gone.
- `Toasts` in the kit takes `from: "top" | "bottom"`, the edge the stack stands at. Nothing else to adapt; what the agent reads is unchanged.

## 0.35.0

- What was heard and not yet told to the agent is kept on disk, so a root that sleeps, reloads or starts again still tells each notice once; more than 20 waiting are told as the newest 20 after `N earlier notices; read /activity/notices`. Nothing to adapt.
- A surface whose code does not load no longer takes the root down: `/` lists it in `surfaces` as `{ name, broken }` with the error and where it is, it cannot be opened, and its open tabs are broken with why and come back with their state when the code loads. `.baba/.root/surfaces.ts` now names each surface as `() => import(…)`; installing in `.baba/` generates it again.
- While the page does not build, the root serves the last page that did, also after its code is loaded again.
- The version a running root tells is read from the package each time, so it is right after a release is taken without a restart.

## 0.34.0

- Claude Code's adapter hands on no account, organisation or user id and no address, in any field or text, the process's stderr included. An adapter for another harness should do the same.
- In this repository's lab, a closed run keeps only its record, `run.json` and the timeline: its project and home, the harness's transcripts among them, are deleted. `/runs` offers `forget id=`, and only the last 20 records are kept. When the lab starts, it clears what a lab that is gone left behind.
- What the person does on the page under test joins the lab's timeline as entries of kind `person`, read from the root's `/activity`. A run's first entry says the lab is left out of the copy.

## 0.33.0

- A handle the person alone may call carries `ask: true` in the view the person reads, and the frame knows an ask from that view alone. `action({ ask: true })` sets it. A surface that offers a person-only handle through its own `view` instead of `action` should pass `ask` as `handle()`'s fifth argument, or the frame shows it as an ordinary action. The agent's views and text are unchanged.
- A story can drive a command that keeps running: `world.send(command, event)` gives one event and leaves the command running, and the actors see and are told between events; `world.end(command)` ends it. Nothing to adapt.
- The kit's components size all text by the type scale, `text-badge`, `text-meta`, `text-body` and `text-large`; some small labels moved by 1px. A surface's page should do the same.
- What the agent reads calls the root of `.baba/` the shell: the skill baba, the hook's lead lines, "In the shell of .baba/: …", "Heard in the shell of .baba/ while you worked:" and "The shell of .baba/ was started…", and `baba`'s usage. A spec that matches those lines must follow. Installing in `.baba/` provisions the skill again.
- In this repository `bun check` and `bun test` cover `.baba/surfaces` too.

## 0.32.0

- The present is told as events on things. Each open tab is one heading, `PATH SURFACE "TITLE"`, with its facts under it and its actions by name. List rows are named by `at`, `n`, `id`, `name` or `key`, so a reorder is one line and a changed row is one line of what changed. `how` is told in a change only by where to read it, long texts are cut with where to read them, and a telling stops at 40 lines. `needs` is a table first at `/`, and each need added, gone or changed is one line. One `open` per surface is printed once as `open surface=NAME`. A read of `/`, by the word or by a program's `root.read("/")`, gives the present whole, and changes are counted from it.
- During work the agent is told only what was heard: notices, and "the person acted on SURFACE PATH" once per tab. The present's changes come with the person's message, at the end of a wait, or whole on a read of `/`. A call answers with its own change and what was heard. A wait ends on a notice or a change to `needs`, not on a fact a surface changed by itself.
- A surface whose change should reach the agent mid-turn should give a notice; a fact alone waits for the boundary. A fact that is not at `/` is in no telling: only a notice or a read reaches it.
- Breaking: `flatten` and `changes` are no longer exported from `babavoss/core/index.ts`; `whole`, `diff` and `tell` are. A story's `told()` uses the new shapes, so a spec matching `issues.0.status: …` now matches `/issues/1: status …`, and `- attention.who` reads `- attention`.

## 0.31.0

- The strip's right has one notifications button: a bell counting the notices others caused that the person has not seen. Its panel opens on Notifications, with a switch to All activity. A toast hides into the button when it passes.
- Activity entries say whether a surface said them: `notice` on the entry, `kind` (`notice` or `call`) at `/activity`, and `/activity/notices` for the notices alone. A call without a notice appears only under All activity, so give a notice where the person should hear of it.
- What the person has seen is kept in the shell's state per session, so a refresh or a page opened later shows the right count. `seen` and `looked` are person-only actions at `/activity/notices`, and the agent is told nothing of them.
- `Toasts` in the kit takes `into`, where a passed toast goes.

## 0.30.0

- The framework has a harness layer, `babavoss/core/harness/index.ts`: a `Harness` interface whose sessions report normalised events, Claude Code's adapter (`claudeCode()`, with the pure `claudeEvents(line)` parser), and `fakeHarness()` for stories. A surface that drives an agent uses it instead of spawning `claude` itself.
- A session the adapter starts has a home of its own, which reaches the person's login through a link, never a copy; the link and the account files the harness writes there are removed when the session's home is released.

## 0.29.0

- The framework's hook is now also provisioned for `Stop`, `StopFailure` and `SessionEnd`. It tells the session's runtime whose move it is, adds no context at those events and never blocks stopping. Installing in `.baba/` provisions it again.
- The shell's strip shows whose move it is: the agent working, idle, or unknown. When the agent is idle it shows how many of the person's changes wait for its next message, with a button that copies a message to send. A surface should drop any busy indicator or end-of-move button of its own.
- The door has `POST /_/turn` and a `turn` event on the page's stream; a page that counts stream events now receives `turn` after `change` when it connects. Nothing about the turn is in the present.

## 0.28.0

- The shell keeps the session's activity: every notice, every call into a tab that gave none (as its handle and arguments), and every tab opened, closed or shown. The agent reads it at `/activity`, named at `/` by `activity: { at: "/activity" }`, and is never told it. The person sees it in a panel at the strip's right. A surface that wants a meaningful line there instead of the mechanical one gives a notice.
- A call carries `t`, the time it was admitted, in ms since the epoch. An update that keeps time reads it there, never from a clock. Nothing to adapt.

## 0.27.0

- A surface no longer says who it waits on as free text (`waiting: "the person, to …"`). It says `attention: { who: "person" | "agent", why }` at `/`, or a list of them; replace each `waiting` fact with it, and drop `waiting` where nobody is needed.
- What `update` returns may now carry `notices`, short lines on what just happened, beside `model` and `commands`. Add one where a call or a command's event finishes something the other side should hear of, and assert them in specs with `agent.noticed()` / `person.noticed()`.
- The present now says first, under `needs`, which tabs need the person or the agent and why; `attention` is no longer among that tab's facts at `/`. Answers and hooks tell what was noticed since the last answer, once, under `notices:`, before what changed. A notice ends a `wait`. What only the agent's own call noticed is not told back to it.
- On the page a tab that needs the person is marked in the strip, a notice is a toast that goes to where it happened, a broken tab is marked, and the launcher says when a later babavoss is out.
- `Running` has a new `notices(fn)`. Anything that implements `Running` by hand must add it.

## 0.26.0

- The shell now frames every tab: the title, the page's menus, an Actions menu with the actions the surface offers at the tab's route and at `/`, and the asks on the right. ⌘K offers all of them first.
- A surface's `ui/index.tsx` should return its content alone: remove the `<Plain label="…">` wrapper, which only drew a bar. Give the page's own commands with `useMenus([{ id, label, items }])` from `babavoss/kit/index.ts`.
- `Plain`, `Workbench` and `MenuBar` still work; inside the shell their menus move into the frame. Keep a layout only for what it adds inside the content.
- Handle names and descriptions now also label buttons and menu items the person sees; name them for both readers.

## 0.25.0

- The shell offers `show at=PATH` at `/` while a tab is open: the person's page brings that tab to the front and opens that route. While the person is writing in a field, or acted on the page in the last few seconds, the page offers the place to click to instead. `/` carries `pointed`, the place last shown and its count.
- A place is a path the surface has a view for, so give each thing its own path (`/issues/:n`), name it under `at` in rows, and keep the page's selection in `useTab().route` with `navigate`, so a refresh, a link and the agent's pointing land on it.

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
