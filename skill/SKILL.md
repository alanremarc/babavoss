---
name: baba
description: Make and maintain the roles your agent plays, each with a page for the person. Use when making, changing or trying a role, or when a task deserves a tool of its own before it is done.
compatibility: Requires Bun 1.4 or later
---

A role is software you operate for the person: a surface you read and act on through a command, and a page where they watch and decide over the same surface. The roles here are code in `.baba/`, which is at `<the directory this file is in>/../../../.baba`. Each is given to the harness as a skill of its name by provisioning; this skill is provisioned with them.

Run the commands below from that `.baba/` directory.

## The loop

1. Make or change a role. `bun run baba new NAME` makes `roles/NAME/` from the template, a role that runs as it is. Agree with the person first what it is for: its job, your part, what they see on the page and what they decide there.
2. Test it. `bun test roles/NAME` runs its specs: one story per rule of its surface. `bun check` checks its types.
3. Provision it. `bun run baba provision` writes the skills of every role beside `.baba/`. A new role is found by a new session of the harness; tell the person. A change to a role's code needs no provisioning, and a running role loads it by itself.

Then open the role as its skill says, give the person its page, and build it one step at a time, each ending in something they can see there.

## A role

```text
roles/NAME/
  ROLE.md           its description, in the frontmatter, and its own know-how: the order of the work, who decides what, when not to act
  scripts/open.ts   its door, the same in every role
  src/app.ts        its definition: name, surface and page
  src/surface.ts    the surface: what is true and what can be done, made for the agent first
  ui/               the page, over the same surface
  spec/             its rules, as stories
```

The description says what the role does and when to use it: a phrase and a "use when". What is mechanical belongs in the surface, not in ROLE.md: what an input may be, in the handle's description; what must be waited for, as a fact. How to open and operate a role is written into every skill by provisioning; do not repeat it.

The framework is the package `babavoss`, in `node_modules/babavoss`: import it as `babavoss/core/…` and `babavoss/shell/…`, and read its code in `framework/` there rather than guessing its interfaces.

## Updating

A role's door says when a later babavoss is out, with the command that takes it. Take it unless the person said not to. Then read `node_modules/babavoss/CHANGELOG.md` from the version the roles ran on up, adapt the roles to what changed, and run their specs. Installing provisions again, so this skill is then the new version's: read it again.
