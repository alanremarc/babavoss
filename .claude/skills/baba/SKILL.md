---
name: baba
description: Make and maintain the roles your agent plays, each with a page for the person. Use when making, changing or trying a role, or when a task deserves a tool of its own before it is done.
compatibility: Requires Bun 1.4 or later
---

A role is software you operate for the person: a surface you read and act on through a command, and a page where they watch and decide over the same surface. The roles here are code in `.baba/`, which is at `<the directory this file is in>/../../../.baba`. Each is given to the harness as a skill of its name by provisioning; this skill is provisioned with them.

Run the commands below from that `.baba/` directory.

## The root

`.baba/` has a root: one runtime for this session, with one page. Its first tab lists the roles, and each role is opened beside it as a tab of its own the first time its skill is used.

Where this session began with these words, the root is started already and its answer follows them. Otherwise start it with `bun run baba start`. Its answer is the framework's version, the page's address, the roles and the tabs that are open, each with what is true in it. Open the page in the harness's browser if it has one, and otherwise give its address to the person; do so again whenever an answer names a new address.

The root sleeps when nothing has called it for a while and when told to close, and any command wakes it where it was: its tabs and their state are kept for the session. There is nothing to keep running. To see that it is up, read it: the answer's first lines name the command, and that command with `/` reads the root.

## The loop

1. Make or change a role. `bun run baba new NAME` makes `roles/NAME/` from the template, a role that runs as it is. Agree with the person first what it is for: its job, your part, what they see on the page and what they decide there.
2. Test it. `bun test roles/NAME` runs its specs: one story per rule of its surface. `bun check` checks its types.
3. Provision it. `bun run baba provision` writes the skills of every role beside `.baba/`, and the framework's hook into the harness's settings: through it a session begins with these words and the root started, and you are told what changed in an open tab, such as what the person did on the page, without asking.

A new role's skill is found by a new session of the harness; tell the person. In this one, open it with `bun run baba role NAME`. A change to a role's code needs no provisioning: the running root loads it by itself, and the page follows.

Build a role one step at a time, each ending in something the person can see in its tab.

## A role

```text
roles/NAME/
  ROLE.md        its description, in the frontmatter, and its own know-how: the order of the work, who decides what, when not to act
  src/role.ts    its surface, the default export: what is true and what can be done, made for the agent first
  ui/index.tsx   its page, the default export: a component shown in its tab, over the same surface; `icon`, where exported, is the tab's
  spec/          its rules, as stories
```

The description says what the role does and when to use it: a phrase and a "use when". What is mechanical belongs in the surface, not in ROLE.md: what an input may be, in the handle's description; what must be waited for, as a fact. How to open and operate a role is written into every skill by provisioning; do not repeat it.

The framework is the package `babavoss`, in `node_modules/babavoss`: import it as `babavoss/core/…` and `babavoss/shell/…`, and read its code in `framework/` there rather than guessing its interfaces.

## Updating

The root's door says when a later babavoss is out, with the command that takes it. Take it unless the person said not to. Then read `node_modules/babavoss/CHANGELOG.md` from the version the roles ran on up, adapt the roles to what changed, and run their specs. Installing provisions again, so this skill is then the new version's: read it again.
