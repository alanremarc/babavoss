# Making surfaces

Read this before making or changing a surface. Run the commands from the `.baba/` directory.

## The loop

1. Make or change a surface. `bun run baba new NAME` makes `surfaces/NAME/` from the template, a surface that runs as it is. Agree with the person first what it is for: its job, your part, what they see in its tab and which decisions are theirs.
2. Test it. `bun test surfaces/NAME` runs its specs: one story per rule. `bun check` checks its types. In a story the test is the world: `world.settle(command, event)` ends a command the surface started; one that keeps running is held open, given one event at a time by `world.send(command, event)`, the actors looking between, and ended by `world.end(command)`.
3. Open it from the shell, give the person the page, and build it one step at a time, each ending in something they can see in its tab.

The running shell runs the code it started with. A surface made, changed or removed runs once it restarts, a fresh runtime in its place, at the same address, every tab and its state kept: in dev mode at once, by itself; otherwise when you restart it. Until then `/` says the code changed, with the command, `restart`. With nothing under way it restarts and answers. With work under way it drains: it takes no new calls, restarts once that work ended, and answers at once naming its instance; `follow` with that instance waits until the one in its place answers, and says so at once where it is gone already. `sleep` cuts the work instead, and the next call starts it again. In dev mode a change to a surface's code cuts what runs, and the next answer says what was cut; a change to its page alone reloads the open pages. `bun run baba provision` is for the harnesses: it writes again what makes each aware of the surfaces beside `.baba/`, as installing does.

## A surface

```text
surfaces/NAME/
  src/surface.ts   the surface, the default export: what is true and what can be done, made for the agent first
  ui/index.tsx     its page, the default export: a component shown in its tab, over the same surface; `icon`, where exported, is the
                   tab's, and `drawers` ask an action's inputs
  spec/            its rules, as stories
```

Everything an agent learns of a surface, it learns from the surface. There is no file of instructions beside it.

- `description` is how the shell lists it, and so how an agent chooses it: what it does and when to use it, a phrase and a "use when".
- How it is to be worked is said by its views, as facts: the order of the work, who decides what, when not to act. The template's `how` at `/` is the place for what always holds. Say what depends on the state where the state is: what comes next; that the person's word is waited for is a highlight, below. Keep it short, since it is read each time.
- What is mechanical needs no words: what an input may be is declared with it, and an action that may not be taken now is not offered.

Every place in a surface has an address, so a refresh, a copied link and the agent's pointing all land on it. Give each thing its own path, `/issues/:n`, and name it under `at` in the rows that list it: the agent reads it and marks it for the person with the shell's `highlight`. On the page, keep what is selected in the tab's route, never in component state: `useTab().route` is the path within the tab and `navigate(route)` moves it, as the queue does with `/issues/N`. A route the surface does not know, such as a dropped issue's, falls back to something sensible, the first issue, never an error.

The agent and the person are offered the same handles: the agent does the work through them, and the person may take any of them on the page. Where a decision is the person's, the view says so, in `how` or where it stands, and the agent raises it in the conversation: it acts on their word there, or they take the same handle on the page. The conversation is where the person steers; the page shows what the surface says and offers them their decisions, and anything else they want changed, they tell the agent.

## A handle

The agent reads a view's handles in one block: the command once, with `ACTION` for the name and the arguments they all share, then a line per handle, its name, its own arguments and its description. Its name says what it does; the rest says what the name does not.

- A description is one clause that adds what the name does not say: the effect, or when to use it. It never repeats the handle's name, its subject or the command; lower case, no full stop; empty where the name says it all. `done`: "its work is merged into main"; `start`: "when a subagent begins on it"; `describe`: "".
- An input declares its base type, `"string"`, `"number"` or `"boolean"`, and beside it what it means where the type alone does not say: `kind`, a word, `line`, `markdown` and `path` being the text the page's form knows, any other the surface's own and said with its type, as `id(string)`; `choices`, the values it may take, said `light|dark|system`; or `range`, whole numbers, said `1..5`. One declaration serves the agent, the form, a picker or a box of several lines, and admission, which refuses a value outside the choices or the range, saying what is allowed.

