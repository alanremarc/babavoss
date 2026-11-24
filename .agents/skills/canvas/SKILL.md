---
name: canvas
description: "Plan Baba Voss work and record progress, decisions, tickets, notes, and milestones in this worktree's Canvas."
---

# Canvas

Open the shell's `canvas` surface if it is closed. Its views show the current work and the commands for each action. Canvas is shared by the sessions of this worktree. Git ignores its state and the root `notes/` directory.

- **Title and brief.** State the goal and constraints when work starts.
- **Now.** Keep one to three short lines on active work and the next step. Update it when either changes.
- **Asks.** Put decisions for the person here and raise them in the conversation. Write options as `a | *b`, with `*` marking a recommendation. Record the answer and withdraw an ask that no longer matters.
- **Plan.** Add one ticket per deliverable. Use `worker=main` for direct work and `worker=subagent` for delegated work. Group related tickets into phases when it helps. Set their order with `order`. Start each ticket as work begins. Post results or blockers on the ticket. Mark repository changes done once they are merged to `main`. Use `drop` when work stops and give the reason.
- **Notes.** Put findings and longer material in `notes/<name>.md`. Start with a title and one-line summary. Use level-two headings for the contents. Put enduring design in `docs/` and follow the approval rule for `docs/DESIGN.md`. For an embedded figure, use `![name](figures/name.html)` and follow the [figure rules](references/figures.md).
- **Journal.** Log decisions and milestones that help the person follow the work. Canvas also logs finished tickets and answered asks.

Use short, direct sentences. Put the result first. Keep supporting detail on the ticket or in a note. Use `$orchestration-mode` when the person explicitly asks to coordinate work through subagents.
