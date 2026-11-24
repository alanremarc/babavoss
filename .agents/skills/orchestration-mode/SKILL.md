---
name: orchestration-mode
description: "Coordinate Baba Voss work through Canvas and subagents in separate worktrees when the person explicitly invokes orchestration mode."
disable-model-invocation: true
---

# Orchestration mode

Enter this mode only when the person explicitly invokes it. The main agent plans, dispatches, reviews, integrates, and communicates with the person. Delegate implementation tickets to subagents in separate worktrees.

## Plan in Canvas

- Use the Canvas skill. Set the brief and Now. Make a `worker=subagent` ticket for each deliverable with its scope, dependencies, expected result, and checks.
- Start ready tickets in plan order. Run up to three independent tickets at a time. Sequence tickets that depend on an unpublished change.
- Put decisions for the person in asks. Record scope changes, blockers, and results on the matching ticket.

## Dispatch and follow a ticket

1. Start the ticket and read its `/canvas/tickets/N` view. Copy the exact `report` command, including the session argument. Keep this Canvas tab open while workers report.
2. Have the harness create the worker's worktree. In T3 use `isolation: "worktree"`. Use the orchestrator's committed head when the ticket depends on it. Verify the starting commit.
3. Assign the worktree's absolute path to the ticket and post its branch and base. Give the worker the ticket scope, checks from `AGENTS.md`, and the exact `report` command. In a fresh checkout, install dependencies at the root and in `.baba/` if setup has not run.
4. Workers report at the start, at meaningful milestones, when blocked, and when ready for review. They make local Conventional Commits and report the checked commit. Publishing and closing tickets are the orchestrator’s tasks. If the Canvas command fails, the worker tells the orchestrator, who posts the update.
5. Follow the harness's completion mechanism. Use the model and settings the person requests. When delegated to choose, prefer Claude Opus 5.5 for design and GPT-6.2 Sol for mechanical implementation or review. When a required model or worktree is unavailable, record the blocker and tell the person.

## Integrate

Review each result against the ticket and integrate compatible commits in the orchestrator's branch. Send substantial revisions back to a worker and handle small review fixes directly. Run the repository checks on the integrated result and record the commit and checks on each ticket.

Publishing follows `AGENTS.md` and the person's authorization. Open or update a pull request when asked. Mark tickets done after their changes merge into `main`. Leave worktrees with unfinished work available for their tickets.
