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

A story asserts them as the actors do: `agent.noticed()` and `person.noticed()` give what each was told since it last asked.

The framework is the package `babavoss`, in `node_modules/babavoss`: import it as `babavoss/core/…`; a page takes its components and layouts from the kit, `babavoss/kit/index.ts`, and reaches its tab through the shell's hooks, `useTab` and `useLive` from `babavoss/shell/ui/index.tsx`; read its code in `framework/` there rather than guessing its interfaces.

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
