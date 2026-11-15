# Making surfaces

Read this before making or changing a surface. Run the commands from the `.baba/` directory.

## The loop

1. Make or change a surface. `bun run baba new NAME` makes `surfaces/NAME/` from the template, a surface that runs as it is. Agree with the person first what it is for: its job, your part, what they see in its tab and what they decide there.
2. Test it. `bun test surfaces/NAME` runs its specs: one story per rule. `bun check` checks its types. In a story the test is the world: `world.settle(command, event)` ends a command the surface started; one that keeps running is held open, given one event at a time by `world.send(command, event)`, the actors looking between, and ended by `world.end(command)`.
3. Open it from the shell, give the person the page, and build it one step at a time, each ending in something they can see in its tab.

The running shell takes a surface that was made or removed, and a change to a surface's code, by itself, and the page follows. `bun run baba provision` is for the harnesses: it writes again what makes each aware of the surfaces beside `.baba/`, as installing does.

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
- How it is to be worked is said by its views, as facts: the order of the work, who decides what, when not to act. The template's `how` at `/` is the place for what always holds. Say what depends on the state where the state is: what comes next; who is waited for is `attention`, below. Keep it short, since it is read each time.
- What is mechanical needs no words: what an input may be is in the handle's description, and an action that may not be taken now is not offered.

Every place in a surface has an address, so a refresh, a copied link and the agent's pointing all land on it. Give each thing its own path, `/issues/:n`, and name it under `at` in the rows that list it: the agent reads it and points the person there with the shell's `show`. On the page, keep what is selected in the tab's route, never in component state: `useTab().route` is the path within the tab and `navigate(route)` moves it, as the queue does with `/issues/N`. A route the surface does not know, such as a dropped issue's, falls back to something sensible, the first issue, never an error.

The agent does the work through handles. What only the person may decide is an ask, offered to them alone on the page. The page shows what the surface says and offers the person their decisions; anything else they want changed, they tell the agent.

## Speaking to the shell

A surface tells the shell two kinds of thing, and the shell tells both sides: the agent in its present, the person on the page.

| Kind | What | Written as |
|---|---|---|
| a fact at `/` | what stands, until the surface stops saying it | `title`; `attention`, someone is needed; `broken` |
| a notice from `update` | what just happened, told once and kept nowhere | `notices`, beside `model` and `commands` |

`attention` says who is needed now, `"person"` or `"agent"`, and why, in a few words. The shell gathers it first at `/`, as `needs`, marks the tab in the strip and shows the why; a list says it of both. Where an ask is offered, say it: the ask is how the person decides, `attention` is that they are waited for.

```ts
...(m.proposed !== undefined && { attention: { who: "person", why: "to accept or decline the proposed greeting" }, accept: accept.bind({}) }),
```

A notice is one short line on what just happened, in answer to a call or to a command's event: a draft approved, a run ended. The page shows it as a toast that goes to the tab, and keeps it in the person's notifications; the agent is told it once, but not what its own call alone gave. `at` is a path within the surface it is about. What still holds afterwards belongs in a fact, not a notice.

```ts
update: (m: Model): Update<Model, never> => ({ model: { greeting: m.proposed! }, notices: [`The greeting is now "${m.proposed}"`] }),
```

A surface's activity comes by itself: the shell keeps every call into a tab, at `/activity` and on the page under all activity, as its handle and arguments. A notice is how a surface puts a meaningful line there instead, for a call or for a command's event, and the only way it reaches the person's notifications.

The agent hears notices as it works, after every tool call; facts reach it with the person's next message, or when it reads `/`. A change the agent should react to before then, mid-turn, deserves a notice; one it can take up later is a fact alone. Where the person acts and the surface says nothing, the agent hears only that they acted there. A notice stands for what its update changed: those changes are not told to the agent again, so let the notice say what moved; a need of the agent's is told all the same.

What is there to be looked up rather than followed, rows that are finished or counters, wrap in `detail(value)` from `babavoss/core/index.ts`, a fact or a row of a list. The page and a read of the tab see it as an ordinary value; the shell's present at `/` leaves it out and counts it in one line, `+19 more in issues; read /tabs/3`, and a change to it there is one line too.