```ts
const start = action({
  name: "start",
  description: "when a subagent begins on it",
  subject: { n: "number" },
  inputs: { lane: { type: "number", range: [1, 5] } },
  update: (w: Work, { n, lane }) => …,
})
```

## Speaking to the shell

A surface tells the shell two kinds of thing, and the shell tells both sides: the agent in its present, the person on the page.

| Kind | What | Written as |
|---|---|---|
| a fact at `/` | what stands, until the surface stops saying it | `title`; `broken` |
| a notice from `update` | what just happened, told once, kept in no view: the line of its action in the log | `notices`, beside `model` and `commands` |

A notice is one short line on what just happened, in answer to a call or to a command's event: a draft approved, a run ended. The page keeps it in the tab's drawer, folded with the tab's other ordinary entries until the person opens the fold; the agent is told it once, but not what its own call alone gave. `at` is a path within the surface it is about. What still holds afterwards belongs in a fact, not a notice.

```ts
update: (m: Model): Update<Model, never> => ({ model: { greeting: m.proposed! }, notices: [`The greeting is now "${m.proposed}"`] }),
```

A notice marked `highlight: true` is a highlight: what happened that the person should look at, such as a proposal that waits on their word, or a run that failed. Their page shows it as a bubble beside its tab for a moment and marks the tab with a dot until they open its drawer, where highlights are what its thread shows, each with who raised it, when and where it goes; the agent is told it first among what it hears. The agent raises one of its own with the shell's `highlight`. Mark only what deserves it: everything else is folded between the highlights, a line that says how many and by whom, for whoever opens it.

```ts
update: (m, { text }) => ({ model: { ...m, proposed: text }, notices: [{ text: `"${text}" is proposed, to accept or decline`, highlight: true }] }),
```

A surface's activity comes by itself: the shell keeps a log of every action in a tab, for auditing rather than replay, at `/activity` and in its tab's drawer. An entry says when; who, the person, the agent or the world; where; the handle and its inputs, one past 200 characters cut and a credential never kept; and what came of it, done, or refused with why. An event of a session command is the world's, named by the command's `kind`, so name a command for what it hears, `watch-work-file`; its silent events in a row are one entry with a count. An event of work a call started is the caller's, kept only where the surface says a line about it. A notice is how a surface adds its own line to an entry, for a call or for an event, and the only way it reaches the person as words: in an opened fold the drawer shows it as a message, the call under it, calls in a row with no line as one line, and the calls of one program run with `-e`, which share its name in `id`, as one line that says where a refusal stopped it. Of the ordinary entries, only the newest is shown unasked, one faint line under the fold at the thread's foot. The model holds a tab's newest 200 entries; its whole log is kept in the tab's own files. When the tab closes, its state and its log leave the session's present for the archive of closed tabs, read only at `/activity/closed`, where the agent reads them; it is never opened again with them. The archive clears itself after a window the person sets, and on their word.

The agent hears notices as it works, after every tool call; facts reach it with the person's next message, or when it reads `/`. A change the agent should react to before then, mid-turn, deserves a notice; one it can take up later is a fact alone. Where the person acts and the surface says nothing, the agent hears only that they acted there. A notice stands for what its update changed: those changes are not told to the agent again, so let the notice say what moved.

What is there to be looked up rather than followed, rows that are finished or counters, wrap in `detail(value)` from `babavoss/core/index.ts`, a fact or a row of a list. The page and a read of the tab see it as an ordinary value; the shell's present at `/` leaves it out and counts it in one line, `+19 more in issues; read /tabs/3`, and a change to it there is one line too.

```ts
issues: [...open.map(row), ...done.map((issue) => detail(row(issue)))],
```

An action that is the page's own bookkeeping, of no event in the work, such as a drawer the person opened, takes `quiet: true`: what it changes is told to the agent in no way, and kept in no log. An update may return `quiet: true` for an event of the same kind.

A story asserts them as the actors do: `agent.noticed()` and `person.noticed()` give what each was told since it last asked.

The framework is the package `babavoss`, in `node_modules/babavoss`, and it can be imported only by its entries:

