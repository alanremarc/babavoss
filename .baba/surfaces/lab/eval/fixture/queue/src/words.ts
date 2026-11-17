// The fixture's words: its description, its `how` and each action's description, apart from its code, so a variant of
// the eval can run the same queue with other words (../../../words/). These say mechanics alone: what a thing is, what an
// action does and what must hold for it; never when to act, how to run the work, or who decides.
export const LANES = 5

export const words = {
  description: "The session's work as issues, each a draft, in the backlog, in a lane or done, on a narrative with what it came out of. Use when issues are read or moved.",
  how:
    "Issues on narratives: each a draft, in the backlog, in a lane or done, with the issues it came out of. A draft joins the backlog when approved. " +
    `Each of the ${LANES} lanes holds one issue at a time. Done means the issue's work is merged into main. A note is one line on where an issue stands. ` +
    "The backlog is listed oldest first. An issue's path has its whole text.",
  actions: {
    add: "to the backlog's bottom",
    add_from: "as add, with the issues it came out of, a comma list, or none; narrative empty for its first parent's",
    draft: "an issue proposed, not yet in the backlog",
    approve: "moves the draft into the backlog",
    describe: "",
    note: "replaces its note; empty clears it",
    start: "puts it in the lane, which must be free; a draft too",
    done: "its work is merged into main",
    back: "to the backlog",
    drop: "it will not be done",
    link: "it came out of that one as well",
    unlink: "it did not come out of that one",
    move: "to another narrative",
  },
}

export type Words = typeof words
