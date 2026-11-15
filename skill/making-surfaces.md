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
- How it is to be worked is said by its views, as facts: the order of the work, who decides what, when not to act. The template's `how` at `/` is the place for what always holds. Say what depends on the state where the state is: what is waited for, what comes next. Keep it short, since it is read each time.
- What is mechanical needs no words: what an input may be is in the handle's description, and an action that may not be taken now is not offered.

The agent does the work through handles. What only the person may decide is an ask, offered to them alone on the page. The page shows what the surface says and offers the person their decisions; anything else they want changed, they tell the agent.

The framework is the package `babavoss`, in `node_modules/babavoss`: import it as `babavoss/core/…`; a page takes its components and layouts from the kit, `babavoss/kit/index.ts`, and reaches its tab through the shell's hooks, `useTab` and `useLive` from `babavoss/shell/ui/index.tsx`; read its code in `framework/` there rather than guessing its interfaces.

## Updating

When an answer says a later babavoss is out, take it with the command it gives, unless the person said not to. Then read `node_modules/babavoss/CHANGELOG.md` from the version the surfaces ran on up, adapt the surfaces to what changed, and run their specs. Installing provisions again.