- `babavoss/core/index.ts`, for a surface's source and specs: `surface`, `view`, `action`, `story`, a harness and the rest; a page takes its types, as `Handle`.
- `babavoss/kit/index.ts`, for a page: the primitives, `cn` and the theme.
- `babavoss/shell/ui/index.tsx`, for a page: its tab, `useTab`, `useLive`, `useShell`, `useConventions`, with `DrawerProps` and `HomeProps`.
- `babavoss/core/config.ts`, for `.baba/baba.config.ts` alone.

Anything else, a file of the framework by its path, does not resolve. What a page needs beyond the entries it keeps in its own folder; read the framework's code in `framework/` there rather than guessing its interfaces.

A page reads its views with `useLive(path)` and is shown once its first reads have answered, those that depend on others too, as the queue's selected issue does on its list; until then its tab is its quiet ground. So a page draws no loading state of its own, and an empty state it draws is true. When a path it reads moves, as with the route, it keeps the view it had until the new one lands; a change by anyone replaces the view in place. `error` says why a read failed, beside the view it had. A refresh is served with the shell and the shown tab's views at `/` and at its route, so it is drawn whole at once.

## The tab and its menu

A tab is the home of one instance of a surface, with its own state. The page's rail, at the side of the page the person chose, holds home, the babavoss mark, which also shows whether the agent is working, then the tabs, newest beside it. Each tab has a drawer, the same for every surface: its menu at the head, made from its views alone, over its activity as a thread of its highlights, the rest folded between them. A click on the tab shown opens it, as a right click, the context-menu key or the drawer's shortcut does. A page cannot add to it or replace it: `ui/index.tsx` returns its content, which fills the tab beside the rail, and optionally `icon` and `drawers`.

- A search of the actions and places of the whole tree below the tab, read breadth-first from `/` along the `at`s.
- The surface's actions at `/`, under its `title`.
- Where the tab's route is below `/`, the actions offered there, under the place's view's `title` or `name`, or its row's.
- Go: every `at` the view where the tab is names, by its row's `title` or `name`, and the way back up; choosing one moves the tab's route, so a page that keeps its place in the route follows. Go of more than 8 places opens on a field that filters it.
- The shell's own: close the tab, close the others, copy its link, reload its views.
- A highlight the person has not opened carries one dot: on the tab, until they open its drawer; and in the menu then, on Go and every step of the way to the place it is about. Home, the rail's first tab, is the shell's own page, never a surface's, with a drawer of its own: the shell's actions, the tabs as its places, the shell's own entries, and under them the closed tabs, each opening its log read only; a surface's actions and places are in its tab's menu alone. ⌘P or Ctrl+P opens the drawer of the tab shown, and closes it; ⌘J and ⌘K go to the previous and next tab along the rail. The person can rebind them in the settings, a surface that comes with the shell, so a page does not take them for its own.

So the person can do from the menu what the agent can do from the command: name and describe handles for both, and name each place by a `title` or `name` in its row. An entry is its handle's name, the description its hint; where several entries bind one handle to different subjects, each is the name and the `title` or `name` of the row it stands in, as home's "Close Queue" for each tab, else its subject's values. A view may order its actions in the menu with a `menu` fact, groups each with a label and the names of its actions, the rest after them; it is an ordinary fact the agent reads too, so give it below `/`, as the queue does at `/issues/:n`, where it stays out of the present.

```ts
menu: [{ label: "Move", actions: ["start", "done", "back"] }, { label: "Edit", actions: ["describe", "note"] }],
```

An action with inputs opens a modal. The shell makes a form of its inputs, one field each as it is declared, a picker for choices or a narrow range and a box of several lines for markdown, under its description. Where the page module exports a drawer for the action by its name, the modal shows that instead: `export const drawers = { add: AddIssue }`, each a component given `{ handle, path, view, submit, close }`. `submit(args)` makes the call with the inputs and resolves with the reason where it is refused; the modal then shows the reason and stays open, and closes once the call is admitted. `close` gives up. A drawer is drawn outside the tab, so the surface's `ui/styles.css` does not reach it.

What is only the page's, presentation such as a lens, a fold or a pane, and a choice a page makes before it calls, is a control in the page's own content, never in the menu: the lab folds its injections and picks the next run's model in its timeline's toolbar. The kit's parts of a content, a toolbar with its segments and a page, are there for a page that wants them.