```ts
issues: [...open.map(row), ...done.map((issue) => detail(row(issue)))],
```

An action that is the page's own bookkeeping, of no event in the work, such as what the person has seen, takes `quiet: true`: what it changes is told to the agent in no way. An update may return `quiet: true` for an event of the same kind.

A story asserts them as the actors do: `agent.noticed()` and `person.noticed()` give what each was told since it last asked.

The framework is the package `babavoss`, in `node_modules/babavoss`: import it as `babavoss/core/…`; a page takes its components and layouts from the kit, `babavoss/kit/index.ts`, and reaches its tab through the shell's hooks, `useTab` and `useLive` from `babavoss/shell/ui/index.tsx`, with `DrawerProps` beside them; read its code in `framework/` there rather than guessing its interfaces.

A page reads its views with `useLive(path)` and is shown once its first reads have answered, those that depend on others too, as the queue's selected issue does on its list; until then its tab is its quiet ground. So a page draws no loading state of its own, and an empty state it draws is true. When a path it reads moves, as with the route, it keeps the view it had until the new one lands; a change by anyone replaces the view in place. `error` says why a read failed, beside the view it had. A refresh is served with the shell and the shown tab's views at `/` and at its route, so it is drawn whole at once.

## The tab and its menu

A tab is the home of one instance of a surface, with its own state. The page's strip holds home, the babavoss mark, which also shows whether the agent is working, then the tabs, then the notifications. Each tab carries its surface's menu, the same for every surface and made from its views alone: over the tab, or with it focused, its icon gives way to dots that open the menu, as a right click or Shift+F10 does. A page cannot add to it or replace it: `ui/index.tsx` returns its content, which fills the tab under the strip, and optionally `icon` and `drawers`.

- A search of the actions and places of the whole tree below the tab, read breadth-first from `/` along the `at`s.
- The surface's actions at `/`, under its `title`.
- Where the tab's route is below `/`, the actions offered there, under the place's view's `title` or `name`, or its row's.
- Go: every `at` the view where the tab is names, by its row's `title` or `name`, and the way back up; choosing one moves the tab's route, so a page that keeps its place in the route follows. Go of more than 8 places opens on a field that filters it.
- The shell's own: close the tab, close the others, copy its link, reload its views.
- What waits on the person carries one dot, on the tab and on every step of the way to it in the menu: an ask stands first in its group, dotted; an ask at another place, or a notice they have not seen about one, dots Go and that place. Home, the strip's first tab, is the shell's own page, never a surface's: the surfaces to open, the settings among them, the tabs to switch to, and the shell's commands; a surface's actions and places are in its tab's menu alone. ⌘P or Ctrl+P goes home from any tab, and back; ⌘J and ⌘K go to the next and previous tab. The person can rebind them in the settings, a surface that comes with the shell, so a page does not take them for its own.

So the person can do from the menu what the agent can do from the command: name and describe handles for both, and name each place by a `title` or `name` in its row. A view may order its actions in the menu with a `menu` fact, groups each with a label and the names of its actions, the rest after them; it is an ordinary fact the agent reads too, so give it below `/`, as the queue does at `/issues/:n`, where it stays out of the present.

```ts
menu: [{ label: "Move", actions: ["start", "done", "back"] }, { label: "Edit", actions: ["describe", "note"] }],
```

An action with inputs opens a modal. The shell makes a form of its inputs, one field each, under its description. Where the page module exports a drawer for the action by its name, the modal shows that instead: `export const drawers = { add: AddIssue }`, each a component given `{ handle, path, view, submit, close }`. `submit(args)` makes the call with the inputs and resolves with the reason where it is refused; the modal then shows the reason and stays open, and closes once the call is admitted. `close` gives up. A drawer is drawn outside the tab, so the surface's `ui/styles.css` does not reach it.

