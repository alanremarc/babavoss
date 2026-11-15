# Making surfaces

Read this before making or changing a surface. Run the commands from the `.baba/` directory.

## The loop

1. Make or change a surface. `bun run baba new NAME` makes `surfaces/NAME/` from the template, a surface that runs as it is. Agree with the person first what it is for: its job, your part, what they see in its tab and what they decide there.
2. Test it. `bun test surfaces/NAME` runs its specs: one story per rule. `bun check` checks its types.
3. Open it from the root, give the person the page, and build it one step at a time, each ending in something they can see in its tab.

The running root takes a surface that was made or removed, and a change to a surface's code, by itself, and the page follows. `bun run baba provision` is for the harness: it writes the skill baba and the framework's hook beside `.baba/` again, as installing does.

## A surface

```text
surfaces/NAME/
  src/surface.ts   the surface, the default export: what is true and what can be done, made for the agent first
  ui/index.tsx     its page, the default export: a component shown in its tab, over the same surface; `icon`, where exported, is the tab's
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

A notice is one short line on what just happened, in answer to a call or to a command's event: a draft approved, a run ended. The page shows it as a toast that goes to the tab; the agent is told it once, but not what its own call alone gave. `at` is a path within the surface it is about. What still holds afterwards belongs in a fact, not a notice.

```ts
update: (m: Model): Update<Model, never> => ({ model: { greeting: m.proposed! }, notices: [`The greeting is now "${m.proposed}"`] }),
```

A surface's activity comes by itself: the shell keeps every call into a tab, at `/activity` and on the page, as its handle and arguments. A notice is how a surface puts a meaningful line there instead, for a call or for a command's event.

A story asserts them as the actors do: `agent.noticed()` and `person.noticed()` give what each was told since it last asked.

The framework is the package `babavoss`, in `node_modules/babavoss`: import it as `babavoss/core/…`; a page takes its components and layouts from the kit, `babavoss/kit/index.ts`, and reaches its tab through the shell's hooks, `useTab` and `useLive` from `babavoss/shell/ui/index.tsx`; read its code in `framework/` there rather than guessing its interfaces.

## The frame

The shell draws one bar above every tab, the same for every surface: the title, the surface's `title` fact at `/` or its name; the page's menus; an Actions menu; and at the right what waits on the person. `ui/index.tsx` returns its content alone, with no bar of its own.

- The actions are there by themselves: every handle the view offers at the tab's route and at `/`, by its name, its description on hover, and with a prompt for its inputs. An ask stands out at the right of the bar. So the person can do from the frame what the agent can do from the command; name and describe handles for both.
- The page's own commands, presentation such as a lens, a pane or a fold, are menus: `useMenus([{ id: "view", label: "View", items }])` from the kit. Every entry is in the palette too.
- ⌘K or Ctrl+K opens the palette over all of it: the tab's asks, actions and menus first, then the surfaces to open and the tabs to switch to.
- A kit layout inside the content is for a page that needs one, the workbench's toolbars or a welcome page over scopes; its menus join the frame's.
- Whose move it is is the shell's too: the strip says whether the agent is working or idle, and how many of the person's changes wait for its next turn. A surface makes no busy indicator and no end-of-move button of its own.

## Looks

A page follows the person's palette, light or dark mode, by the shell's theming tokens, so it never needs to know which is chosen.

- Use the kit's components and layouts first: they are already in the design language.
- Then the tokens, through Tailwind classes; `framework/kit/defaults.css` defines them:
  - colour: `background` and `foreground`, the page and its text; `muted` and `muted-foreground`, quiet fills and secondary text; `card`, `popover` and `secondary`, each with `-foreground`, raised, floating and quieter panels; `primary` and `primary-foreground`, the one action, the selected, what is live; `accent` and `accent-foreground`, a hovered or current row; `destructive`, `success`, `warning`, `info`, states; `border`, `input`, `ring`, lines, field outlines, focus; `sidebar`, the frame's chrome; `chart-1` to `chart-5`, a chart's series. As `bg-primary`, `text-muted-foreground`, `border-border`, `bg-success/10`.
  - type: `text-badge` 9px, `text-meta` 11px, `text-body` 12px, the frame's default, `text-large` 13px; Tailwind's `text-sm` and up for headings.
  - font: `font-sans`, `font-heading`, `font-mono`.
  - radius: `rounded-sm` to `rounded-4xl`, from the palette's `--radius`.
  - frame: `h-menubar`, `h-bar` and `h-row`, the heights of the menu bar, a bar below it, a row or icon button; `size-icon`, `size-rail-icon`, `size-glyph`, icons. Spacing is Tailwind's.
- Never hard-code a colour, a font or a size where a token fits.

Where a surface needs more, `ui/styles.css` beside its component is its own stylesheet. The root takes it after the shell's, inside `@scope ([data-surface="NAME"])`, the element that holds each of its tabs: its rules reach its tabs and nothing else, and are not layered, so they win over a class. `:scope { … }` is the tab itself: set the surface's own tokens there as CSS variables, `--lane-idle: var(--border)`, and override a shell token there, `--primary: …`, for its tabs alone. `@apply` works in it; `@theme`, `@import` and `:root` do not, and a dialog, popover or tooltip, drawn outside the tab, keeps the shell's tokens. Do not import it from `ui/index.tsx`.

## Updating

When an answer says a later babavoss is out, take it with the command it gives, unless the person said not to. Then read `node_modules/babavoss/CHANGELOG.md` from the version the surfaces ran on up, adapt the surfaces to what changed, and run their specs. Installing provisions again.