Whose move it is is the shell's too: the mark on the rail moves while the agent works, and home's drawer says which of the person's changes wait for its next turn. A surface makes no busy indicator and no end-of-move button of its own.

## A page's own

A page is a React component the shell wraps in its tab. Inside the tab everything is the surface's: any library installed in `.baba/`, any pattern, its own CSS. The kit is where to start: shadcn's primitives with one layer of opinions, and nothing more. What a page needs beyond them is the project's own shadcn components, or the surface's own in its folder, as the lab's thread and composer are in `surfaces/lab/ui/components/`. The rail, a tab's drawer with its menu and thread, a modal's frame and the theme's tokens are the shell's.

- A library: `bun add NAME` in `.baba/`, then import it. The page has one React, the framework's, whatever a library brings. A library's own stylesheet is imported from the page, `import "NAME/dist/style.css"`; it is not scoped, so restyle it to the tokens in `ui/styles.css`.
- A shadcn component: `bunx shadcn@latest add NAME` in `.baba/` writes it to `components/ui/`, shared by every surface, imported as `@/components/ui/NAME`. It reads the tokens the shell's theme defines, so it follows the palette and the mode. The css file `components.json` names is not part of the page: what the CLI writes there changes nothing.
- Tailwind sees every file in `.baba/` but `node_modules`. A package whose own classes must be generated is named by a `@source` line in `ui/styles.css`, its path from there: `@source "../../../node_modules/NAME";`.
- The shell's services, by convention, from `useShell()`: `toast(text, at?)`, a bubble beside the tab for a moment, which a click follows to `at`, kept nowhere and not told to the agent, where what both sides should know is a notice from `update`; `open(surface)`, its tab, the open one or a new one; `go(at)`, a place by its whole path, `/queue/issues/3`; `appearance`, `{ mode, theme }`, for a library that must be told them, such as a chart's or an editor's. A page drawn by the tokens needs none of it.

## Home

A click on the mark shows home: by default a desktop, an icon a surface, with Open or how many tabs under it, marked where a tab of it is broken or holds a highlight; a click goes to its newest tab or opens one. A project may draw its own: `.baba/home.tsx`, whose default export takes the desktop's place, given `HomeProps` from `babavoss/shell/ui/index.tsx`: the project's `title`, a `notice` where there are no surfaces, `surfaces` each with `name`, `label`, `description`, `icon`, and `open()` or why it is `broken`, the open `tabs` newest first each with `label`, `surface`, `icon`, `mark` and `go()`, and the `foot` that says the root, its version, the session and its harness, to place where it fits. It is a page like a surface's, drawn with the kit; it has no view, so its state is the surfaces'. Made or removed, the root's page is generated again with it.

```tsx
import type { HomeProps } from "babavoss/shell/ui/index.tsx"

export default function Home({ title, surfaces, tabs, foot }: HomeProps) {
  return <main className="flex flex-1 flex-col gap-4 p-8">…{foot}</main>
}
```

## Looks

A page follows the person's palette, light or dark mode, by the shell's theming tokens, so it never needs to know which is chosen.

- Use the kit's components first, then the project's shadcn components: they are already in the design language.
- Then the tokens, through Tailwind classes; `framework/kit/defaults.css` defines them:
  - colour: `background` and `foreground`, the page and its text; `muted` and `muted-foreground`, quiet fills and secondary text; `card`, `popover` and `secondary`, each with `-foreground`, raised, floating and quieter panels; `primary` and `primary-foreground`, the one action, the selected, what is live; `accent` and `accent-foreground`, a hovered or current row; `destructive`, `success`, `warning`, `info`, states; `border`, `input`, `ring`, lines, field outlines, focus; `sidebar`, the shell's chrome; `chart-1` to `chart-5`, a chart's series. As `bg-primary`, `text-muted-foreground`, `border-border`, `bg-success/10`.
  - type: `text-badge` 9px, `text-meta` 11px, `text-body` 12px, the frame's default, `text-large` 13px, the kit's whole scale; Tailwind's `text-sm` and up for a page's headings.
  - font: `font-sans`, `font-heading`, `font-mono`.
  - radius: `rounded-sm` to `rounded-4xl`, from the palette's `--radius`.
  - frame: `h-menubar`, `h-bar` and `h-row`, the heights of a compact header, a bar, a row or icon button; `size-icon`, `size-rail-icon`, `size-glyph`, icons. Spacing is Tailwind's.