What is only the page's, presentation such as a lens, a fold or a pane, and a choice a page makes before it calls, is a control in the page's own content, never in the menu: the lab folds its injections and picks the next run's model in its timeline's toolbar. A kit layout inside the content is for a page that needs one, the workbench's toolbars or a welcome page over scopes.

Whose move it is is the shell's too: the mark at the strip's start moves while the agent works and counts the person's changes that wait for its next turn, and home offers to end their move. A surface makes no busy indicator and no end-of-move button of its own.

## Looks

A page follows the person's palette, light or dark mode, by the shell's theming tokens, so it never needs to know which is chosen.

- Use the kit's components and layouts first: they are already in the design language.
- Then the tokens, through Tailwind classes; `framework/kit/defaults.css` defines them:
  - colour: `background` and `foreground`, the page and its text; `muted` and `muted-foreground`, quiet fills and secondary text; `card`, `popover` and `secondary`, each with `-foreground`, raised, floating and quieter panels; `primary` and `primary-foreground`, the one action, the selected, what is live; `accent` and `accent-foreground`, a hovered or current row; `destructive`, `success`, `warning`, `info`, states; `border`, `input`, `ring`, lines, field outlines, focus; `sidebar`, the shell's chrome; `chart-1` to `chart-5`, a chart's series. As `bg-primary`, `text-muted-foreground`, `border-border`, `bg-success/10`.
  - type: `text-badge` 9px, `text-meta` 11px, `text-body` 12px, the frame's default, `text-large` 13px; Tailwind's `text-sm` and up for headings.
  - font: `font-sans`, `font-heading`, `font-mono`.
  - radius: `rounded-sm` to `rounded-4xl`, from the palette's `--radius`.
  - frame: `h-menubar`, `h-bar` and `h-row`, the heights of a compact header, a bar, a row or icon button; `size-icon`, `size-rail-icon`, `size-glyph`, icons. Spacing is Tailwind's.
- Never hard-code a colour, a font or a size where a token fits.

Where a surface needs more, `ui/styles.css` beside its component is its own stylesheet. The shell takes it after its own, inside `@scope ([data-surface="NAME"])`, the element that holds each of its tabs: its rules reach its tabs and nothing else, and are not layered, so they win over a class. `:scope { … }` is the tab itself: set the surface's own tokens there as CSS variables, `--lane-idle: var(--border)`, and override a shell token there, `--primary: …`, for its tabs alone. `@apply` works in it; `@theme`, `@import` and `:root` do not, and a dialog, popover or tooltip, drawn outside the tab, keeps the shell's tokens. Do not import it from `ui/index.tsx`.

## The harnesses

Each harness beside `.baba/` is made aware by its own adapter when `.baba/` is installed or provisioned. Claude Code gets `.claude/skills/baba`, a link to the package's plugin: the skill and the hook, loaded once the folder is trusted. Codex gets the skill in `.agents/skills/baba` and the hook in `.codex/hooks.json`, among the person's own hooks; Codex asks the person to review them once, with `/hooks`. With no configuration every harness is set up so. Where the person wants otherwise, `.baba/baba.config.ts` says it:

```ts
import { config } from "babavoss/core/config.ts"

export default config({
  harnesses: {
    claude: { enable: true, events: ["SessionStart", "UserPromptSubmit", "Stop", "StopFailure", "SessionEnd"] },
    codex: { enable: false },
  },
})
```

A section per harness, each starting with `enable`; `enable: false` takes back what baba wrote for that harness at the next `bun run baba provision`. `events` lists the hook's events that tell anything, all by default; the hook reads it as it runs, so a change needs no provisioning. Codex's section takes `network: true` too, which opens the sandbox's network in `.codex/config.toml` where that file does not already say, so the shell's command reaches its runtime. A configuration that does not load stops provisioning with its error, and keeps the hooks silent until it is corrected; the shell's answer says so.

## Updating

When an answer says a later babavoss is out, take it with the command it gives, unless the person said not to. Then read `node_modules/babavoss/CHANGELOG.md` from the version the surfaces ran on up, adapt the surfaces to what changed, and run their specs. Installing provisions again.