- Never hard-code a colour, a font or a size where a token fits.

The shell hands every page, home's included, its conventions: how the person wants pages to be, from their settings and the machine. A page interprets them by its own code. Following them is expected, and nothing checks it: a page that ignores one still works.

- `motion`, `full` or `reduced`: where reduced, nothing moves. The kit stills every CSS animation and transition; a page that moves by script checks it.
- `scale`, the text size, 1 by default: the kit sizes in rem, which the scale sizes, so a page drawn by the tokens follows unasked. Never size text in px.
- `side`, `left` or `right`: where a page's own sidebar stands.
- `rail`, `left`, `right`, `top` or `bottom`: where the shell's tabs stand, to keep clear of or to mirror.
- `mode`, `light` or `dark`, as shown.

A page reads them from `useConventions()` in `babavoss/shell/ui/index.tsx`, or by CSS alone: each stands on the page's root as `data-NAME`, a number as `--NAME` too, with the variants `motion-safe:`, `motion-reduce:`, `side-left:`, `side-right:`, `rail-left:`, `rail-right:`, `rail-top:`, `rail-bottom:` and `dark:`.

```tsx
<div className="flex side-left:flex-row-reverse">
  <main className="flex-1">…</main>
  <aside className="w-72 border-l side-left:border-l-0 side-left:border-r">…</aside>
</div>

const { motion } = useConventions()
row.scrollIntoView({ behavior: motion === "reduced" ? "auto" : "smooth" })
```

Where a surface needs more, `ui/styles.css` beside its component is its own stylesheet. The shell takes it after its own, inside `@scope ([data-surface="NAME"])`, the element that holds each of its tabs: its rules reach its tabs and nothing else, and are not layered, so they win over a class. `:scope { … }` is the tab itself: set the surface's own tokens there as CSS variables, `--lane-idle: var(--border)`, and override a shell token there, `--primary: …`, for its tabs alone. `@apply` and `@source` work in it; `@theme`, `@import` and `:root` do not, and a dialog, popover or tooltip, drawn outside the tab, keeps the shell's tokens. Do not import it from `ui/index.tsx`.

## The harnesses

Each harness beside `.baba/` is made aware by its own adapter when `.baba/` is installed or provisioned. Claude Code gets `.claude/skills/baba`, a link to the package's plugin: the skill and the hook, loaded once the folder is trusted. Codex gets the skill in `.agents/skills/baba` and the hook in `.codex/hooks.json`, among the person's own hooks; Codex asks the person to review them once, with `/hooks`. With no configuration every harness is set up so. Where the person wants otherwise, `.baba/baba.config.ts` says it:

```ts
import { config } from "babavoss/core/config.ts"

export default config({
  title: "Billing desk",
  dev: true,
  harnesses: {
    claude: { enable: true, events: ["SessionStart", "UserPromptSubmit", "Stop", "StopFailure", "SessionEnd"] },
    codex: { enable: false },
  },
})
```

`title` names the root: home's heading, the page's title and the title the agent reads at `/`; without it, the root is named after the project directory. The root reads it as it starts, and `dev`: true, and the shell restarts at once whenever its code changes, cutting what runs, as while the surfaces are being made; false or absent, the default, and it runs the code it started with until restarted. `BABAVOSS_DEV=1` or `0` in the environment overrides it. A section per harness, each starting with `enable`; `enable: false` takes back what baba wrote for that harness at the next `bun run baba provision`. `events` lists the hook's events that tell anything, all by default; the hook reads it as it runs, so a change needs no provisioning. Codex's section takes `network: true` too, which opens the sandbox's network in `.codex/config.toml` where that file does not already say, so the shell's command reaches its runtime. A configuration that does not load stops provisioning with its error, and keeps the hooks silent until it is corrected; the shell's answer says so.

## Updating

When an answer says a later babavoss is out, take it with the command it gives, unless the person said not to. Then read `node_modules/babavoss/CHANGELOG.md` from the version the surfaces ran on up, adapt the surfaces to what changed, and run their specs. Installing provisions again; restart the shell to run the version taken.
